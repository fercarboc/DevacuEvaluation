// src/components/account/PerfilHotel.tsx
import React, { useEffect, useMemo, useState } from "react";
import type { User } from "@/types/types";
import { callEvalFn } from "@/services/callEvalFn";
import {
  Building2,
  MapPin,
  BadgeInfo,
  Save,
  RefreshCw,
  AlertTriangle,
  Percent,
  Clock,
  BedDouble,
  Utensils,
  Car,
  Dog,
  Waves,
  CheckCircle2,
  XCircle,
  Mail,
  User as UserIcon,
  IdCard,
} from "lucide-react";

type PropertyType =
  | "HOTEL"
  | "RURAL_HOUSE"
  | "APARTMENTS"
  | "HOSTEL"
  | "CAMPING"
  | "OTHER";

type HotelProfileRow = {
  customer_id: string;
  app_id: string;

  hotel_name: string | null;
  property_type: PropertyType | null;
  hotel_category: number | null;

  // ✅ YA ES DB (debacu_eval_hotel_profile)
  country: string | null;
  province: string | null;
  city: string | null;

  // ✅ contacto / dirección (DB)
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  postal_code: string | null;
  contact_person: string | null;
  contact_role: string | null;

  // Operativa / economía
  monthly_stays_estimated: number | null;
  adr_real: number | null;
  season_mult_high: number | null;
  season_mult_low: number | null;
  currency: string | null;

  // Objetivos (DB 0..1)
  occupancy_target: number | null;
  revpar_target: number | null;
  cancellation_rate_target: number | null;

  updated_at?: string | null;
  created_at?: string | null;

  // Operativa avanzada
  timezone: string | null;
  checkin_time: string | null; // "HH:MM"
  checkout_time: string | null; // "HH:MM"
  rooms_count: number | null;
  max_occupancy: number | null;

  monthly_revenue_estimate: number | null;

  has_restaurant: boolean | null;
  has_spa: boolean | null;
  has_parking: boolean | null;
  allows_pets: boolean | null;

  profile_completed: boolean | null;
  profile_completed_at: string | null;
};

type HotelProfileGetResponse = {
  ok: boolean;
  profile: HotelProfileRow | null;
  audit_ok?: boolean;
  missing_fields?: string[];
};

type Props = {
  user: User;
};

const DEFAULTS: Omit<HotelProfileRow, "customer_id" | "app_id"> = {
  hotel_name: null,
  property_type: null,
  hotel_category: 3,

  country: null,
  province: null,
  city: null,

  // contacto/dirección
  contact_email: null,
  contact_phone: null,
  address: null,
  postal_code: null,
  contact_person: null,
  contact_role: null,

  monthly_stays_estimated: null,
  adr_real: null,
  season_mult_high: 1.25,
  season_mult_low: 0.8,
  currency: "EUR",

  // Targets (DB 0..1)
  occupancy_target: 0.7,
  revpar_target: null,
  cancellation_rate_target: 0.1,

  // Operativa avanzada
  timezone: "Europe/Madrid",
  checkin_time: "14:00",
  checkout_time: "12:00",
  rooms_count: null,
  max_occupancy: null,

  monthly_revenue_estimate: null,

  has_restaurant: false,
  has_spa: false,
  has_parking: false,
  allows_pets: false,

  profile_completed: false,
  profile_completed_at: null,
};

type FieldErrors = Partial<Record<keyof HotelProfileRow, string>>;
type TouchedMap = Partial<Record<keyof HotelProfileRow, boolean>>;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function clampInt(n: number, min: number, max: number) {
  const v = Math.trunc(Number(n));
  if (!Number.isFinite(v)) return min;
  return clamp(v, min, max);
}

function toNumOrNull(v: string): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const normalized = s.replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function pctToFrac(pct: number | null): number | null {
  if (pct === null) return null;
  return clamp(pct / 100, 0, 1);
}

function fracToPct(frac: number | null): number | null {
  if (frac === null) return null;
  return clamp(frac * 100, 0, 100);
}

/**
 * Acepta HH:MM o HH:MM:SS y normaliza a HH:MM.
 * Devuelve null si es inválido o vacío.
 */
function normalizeTimeHHMMOrNull(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const m = s.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!m) return null;
  return `${m[1]}:${m[2]}`;
}

