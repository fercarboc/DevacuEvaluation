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

  // ⚠️ En DB NO lo queremos (viene de customers), pero lo mantenemos en UI state
  country: string | null;
  province: string | null;
  city: string | null;

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
};

type HotelProfileGetResponse = {
  ok: boolean;
  profile: HotelProfileRow | null;
  location?: { country: string | null; province: string | null; city: string | null };
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

  monthly_stays_estimated: null,
  adr_real: null,
  season_mult_high: 1.25,
  season_mult_low: 0.8,
  currency: "EUR",

  occupancy_target: 0.7,
  revpar_target: null,
  cancellation_rate_target: 0.1,
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function toNumOrNull(v: string): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
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

function isComplete(p: HotelProfileRow) {
  return Boolean(
    (p.property_type ?? null) &&
      (p.country ?? "").trim() &&
      (p.province ?? "").trim() &&
      (p.city ?? "").trim()
  );
}

export function PerfilHotel({ user }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [profile, setProfile] = useState<HotelProfileRow>(() => ({
    customer_id: (user as any)?.customerId ?? (user as any)?.id ?? "",
    app_id: "DEBACU_EVAL",
    ...DEFAULTS,
  }));

  // UI: porcentajes
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
      const loc = res?.location ?? null;

      setProfile((prev) => {
        // base
        const base: HotelProfileRow = {
          ...prev,
          ...DEFAULTS,
          app_id: "DEBACU_EVAL",
        };

        // mezcla desde profile (sin fiarnos de location ahí)
        const merged: HotelProfileRow = row
          ? {
              ...base,
              ...row,

              // clamps
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
            }
          : base;

        // ✅ ubicación SIEMPRE desde customers (res.location)
        return {
          ...merged,
          country: loc?.country ?? merged.country ?? null,
          province: loc?.province ?? merged.province ?? null,
          city: loc?.city ?? merged.city ?? null,
        };
      });
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
      const cat = clamp(Number(profile.hotel_category ?? 3), 1, 5);
      const hi = profile.season_mult_high === null ? null : Number(profile.season_mult_high);
      const lo = profile.season_mult_low === null ? null : Number(profile.season_mult_low);

      if (hi !== null && (!Number.isFinite(hi) || hi <= 0))
        throw new Error("Temporada alta: valor inválido.");
      if (lo !== null && (!Number.isFinite(lo) || lo <= 0))
        throw new Error("Temporada baja: valor inválido.");

      const payload: Partial<HotelProfileRow> = {
        app_id: "DEBACU_EVAL",
        hotel_name: profile.hotel_name?.trim() ? profile.hotel_name.trim() : null,
        property_type: (profile.property_type ?? null) as any,
        hotel_category: cat,

        // ⚠️ se envían para que el backend actualice customers,
        // pero NO deben depender de que debacu_eval_hotel_profile los persista.
        country: profile.country?.trim() ? profile.country.trim() : null,
        province: profile.province?.trim() ? profile.province.trim() : null,
        city: profile.city?.trim() ? profile.city.trim() : null,

        currency: profile.currency?.trim() ? profile.currency.trim() : "EUR",

        monthly_stays_estimated:
          profile.monthly_stays_estimated === null
            ? null
            : clamp(Number(profile.monthly_stays_estimated), 0, 1_000_000),
        adr_real:
          profile.adr_real === null ? null : clamp(Number(profile.adr_real), 0, 1_000_000),

        season_mult_high: hi === null ? null : clamp(hi, 0, 100),
        season_mult_low: lo === null ? null : clamp(lo, 0, 100),

        occupancy_target:
          profile.occupancy_target === null
            ? null
            : clamp(Number(profile.occupancy_target), 0, 1),
        cancellation_rate_target:
          profile.cancellation_rate_target === null
            ? null
            : clamp(Number(profile.cancellation_rate_target), 0, 1),
        revpar_target:
          profile.revpar_target === null
            ? null
            : clamp(Number(profile.revpar_target), 0, 1_000_000),
      };

      const completeAfterSave = Boolean(
        payload.property_type &&
          (payload.country ?? "").trim() &&
          (payload.province ?? "").trim() &&
          (payload.city ?? "").trim()
      );

      const res = await callEvalFn<{ ok: boolean; profile: HotelProfileRow }>(
        "debacu_eval_hotel_profile_upsert",
        payload
      );

      if (!res?.ok) throw new Error("No se pudo guardar el perfil.");

      // ✅ NO permitimos que res.profile pise ubicación (si viniera null)
      setProfile((prev) => ({
        ...prev,
        ...res.profile,
        country: prev.country,
        province: prev.province,
        city: prev.city,
      }));

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
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Estos datos alimentan auditoría, comparativas y métricas. Obligatorio para “auditoría completa”:{" "}
          <b>Tipo</b>, <b>País</b>, <b>Provincia</b>, <b>Ciudad</b>.
        </p>
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
              Perfil incompleto: rellena <b>Tipo</b>, <b>País</b>, <b>Provincia</b> y <b>Ciudad</b> para habilitar
              auditoría completa.
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {/* Identidad */}
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-600" />
              <p className="text-sm font-semibold text-slate-900">Identificación</p>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Nombre del hotel</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={profile.hotel_name ?? ""}
                  onChange={(e) => setProfile((p) => ({ ...p, hotel_name: e.target.value || null }))}
                  placeholder="Ej: Hotel Palmeras"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Tipo *</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={profile.property_type ?? ""}
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, property_type: (e.target.value || null) as any }))
                    }
                  >
                    <option value="">Selecciona…</option>
                    <option value="HOTEL">Hotel</option>
                    <option value="RURAL_HOUSE">Casa rural</option>
                    <option value="APARTMENTS">Apartamentos</option>
                    <option value="HOSTEL">Hostal</option>
                    <option value="CAMPING">Camping</option>
                    <option value="OTHER">Otro</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600">Categoría</label>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={profile.hotel_category ?? 3}
                    onChange={(e) => setProfile((p) => ({ ...p, hotel_category: Number(e.target.value) }))}
                  >
                    <option value={1}>1 ★</option>
                    <option value={2}>2 ★</option>
                    <option value={3}>3 ★</option>
                    <option value={4}>4 ★</option>
                    <option value={5}>5 ★</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600">Moneda</label>
                <select
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={profile.currency ?? "EUR"}
                  onChange={(e) => setProfile((p) => ({ ...p, currency: e.target.value || "EUR" }))}
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
            </div>
          </div>

          {/* Ubicación */}
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-slate-600" />
              <p className="text-sm font-semibold text-slate-900">Ubicación</p>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">País *</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={profile.country ?? ""}
                  onChange={(e) => setProfile((p) => ({ ...p, country: e.target.value || null }))}
                  placeholder="Ej: España"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600">Provincia *</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={profile.province ?? ""}
                    onChange={(e) => setProfile((p) => ({ ...p, province: e.target.value || null }))}
                    placeholder="Ej: Cantabria"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-600">Ciudad *</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={profile.city ?? ""}
                    onChange={(e) => setProfile((p) => ({ ...p, city: e.target.value || null }))}
                    placeholder="Ej: Santander"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                Si esto queda vacío, tu auditoría saldrá “incompleta” (a propósito).
              </div>
            </div>
          </div>

          {/* Economía / Operativa */}
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
            <div className="flex items-center gap-2">
              <BadgeInfo className="w-4 h-4 text-slate-600" />
              <p className="text-sm font-semibold text-slate-900">Economía / Temporadas</p>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Estancias mensuales estimadas</label>
                <input
                  type="number"
                  min={0}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  value={profile.monthly_stays_estimated ?? ""}
                  onChange={(e) =>
                    setProfile((p) => ({ ...p, monthly_stays_estimated: toNumOrNull(e.target.value) }))
                  }
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
                  onChange={(e) => setProfile((p) => ({ ...p, adr_real: toNumOrNull(e.target.value) }))}
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
                    onChange={(e) => setProfile((p) => ({ ...p, season_mult_high: toNumOrNull(e.target.value) }))}
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
                    onChange={(e) => setProfile((p) => ({ ...p, season_mult_low: toNumOrNull(e.target.value) }))}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                Estos multiplicadores afectan a estimaciones comparativas (alta/baja) y alertas económicas.
              </div>
            </div>
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
                  setProfile((p) => ({ ...p, occupancy_target: pctToFrac(pct) }));
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
                  setProfile((p) => ({ ...p, cancellation_rate_target: pctToFrac(pct) }));
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
                onChange={(e) => setProfile((p) => ({ ...p, revpar_target: toNumOrNull(e.target.value) }))}
                placeholder="Ej: 65.00"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PerfilHotel;
