import React, { useEffect, useMemo, useState } from "react";
import { TrendingDown, ShieldAlert, Info } from "lucide-react";
import {
  customerRevenueChannelsGet,
  type RevenueChannelRow,
  type PeriodField,
} from "@/services/revenueService";

import ChannelLeakDetailDrawer from "@/components/revenue/ChannelLeakDetailDrawer";

type LeakItem = {
  id: string;
  title: string;
  description: string;
  impact: string;
  severity: "critical" | "warning" | "info";
  icon: React.ComponentType<{ className?: string }>;
  color: "red" | "yellow" | "blue";

  // ✅ datos para abrir el drawer
  channel_group: RevenueChannelRow["channel_group"];
  platform_key: string;

  // ✅ guardamos net numérico para lógica UI (habilitar/deshabilitar)
  net: number;
};

function isoLocalDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function currentMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  return { from: isoLocalDate(from), to: isoLocalDate(now) };
}

function lastNDaysRange(n: number) {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - n);
  return { from: isoLocalDate(from), to: isoLocalDate(to) };
}

function money(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("es-ES", { maximumFractionDigits: 0 });
}

function platformDisplay(pk: string) {
  const k = (pk ?? "").toUpperCase();
  if (k === "BOOKING") return "Booking";
  if (k === "AIRBNB") return "Airbnb";
  if (k === "EXPEDIA") return "Expedia";
  if (k === "WEB") return "Web";
  if (k === "DIRECT") return "Directo";
  if (k === "RESERVADOR") return "Reservador";
  if (k === "MOTOR_PROPIO") return "Motor propio";
  if (k === "MIRAI") return "Motor (Mirai)";
  if (k === "AGENCIA") return "Agencias";
  if (k === "VIAJES") return "Viajes";
  if (k === "UNKNOWN") return "Desconocido";
  return k.replace(/_/g, " ");
}

function channelDisplay(cg: string) {
  if (cg === "OTA") return "OTA";
  if (cg === "DIRECTO") return "Directo";
  if (cg === "B2B") return "B2B";
  return "Otros";
}

type SelectedLeak = {
  channelGroup: RevenueChannelRow["channel_group"];
  platformKey: string;
} | null;