function isComplete(p: HotelProfileRow) {
  // ✅ mínimo para auditoría completa (regla UI)
  return Boolean(
    (p.property_type ?? null) &&
      (p.country ?? "").trim() &&
      (p.province ?? "").trim() &&
      (p.city ?? "").trim()
  );
}

function trimOrNull(v: string | null | undefined) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function upperOrNull(v: string | null | undefined) {
  const s = String(v ?? "").trim();
  return s ? s.toUpperCase() : null;
}

function normalizeEmailOrNull(v: string | null | undefined) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  // validación suave: no bloquea por regex estricta
  if (!s.includes("@") || !s.includes(".")) return s;
  return s;
}

// Teléfono: permite + al inicio y luego solo dígitos
function sanitizePhone(v: string) {
  const raw = String(v ?? "");
  const hasPlus = raw.trim().startsWith("+");
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return "";
  return hasPlus ? `+${digits}` : digits;
}

// CP: solo dígitos
function sanitizePostalCode(v: string) {
  return String(v ?? "").replace(/[^\d]/g, "").slice(0, 10);
}

function validateProfile(p: HotelProfileRow): FieldErrors {
  const e: FieldErrors = {};

  // Obligatorios (auditoría completa)
  if (!trimOrNull(p.property_type)) e.property_type = "Selecciona un tipo.";
  if (!trimOrNull(p.country)) e.country = "El país es obligatorio.";
  if (!trimOrNull(p.province)) e.province = "La provincia es obligatoria.";
  if (!trimOrNull(p.city)) e.city = "La ciudad es obligatoria.";

  // Horas: válido si null/empty; si hay valor, debe normalizar
  if (p.checkin_time && !normalizeTimeHHMMOrNull(p.checkin_time)) {
    e.checkin_time = "Check-in inválido (HH:MM).";
  }
  if (p.checkout_time && !normalizeTimeHHMMOrNull(p.checkout_time)) {
    e.checkout_time = "Check-out inválido (HH:MM).";
  }

  // Email (si lo informan)
  const email = trimOrNull(p.contact_email);
  if (email && (!email.includes("@") || !email.includes("."))) {
    e.contact_email = "Email inválido.";
  }

  // Teléfono (si lo informan)
  const phone = trimOrNull(p.contact_phone);
  if (phone) {
    const digits = phone.replace(/[^\d]/g, "");
    if (digits.length < 7) e.contact_phone = "Teléfono demasiado corto.";
  }

  // CP (si lo informan) => mínimo 4 dígitos, por no forzar país
  const pc = trimOrNull(p.postal_code);
  if (pc) {
    const digits = pc.replace(/[^\d]/g, "");
    if (digits.length < 4) e.postal_code = "Código postal demasiado corto.";
  }

  return e;
}

