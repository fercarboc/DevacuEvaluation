// src/components/RatingForm.tsx
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

/** =========================================================
 *  Países (ISO-3166 alpha-3) - lista cerrada para evitar basura
 *  ========================================================= */
const COUNTRIES_ALPHA3 = [
  "ESP","FRA","GBR","USA","PRT","DEU","ITA","NLD","BEL","CHE","AUT","IRL",
  "SWE","NOR","DNK","FIN","ISL","POL","CZE","SVK","HUN","ROU","BGR","GRC",
  "TUR","MAR","DZA","TUN","EGY","MEX","BRA","ARG","CHL","COL","PER","URY",
  "CAN","AUS","NZL","JPN","CHN","KOR","IND","ZAF",
] as const;

function isCountryAlpha3(v: string | null | undefined) {
  const s = String(v ?? "").trim().toUpperCase();
  return (COUNTRIES_ALPHA3 as readonly string[]).includes(s);
}

function sanitizeAlpha3(input: string) {
  return String(input ?? "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
}

function isValidEmail(email: string) {
  const s = String(email ?? "").trim();
  if (!s) return true; // opcional
  if (s.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

function sanitizeDigits(input: string, maxLen = 15) {
  return String(input ?? "").replace(/\D/g, "").slice(0, maxLen);
}

function isValidPhoneDigits(phone: string, minLen = 7, maxLen = 15) {
  const s = String(phone ?? "").trim();
  if (!s) return true; // opcional
  if (!/^\d+$/.test(s)) return false;
  return s.length >= minLen && s.length <= maxLen;
}

/** =========================================================
 *  Props / Types
 *  ========================================================= */
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

type FormErrors = Partial<Record<"email" | "phone" | "nationality", string>>;

/** =========================================================
 *  Helpers existentes (SIN CAMBIAR LÓGICA)
 *  ========================================================= */
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
// (mantengo tu sanitizePhone, pero ahora el input se controla con digits para evitar letras)
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
    input.economic_impact_gross == null
      ? null
      : Math.abs(Number(input.economic_impact_gross));
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

/** =========================================================
 *  Validación SOLO de campos “controlados” (sin cambiar lógica)
 *  ========================================================= */
function validateControlled(nextForm: {
  email: string;
  phone: string;
  nationality: string;
}): FormErrors {
  const e: FormErrors = {};

  const em = String(nextForm.email ?? "").trim();
  if (em && !isValidEmail(em)) e.email = "Email inválido.";

  const ph = String(nextForm.phone ?? "").trim();
  if (ph && !isValidPhoneDigits(ph, 7, 15)) e.phone = "Teléfono inválido (solo dígitos, 7-15).";

  const nat = String(nextForm.nationality ?? "").trim();
  if (nat) {
    const c = nat.toUpperCase();
    if (!isCountryAlpha3(c)) e.nationality = "Código inválido (usa ESP, FRA, GBR...).";
  }

  return e;
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

  // ✅ errores controlados (email/phone/nationality)
  const [errors, setErrors] = useState<FormErrors>({});

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

  // ✅ Validación controlada (no cambia la lógica: solo bloquea basura)
  const controlledErrors = useMemo(
    () => validateControlled({ email: form.email, phone: form.phone, nationality: form.nationality }),
    [form.email, form.phone, form.nationality]
  );

  const canSubmit = useMemo(() => {
    if (status === "submitting") return false;

    if (!form.rating) return false;
    if (!form.fullName.trim()) return false;
    if (!form.platform) return false;
    if (form.platform === "OTROS" && !form.platformOther.trim()) return false;

    // 🚫 si meten email/teléfono/nacionalidad inválidos, no se envía
    if (Object.keys(controlledErrors).length > 0) return false;

    if (isRisk) {
      if (!incidentSelected) return false;

      const hasId = !!form.document.trim() || !!form.email.trim() || !!form.phone.trim();
      if (!hasId) return false;
    }

    if (!isRisk && form.incident_type) return false;
    return true;
  }, [form, status, isRisk, incidentSelected, controlledErrors]);

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

    // ✅ refuerza validación controlada en submit
    const ce = validateControlled({
      email: form.email,
      phone: form.phone,
      nationality: form.nationality,
    });
    setErrors(ce);
    if (Object.keys(ce).length > 0) {
      alert(Object.values(ce).filter(Boolean).join(" · "));
      return;
    }

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
        nationality: form.nationality.trim()
          ? form.nationality.trim().toUpperCase()
          : null,
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
        setErrors({});
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
                        onChange={(e) => {
                          const v = sanitizeDigits(e.target.value, 15);
                          setForm((p) => ({ ...p, phone: v }));
                          setErrors((prev) => ({ ...prev, phone: undefined }));
                        }}
                        onBlur={() => {
                          const ce = validateControlled({
                            email: form.email,
                            phone: form.phone,
                            nationality: form.nationality,
                          });
                          setErrors((prev) => ({ ...prev, phone: ce.phone }));
                        }}
                        className={`block w-full px-3 py-2 border rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
                          errors.phone ? "border-red-300 bg-red-50" : "border-slate-300"
                        }`}
                        placeholder="Ej: 600123456"
                      />
                      {errors.phone && <p className="text-[11px] text-red-600 mt-1">{errors.phone}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Email
                      </label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          setForm((p) => ({ ...p, email: v }));
                          setErrors((prev) => ({ ...prev, email: undefined }));
                        }}
                        onBlur={() => {
                          const ce = validateControlled({
                            email: form.email,
                            phone: form.phone,
                            nationality: form.nationality,
                          });
                          setErrors((prev) => ({ ...prev, email: ce.email }));
                        }}
                        className={`block w-full px-3 py-2 border rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm ${
                          errors.email ? "border-red-300 bg-red-50" : "border-slate-300"
                        }`}
                        placeholder="cliente@email.com"
                      />
                      {errors.email && <p className="text-[11px] text-red-600 mt-1">{errors.email}</p>}
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nacionalidad (código)
                      </label>

                      <select
                        value={form.nationality}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            nationality: e.target.value,
                          }))
                        }
                        className={`block w-full px-3 py-2 border rounded-xl focus:ring-indigo-500 focus:border-indigo-500 text-sm bg-white ${
                          errors.nationality ? "border-red-300 bg-red-50" : "border-slate-300"
                        }`}
                      >
                        <option value="">Selecciona…</option>

                        {/* Europa */}
                        <option value="ESP">ESP - España</option>
                        <option value="FRA">FRA - Francia</option>
                        <option value="GBR">GBR - Reino Unido</option>
                        <option value="PRT">PRT - Portugal</option>
                        <option value="DEU">DEU - Alemania</option>
                        <option value="ITA">ITA - Italia</option>
                        <option value="NLD">NLD - Países Bajos</option>
                        <option value="BEL">BEL - Bélgica</option>
                        <option value="CHE">CHE - Suiza</option>
                        <option value="IRL">IRL - Irlanda</option>

                        {/* América */}
                        <option value="USA">USA - Estados Unidos</option>
                        <option value="CAN">CAN - Canadá</option>
                        <option value="MEX">MEX - México</option>
                        <option value="BRA">BRA - Brasil</option>
                        <option value="ARG">ARG - Argentina</option>
                        <option value="CHL">CHL - Chile</option>
                        <option value="COL">COL - Colombia</option>
                        <option value="PER">PER - Perú</option>
                        <option value="URY">URY - Uruguay</option>

                        {/* África */}
                        <option value="MAR">MAR - Marruecos</option>
                        <option value="DZA">DZA - Argelia</option>
                        <option value="TUN">TUN - Túnez</option>
                        <option value="EGY">EGY - Egipto</option>
                        <option value="ZAF">ZAF - Sudáfrica</option>

                        {/* Oceanía */}
                        <option value="AUS">AUS - Australia</option>
                        <option value="NZL">NZL - Nueva Zelanda</option>
                      </select>

                      {errors.nationality && (
                        <p className="text-[11px] text-red-600 mt-1">
                          {errors.nationality}
                        </p>
                      )}
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
                      {Object.keys(controlledErrors).length > 0 ? " Revisa email/teléfono/nacionalidad." : ""}
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