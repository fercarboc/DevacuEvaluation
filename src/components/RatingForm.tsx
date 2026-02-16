import React, { useEffect, useMemo, useState } from "react";
import {
  Save,
  AlertCircle,
  CheckCircle,
  Shield,
  FileText,
  Info,
  Plus,
  Trash2,
  X,
  AlertTriangle,
} from "lucide-react";
import { StarRating } from "./StarRating";
import { addEvaluation } from "../services/evaluationService";
import { callEvalFn } from "@/services/callEvalFn";

interface RatingFormProps {
  currentCustomerId: string;
  currentCustomerName: string;
}

type Status = "idle" | "submitting" | "success" | "error";

const PLATFORM_OPTIONS = [
  "BOOKING",
  "EXPEDIA",
  "AIRBNB",
  "MOTOR_PROPIO",
  "AGENCIA",
  "WALK_IN",
  "OTROS",
] as const;
type Platform = (typeof PLATFORM_OPTIONS)[number];

type SeasonApplied = "LOW" | "HIGH" | "NORMAL";

/** ===== Catálogo desde BD (effective, ya mergeado en Edge) ===== */
type IncidentCatalogItem = {
  incident_type: string;
  title: string | null;
  description: string | null;
  severity: number | null;
  default_gross_min: number | null;
  default_gross_max: number | null;
  default_recovery_pct: number | null;
  suggested_actions: string | null;
  is_active: boolean;
  source?: "GLOBAL" | "OVERRIDE" | "CUSTOM";
};

type ItemCatalogItem = {
  item_code: string;
  title: string | null;
  category: string | null;
  unit_price: number | null;
  currency: string | null;
  description: string | null;
  is_active: boolean;
  source?: "GLOBAL" | "OVERRIDE" | "CUSTOM";
};

type HotelProfile = {
  is_complete: boolean;
  missing: string[];
  hotel_category: number | null;
  monthly_stays_estimated: number | null;
  adr_real: number | null;
  season_mult_high: number | null;
  season_mult_low: number | null;
};

function clampText(s: string, max: number) {
  const t = (s ?? "").trim();
  return t.length > max ? t.slice(0, max) : t;
}
function sanitizeUpperLettersAndSpaces(input: string) {
  const raw = input ?? "";
  const cleaned = raw.replace(/[0-9]/g, "");
  return cleaned.toUpperCase();
}
function sanitizeDoc(input: string) {
  const raw = input ?? "";
  return raw.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}
function sanitizePhone(input: string) {
  const raw = input ?? "";
  return raw.replace(/\D/g, "").slice(0, 11);
}
function looksLikeRiskRating(v: number) {
  return v > 0 && v <= 3;
}

/**
 * Money parsing robusto:
 * - admite coma/punto
 * - convierte a número
 * - devuelve SIEMPRE positivo (magnitud)
 * - null si vacío
 */