const Leaks: React.FC = () => {
  const defaultRange = useMemo(() => currentMonthRange(), []);

  // Draft
  const [periodFrom, setPeriodFrom] = useState<string>(defaultRange.from);
  const [periodTo, setPeriodTo] = useState<string>(defaultRange.to);
  const [periodField, setPeriodField] = useState<PeriodField>("evaluation_date");

  // Applied
  const [appliedFrom, setAppliedFrom] = useState<string>(defaultRange.from);
  const [appliedTo, setAppliedTo] = useState<string>(defaultRange.to);
  const [appliedField, setAppliedField] = useState<PeriodField>("evaluation_date");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<RevenueChannelRow[]>([]);

  // Drawer
  const [detailOpen, setDetailOpen] = useState(false);
  const [selected, setSelected] = useState<SelectedLeak>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        setLoading(true);

        const resp = await customerRevenueChannelsGet({
          period_from: appliedFrom,
          period_to: appliedTo,
          period_field: appliedField,
        });

        if (cancelled) return;
        setRows(resp.rows ?? []);
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message ?? "Error cargando datos");
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [appliedFrom, appliedTo, appliedField]);

  const leaks: LeakItem[] = useMemo(() => {
    if (!rows?.length) return [];

    const sorted = [...rows].sort((a, b) => (b.net_total ?? 0) - (a.net_total ?? 0));
    const top = sorted.slice(0, 6);

    return top.map((r) => {
      const net = Number(r.net_total ?? 0);
      const share = Math.round((Number(r.pct_net_share ?? 0) || 0) * 100);
      const high = Math.round((Number(r.pct_high ?? 0) || 0) * 100);

      let severity: LeakItem["severity"] = "info";
      let color: LeakItem["color"] = "blue";
      let icon: LeakItem["icon"] = Info;

      if (share >= 35 || net >= 500) {
        severity = "critical";
        color = "red";
        icon = TrendingDown;
      } else if (share >= 15 || high >= 40 || net >= 150) {
        severity = "warning";
        color = "yellow";
        icon = ShieldAlert;
      }

      const title = `${channelDisplay(r.channel_group)} / ${platformDisplay(r.platform_key)}: Fuga de margen`;
      const description = `Net loss ${money(net)} € en el periodo. Cuota sobre net total: ${share}%. Riesgo alto: ${high}%.`;
      const impact = `${money(net)} €`;

      return {
        id: `${r.channel_group}-${r.platform_key}`,
        title,
        description,
        impact,
        severity,
        icon,
        color,
        channel_group: r.channel_group,
        platform_key: r.platform_key,
        net,
      };
    });
  }, [rows]);

  const applyFilters = () => {
    setAppliedFrom(periodFrom);
    setAppliedTo(periodTo);
    setAppliedField(periodField);
  };

  const setMonthNow = () => {
    const r = currentMonthRange();
    setPeriodFrom(r.from);
    setPeriodTo(r.to);
  };

  const setLast30 = () => {
    const r = lastNDaysRange(30);
    setPeriodFrom(r.from);
    setPeriodTo(r.to);
  };

  const hasPendingChanges =
    periodFrom !== appliedFrom || periodTo !== appliedTo || periodField !== appliedField;

  const openDetail = (leak: LeakItem) => {
    // ✅ protección: si net == 0 (o <= 0), no abrimos
    if (!(Number(leak.net) > 0)) return;

    setSelected({ channelGroup: leak.channel_group, platformKey: leak.platform_key });
    setDetailOpen(true);
  };

  const closeDetail = () => {
    setDetailOpen(false);
    // setSelected(null); // opcional
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Drawer */}
      {selected && (
        <ChannelLeakDetailDrawer
          open={detailOpen}
          onClose={closeDetail}
          channelGroup={selected.channelGroup}
          platformKey={selected.platformKey}
          periodFrom={appliedFrom}
          periodTo={appliedTo}
          periodField={appliedField}
        />
      )}

      <header className="space-y-2">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-900">Fugas de Revenue</h1>
            <p className="text-gray-500">Detectar dónde se erosiona el margen.</p>
          </div>

          <div className="flex flex-col items-start lg:items-end gap-2">
            <div className="flex gap-3 flex-wrap justify-start lg:justify-end items-end">
              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-600 mb-1">Desde</label>
                <input
                  type="date"
                  value={periodFrom}
                  onChange={(e) => setPeriodFrom(e.target.value)}
                  className="h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-600 mb-1">Hasta</label>
                <input
                  type="date"
                  value={periodTo}
                  onChange={(e) => setPeriodTo(e.target.value)}
                  className="h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-xs font-medium text-gray-600 mb-1">Campo de periodo</label>
                <select
                  value={periodField}
                  onChange={(e) => setPeriodField(e.target.value as PeriodField)}
                  className="h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white"
                >
                  <option value="evaluation_date">evaluation_date</option>
                  <option value="created_at">created_at</option>
                </select>
              </div>

              <button
                type="button"
                onClick={setMonthNow}
                className="h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white hover:bg-gray-50"
              >
                Mes actual
              </button>

              <button
                type="button"
                onClick={setLast30}
                className="h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white hover:bg-gray-50"
              >
                Últimos 30 días
              </button>

              <button
                type="button"
                onClick={applyFilters}
                disabled={loading || !hasPendingChanges}
                className="h-10 px-4 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                Aplicar
              </button>
            </div>

            <div className="text-sm text-gray-500">
              {loading ? "Cargando…" : error ? "Error" : `${leaks.length} alertas`}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-3 p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">
            {error}
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {loading && (
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm text-sm text-gray-500">
            Cargando…
          </div>
        )}

        {!loading && !error && leaks.length === 0 && (
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm text-sm text-gray-500">
            No hay fugas detectadas en el periodo (o no hay datos).
          </div>
        )}

        {leaks.map((leak) => {
          const Icon = leak.icon;

          const borderColors: Record<string, string> = {
            red: "border-l-red-500",
            yellow: "border-l-yellow-500",
            blue: "border-l-blue-500",
          };

          const textColors: Record<string, string> = {
            red: "text-red-700",
            yellow: "text-yellow-700",
            blue: "text-blue-700",
          };

          const hasDetails = leak.net > 0;

          return (
            <div
              key={leak.id}
              className={`bg-white p-6 rounded-xl border border-gray-200 border-l-4 ${
                borderColors[leak.color]
              } shadow-sm flex gap-4 transition-transform hover:scale-[1.01]`}
            >
              <div className={`mt-1 ${textColors[leak.color]}`}>
                <Icon className="w-5 h-5" />
              </div>

              <div className="flex-1">
                <div className="flex justify-between items-start mb-1 gap-3">
                  <h4 className="font-bold text-gray-900">{leak.title}</h4>
                  <span className={`text-xs font-bold uppercase ${textColors[leak.color]}`}>
                    {leak.impact}
                  </span>
                </div>

                <p className="text-sm text-gray-500 leading-relaxed">{leak.description}</p>

                <div className="mt-3 flex gap-2 items-center">
                  <button
                    className={[
                      "text-xs font-semibold",
                      hasDetails ? "text-blue-600 hover:underline" : "text-gray-300 cursor-not-allowed",
                    ].join(" ")}
                    onClick={() => hasDetails && openDetail(leak)}
                    disabled={!hasDetails}
                    title={!hasDetails ? "Sin net loss en el periodo" : "Ver detalle"}
                  >
                    Ver detalles
                  </button>

                  <span className="text-gray-300">•</span>

                  <button
                    className="text-xs font-semibold text-gray-400 hover:text-gray-600"
                    onClick={() => {
                      // futuro: persistir dismiss en tabla alerts
                    }}
                  >
                    Ignorar
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Leaks;
