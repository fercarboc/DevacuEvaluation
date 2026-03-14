import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Save,
  AlertCircle,
  CheckCircle,
  Shield,
  FileText,
  Info,
  X,
  AlertTriangle,
} from "lucide-react";
import { callEvalFn } from "@/services/callEvalFn";

/** =========================================================
 * Constantes / utilidades
 * ========================================================= */

const COUNTRIES_ALPHA3 = [
  "ESP",
  "FRA",
  "GBR",
  "USA",
  "PRT",
  "DEU",
  "ITA",
  "NLD",
  "BEL",
  "CHE",
  "AUT",
  "IRL",
  "SWE",
  "NOR",
  "DNK",
  "FIN",
  "ISL",
  "POL",
  "CZE",
  "SVK",
  "HUN",
  "ROU",
  "BGR",
  "GRC",
  "TUR",
  "MAR",
  "DZA",
  "TUN",
  "EGY",
  "MEX",
  "BRA",
  "ARG",
  "CHL",
  "COL",
  "PER",
  "URY",
  "CAN",
  "AUS",
  "NZL",
  "JPN",
  "CHN",
  "KOR",
  "IND",
  "ZAF",
] as const;

const LS_KEY_HIDE_PROFILE_NOTICE =
  "debacu_eval_hide_profile_incomplete_notice_v1";

type Status = "idle" | "submitting" | "success" | "error";
type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface RatingFormProps {
  currentCustomerId: string;
  currentCustomerName: string;
  selectedPropertyId?: string | null;
  selectedPropertyName?: string | null;
}

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

type HotelProfile = {
  is_complete: boolean;
  missing: string[];
  hotel_category: number | null;
  monthly_stays_estimated: number | null;
  adr_real: number | null;
  season_mult_high: number | null;
  season_mult_low: number | null;
};

type FormErrors = Partial<
  Record<
    | "email"
    | "phone"
    | "nationality"
    | "incident_date"
    | "property_id"
    | "identity"
    | "incident_type"
    | "description"
    | "severity",
    string
  >
>;

type HotelProfileResponse = {
  ok?: boolean;
  profile?: unknown;
  data?: unknown;
  missing_fields?: string[];
  missing?: string[];
};

type IncidentCatalogResponse = {
  ok?: boolean;
  items?: IncidentCatalogItem[];
  data?: {
    items?: IncidentCatalogItem[];
  };
};

type ManualIncidentCreateResponse = {
  ok?: boolean;
  detail?: string;
  error?: string;
  data?: {
    incidentId?: string;
    incident_id?: string;
  };
};

type FormState = {
  fullName: string;
  document: string;
  email: string;
  phone: string;
  nationality: string;
  incident_type: string;
  severity: Severity | "";
  incident_date: string;
  economic_impact: string;
  notes: string;
  hasEvidence: boolean;
};

function clean(v?: string | null): string {
  return String(v ?? "").trim();
}

function clampText(s: string, max: number): string {
  const t = String(s ?? "").trim();
  return t.length > max ? t.slice(0, max) : t;
}

function isCountryAlpha3(v: string | null | undefined): boolean {
  const s = String(v ?? "").trim().toUpperCase();
  return (COUNTRIES_ALPHA3 as readonly string[]).includes(s);
}