function parseMoneyNullable(input: string): number | null {
  const t = (input ?? "").trim();
  if (!t) return null;
  const n = Number(t.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.abs(n);
}

/**
 * Normalización económica (cliente):
 * - gross/recovered >= 0 (magnitud)
 * - net >= 0 (gross - recovered)
 *
 * OJO: En tu diseño actual, el gross/net lo calcula el servidor.
 * Aquí lo usamos para blindar recovered y evitar que llegue negativo.
 */
function normalizeEconomics(input: {
  economic_impact_gross?: number | null;
  economic_recovered?: number | null;
}) {
  const gross =
    input.economic_impact_gross == null ? null : Math.abs(Number(input.economic_impact_gross));
  const recovered =
    input.economic_recovered == null ? null : Math.abs(Number(input.economic_recovered));

  const net =
    gross == null && recovered == null ? null : Math.max((gross ?? 0) - (recovered ?? 0), 0);

  return {
    economic_impact_gross: gross,
    economic_recovered: recovered,
    economic_net_loss: net,
  };
}

/** ======================================================================
 *  AVISO PERFIL INCOMPLETO (persistente)
 *  ====================================================================== */
const LS_KEY_HIDE_PROFILE_NOTICE = "debacu_eval_hide_profile_incomplete_notice_v1";

/** ======================================================================
 *  Modal simple sin librerías
 *  ====================================================================== */
function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-[92vw] max-w-xl rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 hover:bg-slate-50"
            aria-label="Cerrar"
            title="Cerrar"
          >
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export const RatingForm: React.FC<RatingFormProps> = ({
  currentCustomerId,
  currentCustomerName,
}) => {
  const [status, setStatus] = useState<Status>("idle");

  // Perfil obligatorio (pero NO bloquea el formulario)
  const [profileLoading, setProfileLoading] = useState(true);
  const [profile, setProfile] = useState<HotelProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // aviso modal
  const [showProfileNotice, setShowProfileNotice] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  // catálogos (Edge)
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [incidentCatalog, setIncidentCatalog] = useState<IncidentCatalogItem[]>([]);
  const [itemCatalog, setItemCatalog] = useState<ItemCatalogItem[]>([]);

  const [form, setForm] = useState({
    fullName: "",
    document: "",
    email: "",
    phone: "",
    nationality: "",
    platform: "" as Platform | "",
    platformOther: "",
    rating: 0,

    incident_type: "" as string,
    season_applied: "NORMAL" as SeasonApplied,
    hasEvidence: false,
    recovered_amount: "" as string,
    notes: "",

    impact_items: [] as Array<{ code: string; qty: number }>, // code = item_code
  });

  /** =========================================================
   *  Carga perfil + catálogos (Edge)
   * ========================================================= */
useEffect(() => {
  (async () => {
    try {
      setProfileError(null);
      setCatalogError(null);
      setProfileLoading(true);
      setCatalogLoading(true);

    // 1) perfil
const prof = await callEvalFn<any>("debacu_eval_hotel_profile_get", {}).catch(() => null);

if (prof?.ok) {
  const root = prof as any;
  const pr = root.profile ?? root.data?.profile ?? root.data ?? null;

  const profileCompleted =
    pr?.profile_completed === true ||
    pr?.profile_completed === "true" ||
    pr?.profileCompleted === true ||
    pr?.profileCompleted === "true";

  const missing =
    Array.isArray(root.missing_fields)
      ? root.missing_fields
      : Array.isArray(pr?.missing_fields)
      ? pr.missing_fields
      : Array.isArray(root.missing)
      ? root.missing
      : Array.isArray(pr?.missing)
      ? pr.missing
      : [];

  const p: HotelProfile = {
    is_complete: profileCompleted,
    missing,
    hotel_category: pr?.hotel_category ?? null,
    monthly_stays_estimated: pr?.monthly_stays_estimated ?? null,
    adr_real: pr?.adr_real ?? null,
    season_mult_high: pr?.season_mult_high ?? null,
    season_mult_low: pr?.season_mult_low ?? null,
  };

  setProfile(p);

  if (p.is_complete) {
    setShowProfileNotice(false);
    localStorage.removeItem(LS_KEY_HIDE_PROFILE_NOTICE);
  } else {
    const hide = localStorage.getItem(LS_KEY_HIDE_PROFILE_NOTICE) === "1";
    if (!hide) setShowProfileNotice(true);
  }
      } else {
        setProfile({
          is_complete: false,
          missing: ["No se pudo verificar la configuración del hotel."],
          hotel_category: null,
          monthly_stays_estimated: null,
          adr_real: null,
          season_mult_high: null,
          season_mult_low: null,
        });
        setProfileError("No se pudo cargar el perfil del hotel.");
        const hide = localStorage.getItem(LS_KEY_HIDE_PROFILE_NOTICE) === "1";
        if (!hide) setShowProfileNotice(true);
      }

      // 2) incident catalog (effective)
      const inc = await callEvalFn<any>("debacu_eval_incident_catalog_list", {}).catch(() => null);
      if (inc?.ok && Array.isArray(inc?.items)) {
        setIncidentCatalog(inc.items as IncidentCatalogItem[]);
      } else {
        setIncidentCatalog([]);
        setCatalogError((prev) => prev ?? "No se pudo cargar el catálogo de incidencias.");
      }

      // 3) item catalog (effective)
      const items = await callEvalFn<any>("debacu_eval_item_catalog_list", {}).catch(() => null);
      if (items?.ok && Array.isArray(items?.items)) {
        setItemCatalog(items.items as ItemCatalogItem[]);
      } else {
        setItemCatalog([]);
        setCatalogError((prev) => prev ?? "No se pudo cargar el catálogo de items.");
      }
    } catch (e) {
      console.error(e);
      setCatalogError("No se pudo cargar perfil/catálogos (revisa Edge Functions).");
    } finally {
      setProfileLoading(false);
      setCatalogLoading(false);
    }
  })();
}, []);



  const closeProfileNotice = () => {
    if (dontShowAgain) {
      localStorage.setItem(LS_KEY_HIDE_PROFILE_NOTICE, "1");
    }
    setShowProfileNotice(false);
  };

  const ratingLabel =
    form.rating === 1
      ? "Muy negativo"
      : form.rating === 2
      ? "Negativo"
      : form.rating === 3
      ? "Neutro"
      : form.rating === 4
      ? "Positivo"
      : form.rating === 5
      ? "Excelente"
      : "Selecciona estrellas";

  const isRisk = useMemo(() => looksLikeRiskRating(form.rating), [form.rating]);
  const incidentSelected = useMemo(() => !!form.incident_type.trim(), [form.incident_type]);

  const selectedIncident = useMemo(
    () => incidentCatalog.find((x) => x.incident_type === form.incident_type) || null,
    [incidentCatalog, form.incident_type]
  );

  // Si no es riesgo, limpiar campos de incidencia
  useEffect(() => {
    if (!form.rating) return;
    if (!isRisk && form.incident_type) {
      setForm((p) => ({
        ...p,
        incident_type: "",
        impact_items: [],
        recovered_amount: "",
        season_applied: "NORMAL",
        hasEvidence: false,
      }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRisk]);

  const canSubmit = useMemo(() => {
    if (status === "submitting") return false;

    if (!form.rating) return false;
    if (!form.fullName.trim()) return false;
    if (!form.platform) return false;
    if (form.platform === "OTROS" && !form.platformOther.trim()) return false;

    if (isRisk) {
      if (!incidentSelected) return false;

      const hasId = !!form.document.trim() || !!form.email.trim() || !!form.phone.trim();
      if (!hasId) return false;
    }

    if (!isRisk && form.incident_type) return false;
    return true;
  }, [form, status, isRisk, incidentSelected]);

  const addItemRow = () => {
    setForm((p) => ({
      ...p,
      impact_items: [...p.impact_items, { code: "", qty: 1 }],
    }));
  };

  const removeItemRow = (idx: number) => {
    setForm((p) => ({
      ...p,
      impact_items: p.impact_items.filter((_, i) => i !== idx),
    }));
  };

  const updateItemRow = (idx: number, patch: Partial<{ code: string; qty: number }>) => {
    setForm((p) => ({
      ...p,
      impact_items: p.impact_items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!canSubmit) {
      alert("Revisa el formulario: faltan campos obligatorios o criterios mínimos.");
      return;
    }

    setStatus("submitting");

    try {
      const platformFinal =
        form.platform === "OTROS"
          ? `OTROS:${clampText(form.platformOther, 30)}`
          : form.platform;

      const controlledParts: string[] = [];
      controlledParts.push(`evidence=${form.hasEvidence ? "yes" : "no"}`);
      const notes = clampText(form.notes, 240);
      if (notes) controlledParts.push(`notes=${notes}`);

      const impact_items = (form.impact_items || [])
        .filter((x) => (x.code || "").trim() && Number(x.qty || 0) > 0)
        .map((x) => ({
          code: String(x.code).trim().toUpperCase(),
          qty: Math.max(1, Number(x.qty)),
        }));

      // recovered: en tu modelo es un "importe recuperado" (magnitud positiva)
      const recoveredRaw = parseMoneyNullable(form.recovered_amount);
      const econ = normalizeEconomics({
        economic_impact_gross: null, // gross lo calcula el servidor (catálogo + items + temporada)
        economic_recovered: recoveredRaw,
      });

      const payload = {
        document: form.document.trim() ? sanitizeDoc(form.document) : "GEN-SIN-DOC",
        full_name: sanitizeUpperLettersAndSpaces(form.fullName).trim(),
        nationality: form.nationality.trim() ? form.nationality.trim().toUpperCase() : null,
        phone: form.phone.trim() ? sanitizePhone(form.phone) : null,
        email: form.email.trim() ? form.email.trim().toLowerCase() : null,

        rating: form.rating,
        comment: controlledParts.join(" | ") || null,
        platform: platformFinal,

        // Incidencia (solo si ≤3★)
        incident_type: isRisk ? form.incident_type : null,
        impact_items: isRisk ? impact_items : null,
        season_applied: isRisk ? form.season_applied : null,

        // IMPORTANTE: recovered siempre positivo; el servidor calculará net_loss
        economic_recovered: isRisk ? econ.economic_recovered : null,

        creator_customer_id: currentCustomerId || null,
        creator_customer_name: currentCustomerName || null,
      };

      const result = await addEvaluation(payload as any, currentCustomerId, currentCustomerName);
      if (!result) throw new Error("No se pudo guardar la valoración");

      setStatus("success");
      setTimeout(() => {
        setStatus("idle");
        setForm({
          fullName: "",
          document: "",
          email: "",
          phone: "",
          nationality: "",
          platform: "",
          platformOther: "",
          rating: 0,
          incident_type: "",
          season_applied: "NORMAL",
          hasEvidence: false,
          recovered_amount: "",
          notes: "",
          impact_items: [],
        });
      }, 1200);
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  };

  /** =========================================================
   *  UI
   * ========================================================= */
  return (
    <div className="max-w-6xl mx-auto">
      {/* Modal aviso perfil incompleto */}
      <Modal open={showProfileNotice} title="Perfil del hotel incompleto" onClose={closeProfileNotice}>
        <div className="text-sm text-slate-700">
          Para acceder a <strong>Auditoría</strong>, <strong>estadísticas</strong>, <strong>ratios</strong> y
          <strong> comparativas sectoriales</strong>, necesitas completar el perfil del hotel.
        </div>

        {profileError && <div className="mt-3 text-xs text-amber-700">{profileError}</div>}

        {!!profile?.missing?.length && (
          <div className="mt-4 text-sm text-slate-700">
            <div className="font-semibold mb-2">Campos pendientes:</div>
            <ul className="list-disc ml-5 space-y-1">
              {profile.missing.map((m, idx) => (
                <li key={idx}>{m}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-4">
          <label className="flex items-center gap-2 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="h-4 w-4"
            />
            No volver a mostrar
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white hover:bg-slate-50"
              onClick={() => (window.location.href = "/app/account")}
              title="Completar perfil"
            >
              Ir a Mi cuenta
            </button>
            <button
              type="button"
              className="px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-black"
              onClick={closeProfileNotice}
            >
              Cerrar
            </button>
          </div>
        </div>
      </Modal>

      {/* Encabezado */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 mb-1">
              Registrar evaluación / incidencia
            </h2>
            <p className="text-sm text-slate-600">
              Si es incidencia (≤3★) debes seleccionar tipo y, si aplica, items. La economía se calcula en servidor.
            </p>

            {profileLoading && <p className="text-xs text-slate-500 mt-2">Verificando perfil…</p>}

            {!profileLoading && profile && !profile.is_complete && (
              <p className="text-xs text-amber-700 mt-2">
                Perfil incompleto: puedes registrar incidencias, pero auditoría/ratios quedarán limitados.
              </p>
            )}

            {catalogLoading && <p className="text-xs text-slate-500 mt-2">Cargando catálogos…</p>}
            {catalogError && <p className="text-xs text-amber-700 mt-2">{catalogError}</p>}
          </div>

          <div className="hidden md:flex items-center gap-2 rounded-2xl border bg-white px-4 py-3 text-xs text-slate-600">
            <Shield className="w-4 h-4 text-slate-500" />
            <span>Acceso restringido · Acciones auditables</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 text-sm">
            {status === "success" ? (
              <div className="text-center py-10">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-900">Registro guardado</h3>
                <p className="text-slate-500 text-sm mt-1">Se ha registrado correctamente.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Identificación */}
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Info className="w-4 h-4 text-slate-500" />
                    <div className="text-sm font-semibold text-slate-900">
                      Identificación del cliente
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nombre completo *
                      </label>
                      <input
                        type="text"
                        required
                        value={form.fullName}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            fullName: sanitizeUpperLettersAndSpaces(e.target.value),
                          }))
                        }
                        className="block w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        placeholder="NOMBRE Y APELLIDOS"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        Normalizado a mayúsculas. No metas texto libre innecesario.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Documento / ID
                      </label>
                      <input
                        type="text"
                        value={form.document}
                        onChange={(e) => setForm((p) => ({ ...p, document: sanitizeDoc(e.target.value) }))}
                        className="block w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        placeholder="DNI, NIE, PASAPORTE..."
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Teléfono
                      </label>
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => setForm((p) => ({ ...p, phone: sanitizePhone(e.target.value) }))}
                        maxLength={11}
                        className="block w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        placeholder="Ej: 600123456"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm((p) => ({ ...p, email: e.target.value.trim() }))}
                        className="block w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                        placeholder="cliente@email.com"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nacionalidad (código)
                      </label>
                      <input
                        type="text"
                        value={form.nationality}
                        onChange={(e) => setForm((p) => ({ ...p, nationality: e.target.value.toUpperCase().slice(0, 3) }))}
                        maxLength={3}
                        className="block w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm uppercase"
                        placeholder="ESP, FRA, GBR..."
                      />
                    </div>
                  </div>
                </div>

                {/* Origen */}
                <div className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-4 h-4 text-slate-500" />
                    <div className="text-sm font-semibold text-slate-900">Origen de la reserva</div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Plataforma *
                      </label>
                      <select
                        value={form.platform}
                        onChange={(e) => setForm((p) => ({ ...p, platform: e.target.value as Platform }))}
                        className="block w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                        required
                      >
                        <option value="">Selecciona…</option>
                        <option value="BOOKING">BOOKING</option>
                        <option value="EXPEDIA">EXPEDIA</option>
                        <option value="AIRBNB">AIRBNB</option>
                        <option value="MOTOR_PROPIO">Motor propio</option>
                        <option value="AGENCIA">Agencia</option>
                        <option value="WALK_IN">Walk-in</option>
                        <option value="OTROS">Otros</option>
                      </select>
                    </div>

                    {form.platform === "OTROS" && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Especifica *
                        </label>
                        <input
                          value={form.platformOther}
                          onChange={(e) => setForm((p) => ({ ...p, platformOther: clampText(e.target.value, 30) }))}
                          className="block w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                          placeholder="Ej: Agencia local"
                          required
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Valoración */}
                <div className="rounded-2xl border border-slate-200 p-4">
                  <label className="block text-xs font-semibold text-slate-700 mb-2">
                    Valoración general *
                  </label>
                  <div className="flex items-center gap-4 mb-2">
                    <StarRating
                      rating={form.rating}
                      interactive={true}
                      onChange={(v) => setForm((p) => ({ ...p, rating: v }))}
                      size="lg"
                    />
                    <span className="text-xs text-slate-500 font-semibold">{ratingLabel}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Si la valoración es ≤3★ se considera incidencia y debes tipificarla. Si es ≥4★, no se registra economía.
                  </p>
                </div>

                {/* Incidencia */}
                {isRisk && (
                  <div className="rounded-2xl border border-slate-200 p-4 space-y-4">
                    <div className="text-sm font-semibold text-slate-900">Datos de la incidencia</div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Tipo de incidencia *
                        </label>
                        <select
                          value={form.incident_type}
                          onChange={(e) => setForm((p) => ({ ...p, incident_type: e.target.value }))}
                          className="block w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                          required
                        >
                          <option value="">Selecciona…</option>
                          {incidentCatalog.map((x) => (
                            <option key={x.incident_type} value={x.incident_type}>
                              {(x.title ?? x.incident_type)} ({x.incident_type})
                            </option>
                          ))}
                        </select>

                        {!catalogLoading && incidentCatalog.length === 0 && (
                          <p className="text-[11px] text-amber-700 mt-1">
                            Catálogo no cargado. Revisa la Edge Function <code>debacu_eval_incident_catalog_list</code>.
                          </p>
                        )}
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Temporada aplicada
                        </label>
                        <select
                          value={form.season_applied}
                          onChange={(e) => setForm((p) => ({ ...p, season_applied: e.target.value as SeasonApplied }))}
                          className="block w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white"
                        >
                          <option value="NORMAL">Normal</option>
                          <option value="LOW">Baja</option>
                          <option value="HIGH">Alta</option>
                        </select>
                        <p className="text-[11px] text-slate-400 mt-1">
                          Se usa para aplicar multiplicadores (según el perfil del hotel).
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Importe recuperado (opcional)
                        </label>
                        <input
                          value={form.recovered_amount}
                          onChange={(e) => setForm((p) => ({ ...p, recovered_amount: e.target.value }))}
                          className="block w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                          placeholder="Ej: 25.00"
                        />
                        <p className="text-[11px] text-slate-400 mt-1">
                          Si recuperaste algo (cobro, fianza…), se aplica al net_loss.
                        </p>
                      </div>

                      <div>
                        <div className="text-xs font-semibold text-slate-700 mb-2">¿Hay evidencia?</div>
                        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                          <input
                            type="checkbox"
                            checked={form.hasEvidence}
                            onChange={(e) => setForm((p) => ({ ...p, hasEvidence: e.target.checked }))}
                            className="h-4 w-4"
                          />
                          <span className="text-sm text-slate-700">Sí, existe evidencia (interno)</span>
                        </label>
                      </div>
                    </div>

                    {/* Items afectados */}
                    <div className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-slate-700">
                          Items afectados (opcional, recomendado)
                        </div>
                        <button
                          type="button"
                          onClick={addItemRow}
                          className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
                        >
                          <Plus className="w-4 h-4" />
                          Añadir item
                        </button>
                      </div>

                      {form.impact_items.length === 0 ? (
                        <p className="text-[11px] text-slate-400 mt-2">
                          Si seleccionas items, el precio unitario lo resolverá el servidor (catálogo / override por hotel).
                        </p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {form.impact_items.map((it, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                              <div className="col-span-7">
                                <select
                                  value={it.code}
                                  onChange={(e) => updateItemRow(idx, { code: e.target.value })}
                                  className="block w-full px-3 py-2 border border-slate-300 rounded-xl text-sm bg-white"
                                >
                                  <option value="">Selecciona item…</option>
                                  {itemCatalog.map((x) => (
                                    <option key={x.item_code} value={x.item_code}>
                                      {(x.title ?? x.item_code)} ({x.item_code})
                                    </option>
                                  ))}
                                </select>

                                {!catalogLoading && itemCatalog.length === 0 && (
                                  <p className="text-[11px] text-amber-700 mt-1">
                                    Catálogo no cargado. Revisa <code>debacu_eval_item_catalog_list</code>.
                                  </p>
                                )}
                              </div>

                              <div className="col-span-3">
                                <input
                                  type="number"
                                  min={1}
                                  value={it.qty}
                                  onChange={(e) =>
                                    updateItemRow(idx, { qty: Math.max(1, Number(e.target.value || 1)) })
                                  }
                                  className="block w-full px-3 py-2 border border-slate-300 rounded-xl text-sm"
                                  placeholder="Qty"
                                />
                              </div>

                              <div className="col-span-2 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => removeItemRow(idx)}
                                  className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
                                  title="Eliminar"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="text-[11px] text-slate-500">
                      Requisito para incidencia: aporta <strong>documento</strong>, <strong>email</strong> o{" "}
                      <strong>teléfono</strong>.
                    </div>

                    {/* Panel opcional: info del tipo seleccionado */}
                    {selectedIncident && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                        <div className="font-semibold">
                          {(selectedIncident.title ?? selectedIncident.incident_type)}{" "}
                          <span className="text-slate-400">({selectedIncident.incident_type})</span>
                        </div>
                        {selectedIncident.description && (
                          <div className="mt-1 text-slate-600">{selectedIncident.description}</div>
                        )}
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-slate-500">Severidad:</span>{" "}
                            <span className="font-semibold">{selectedIncident.severity ?? "—"}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Rango bruto:</span>{" "}
                            <span className="font-semibold">
                              {selectedIncident.default_gross_min ?? "—"} - {selectedIncident.default_gross_max ?? "—"}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500">Recuperación %:</span>{" "}
                            <span className="font-semibold">{selectedIncident.default_recovery_pct ?? "—"}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Fuente:</span>{" "}
                            <span className="font-semibold">{selectedIncident.source ?? "GLOBAL"}</span>
                          </div>
                        </div>
                        {selectedIncident.suggested_actions && (
                          <div className="mt-2">
                            <span className="text-slate-500">Acción sugerida:</span>{" "}
                            <span className="font-semibold">{selectedIncident.suggested_actions}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Observaciones */}
                <div className="rounded-2xl border border-slate-200 p-4">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Observaciones (opcional, máx 240)
                  </label>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: clampText(e.target.value, 240) }))}
                    className="block w-full px-3 py-2 border border-slate-300 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                    placeholder="Sólo contexto operativo. Sin datos sensibles ni acusaciones."
                  />
                  <div className="mt-1 flex justify-between text-[11px] text-slate-400">
                    <span>Evita nombres de terceros, direcciones o detalles innecesarios.</span>
                    <span>{form.notes.length}/240</span>
                  </div>
                </div>

                {/* Submit */}
                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="w-full flex justify-center items-center px-6 py-3 rounded-2xl text-sm font-semibold text-white bg-slate-900 hover:bg-black disabled:opacity-40 transition-colors"
                  >
                    {status === "submitting" ? (
                      "Guardando…"
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        Guardar registro
                      </>
                    )}
                  </button>

                  {!canSubmit && (
                    <div className="mt-3 text-[12px] text-slate-500">
                      Requisitos mínimos: plataforma + estrellas + nombre.
                      {isRisk ? " Si es incidencia (≤3★): tipo + identificador fuerte." : ""}
                      {form.platform === "OTROS" ? " En “Otros” debes especificar el origen." : ""}
                    </div>
                  )}

                  {status === "error" && (
                    <div className="flex items-center gap-2 text-red-600 bg-red-50 p-3 rounded-xl text-xs mt-3">
                      <AlertCircle className="w-4 h-4" />
                      Error al guardar. Reintenta y revisa permisos / sesión.
                    </div>
                  )}
                </div>

                {/* Warning legal UX */}
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                  <div className="font-semibold mb-1">Uso responsable</div>
                  <div>
                    Registro interno para auditoría. Tipifica incidencias y evita texto libre. Las operaciones son auditables.
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Side info */}
        <div>
          <div className="bg-slate-900 text-white border border-slate-800 rounded-2xl p-5 h-full">
            <div className="text-sm font-semibold mb-2">Buenas prácticas</div>
            <ul className="text-xs text-slate-200 space-y-2">
              <li>• Incidencias: usa tipo + items. El coste lo calcula el servidor.</li>
              <li>• No metas acusaciones ni detalles sensibles en observaciones.</li>
              <li>• Si recuperas importes, indícalo (net_loss real).</li>
              <li>• Perfil completo = auditoría y comparativas.</li>
            </ul>

            <div className="mt-5 rounded-2xl bg-white/10 p-4 text-xs text-slate-200">
              <div className="font-semibold text-white mb-1">Notas operativas</div>
              <div className="mt-2">
                Los precios y cálculos económicos <strong className="text-white">no</strong> se hacen en el navegador.
                Se resuelven en Edge con catálogo + override por hotel + temporada.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
