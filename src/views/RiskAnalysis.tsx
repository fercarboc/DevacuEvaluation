import React, { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { COLORS } from "../ui/colors";

import {
  customerRevenueChannelsGet,
  type RevenueChannelRow,
  type PeriodField,
} from "@/services/revenueService";

type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

type RiskSegmentUi = {
  level: RiskLevel;
  incidentsPct: number; // % incidencias sobre total
  lossPct: number; // % net loss sobre total
  avgNetPerIncident: number; // € por incidencia (net_total / total_records)
  incidents: number;
  netTotal: number;
};

/* =========================
 * Dates
 * ========================= */
function isoDate(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lastNDaysRange(n: number) {
  const to = new Date();
  const from = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  return { from: isoDate(from), to: isoDate(to) };
}

function currentMonthRangeUtc() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0..11

  const from = new Date(Date.UTC(y, m, 1));
  // hasta hoy (UTC) para que sea “mes actual hasta hoy”
  const to = now;

  return { from: isoDate(from), to: isoDate(to) };
}

/* =========================
 * Formatters
 * ========================= */
function money(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("es-ES", { maximumFractionDigits: 0 });
}

function pct(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return Math.round(Math.max(0, Math.min(100, v)));
}

function riskLevelLabel(l: RiskLevel) {
  if (l === "HIGH") return "ALTO";
  if (l === "MEDIUM") return "MEDIO";
  return "BAJO";
}

const RiskAnalysis: React.FC = () => {
  /* ======================================================
   * ✅ Draft vs Applied (no recarga al cambiar inputs)
   * ====================================================== */
  const initial = useMemo(() => lastNDaysRange(30), []);

  // draft (lo que ve/edita el usuario)
  const [draftFrom, setDraftFrom] = useState<string>(initial.from);
  const [draftTo, setDraftTo] = useState<string>(initial.to);
  const [draftField, setDraftField] = useState<PeriodField>("evaluation_date");

  // applied (lo que realmente dispara fetch)
  const [periodFrom, setPeriodFrom] = useState<string>(initial.from);
  const [periodTo, setPeriodTo] = useState<string>(initial.to);
  const [periodField, setPeriodField] = useState<PeriodField>("evaluation_date");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<RevenueChannelRow[]>([]);

  /* ======================================================
   * Fetch SOLO cuando cambian applied states
   * ====================================================== */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        setLoading(true);

        const resp = await customerRevenueChannelsGet({
          period_from: periodFrom,
          period_to: periodTo,
          period_field: periodField,
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
  }, [periodFrom, periodTo, periodField]);

  function applyDraft() {
    setPeriodFrom(draftFrom);
    setPeriodTo(draftTo);
    setPeriodField(draftField);
  }

  function quickThisMonth() {
    const r = currentMonthRangeUtc();
    setDraftFrom(r.from);
    setDraftTo(r.to);
  }

  function quickLast30() {
    const r = lastNDaysRange(30);
    setDraftFrom(r.from);
    setDraftTo(r.to);
  }

  /* ======================================================
   * UI computed segments
   * ====================================================== */
  const segments: RiskSegmentUi[] = useMemo(() => {
    let highInc = 0,
      medInc = 0,
      lowInc = 0;
    let highNet = 0,
      medNet = 0,
      lowNet = 0;

    for (const r of rows ?? []) {
      const incidents = Number(r.total_records ?? 0);
      const net = Number(r.net_total ?? 0);

      const ph = Number(r.pct_high ?? 0);
      const pm = Number(r.pct_medium ?? 0);
      const pl = Number(r.pct_low ?? 0);

      highInc += incidents * ph;
      medInc += incidents * pm;
      lowInc += incidents * pl;

      highNet += net * ph;
      medNet += net * pm;
      lowNet += net * pl;
    }

    const totalInc = highInc + medInc + lowInc;
    const totalNet = highNet + medNet + lowNet;

    const segs: RiskSegmentUi[] = [
      {
        level: "LOW",
        incidentsPct: totalInc > 0 ? (lowInc / totalInc) * 100 : 0,
        lossPct: totalNet > 0 ? (lowNet / totalNet) * 100 : 0,
        avgNetPerIncident: lowInc > 0 ? lowNet / lowInc : 0,
        incidents: Math.round(lowInc),
        netTotal: lowNet,
      },
      {
        level: "MEDIUM",
        incidentsPct: totalInc > 0 ? (medInc / totalInc) * 100 : 0,
        lossPct: totalNet > 0 ? (medNet / totalNet) * 100 : 0,
        avgNetPerIncident: medInc > 0 ? medNet / medInc : 0,
        incidents: Math.round(medInc),
        netTotal: medNet,
      },
      {
        level: "HIGH",
        incidentsPct: totalInc > 0 ? (highInc / totalInc) * 100 : 0,
        lossPct: totalNet > 0 ? (highNet / totalNet) * 100 : 0,
        avgNetPerIncident: highInc > 0 ? highNet / highInc : 0,
        incidents: Math.round(highInc),
        netTotal: highNet,
      },
    ];

    return segs.map((s) => ({
      ...s,
      incidentsPct: pct(s.incidentsPct),
      lossPct: pct(s.lossPct),
      avgNetPerIncident: Math.round(s.avgNetPerIncident),
      netTotal: Math.round(s.netTotal),
    }));
  }, [rows]);

  const insight = useMemo(() => {
    if (!segments.length) return null;

    const high = segments.find((s) => s.level === "HIGH")!;
    const low = segments.find((s) => s.level === "LOW")!;
    const med = segments.find((s) => s.level === "MEDIUM")!;

    const worst = [high, med, low].sort((a, b) => b.lossPct - a.lossPct)[0];
    return { high, med, low, worst };
  }, [segments]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* ✅ HEADER: título izquierda, filtros derecha */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        {/* title/desc */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Análisis de Riesgo</h1>
          
        </div>  

        {/* filtros (derecha) */}
        <div className="flex flex-col items-start lg:items-end gap-2">
          <div className="flex gap-3 flex-wrap justify-start lg:justify-end items-end">
            <div className="flex flex-col">
              <label className="text-xs font-medium text-gray-600 mb-1">Desde</label>
              <input
                type="date"
                value={draftFrom}
                onChange={(e) => setDraftFrom(e.target.value)}
                className="h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white text-gray-900"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-medium text-gray-600 mb-1">Hasta</label>
              <input
                type="date"
                value={draftTo}
                onChange={(e) => setDraftTo(e.target.value)}
                className="h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white text-gray-900"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-xs font-medium text-gray-600 mb-1">Campo</label>
              <select
                value={draftField}
                onChange={(e) => setDraftField(e.target.value as PeriodField)}
                className="h-10 px-3 rounded-lg border border-gray-200 text-sm bg-white text-gray-900"
              >
                <option value="evaluation_date">evaluation_date</option>
                <option value="created_at">created_at</option>
              </select>
            </div>

            {/* ✅ quick buttons + apply */}
            <button
              type="button"
              onClick={quickThisMonth}
              className="h-10 px-4 rounded-lg border border-gray-200 text-sm bg-white hover:bg-gray-50 text-gray-900"
            >
              Mes actual
            </button>

            <button
              type="button"
              onClick={quickLast30}
              className="h-10 px-4 rounded-lg border border-gray-200 text-sm bg-white hover:bg-gray-50 text-gray-900"
            >
              Últimos 30 días
            </button>

            <button
              type="button"
              onClick={applyDraft}
              className="h-10 px-4 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700"
            >
              Aplicar
            </button>
          </div>

          <div className="text-sm text-gray-500">
            {loading ? "Cargando…" : error ? "Error" : ``}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Chart */}
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-lg font-semibold mb-6">% Incidencias vs % Pérdidas (Net Loss) por Nivel</h3>

          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={segments} margin={{ top: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis
                  dataKey="level"
                  stroke="#64748b"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => riskLevelLabel(v as RiskLevel)}
                />
                <YAxis
                  stroke="#64748b"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  unit="%"
                />
                <Tooltip
                  cursor={{ fill: "#f8fafc" }}
                  contentStyle={{ borderRadius: "8px", backgroundColor: "#fff", border: "1px solid #e2e8f0", color: "#1e293b" }}
                  formatter={(value: any, name: any, props: any) => {
                    const r = props?.payload as RiskSegmentUi | undefined;
                    if (!r) return [value, name];
                    if (name === "% Incidencias") return [`${r.incidentsPct}% (${r.incidents})`, name];
                    if (name === "% Pérdidas (Net)") return [`${r.lossPct}% (${money(r.netTotal)} €)`, name];
                    return [value, name];
                  }}
                />
                <Legend verticalAlign="top" height={36} />
                <Bar
                  dataKey="incidentsPct"
                  name="% Incidencias"
                  fill={COLORS.primary}
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="lossPct"
                  name="% Pérdidas (Net)"
                  fill={COLORS.danger}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {insight && !loading && !error && (
            <div className="mt-6 flex gap-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
              <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white flex-shrink-0">
                !
              </div>
              <p className="text-sm text-blue-900">
                <strong>Insight:</strong> El segmento de{" "}
                <strong>Riesgo {riskLevelLabel(insight.worst.level)}</strong> concentra{" "}
                <strong>{insight.worst.lossPct}%</strong> de la pérdida neta del periodo. Coste medio por incidencia en
                ALTO: <strong>{money(insight.high.avgNetPerIncident)} €</strong>.
              </p>
            </div>
          )}
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 gap-6">
          {segments.map((segment) => (
            <div
              key={segment.level}
              className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between"
            >
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      segment.level === "LOW"
                        ? "bg-green-500"
                        : segment.level === "MEDIUM"
                        ? "bg-yellow-500"
                        : "bg-red-500"
                    }`}
                  />
                  <span className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                    Riesgo {riskLevelLabel(segment.level)}
                  </span>
                </div>

                <div className="text-2xl font-bold text-gray-900">
                  {money(segment.avgNetPerIncident)} €{" "}
                  <span className="text-sm font-normal text-gray-500">net medio / incidencia</span>
                </div>

                <div className="mt-1 text-sm text-gray-500">
                  Incidencias: <span className="font-semibold text-gray-700">{segment.incidents}</span> · Net:{" "}
                  <span className="font-semibold text-gray-700">{money(segment.netTotal)} €</span>
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Concentración de Pérdida</div>
                <div className={`text-xl font-bold ${segment.lossPct > 50 ? "text-red-600" : "text-gray-900"}`}>
                  {segment.lossPct}%
                </div>
              </div>
            </div>
          ))}

          {!loading && !error && segments.every((s) => s.incidents === 0) && (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm text-sm text-gray-500">
              No hay datos suficientes en el periodo para segmentar riesgo.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RiskAnalysis;