function isValidEmail(email: string): boolean {
  const s = String(email ?? "").trim();
  if (!s) return true;
  if (s.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

function sanitizeDigits(input: string, maxLen = 15): string {
  return String(input ?? "").replace(/\D/g, "").slice(0, maxLen);
}

function isValidPhoneDigits(phone: string, minLen = 7, maxLen = 15): boolean {
  const s = String(phone ?? "").trim();
  if (!s) return true;
  if (!/^\d+$/.test(s)) return false;
  return s.length >= minLen && s.length <= maxLen;
}

function sanitizeUpperLettersAndSpaces(input: string): string {
  return String(input ?? "")
    .replace(/[0-9]/g, "")
    .toUpperCase();
}

function sanitizeDoc(input: string): string {
  return String(input ?? "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase();
}

function isISODate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function getLocalStorageItem(key: string): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(key) ?? "";
}

function setLocalStorageItem(key: string, value: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value);
}

function removeLocalStorageItem(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

function severityLabelFromCatalog(v?: number | null): Severity {
  const n = Number(v ?? 0);
  if (n >= 4) return "CRITICAL";
  if (n >= 3) return "HIGH";
  if (n >= 2) return "MEDIUM";
  return "LOW";
}

function buildEmptyForm(todayIso: string): FormState {
  return {
    fullName: "",
    document: "",
    email: "",
    phone: "",
    nationality: "",
    incident_type: "",
    severity: "",
    incident_date: todayIso,
    economic_impact: "",
    notes: "",
    hasEvidence: false,
  };
}

function coerceProfileResponse(raw: HotelProfileResponse | null): HotelProfile {
  const container =
    (raw?.profile as Record<string, unknown> | undefined) ??
    (raw?.data as Record<string, unknown> | undefined) ??
    {};

  const profileCompleted =
    container.profile_completed === true ||
    container.profile_completed === "true" ||
    container.profileCompleted === true ||
    container.profileCompleted === "true";

  const missing =
    Array.isArray(raw?.missing_fields)
      ? raw?.missing_fields
      : Array.isArray(container.missing_fields)
        ? (container.missing_fields as string[])
        : Array.isArray(raw?.missing)
          ? raw?.missing
          : Array.isArray(container.missing)
            ? (container.missing as string[])
            : [];

  return {
    is_complete: Boolean(profileCompleted),
    missing,
    hotel_category:
      typeof container.hotel_category === "number"
        ? container.hotel_category
        : null,
    monthly_stays_estimated:
      typeof container.monthly_stays_estimated === "number"
        ? container.monthly_stays_estimated
        : null,
    adr_real: typeof container.adr_real === "number" ? container.adr_real : null,
    season_mult_high:
      typeof container.season_mult_high === "number"
        ? container.season_mult_high
        : null,
    season_mult_low:
      typeof container.season_mult_low === "number"
        ? container.season_mult_low
        : null,
  };
}

function validateControlled(nextForm: {
  email: string;
  phone: string;
  nationality: string;
  incident_date: string;
  selectedPropertyId: string;
  document: string;
  incident_type: string;
  description: string;
  severity: string;
}): FormErrors {
  const e: FormErrors = {};

  const em = clean(nextForm.email);
  if (em && !isValidEmail(em)) {
    e.email = "Email inválido.";
  }

  const ph = clean(nextForm.phone);
  if (ph && !isValidPhoneDigits(ph, 7, 15)) {
    e.phone = "Teléfono inválido (solo dígitos, 7-15).";
  }

  const nat = clean(nextForm.nationality);
  if (nat && !isCountryAlpha3(nat)) {
    e.nationality = "Código inválido (usa ESP, FRA, GBR...).";
  }

  if (!clean(nextForm.selectedPropertyId)) {
    e.property_id = "Selecciona primero una propiedad activa.";
  }

  const hasStrongIdentity =
    !!clean(nextForm.document) ||
    !!clean(nextForm.email) ||
    !!clean(nextForm.phone);

  if (!hasStrongIdentity) {
    e.identity = "Debes informar documento, email o teléfono.";
  }

  if (!clean(nextForm.incident_type)) {
    e.incident_type = "Selecciona un tipo de incidencia.";
  }

  if (!clean(nextForm.description) || clean(nextForm.description).length < 8) {
    e.description = "La descripción debe tener al menos 8 caracteres.";
  }

  if (!clean(nextForm.severity)) {
    e.severity = "Selecciona una severidad.";
  }

  const d = clean(nextForm.incident_date);
  if (!d || !isISODate(d)) {
    e.incident_date = "Fecha inválida (YYYY-MM-DD).";
  }

  return e;
}

/** =========================================================
 * Clases UI
 * ========================================================= */

const fieldBaseClass =
  "block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

const fieldErrorClass =
  "border-red-300 bg-red-50 text-slate-900 placeholder:text-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100";

const selectBaseClass =
  "block w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

const sectionCardClass =
  "rounded-2xl border border-slate-300 bg-slate-50 p-4";

/** =========================================================
 * Modal
 * ========================================================= */

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-[92vw] max-w-xl rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 hover:bg-slate-50"
            aria-label="Cerrar"
            title="Cerrar"
          >
            <X className="h-4 w-4 text-slate-600" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

/** =========================================================
 * Componente
 * ========================================================= */

export const RatingForm: React.FC<RatingFormProps> = ({
  currentCustomerId,
  currentCustomerName,
  selectedPropertyId,
  selectedPropertyName,
}) => {
  const [status, setStatus] = useState<Status>("idle");

  const [profileLoading, setProfileLoading] = useState(true);
  const [profile, setProfile] = useState<HotelProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [showProfileNotice, setShowProfileNotice] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [incidentCatalog, setIncidentCatalog] = useState<IncidentCatalogItem[]>(
    [],
  );

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdIncidentId, setCreatedIncidentId] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});

  const successResetTimerRef = useRef<number | null>(null);

  const activePropertyId = useMemo(() => {
    return clean(selectedPropertyId) || clean(getLocalStorageItem("selectedPropertyId"));
  }, [selectedPropertyId]);

  const activePropertyName = useMemo(() => {
    return (
      clean(selectedPropertyName) ||
      clean(getLocalStorageItem("selectedPropertyName")) ||
      "Propiedad activa"
    );
  }, [selectedPropertyName]);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [form, setForm] = useState<FormState>(() => buildEmptyForm(todayIso));

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        setProfileLoading(true);
        setCatalogLoading(true);
        setProfileError(null);
        setCatalogError(null);

        const profRaw = (await callEvalFn(
          "debacu_eval_hotel_profile_get",
          {},
        ).catch(() => null)) as HotelProfileResponse | null;

        if (!cancelled) {
          if (profRaw?.ok) {
            const p = coerceProfileResponse(profRaw);
            setProfile(p);

            if (p.is_complete) {
              setShowProfileNotice(false);
              removeLocalStorageItem(LS_KEY_HIDE_PROFILE_NOTICE);
            } else {
              const hide = getLocalStorageItem(LS_KEY_HIDE_PROFILE_NOTICE) === "1";
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
            const hide = getLocalStorageItem(LS_KEY_HIDE_PROFILE_NOTICE) === "1";
            if (!hide) setShowProfileNotice(true);
          }
        }

        const incRaw = (await callEvalFn(
          "debacu_eval_incident_catalog_list",
          {},
        ).catch(() => null)) as IncidentCatalogResponse | null;

        if (!cancelled) {
          const items = Array.isArray(incRaw?.items)
            ? incRaw.items
            : Array.isArray(incRaw?.data?.items)
              ? incRaw.data.items
              : [];

          if (incRaw?.ok) {
            const validItems = items.filter((x) => Boolean(x?.incident_type));
            setIncidentCatalog(validItems);

            if (validItems.length === 0) {
              setCatalogError("El catálogo está vacío o no devolvió items válidos.");
            }
          } else {
            setIncidentCatalog([]);
            setCatalogError("No se pudo cargar el catálogo de incidencias.");
          }
        }
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setProfileError("No se pudo cargar el perfil del hotel.");
          setCatalogError(
            "No se pudo cargar perfil/catálogos (revisa Edge Functions).",
          );
        }
      } finally {
        if (!cancelled) {
          setProfileLoading(false);
          setCatalogLoading(false);
        }
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (successResetTimerRef.current !== null) {
        window.clearTimeout(successResetTimerRef.current);
      }
    };
  }, []);

  const closeProfileNotice = () => {
    if (dontShowAgain) {
      setLocalStorageItem(LS_KEY_HIDE_PROFILE_NOTICE, "1");
    }
    setShowProfileNotice(false);
  };

  const selectedIncident = useMemo(() => {
    return incidentCatalog.find((x) => x.incident_type === form.incident_type) ?? null;
  }, [incidentCatalog, form.incident_type]);

  useEffect(() => {
    if (!selectedIncident) return;
    if (form.severity) return;

    setForm((prev) => ({
      ...prev,
      severity: severityLabelFromCatalog(selectedIncident.severity),
    }));
  }, [selectedIncident, form.severity]);

  const controlledErrors = useMemo(() => {
    return validateControlled({
      email: form.email,
      phone: form.phone,
      nationality: form.nationality,
      incident_date: form.incident_date,
      selectedPropertyId: activePropertyId,
      document: form.document,
      incident_type: form.incident_type,
      description: form.notes,
      severity: form.severity,
    });
  }, [
    form.email,
    form.phone,
    form.nationality,
    form.incident_date,
    activePropertyId,
    form.document,
    form.incident_type,
    form.notes,
    form.severity,
  ]);

  const canSubmit = useMemo(() => {
    if (status === "submitting") return false;
    return Object.keys(controlledErrors).length === 0;
  }, [status, controlledErrors]);

  const runFieldValidation = (): FormErrors => {
    const nextErrors = validateControlled({
      email: form.email,
      phone: form.phone,
      nationality: form.nationality,
      incident_date: form.incident_date,
      selectedPropertyId: activePropertyId,
      document: form.document,
      incident_type: form.incident_type,
      description: form.notes,
      severity: form.severity,
    });

    setErrors(nextErrors);
    return nextErrors;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const validationErrors = runFieldValidation();
    setSubmitError(null);

    if (Object.keys(validationErrors).length > 0) {
      setStatus("error");
      setSubmitError(Object.values(validationErrors).filter(Boolean).join(" · "));
      return;
    }

    setStatus("submitting");

    try {
      const economicImpactRaw = clean(form.economic_impact);
      const economicImpact =
        economicImpactRaw === ""
          ? null
          : Math.max(0, Number(economicImpactRaw.replace(",", ".")));

      const fullNameParts = clean(form.fullName).split(/\s+/).filter(Boolean);
      const firstName = fullNameParts[0] || undefined;
      const lastName = fullNameParts.slice(1).join(" ") || undefined;

      const payload = {
        property_id: activePropertyId,
        identity: {
          document: clean(form.document) ? sanitizeDoc(form.document) : undefined,
          email: clean(form.email) ? clean(form.email).toLowerCase() : undefined,
          phone: clean(form.phone) ? sanitizeDigits(form.phone, 15) : undefined,
          first_name: firstName,
          last_name: lastName,
          country: clean(form.nationality)
            ? clean(form.nationality).toUpperCase()
            : undefined,
        },
        incident: {
          incident_type: form.incident_type,
          description: clampText(form.notes, 500),
          incident_date: form.incident_date,
          economic_impact: Number.isFinite(economicImpact) ? economicImpact : null,
          severity: form.severity,
          has_evidence: form.hasEvidence,
        },
      };

      const res = (await callEvalFn(
        "debacu_eval_manual_incident_create",
        payload,
      )) as ManualIncidentCreateResponse | null;

      const incidentId = res?.data?.incidentId ?? res?.data?.incident_id ?? null;

      if (!res?.ok || !incidentId) {
        throw new Error(
          res?.detail || res?.error || "manual_incident_create_failed",
        );
      }

      setCreatedIncidentId(incidentId);
      setStatus("success");
      setErrors({});
      setSubmitError(null);

      if (successResetTimerRef.current !== null) {
        window.clearTimeout(successResetTimerRef.current);
      }

      successResetTimerRef.current = window.setTimeout(() => {
        setStatus("idle");
        setCreatedIncidentId(null);
        setForm(buildEmptyForm(todayIso));
      }, 1400);
    } catch (err) {
      console.error(err);

      const message =
        err instanceof Error
          ? err.message
          : "Error al guardar. Reintenta y revisa permisos / sesión.";

      setStatus("error");
      setSubmitError(message);
    }
  };

  return (
    <div className="mx-auto max-w-6xl rounded-3xl bg-slate-100/80 p-1">
      <Modal
        open={showProfileNotice}
        title="Perfil del hotel incompleto"
        onClose={closeProfileNotice}
      >
        <div className="text-sm text-slate-700">
          Para acceder a <strong>Auditoría</strong>, <strong>estadísticas</strong>,
          <strong> ratios</strong> y <strong>comparativas sectoriales</strong>,
          necesitas completar el perfil del hotel.
        </div>

        {profileError && (
          <div className="mt-3 text-xs text-amber-700">{profileError}</div>
        )}

        {!!profile?.missing?.length && (
          <div className="mt-4 text-sm text-slate-700">
            <div className="mb-2 font-semibold">Campos pendientes:</div>
            <ul className="ml-5 list-disc space-y-1">
              {profile.missing.map((m, idx) => (
                <li key={`${m}-${idx}`}>{m}</li>
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
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold hover:bg-slate-50"
              onClick={() => {
                if (typeof window !== "undefined") {
                  window.location.href = "/app/account";
                }
              }}
              title="Completar perfil"
            >
              Ir a Mi cuenta
            </button>
            <button
              type="button"
              className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-black"
              onClick={closeProfileNotice}
            >
              Cerrar
            </button>
          </div>
        </div>
      </Modal>

      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="mb-1 text-2xl font-bold text-slate-900">
              Registrar incidencia manual
            </h2>
            <p className="text-sm text-slate-600">
              Registro estructurado y auditado de incidencias sobre la propiedad activa.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
                Propiedad activa:{" "}
                <span className="font-semibold">{activePropertyName}</span>
              </span>

              {activePropertyId ? (
                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
                  property_id cargada
                </span>
              ) : (
                <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-red-700">
                  sin propiedad activa
                </span>
              )}
            </div>

            {profileLoading && (
              <p className="mt-2 text-xs text-slate-500">Verificando perfil…</p>
            )}

            {!profileLoading && profile && !profile.is_complete && (
              <p className="mt-2 text-xs text-amber-700">
                Perfil incompleto: puedes registrar incidencias, pero auditoría/ratios
                quedarán limitados.
              </p>
            )}

            {catalogLoading && (
              <p className="mt-2 text-xs text-slate-500">Cargando catálogos…</p>
            )}
            {catalogError && (
              <p className="mt-2 text-xs text-amber-700">{catalogError}</p>
            )}
          </div>

          <div className="hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-600 md:flex">
            <Shield className="h-4 w-4 text-slate-500" />
            <span>Acceso restringido · acciones auditables</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-slate-300 bg-white p-6 text-sm shadow-sm">
            {status === "success" ? (
              <div className="py-10 text-center">
                <CheckCircle className="mx-auto mb-4 h-12 w-12 text-green-500" />
                <h3 className="text-lg font-bold text-slate-900">
                  Incidencia registrada
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Se ha registrado correctamente.
                </p>
                {createdIncidentId ? (
                  <p className="mt-2 text-xs text-slate-400">
                    ID: {createdIncidentId}
                  </p>
                ) : null}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className={sectionCardClass}>
                  <div className="mb-3 flex items-center gap-2">
                    <Info className="h-4 w-4 text-slate-500" />
                    <div className="text-sm font-semibold text-slate-900">
                      Identificación del cliente
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Nombre completo
                      </label>
                      <input
                        type="text"
                        value={form.fullName}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            fullName: sanitizeUpperLettersAndSpaces(e.target.value),
                          }))
                        }
                        className={fieldBaseClass}
                        placeholder="NOMBRE Y APELLIDOS"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Solo para apoyo operativo. La identidad fuerte la marcan
                        documento, email o teléfono.
                      </p>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Documento / ID
                      </label>
                      <input
                        type="text"
                        value={form.document}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            document: sanitizeDoc(e.target.value),
                          }))
                        }
                        className={fieldBaseClass}
                        placeholder="DNI, NIE, PASAPORTE..."
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Teléfono
                      </label>
                      <input
                        type="tel"
                        value={form.phone}
                        onChange={(e) => {
                          const value = sanitizeDigits(e.target.value, 15);
                          setForm((prev) => ({ ...prev, phone: value }));
                          setErrors((prev) => ({
                            ...prev,
                            phone: undefined,
                            identity: undefined,
                          }));
                        }}
                        onBlur={runFieldValidation}
                        className={`${fieldBaseClass} ${
                          errors.phone ? fieldErrorClass : ""
                        }`}
                        placeholder="Ej: 600123456"
                      />
                      {errors.phone && (
                        <p className="mt-1 text-[11px] text-red-600">{errors.phone}</p>
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Email
                      </label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => {
                          const value = e.target.value.trim();
                          setForm((prev) => ({ ...prev, email: value }));
                          setErrors((prev) => ({
                            ...prev,
                            email: undefined,
                            identity: undefined,
                          }));
                        }}
                        onBlur={runFieldValidation}
                        className={`${fieldBaseClass} ${
                          errors.email ? fieldErrorClass : ""
                        }`}
                        placeholder="cliente@email.com"
                      />
                      {errors.email && (
                        <p className="mt-1 text-[11px] text-red-600">{errors.email}</p>
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Nacionalidad (código)
                      </label>
                      <select
                        value={form.nationality}
                        onChange={(e) => {
                          setForm((prev) => ({
                            ...prev,
                            nationality: e.target.value,
                          }));
                          setErrors((prev) => ({
                            ...prev,
                            nationality: undefined,
                          }));
                        }}
                        className={`${selectBaseClass} ${
                          errors.nationality ? fieldErrorClass : ""
                        }`}
                      >
                        <option value="">Selecciona…</option>
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
                        <option value="USA">USA - Estados Unidos</option>
                        <option value="CAN">CAN - Canadá</option>
                        <option value="MEX">MEX - México</option>
                        <option value="BRA">BRA - Brasil</option>
                        <option value="ARG">ARG - Argentina</option>
                        <option value="CHL">CHL - Chile</option>
                        <option value="COL">COL - Colombia</option>
                        <option value="PER">PER - Perú</option>
                        <option value="URY">URY - Uruguay</option>
                        <option value="MAR">MAR - Marruecos</option>
                        <option value="DZA">DZA - Argelia</option>
                        <option value="TUN">TUN - Túnez</option>
                        <option value="EGY">EGY - Egipto</option>
                        <option value="ZAF">ZAF - Sudáfrica</option>
                        <option value="AUS">AUS - Australia</option>
                        <option value="NZL">NZL - Nueva Zelanda</option>
                      </select>

                      {errors.nationality && (
                        <p className="mt-1 text-[11px] text-red-600">
                          {errors.nationality}
                        </p>
                      )}
                    </div>
                  </div>

                  {errors.identity && (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                      {errors.identity}
                    </div>
                  )}
                </div>

                <div className={`${sectionCardClass} space-y-4`}>
                  <div className="mb-1 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-slate-500" />
                    <div className="text-sm font-semibold text-slate-900">
                      Datos de la incidencia
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Tipo de incidencia *
                      </label>
                      <select
                        value={form.incident_type}
                        onChange={(e) => {
                          const nextType = e.target.value;
                          const nextIncident =
                            incidentCatalog.find((x) => x.incident_type === nextType) ?? null;

                          setForm((prev) => ({
                            ...prev,
                            incident_type: nextType,
                            severity: nextIncident
                              ? severityLabelFromCatalog(nextIncident.severity)
                              : prev.severity,
                          }));

                          setErrors((prev) => ({
                            ...prev,
                            incident_type: undefined,
                          }));
                        }}
                        className={`${selectBaseClass} ${
                          errors.incident_type ? fieldErrorClass : ""
                        }`}
                      >
                        <option value="">Selecciona…</option>
                        {incidentCatalog.map((x) => (
                          <option key={x.incident_type} value={x.incident_type}>
                            {(x.title ?? x.incident_type)} ({x.incident_type})
                          </option>
                        ))}
                      </select>

                      {errors.incident_type && (
                        <p className="mt-1 text-[11px] text-red-600">
                          {errors.incident_type}
                        </p>
                      )}

                      {!catalogLoading && incidentCatalog.length === 0 && (
                        <p className="mt-1 text-[11px] text-amber-700">
                          Catálogo no cargado. Revisa la Edge Function{" "}
                          <code>debacu_eval_incident_catalog_list</code>.
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Severidad *
                      </label>
                      <select
                        value={form.severity}
                        onChange={(e) => {
                          setForm((prev) => ({
                            ...prev,
                            severity: e.target.value as Severity,
                          }));
                          setErrors((prev) => ({
                            ...prev,
                            severity: undefined,
                          }));
                        }}
                        className={`${selectBaseClass} ${
                          errors.severity ? fieldErrorClass : ""
                        }`}
                      >
                        <option value="">Selecciona…</option>
                        <option value="LOW">LOW</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HIGH">HIGH</option>
                        <option value="CRITICAL">CRITICAL</option>
                      </select>

                      {errors.severity && (
                        <p className="mt-1 text-[11px] text-red-600">{errors.severity}</p>
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Fecha de incidencia *
                      </label>
                      <input
                        type="date"
                        value={form.incident_date}
                        onChange={(e) => {
                          setForm((prev) => ({
                            ...prev,
                            incident_date: e.target.value,
                          }));
                          setErrors((prev) => ({
                            ...prev,
                            incident_date: undefined,
                          }));
                        }}
                        className={`${fieldBaseClass} ${
                          errors.incident_date ? fieldErrorClass : ""
                        }`}
                      />
                      {errors.incident_date && (
                        <p className="mt-1 text-[11px] text-red-600">
                          {errors.incident_date}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
                        Impacto económico (opcional)
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.economic_impact}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            economic_impact: e.target.value,
                          }))
                        }
                        className={fieldBaseClass}
                        placeholder="Ej: 150.00"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Usa importe positivo. Si no aplica, déjalo vacío.
                      </p>
                    </div>

                    <div className="md:col-span-2">
                      <div className="mb-2 text-xs font-semibold text-slate-700">
                        ¿Hay evidencia?
                      </div>
                      <label className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 shadow-sm">
                        <input
                          type="checkbox"
                          checked={form.hasEvidence}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              hasEvidence: e.target.checked,
                            }))
                          }
                          className="h-4 w-4"
                        />
                        <span className="text-sm text-slate-700">
                          Sí, existe evidencia interna
                        </span>
                      </label>
                    </div>
                  </div>

                  {selectedIncident && (
                    <div className="rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-700 shadow-sm">
                      <div className="font-semibold text-slate-900">
                        {selectedIncident.title ?? selectedIncident.incident_type}{" "}
                        <span className="text-slate-400">
                          ({selectedIncident.incident_type})
                        </span>
                      </div>

                      {selectedIncident.description && (
                        <div className="mt-1 text-slate-600">
                          {selectedIncident.description}
                        </div>
                      )}

                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-slate-500">Severidad catálogo:</span>{" "}
                          <span className="font-semibold text-slate-900">
                            {selectedIncident.severity ?? "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Rango bruto:</span>{" "}
                          <span className="font-semibold text-slate-900">
                            {selectedIncident.default_gross_min ?? "—"} -{" "}
                            {selectedIncident.default_gross_max ?? "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Recuperación %:</span>{" "}
                          <span className="font-semibold text-slate-900">
                            {selectedIncident.default_recovery_pct ?? "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500">Fuente:</span>{" "}
                          <span className="font-semibold text-slate-900">
                            {selectedIncident.source ?? "GLOBAL"}
                          </span>
                        </div>
                      </div>

                      {selectedIncident.suggested_actions && (
                        <div className="mt-2">
                          <span className="text-slate-500">Acción sugerida:</span>{" "}
                          <span className="font-semibold text-slate-900">
                            {selectedIncident.suggested_actions}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className={sectionCardClass}>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    Descripción / observaciones *
                  </label>
                  <textarea
                    rows={4}
                    value={form.notes}
                    onChange={(e) => {
                      setForm((prev) => ({
                        ...prev,
                        notes: clampText(e.target.value, 500),
                      }));
                      setErrors((prev) => ({
                        ...prev,
                        description: undefined,
                      }));
                    }}
                    className={`${fieldBaseClass} min-h-[110px] resize-y ${
                      errors.description ? fieldErrorClass : ""
                    }`}
                    placeholder="Describe la incidencia de forma objetiva y operativa. Sin acusaciones ni datos innecesarios."
                  />
                  <div className="mt-1 flex justify-between text-[11px] text-slate-500">
                    <span>Usa texto objetivo. Evita detalles sensibles o irrelevantes.</span>
                    <span>{form.notes.length}/500</span>
                  </div>
                  {errors.description && (
                    <p className="mt-1 text-[11px] text-red-600">
                      {errors.description}
                    </p>
                  )}
                </div>

                <div className="pt-1">
                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="flex w-full items-center justify-center rounded-2xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-40"
                  >
                    {status === "submitting" ? (
                      "Guardando…"
                    ) : (
                      <>
                        <Save className="mr-2 h-4 w-4" />
                        Guardar incidencia
                      </>
                    )}
                  </button>

                  {!canSubmit && (
                    <div className="mt-3 text-[12px] text-slate-500">
                      Requisitos mínimos: propiedad activa + tipo + severidad + fecha +
                      descripción + identificador fuerte.
                    </div>
                  )}

                  {status === "error" && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
                      <AlertCircle className="h-4 w-4" />
                      {submitError ||
                        "Error al guardar. Reintenta y revisa permisos / sesión."}
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                  <div className="mb-1 font-semibold">Uso responsable</div>
                  <div>
                    Registro interno para auditoría. Tipifica incidencias y evita texto libre
                    excesivo. Las operaciones son auditables.
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>

        <div>
          <div className="h-full rounded-2xl border border-slate-900 bg-slate-950 p-5 text-white shadow-sm">
            <div className="mb-2 text-sm font-semibold">Buenas prácticas</div>
            <ul className="space-y-2 text-xs leading-6 text-slate-200">
              <li>• Usa siempre un identificador fuerte: documento, email o teléfono.</li>
              <li>• No metas acusaciones ni detalles sensibles innecesarios.</li>
              <li>• Selecciona tipo y severidad de forma consistente.</li>
              <li>• Perfil completo = mejor auditoría y mejores métricas.</li>
            </ul>

            <div className="mt-5 rounded-2xl border border-white/10 bg-white/10 p-4 text-xs text-slate-200">
              <div className="mb-1 font-semibold text-white">Notas operativas</div>
              <div className="mt-2 leading-5">
                Esta pantalla registra incidencias manuales en el nuevo módulo de auditoría.
                El control real de acceso y la trazabilidad se resuelven en backend.
              </div>
              <div className="mt-3 text-[11px] text-slate-300">
                Usuario actual:{" "}
                <span className="font-semibold">{currentCustomerName || "—"}</span>
              </div>
              <div className="mt-1 text-[11px] text-slate-300">
                Ref. cliente actual:{" "}
                <span className="font-semibold">{currentCustomerId || "—"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};