export function PerfilHotel({ user }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [auditOk, setAuditOk] = useState<boolean | null>(null);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  // ✅ control inputs
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [touched, setTouched] = useState<TouchedMap>({});

  const [profile, setProfile] = useState<HotelProfileRow>(() => ({
    customer_id: (user as any)?.customerId ?? (user as any)?.id ?? "",
    app_id: "DEBACU_EVAL",
    ...DEFAULTS,
  }));

  function markTouched<K extends keyof HotelProfileRow>(key: K) {
    setTouched((t) => ({ ...t, [key]: true }));
  }

  function setField<K extends keyof HotelProfileRow>(key: K, value: HotelProfileRow[K]) {
    setProfile((p) => ({ ...p, [key]: value }));

    // validación en vivo (solo si ya tocaron el campo)
    setFieldErrors((prev) => {
      if (!touched[key]) return prev;
      const nextProfile = { ...profile, [key]: value } as HotelProfileRow;
      const nextErrors = validateProfile(nextProfile);
      return { ...prev, [key]: nextErrors[key] };
    });
  }

  const occupancyPct = useMemo(
    () => fracToPct(profile.occupancy_target),
    [profile.occupancy_target]
  );
  const cancelPct = useMemo(
    () => fracToPct(profile.cancellation_rate_target),
    [profile.cancellation_rate_target]
  );

  const completeness = useMemo(() => isComplete(profile), [profile]);

  const load = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await callEvalFn<HotelProfileGetResponse>(
        "debacu_eval_hotel_profile_get",
        { app_id: "DEBACU_EVAL" }
      );

      const row = res?.profile ?? null;

      setAuditOk(typeof res?.audit_ok === "boolean" ? res.audit_ok : null);
      setMissingFields(Array.isArray(res?.missing_fields) ? res.missing_fields : []);

      setProfile((prev) => {
        const base: HotelProfileRow = {
          ...prev,
          ...DEFAULTS,
          app_id: "DEBACU_EVAL",
        };

        const merged: HotelProfileRow = row
          ? {
              ...base,
              ...row,

              hotel_category: clamp(Number(row.hotel_category ?? 3), 1, 5),

              season_mult_high:
                row.season_mult_high === null ? 1.25 : Number(row.season_mult_high),
              season_mult_low:
                row.season_mult_low === null ? 0.8 : Number(row.season_mult_low),

              occupancy_target:
                row.occupancy_target === null || row.occupancy_target === undefined
                  ? DEFAULTS.occupancy_target
                  : clamp(Number(row.occupancy_target), 0, 1),
              cancellation_rate_target:
                row.cancellation_rate_target === null ||
                row.cancellation_rate_target === undefined
                  ? DEFAULTS.cancellation_rate_target
                  : clamp(Number(row.cancellation_rate_target), 0, 1),

              timezone: row.timezone ?? DEFAULTS.timezone,
              // Normaliza por si BD devuelve HH:MM:SS
              checkin_time:
                normalizeTimeHHMMOrNull(row.checkin_time) ??
                normalizeTimeHHMMOrNull(DEFAULTS.checkin_time) ??
                "14:00",
              checkout_time:
                normalizeTimeHHMMOrNull(row.checkout_time) ??
                normalizeTimeHHMMOrNull(DEFAULTS.checkout_time) ??
                "12:00",

              has_restaurant:
                row.has_restaurant === null || row.has_restaurant === undefined
                  ? DEFAULTS.has_restaurant
                  : Boolean(row.has_restaurant),
              has_spa:
                row.has_spa === null || row.has_spa === undefined
                  ? DEFAULTS.has_spa
                  : Boolean(row.has_spa),
              has_parking:
                row.has_parking === null || row.has_parking === undefined
                  ? DEFAULTS.has_parking
                  : Boolean(row.has_parking),
              allows_pets:
                row.allows_pets === null || row.allows_pets === undefined
                  ? DEFAULTS.allows_pets
                  : Boolean(row.allows_pets),

              profile_completed:
                row.profile_completed === null || row.profile_completed === undefined
                  ? DEFAULTS.profile_completed
                  : Boolean(row.profile_completed),
              profile_completed_at: row.profile_completed_at ?? null,
            }
          : base;

        return merged;
      });

      // resetea errores/touched tras cargar
      setFieldErrors({});
      setTouched({});
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "No se pudo cargar el perfil del hotel.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      // 1) Normaliza valores antes de validar/guardar
      const normalized: HotelProfileRow = {
        ...profile,
        hotel_name: trimOrNull(profile.hotel_name),

        // ubicación (en mayúsculas para normalizar)
        country: upperOrNull(profile.country),
        province: upperOrNull(profile.province),
        city: upperOrNull(profile.city),

        // contacto/dirección (trim; email no a mayúsculas)
        contact_email: trimOrNull(profile.contact_email),
        // aplica saneo (si hay valor)
        contact_phone: trimOrNull(profile.contact_phone),
        address: trimOrNull(profile.address),
        postal_code: trimOrNull(profile.postal_code),
        contact_person: trimOrNull(profile.contact_person),
        contact_role: trimOrNull(profile.contact_role),

        // operativa
        timezone: trimOrNull(profile.timezone),

        // Normaliza horas SIEMPRE a HH:MM, y si vienen vacías -> defaults para evitar el bug “2ª vez”
        checkin_time: normalizeTimeHHMMOrNull(profile.checkin_time) ?? "14:00",
        checkout_time: normalizeTimeHHMMOrNull(profile.checkout_time) ?? "12:00",
      };

      // refleja normalización en UI (incluye horas ya saneadas)
      setProfile(normalized);

      const errors = validateProfile(normalized);
      setFieldErrors(errors);

      // marcamos como "touched" lo obligatorio para que se vean errores si faltan
      setTouched((t) => ({
        ...t,
        property_type: true,
        country: true,
        province: true,
        city: true,
        checkin_time: true,
        checkout_time: true,
        // opcionales: solo si ya los tocaron
        contact_email: t.contact_email ?? false,
        contact_phone: t.contact_phone ?? false,
        postal_code: t.postal_code ?? false,
      }));

      if (Object.keys(errors).length > 0) {
        const list = Object.values(errors).filter(Boolean).slice(0, 6).join(" · ");
        throw new Error(list || "Faltan/corrige campos obligatorios.");
      }

      const cat = clamp(Number(normalized.hotel_category ?? 3), 1, 5);
      const hi =
        normalized.season_mult_high === null ? null : Number(normalized.season_mult_high);
      const lo =
        normalized.season_mult_low === null ? null : Number(normalized.season_mult_low);

      if (hi !== null && (!Number.isFinite(hi) || hi <= 0))
        throw new Error("Temporada alta: valor inválido.");
      if (lo !== null && (!Number.isFinite(lo) || lo <= 0))
        throw new Error("Temporada baja: valor inválido.");

      const payload: Partial<HotelProfileRow> = {
        app_id: "DEBACU_EVAL",
        hotel_name: trimOrNull(normalized.hotel_name),
        property_type: (normalized.property_type ?? null) as any,
        hotel_category: cat,

        // ✅ DB (perfil)
        country: trimOrNull(normalized.country),
        province: trimOrNull(normalized.province),
        city: trimOrNull(normalized.city),

        // ✅ DB (contacto/dirección)
        contact_email: normalizeEmailOrNull(normalized.contact_email),

        // saneo “duro”: tel y cp solo se mandan ya saneados
        contact_phone: (() => {
          const s = trimOrNull(normalized.contact_phone);
          if (!s) return null;
          const v = sanitizePhone(s);
          return v ? v : null;
        })(),
        address: trimOrNull(normalized.address),
        postal_code: (() => {
          const s = trimOrNull(normalized.postal_code);
          if (!s) return null;
          const v = sanitizePostalCode(s);
          return v ? v : null;
        })(),
        contact_person: trimOrNull(normalized.contact_person),
        contact_role: trimOrNull(normalized.contact_role),

        currency: trimOrNull(normalized.currency) ?? "EUR",

        monthly_stays_estimated:
          normalized.monthly_stays_estimated === null
            ? null
            : clamp(Number(normalized.monthly_stays_estimated), 0, 1_000_000),
        adr_real:
          normalized.adr_real === null ? null : clamp(Number(normalized.adr_real), 0, 1_000_000),

        season_mult_high: hi === null ? null : clamp(hi, 0, 100),
        season_mult_low: lo === null ? null : clamp(lo, 0, 100),

        occupancy_target:
          normalized.occupancy_target === null
            ? null
            : clamp(Number(normalized.occupancy_target), 0, 1),
        cancellation_rate_target:
          normalized.cancellation_rate_target === null
            ? null
            : clamp(Number(normalized.cancellation_rate_target), 0, 1),
        revpar_target:
          normalized.revpar_target === null
            ? null
            : clamp(Number(normalized.revpar_target), 0, 1_000_000),

        // Operativa avanzada
        timezone: trimOrNull(normalized.timezone) ?? "Europe/Madrid",
        checkin_time: normalized.checkin_time,
        checkout_time: normalized.checkout_time,

        rooms_count:
          normalized.rooms_count === null
            ? null
            : clampInt(Number(normalized.rooms_count), 0, 100_000),
        max_occupancy:
          normalized.max_occupancy === null
            ? null
            : clampInt(Number(normalized.max_occupancy), 0, 100_000),

        monthly_revenue_estimate:
          normalized.monthly_revenue_estimate === null
            ? null
            : clamp(Number(normalized.monthly_revenue_estimate), 0, 1_000_000_000),

        has_restaurant: Boolean(normalized.has_restaurant),
        has_spa: Boolean(normalized.has_spa),
        has_parking: Boolean(normalized.has_parking),
        allows_pets: Boolean(normalized.allows_pets),
      };

      const completeAfterSave = Boolean(
        payload.property_type &&
          (payload.country ?? "").trim() &&
          (payload.province ?? "").trim() &&
          (payload.city ?? "").trim()
      );

      const res = await callEvalFn<{
        ok: boolean;
        profile: HotelProfileRow;
        audit_ok?: boolean;
        missing_fields?: string[];
      }>("debacu_eval_hotel_profile_upsert", payload);

      if (!res?.ok) throw new Error("No se pudo guardar el perfil.");

      setAuditOk(typeof res?.audit_ok === "boolean" ? res.audit_ok : auditOk);
      setMissingFields(Array.isArray(res?.missing_fields) ? res.missing_fields : missingFields);

      // Asegura horas normalizadas tras respuesta
      const mergedProfile: HotelProfileRow = {
        ...profile,
        ...res.profile,
        checkin_time:
          normalizeTimeHHMMOrNull(res.profile?.checkin_time) ??
          normalizeTimeHHMMOrNull(profile.checkin_time) ??
          "14:00",
        checkout_time:
          normalizeTimeHHMMOrNull(res.profile?.checkout_time) ??
          normalizeTimeHHMMOrNull(profile.checkout_time) ??
          "12:00",
      };

      setProfile(mergedProfile);

      setMessage(completeAfterSave ? "Guardado ✅" : "Guardado, pero faltan campos obligatorios.");
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "No se pudo guardar.");
    } finally {
      setSaving(false);
    }
  };

  const Header = () => (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          <Building2 className="w-5 h-5 text-slate-700" />
          <h3 className="text-lg font-semibold text-slate-900">Perfil del hotel</h3>
          {profile.profile_completed ? (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Completo
            </span>
          ) : (
            <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-800">
              <XCircle className="w-3.5 h-3.5" />
              Incompleto
            </span>
          )}
        </div>

        <p className="text-xs text-slate-500 mt-1">
          Estos datos alimentan auditoría, comparativas y métricas. Obligatorio para “auditoría completa”:{" "}
          <b>Tipo</b>, <b>País</b>, <b>Provincia</b>, <b>Ciudad</b>.
        </p>

        {auditOk !== null && (
          <p className="text-xs mt-1 text-slate-600">
            Auditoría:{" "}
            <b className={auditOk ? "text-emerald-700" : "text-amber-700"}>
              {auditOk ? "OK" : "Limitada"}
            </b>
            {missingFields.length > 0 && (
              <span className="text-slate-500"> · Faltan: {missingFields.join(", ")}</span>
            )}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={load}
          disabled={loading || saving}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Recargar
        </button>

        <button
          type="button"
          onClick={save}
          disabled={loading || saving}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-black disabled:opacity-60"
        >
          <Save className="w-4 h-4" />
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <Header />
        <div className="mt-6 text-sm text-slate-500">Cargando perfil…</div>
      </div>
    );
  }

  const errCls = (k: keyof HotelProfileRow, base: string) =>
    `${base} ${touched[k] && fieldErrors[k] ? "border-red-300 bg-red-50" : ""}`;

  const errMsg = (k: keyof HotelProfileRow) =>
    touched[k] && fieldErrors[k] ? (
      <div className="mt-1 text-xs text-red-600">{fieldErrors[k]}</div>
    ) : null;

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <Header />

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5" />
            <div>{error}</div>
          </div>
        )}

        {message && !error && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {message}
          </div>
        )}

        {!completeness && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
            <BadgeInfo className="w-4 h-4 mt-0.5" />
            <div>
              Perfil incompleto: rellena <b>Tipo</b>, <b>País</b>, <b>Provincia</b> y{" "}
              <b>Ciudad</b> para habilitar auditoría completa.
            </div>
          </div>
        )}

        {/* === 3 CARDS HORIZONTALES (más profesional) === */}
        <div className="mt-6 grid gap-4 xl:grid-cols-3">
          {/* Card base */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-600" />
                <p className="text-sm font-semibold text-slate-900">Identificación</p>
              </div>
              <span className="text-[11px] font-medium text-slate-500">Hotel</span>
            </div>

            <div className="p-5 space-y-4">
              {/* fila 1 */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500">Nombre del hotel</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:bg-white focus:border-slate-300"
                  value={profile.hotel_name ?? ""}
                  onBlur={() => {
                    markTouched("hotel_name");
                    setField("hotel_name", trimOrNull(profile.hotel_name));
                  }}
                  onChange={(e) => setField("hotel_name", e.target.value ? e.target.value : null)}
                  placeholder="Ej: Hotel Palmeras"
                />
              </div>

              {/* fila 2 (2 columnas) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500">Tipo *</label>
                  <select
                    className={errCls(
                      "property_type",
                      "mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:bg-white focus:border-slate-300"
                    )}
                    value={profile.property_type ?? ""}
                    onBlur={() => markTouched("property_type")}
                    onChange={(e) => setField("property_type", (e.target.value || null) as any)}
                  >
                    <option value="">Selecciona…</option>
                    <option value="HOTEL">Hotel</option>
                    <option value="RURAL_HOUSE">Casa rural</option>
                    <option value="APARTMENTS">Apartamentos</option>
                    <option value="HOSTEL">Hostal</option>
                    <option value="CAMPING">Camping</option>
                    <option value="OTHER">Otro</option>
                  </select>
                  {errMsg("property_type")}
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-500">Categoría</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:bg-white focus:border-slate-300"
                    value={profile.hotel_category ?? 3}
                    onChange={(e) => setField("hotel_category", Number(e.target.value))}
                  >
                    <option value={1}>1 ★</option>
                    <option value={2}>2 ★</option>
                    <option value={3}>3 ★</option>
                    <option value={4}>4 ★</option>
                    <option value={5}>5 ★</option>
                  </select>
                </div>
              </div>

              {/* fila 3 */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500">Moneda</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:bg-white focus:border-slate-300"
                  value={profile.currency ?? "EUR"}
                  onChange={(e) => setField("currency", e.target.value || "EUR")}
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
            </div>
          </div>

          {/* UBICACIÓN (incluye domicilio + cp) */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-slate-600" />
                <p className="text-sm font-semibold text-slate-900">Ubicación</p>
              </div>
              <span className="text-[11px] font-medium text-slate-500">Fiscal/Operativa</span>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-500">País *</label>
                <input
                  className={errCls(
                    "country",
                    "mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:bg-white focus:border-slate-300"
                  )}
                  value={profile.country ?? ""}
                  onBlur={() => {
                    markTouched("country");
                    setField("country", upperOrNull(profile.country));
                  }}
                  onChange={(e) => setField("country", e.target.value ? e.target.value : null)}
                  placeholder="Ej: España"
                />
                {errMsg("country")}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500">Provincia *</label>
                  <input
                    className={errCls(
                      "province",
                      "mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:bg-white focus:border-slate-300"
                    )}
                    value={profile.province ?? ""}
                    onBlur={() => {
                      markTouched("province");
                      setField("province", upperOrNull(profile.province));
                    }}
                    onChange={(e) => setField("province", e.target.value ? e.target.value : null)}
                    placeholder="Ej: Cantabria"
                  />
                  {errMsg("province")}
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-500">Ciudad *</label>
                  <input
                    className={errCls(
                      "city",
                      "mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:bg-white focus:border-slate-300"
                    )}
                    value={profile.city ?? ""}
                    onBlur={() => {
                      markTouched("city");
                      setField("city", upperOrNull(profile.city));
                    }}
                    onChange={(e) => setField("city", e.target.value ? e.target.value : null)}
                    placeholder="Ej: Torrelavega"
                  />
                  {errMsg("city")}
                </div>
              </div>

              {/* ✅ Domicilio + CP aquí */}
              <div>
                <label className="text-[11px] font-semibold text-slate-500">Domicilio</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:bg-white focus:border-slate-300"
                  value={profile.address ?? ""}
                  onBlur={() => {
                    markTouched("address");
                    setField("address", trimOrNull(profile.address));
                  }}
                  onChange={(e) => setField("address", e.target.value ? e.target.value : null)}
                  placeholder="Ej: Calle Mayor 12"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 items-end">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500">Código postal</label>
                  <input
                    inputMode="numeric"
                    autoComplete="postal-code"
                    className={errCls(
                      "postal_code",
                      "mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:bg-white focus:border-slate-300"
                    )}
                    value={profile.postal_code ?? ""}
                    onBlur={() => {
                      markTouched("postal_code");
                      setField("postal_code", trimOrNull(profile.postal_code));
                    }}
                    onChange={(e) => {
                      const v = sanitizePostalCode(e.target.value);
                      setField("postal_code", v ? v : null);
                    }}
                    placeholder="Ej: 39620"
                  />
                  {errMsg("postal_code")}
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Si falta ubicación, la auditoría sale “incompleta”.
                </div>
              </div>
            </div>
          </div>

          {/* CONTACTO (sin domicilio/cp) */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-slate-600" />
                <p className="text-sm font-semibold text-slate-900">Contacto</p>
              </div>
              <span className="text-[11px] font-medium text-slate-500">Soporte/Avisos</span>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-500">Email de contacto</label>
                <input
                  inputMode="email"
                  autoComplete="email"
                  className={errCls(
                    "contact_email",
                    "mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:bg-white focus:border-slate-300"
                  )}
                  value={profile.contact_email ?? ""}
                  onBlur={() => {
                    markTouched("contact_email");
                    setField("contact_email", trimOrNull(profile.contact_email));
                  }}
                  onChange={(e) => setField("contact_email", e.target.value ? e.target.value : null)}
                  placeholder="Ej: recepcion@hotel.com"
                />
                {errMsg("contact_email")}
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-500">Teléfono de contacto</label>
                <input
                  inputMode="tel"
                  autoComplete="tel"
                  className={errCls(
                    "contact_phone",
                    "mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:bg-white focus:border-slate-300"
                  )}
                  value={profile.contact_phone ?? ""}
                  onBlur={() => {
                    markTouched("contact_phone");
                    setField("contact_phone", trimOrNull(profile.contact_phone));
                  }}
                  onChange={(e) => {
                    const v = sanitizePhone(e.target.value);
                    setField("contact_phone", v ? v : null);
                  }}
                  placeholder="Ej: +34600123456"
                />
                {errMsg("contact_phone")}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500">Persona de contacto</label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm outline-none focus:bg-white focus:border-slate-300"
                      value={profile.contact_person ?? ""}
                      onBlur={() => {
                        markTouched("contact_person");
                        setField("contact_person", trimOrNull(profile.contact_person));
                      }}
                      onChange={(e) =>
                        setField("contact_person", e.target.value ? e.target.value : null)
                      }
                      placeholder="Ej: Ana López"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-500">Cargo</label>
                  <div className="relative">
                    <IdCard className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-sm outline-none focus:bg-white focus:border-slate-300"
                      value={profile.contact_role ?? ""}
                      onBlur={() => {
                        markTouched("contact_role");
                        setField("contact_role", trimOrNull(profile.contact_role));
                      }}
                      onChange={(e) => setField("contact_role", e.target.value ? e.target.value : null)}
                      placeholder="Ej: Dirección / Recepción"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                Operativo (soporte, incidencias, auditoría). No es PII de huéspedes.
              </div>
            </div>
          </div>
        </div>

        {/* Economía / Temporadas */}
        <div className="mt-4 bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <BadgeInfo className="w-4 h-4 text-slate-600" />
            <p className="text-sm font-semibold text-slate-900">Economía / Temporadas</p>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-xs font-semibold text-slate-600">Estancias mensuales estimadas</label>
              <input
                type="number"
                min={0}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={profile.monthly_stays_estimated ?? ""}
                onChange={(e) => setField("monthly_stays_estimated", toNumOrNull(e.target.value))}
                placeholder="Ej: 140"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">ADR real (opcional)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={profile.adr_real ?? ""}
                onChange={(e) => setField("adr_real", toNumOrNull(e.target.value))}
                placeholder="Ej: 95.00"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Mult. alta</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={profile.season_mult_high ?? ""}
                  onChange={(e) => setField("season_mult_high", toNumOrNull(e.target.value))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Mult. baja</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={profile.season_mult_low ?? ""}
                  onChange={(e) => setField("season_mult_low", toNumOrNull(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            Estos multiplicadores afectan a estimaciones comparativas (alta/baja) y alertas económicas.
          </div>
        </div>

        {/* Operativa avanzada */}
        <div className="mt-4 bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-600" />
            <p className="text-sm font-semibold text-slate-900">Operativa</p>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Estos datos sirven para auditoría avanzada, ratios y consistencia operativa.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-xs font-semibold text-slate-600">Zona horaria</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={profile.timezone ?? ""}
                onBlur={() => {
                  markTouched("timezone");
                  setField("timezone", trimOrNull(profile.timezone));
                }}
                onChange={(e) => setField("timezone", e.target.value ? e.target.value : null)}
                placeholder="Ej: Europe/Madrid"
              />
              {errMsg("timezone")}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">Check-in</label>
              <input
                type="time"
                className={errCls(
                  "checkin_time",
                  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                )}
                value={profile.checkin_time ?? ""}
                onBlur={() => markTouched("checkin_time")}
                onChange={(e) => setField("checkin_time", e.target.value || null)}
              />
              {errMsg("checkin_time")}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">Check-out</label>
              <input
                type="time"
                className={errCls(
                  "checkout_time",
                  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                )}
                value={profile.checkout_time ?? ""}
                onBlur={() => markTouched("checkout_time")}
                onChange={(e) => setField("checkout_time", e.target.value || null)}
              />
              {errMsg("checkout_time")}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">Nº habitaciones</label>
              <input
                type="number"
                min={0}
                step="1"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={profile.rooms_count ?? ""}
                onChange={(e) => setField("rooms_count", toNumOrNull(e.target.value))}
                placeholder="Ej: 25"
              />
              {errMsg("rooms_count")}
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">Ocupación máxima</label>
              <input
                type="number"
                min={0}
                step="1"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={profile.max_occupancy ?? ""}
                onChange={(e) => setField("max_occupancy", toNumOrNull(e.target.value))}
                placeholder="Ej: 60"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">Ingresos mensuales (estimación)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={profile.monthly_revenue_estimate ?? ""}
                onChange={(e) => setField("monthly_revenue_estimate", toNumOrNull(e.target.value))}
                placeholder="Ej: 42000"
              />
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <Utensils className="w-4 h-4 text-slate-600" />
              <input
                type="checkbox"
                checked={Boolean(profile.has_restaurant)}
                onChange={(e) => setField("has_restaurant", e.target.checked)}
              />
              Restaurante
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <Waves className="w-4 h-4 text-slate-600" />
              <input
                type="checkbox"
                checked={Boolean(profile.has_spa)}
                onChange={(e) => setField("has_spa", e.target.checked)}
              />
              Spa
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <Car className="w-4 h-4 text-slate-600" />
              <input
                type="checkbox"
                checked={Boolean(profile.has_parking)}
                onChange={(e) => setField("has_parking", e.target.checked)}
              />
              Parking
            </label>

            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
              <Dog className="w-4 h-4 text-slate-600" />
              <input
                type="checkbox"
                checked={Boolean(profile.allows_pets)}
                onChange={(e) => setField("allows_pets", e.target.checked)}
              />
              Admite mascotas
            </label>
          </div>
        </div>

        {/* Targets */}
        <div className="mt-4 bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-center gap-2">
            <Percent className="w-4 h-4 text-slate-600" />
            <p className="text-sm font-semibold text-slate-900">Objetivos (targets)</p>
          </div>

          <p className="text-xs text-slate-500 mt-1">
            En base de datos se guarda como <b>0..1</b> (fracción). En pantalla lo ves como <b>0..100%</b>.
          </p>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-xs font-semibold text-slate-600">Objetivo ocupación (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step="1"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={occupancyPct ?? ""}
                onChange={(e) => {
                  const pct = toNumOrNull(e.target.value);
                  setField("occupancy_target", pctToFrac(pct));
                }}
                placeholder="Ej: 70"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">Objetivo cancelación (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                step="1"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={cancelPct ?? ""}
                onChange={(e) => {
                  const pct = toNumOrNull(e.target.value);
                  setField("cancellation_rate_target", pctToFrac(pct));
                }}
                placeholder="Ej: 10"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-600">Objetivo RevPAR (moneda)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                value={profile.revpar_target ?? ""}
                onChange={(e) => setField("revpar_target", toNumOrNull(e.target.value))}
                placeholder="Ej: 65.00"
              />
            </div>
          </div>
        </div>

        {/* Nota de consistencia */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600 flex items-start gap-2">
          <BedDouble className="w-4 h-4 mt-0.5 text-slate-600" />
          <div>
            Consejo práctico: <b>Nº habitaciones</b> + <b>zona horaria</b> deberían ser obligatorios si quieres que el
            sistema pueda comparar ratios y alertas de forma fiable. Si no los fuerzas, “auditoría completa” será
            incoherente.
          </div>
        </div>
      </div>
    </div>
  );
}

export default PerfilHotel;