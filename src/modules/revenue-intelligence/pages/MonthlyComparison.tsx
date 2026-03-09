import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Calendar,
  Download,
  Eye,
  FileDown,
  Hotel,
  TrendingDown,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useRevenueMonthlySummary } from "../hooks/useRevenueMonthlySummary";
import { useRevenueDayByDaySummary } from "../hooks/useRevenueDayByDaySummary";

type RevenuePropertyLite = {
  id: string;
  name: string;
  roomsCount?: number;
};

type MonthlyComparisonProps = {
  orgId: string | null;
  selectedPropertyId: string | null;
  properties?: RevenuePropertyLite[];
};

type QuickFilter = "currentYear" | "previousYear" | "last12Months" | "custom";
type MetricTab = "revenue" | "adr" | "revpar" | "occ";

type GenericMonthRow = Record<string, unknown>;

type BuiltComparisonRow = {
  id: string;
  monthKey: string;
  monthLabel: string;
  currentRevenue: number;
  compareRevenue: number;
  revenueDelta: number;
  revenueDeltaPct: number | null;
  currentAdr: number;
  compareAdr: number;
  adrDelta: number;
  adrDeltaPct: number | null;
  currentRevpar: number;
  compareRevpar: number;
  revparDelta: number;
  revparDeltaPct: number | null;
  currentOcc: number;
  compareOcc: number;
  occDelta: number;
  occDeltaPct: number | null;
  badge: "TOP" | "LOW" | "NEUTRAL";
};

type KpiMetric = {
  title: string;
  current: number;
  compare: number;
  deltaAbs: number;
  deltaPct: number | null;
  kind: MetricTab;
};

type DailyRow = Record<string, unknown>;

const MONTH_LABELS_SHORT = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  return `${year}-${month}-${day}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function parseDateSafe(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatCurrency(value: number | null | undefined) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function formatCurrencyCompact(value: number | null | undefined) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value ?? 0);
}

function formatNumber(value: number | null | undefined, digits = 1) {
  return new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value ?? 0);
}

function formatPercent(value: number | null | undefined, digits = 1) {
  return `${formatNumber(value ?? 0, digits)}%`;
}

function formatSignedCurrency(value: number | null | undefined) {
  const num = value ?? 0;
  return `${num >= 0 ? "+" : ""}${formatCurrency(num)}`;
}

function formatSignedPercent(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined) return "—";
  return `${value >= 0 ? "+" : ""}${formatNumber(value, digits)}%`;
}

function calcDeltaPct(current: number, compare: number) {
  if (compare === 0) return current === 0 ? 0 : null;
  return ((current - compare) / compare) * 100;
}

function metricDeltaTone(value: number | null | undefined) {
  if ((value ?? 0) > 0) return "text-emerald-600";
  if ((value ?? 0) < 0) return "text-red-600";
  return "text-slate-500";
}

function metricBgTone(value: number | null | undefined) {
  if ((value ?? 0) > 0) return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  if ((value ?? 0) < 0) return "bg-red-50 text-red-700 ring-red-200";
  return "bg-slate-50 text-slate-600 ring-slate-200";
}

function badgeClasses(value: BuiltComparisonRow["badge"]) {
  switch (value) {
    case "TOP":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "LOW":
      return "bg-red-50 text-red-700 ring-red-200";
    default:
      return "bg-slate-50 text-slate-600 ring-slate-200";
  }
}

function getMonthKey(row: GenericMonthRow, index: number) {
  const candidates = [
    row.monthKey,
    row.month_key,
    row.month,
    row.period,
    row.label,
    row.name,
  ];

  const found = candidates.find((item) => typeof item === "string" && item.trim().length > 0);
  return found ? String(found) : `month-${index}`;
}

function getMonthLabel(row: GenericMonthRow, index: number) {
  const explicit = [row.monthLabel, row.month_label, row.label, row.name].find(
    (item) => typeof item === "string" && item.trim().length > 0,
  );
  if (explicit) return String(explicit);

  const key = getMonthKey(row, index);
  const isoMatch = /^(\d{4})-(\d{2})/.exec(key);
  if (isoMatch) {
    const monthIndex = Number(isoMatch[2]) - 1;
    if (monthIndex >= 0 && monthIndex < 12) return MONTH_LABELS_SHORT[monthIndex];
  }

  const monthNum =
    typeof row.monthNumber === "number"
      ? row.monthNumber
      : typeof row.month_number === "number"
        ? row.month_number
        : null;

  if (typeof monthNum === "number" && monthNum >= 1 && monthNum <= 12) {
    return MONTH_LABELS_SHORT[monthNum - 1];
  }

  return key;
}

function pickNumeric(row: GenericMonthRow, candidates: string[]) {
  for (const key of candidates) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }
  return 0;
}

function getRevenue(row: GenericMonthRow) {
  return pickNumeric(row, ["revenue", "totalRevenue", "total_revenue", "amount"]);
}

function getAdr(row: GenericMonthRow) {
  return pickNumeric(row, ["adr", "averageDailyRate", "average_daily_rate"]);
}

function getRevpar(row: GenericMonthRow) {
  return pickNumeric(row, ["revpar", "revPar"]);
}

function getOcc(row: GenericMonthRow) {
  return pickNumeric(row, ["occ", "occupancy", "occupancyRate", "occupancy_rate"]);
}

function metricValueByTab(row: BuiltComparisonRow, tab: MetricTab, source: "current" | "compare") {
  if (tab === "revenue") return source === "current" ? row.currentRevenue : row.compareRevenue;
  if (tab === "adr") return source === "current" ? row.currentAdr : row.compareAdr;
  if (tab === "revpar") return source === "current" ? row.currentRevpar : row.compareRevpar;
  return source === "current" ? row.currentOcc : row.compareOcc;
}

function metricDeltaByTab(row: BuiltComparisonRow, tab: MetricTab) {
  if (tab === "revenue") return row.revenueDelta;
  if (tab === "adr") return row.adrDelta;
  if (tab === "revpar") return row.revparDelta;
  return row.occDelta;
}

function metricDeltaPctByTab(row: BuiltComparisonRow, tab: MetricTab) {
  if (tab === "revenue") return row.revenueDeltaPct;
  if (tab === "adr") return row.adrDeltaPct;
  if (tab === "revpar") return row.revparDeltaPct;
  return row.occDeltaPct;
}

function buildComparisonRowsFromMonths(
  months: GenericMonthRow[] = [],
  compareMonths: GenericMonthRow[] = [],
): BuiltComparisonRow[] {
  const size = Math.max(months.length, compareMonths.length);
  const baseRows = Array.from({ length: size }).map((_, index) => {
    const current = months[index] ?? {};
    const compare = compareMonths[index] ?? {};

    const currentRevenue = getRevenue(current);
    const compareRevenue = getRevenue(compare);
    const currentAdr = getAdr(current);
    const compareAdr = getAdr(compare);
    const currentRevpar = getRevpar(current);
    const compareRevpar = getRevpar(compare);
    const currentOcc = getOcc(current);
    const compareOcc = getOcc(compare);

    const monthKey = getMonthKey(current, index) || getMonthKey(compare, index);
    const monthLabel = getMonthLabel(current, index) || getMonthLabel(compare, index);

    return {
      id: `${monthKey}-${index}`,
      monthKey,
      monthLabel,
      currentRevenue,
      compareRevenue,
      revenueDelta: currentRevenue - compareRevenue,
      revenueDeltaPct: calcDeltaPct(currentRevenue, compareRevenue),
      currentAdr,
      compareAdr,
      adrDelta: currentAdr - compareAdr,
      adrDeltaPct: calcDeltaPct(currentAdr, compareAdr),
      currentRevpar,
      compareRevpar,
      revparDelta: currentRevpar - compareRevpar,
      revparDeltaPct: calcDeltaPct(currentRevpar, compareRevpar),
      currentOcc,
      compareOcc,
      occDelta: currentOcc - compareOcc,
      occDeltaPct: calcDeltaPct(currentOcc, compareOcc),
      badge: "NEUTRAL",
    } as BuiltComparisonRow;
  });

  const sortedByRevenue = [...baseRows].sort((a, b) => b.revenueDelta - a.revenueDelta);
  const bestId = sortedByRevenue[0]?.id;
  const worstId = sortedByRevenue[sortedByRevenue.length - 1]?.id;

  return baseRows.map((row) => {
    if (row.id === bestId && row.revenueDelta > 0) {
      return { ...row, badge: "TOP" };
    }
    if (row.id === worstId && row.revenueDelta < 0) {
      return { ...row, badge: "LOW" };
    }
    return { ...row, badge: "NEUTRAL" };
  });
}

function exportRowsToCsv(filename: string, rows: BuiltComparisonRow[]) {
  const headers = [
    "Mes",
    "Revenue actual",
    "Revenue comparado",
    "Revenue delta",
    "Revenue delta %",
    "ADR actual",
    "ADR comparado",
    "ADR delta",
    "ADR delta %",
    "RevPAR actual",
    "RevPAR comparado",
    "RevPAR delta",
    "RevPAR delta %",
    "OCC actual",
    "OCC comparada",
    "OCC delta",
    "OCC delta %",
    "Badge",
  ];

  const body = rows.map((row) =>
    [
      row.monthLabel,
      row.currentRevenue,
      row.compareRevenue,
      row.revenueDelta,
      row.revenueDeltaPct ?? "",
      row.currentAdr,
      row.compareAdr,
      row.adrDelta,
      row.adrDeltaPct ?? "",
      row.currentRevpar,
      row.compareRevpar,
      row.revparDelta,
      row.revparDeltaPct ?? "",
      row.currentOcc,
      row.compareOcc,
      row.occDelta,
      row.occDeltaPct ?? "",
      row.badge,
    ].join(","),
  );

  const csv = [headers.join(","), ...body].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildQuickFilterRange(filter: QuickFilter) {
  const today = new Date();
  const currentYear = today.getFullYear();

  if (filter === "currentYear") {
    return {
      from: `${currentYear}-01-01`,
      to: `${currentYear}-12-31`,
      compareFrom: `${currentYear - 1}-01-01`,
      compareTo: `${currentYear - 1}-12-31`,
      selectedYear: currentYear,
      compareYear: currentYear - 1,
    };
  }

  if (filter === "previousYear") {
    return {
      from: `${currentYear - 1}-01-01`,
      to: `${currentYear - 1}-12-31`,
      compareFrom: `${currentYear - 2}-01-01`,
      compareTo: `${currentYear - 2}-12-31`,
      selectedYear: currentYear - 1,
      compareYear: currentYear - 2,
    };
  }

  const to = new Date(today.getFullYear(), today.getMonth(), 1);
  const from = new Date(today.getFullYear(), today.getMonth() - 11, 1);
  const compareTo = new Date(today.getFullYear() - 1, today.getMonth(), 1);
  const compareFrom = new Date(today.getFullYear() - 1, today.getMonth() - 11, 1);

  return {
    from: toIsoDate(startOfMonth(from)),
    to: toIsoDate(endOfMonth(to)),
    compareFrom: toIsoDate(startOfMonth(compareFrom)),
    compareTo: toIsoDate(endOfMonth(compareTo)),
    selectedYear: currentYear,
    compareYear: currentYear - 1,
  };
}

function getYearOptions() {
  const currentYear = new Date().getFullYear();
  return Array.from({ length: 6 }).map((_, index) => currentYear - index);
}

function monthRangeFromRow(row: BuiltComparisonRow, fromFallback: string, toFallback: string) {
  const match = /^(\d{4})-(\d{2})/.exec(row.monthKey);
  if (!match) {
    return { from: fromFallback, to: toFallback };
  }

  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const date = new Date(year, monthIndex, 1);

  return {
    from: toIsoDate(startOfMonth(date)),
    to: toIsoDate(endOfMonth(date)),
  };
}

function getDailyLabel(row: DailyRow, index: number) {
  const candidates = [row.label, row.dateLabel, row.dayLabel, row.calendar_date, row.date];
  const found = candidates.find((item) => typeof item === "string" && item.trim().length > 0);
  if (found) return String(found);

  const raw = [row.day, row.dayNumber].find((item) => typeof item === "number");
  if (typeof raw === "number") return String(raw);

  return `Día ${index + 1}`;
}

export default function MonthlyComparison({
  orgId,
  selectedPropertyId,
  properties = [],
}: MonthlyComparisonProps) {
  const years = useMemo(() => getYearOptions(), []);
  const initialRange = useMemo(() => buildQuickFilterRange("currentYear"), []);

  const [quickFilter, setQuickFilter] = useState<QuickFilter>("currentYear");
  const [selectedYear, setSelectedYear] = useState<number>(initialRange.selectedYear);
  const [compareYear, setCompareYear] = useState<number>(initialRange.compareYear);
  const [from, setFrom] = useState(initialRange.from);
  const [to, setTo] = useState(initialRange.to);
  const [compareFrom, setCompareFrom] = useState(initialRange.compareFrom);
  const [compareTo, setCompareTo] = useState(initialRange.compareTo);
  const [activeTab, setActiveTab] = useState<MetricTab>("revenue");
  const [detailRow, setDetailRow] = useState<BuiltComparisonRow | null>(null);

  useEffect(() => {
    if (quickFilter === "custom") return;
    const next = buildQuickFilterRange(quickFilter);
    setSelectedYear(next.selectedYear);
    setCompareYear(next.compareYear);
    setFrom(next.from);
    setTo(next.to);
    setCompareFrom(next.compareFrom);
    setCompareTo(next.compareTo);
  }, [quickFilter]);

  useEffect(() => {
    if (quickFilter !== "custom") return;
    setFrom(`${selectedYear}-01-01`);
    setTo(`${selectedYear}-12-31`);
    setCompareFrom(`${compareYear}-01-01`);
    setCompareTo(`${compareYear}-12-31`);
  }, [selectedYear, compareYear, quickFilter]);

  const monthlySummary = useRevenueMonthlySummary({
    orgId,
    propertyId: selectedPropertyId,
    from,
    to,
    compareFrom,
    compareTo,
  });

  const comparisonRows = useMemo(
    () =>
      buildComparisonRowsFromMonths(
        (monthlySummary?.months ?? []) as GenericMonthRow[],
        (monthlySummary?.compareMonths ?? []) as GenericMonthRow[],
      ),
    [monthlySummary?.months, monthlySummary?.compareMonths],
  );

  const chartData = useMemo(
    () =>
      comparisonRows.map((row) => ({
        monthLabel: row.monthLabel,
        currentValue: metricValueByTab(row, activeTab, "current"),
        compareValue: metricValueByTab(row, activeTab, "compare"),
        delta: metricDeltaByTab(row, activeTab),
        deltaPct: metricDeltaPctByTab(row, activeTab),
        badge: row.badge,
      })),
    [comparisonRows, activeTab],
  );

  const currentTotals = monthlySummary?.totals ?? {};
  const compareTotals = monthlySummary?.compareTotals ?? {};

  const kpis = useMemo<KpiMetric[]>(
    () => [
      {
        title: "Revenue total",
        current: pickNumeric(currentTotals as GenericMonthRow, [
          "revenue",
          "totalRevenue",
          "total_revenue",
        ]),
        compare: pickNumeric(compareTotals as GenericMonthRow, [
          "revenue",
          "totalRevenue",
          "total_revenue",
        ]),
        deltaAbs:
          pickNumeric(currentTotals as GenericMonthRow, ["revenue", "totalRevenue", "total_revenue"]) -
          pickNumeric(compareTotals as GenericMonthRow, ["revenue", "totalRevenue", "total_revenue"]),
        deltaPct: calcDeltaPct(
          pickNumeric(currentTotals as GenericMonthRow, ["revenue", "totalRevenue", "total_revenue"]),
          pickNumeric(compareTotals as GenericMonthRow, ["revenue", "totalRevenue", "total_revenue"]),
        ),
        kind: "revenue",
      },
      {
        title: "ADR medio",
        current: pickNumeric(currentTotals as GenericMonthRow, ["adr", "averageDailyRate"]),
        compare: pickNumeric(compareTotals as GenericMonthRow, ["adr", "averageDailyRate"]),
        deltaAbs:
          pickNumeric(currentTotals as GenericMonthRow, ["adr", "averageDailyRate"]) -
          pickNumeric(compareTotals as GenericMonthRow, ["adr", "averageDailyRate"]),
        deltaPct: calcDeltaPct(
          pickNumeric(currentTotals as GenericMonthRow, ["adr", "averageDailyRate"]),
          pickNumeric(compareTotals as GenericMonthRow, ["adr", "averageDailyRate"]),
        ),
        kind: "adr",
      },
      {
        title: "RevPAR medio",
        current: pickNumeric(currentTotals as GenericMonthRow, ["revpar", "revPar"]),
        compare: pickNumeric(compareTotals as GenericMonthRow, ["revpar", "revPar"]),
        deltaAbs:
          pickNumeric(currentTotals as GenericMonthRow, ["revpar", "revPar"]) -
          pickNumeric(compareTotals as GenericMonthRow, ["revpar", "revPar"]),
        deltaPct: calcDeltaPct(
          pickNumeric(currentTotals as GenericMonthRow, ["revpar", "revPar"]),
          pickNumeric(compareTotals as GenericMonthRow, ["revpar", "revPar"]),
        ),
        kind: "revpar",
      },
      {
        title: "OCC media",
        current: pickNumeric(currentTotals as GenericMonthRow, [
          "occ",
          "occupancy",
          "occupancyRate",
        ]),
        compare: pickNumeric(compareTotals as GenericMonthRow, [
          "occ",
          "occupancy",
          "occupancyRate",
        ]),
        deltaAbs:
          pickNumeric(currentTotals as GenericMonthRow, ["occ", "occupancy", "occupancyRate"]) -
          pickNumeric(compareTotals as GenericMonthRow, ["occ", "occupancy", "occupancyRate"]),
        deltaPct: calcDeltaPct(
          pickNumeric(currentTotals as GenericMonthRow, ["occ", "occupancy", "occupancyRate"]),
          pickNumeric(compareTotals as GenericMonthRow, ["occ", "occupancy", "occupancyRate"]),
        ),
        kind: "occ",
      },
    ],
    [currentTotals, compareTotals],
  );

  const insights = useMemo(() => {
    if (!comparisonRows.length) return [];

    const bestRevenueMonth = [...comparisonRows].sort((a, b) => b.revenueDelta - a.revenueDelta)[0];
    const worstOccMonth = [...comparisonRows].sort((a, b) => a.occDelta - b.occDelta)[0];
    const worstRevparMonth = [...comparisonRows].sort((a, b) => a.revparDelta - b.revparDelta)[0];

    const totalRevenueDelta = kpis.find((item) => item.kind === "revenue")?.deltaPct ?? null;
    const adrDelta = kpis.find((item) => item.kind === "adr")?.deltaPct ?? null;
    const occDelta = kpis.find((item) => item.kind === "occ")?.deltaPct ?? null;
    const revparDelta = kpis.find((item) => item.kind === "revpar")?.deltaPct ?? null;

    return [
      totalRevenueDelta === null
        ? "Revenue del periodo sin base comparable suficiente para calcular variación porcentual."
        : `Revenue ${totalRevenueDelta >= 0 ? "crece" : "cae"} ${formatSignedPercent(totalRevenueDelta)} vs ${compareYear}, con el mayor impacto en ${bestRevenueMonth.monthLabel} (${formatSignedCurrency(bestRevenueMonth.revenueDelta)}).`,
      adrDelta === null || occDelta === null
        ? "ADR y OCC no tienen suficiente base comparable en algún tramo del periodo."
        : `ADR ${adrDelta >= 0 ? "mejora" : "retrocede"} ${formatSignedPercent(adrDelta)} mientras OCC ${occDelta >= 0 ? "sube" : "baja"} ${formatSignedPercent(occDelta)}; el peor mes en ocupación es ${worstOccMonth.monthLabel} (${formatSignedPercent(worstOccMonth.occDeltaPct)}).`,
      revparDelta === null
        ? "RevPAR sin referencia comparable suficiente."
        : `RevPAR ${revparDelta >= 0 ? "avanza" : "retrocede"} ${formatSignedPercent(revparDelta)} y el mes más débil es ${worstRevparMonth.monthLabel} (${formatSignedCurrency(worstRevparMonth.revparDelta)} equivalente frente al periodo comparado).`,
    ];
  }, [comparisonRows, kpis, compareYear]);

  const selectedProperty = useMemo(
    () => properties.find((property) => property.id === selectedPropertyId) ?? null,
    [properties, selectedPropertyId],
  );

  const detailRange = useMemo(() => {
    if (!detailRow) return { from, to };
    return monthRangeFromRow(detailRow, from, to);
  }, [detailRow, from, to]);

  const dailySummary = useRevenueDayByDaySummary({
    orgId,
    propertyId: selectedPropertyId,
    from: detailRange.from,
    to: detailRange.to,
  });

  const loading = monthlySummary?.loading;
  const error = monthlySummary?.error;

  const activeMetricLabel =
    activeTab === "revenue"
      ? "Revenue"
      : activeTab === "adr"
        ? "ADR"
        : activeTab === "revpar"
          ? "RevPAR"
          : "OCC";

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
              <BarChart3 className="h-4 w-4" />
              Revenue Intelligence · Comparación mensual
            </div>

            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Comparativa mensual
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Vista ejecutiva del periodo actual vs comparativo, con lectura rápida y detalle por
                mes.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
              <div className="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                <Hotel className="h-4 w-4 text-slate-500" />
                <span className="font-medium text-slate-700">
                  {selectedProperty?.name ?? monthlySummary?.property?.name ?? "Propiedad"}
                </span>
              </div>

              <div className="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                <Calendar className="h-4 w-4 text-slate-500" />
                <span>
                  {from} <ArrowRight className="mx-1 inline h-3.5 w-3.5" /> {to}
                </span>
              </div>

              <div className="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-200">
                <span className="font-medium text-slate-700">
                {selectedProperty?.roomsCount ??
                  (monthlySummary?.property as { roomsCount?: number; rooms_count?: number } | null | undefined)
                    ?.roomsCount ??
                  (monthlySummary?.property as { roomsCount?: number; rooms_count?: number } | null | undefined)
                    ?.rooms_count ??
                  0}
                </span>
                <span>habitaciones</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                exportRowsToCsv(
                  `monthly-comparison-${selectedProperty?.name ?? "property"}-${from}-${to}.csv`,
                  comparisonRows,
                )
              }
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Exportar CSV
            </button>

            <button
              type="button"
              disabled
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-200 px-4 py-2 text-sm font-medium text-slate-500 shadow-sm cursor-not-allowed"
              title="Próximamente: exportación PDF profesional"
            >
              <FileDown className="h-4 w-4" />
              Exportar PDF
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <button
            type="button"
            onClick={() => setQuickFilter("currentYear")}
            className={`rounded-2xl px-4 py-3 text-left text-sm font-medium ring-1 transition ${
              quickFilter === "currentYear"
                ? "bg-blue-600 text-white ring-blue-600"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            Año actual
          </button>

          <button
            type="button"
            onClick={() => setQuickFilter("previousYear")}
            className={`rounded-2xl px-4 py-3 text-left text-sm font-medium ring-1 transition ${
              quickFilter === "previousYear"
                ? "bg-blue-600 text-white ring-blue-600"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            Año anterior
          </button>

          <button
            type="button"
            onClick={() => setQuickFilter("last12Months")}
            className={`rounded-2xl px-4 py-3 text-left text-sm font-medium ring-1 transition ${
              quickFilter === "last12Months"
                ? "bg-blue-600 text-white ring-blue-600"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            Últimos 12 meses
          </button>

          <button
            type="button"
            onClick={() => setQuickFilter("custom")}
            className={`rounded-2xl px-4 py-3 text-left text-sm font-medium ring-1 transition ${
              quickFilter === "custom"
                ? "bg-blue-600 text-white ring-blue-600"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
            }`}
          >
            Personalizado
          </button>

          <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600 ring-1 ring-slate-200">
            Comparativa: <span className="font-semibold text-slate-900">{compareYear}</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Año actual
            </label>
            <select
              value={selectedYear}
              onChange={(e) => {
                setQuickFilter("custom");
                setSelectedYear(Number(e.target.value));
              }}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none ring-0 transition focus:border-blue-400"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Año comparativo
            </label>
            <select
              value={compareYear}
              onChange={(e) => {
                setQuickFilter("custom");
                setCompareYear(Number(e.target.value));
              }}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none ring-0 transition focus:border-blue-400"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Desde
            </label>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setQuickFilter("custom");
                setFrom(e.target.value);
              }}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Hasta
            </label>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setQuickFilter("custom");
                setTo(e.target.value);
              }}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Compare desde
            </label>
            <input
              type="date"
              value={compareFrom}
              onChange={(e) => {
                setQuickFilter("custom");
                setCompareFrom(e.target.value);
              }}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Compare hasta
            </label>
            <input
              type="date"
              value={compareTo}
              onChange={(e) => {
                setQuickFilter("custom");
                setCompareTo(e.target.value);
              }}
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-blue-400"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
        {kpis.map((kpi) => {
          const isPercentMetric = kpi.kind === "occ";
          return (
            <div
              key={kpi.title}
              className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-500">{kpi.title}</p>
                  <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
                    {isPercentMetric ? formatPercent(kpi.current, 1) : formatCurrency(kpi.current)}
                  </p>
                </div>

                <div
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${metricBgTone(
                    kpi.deltaAbs,
                  )}`}
                >
                  {(kpi.deltaAbs ?? 0) > 0 ? (
                    <TrendingUp className="h-3.5 w-3.5" />
                  ) : (kpi.deltaAbs ?? 0) < 0 ? (
                    <TrendingDown className="h-3.5 w-3.5" />
                  ) : (
                    <BarChart3 className="h-3.5 w-3.5" />
                  )}
                  {kpi.deltaPct === null ? "n/d" : formatSignedPercent(kpi.deltaPct)}
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                <p className="text-xs uppercase tracking-wide text-slate-500">vs {compareYear}</p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-medium text-slate-700">
                    {isPercentMetric ? formatPercent(kpi.compare, 1) : formatCurrency(kpi.compare)}
                  </span>
                  <span className={metricDeltaTone(kpi.deltaAbs)}>
                    {isPercentMetric
                      ? `${kpi.deltaAbs >= 0 ? "+" : ""}${formatPercent(kpi.deltaAbs, 1)}`
                      : formatSignedCurrency(kpi.deltaAbs)}
                  </span>
                  <span className={metricDeltaTone(kpi.deltaPct)}>{formatSignedPercent(kpi.deltaPct)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Resumen mensual</h2>
            <p className="text-sm text-slate-600">
              Base operativa mensual del periodo seleccionado.
            </p>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            Cargando resumen mensual…
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-10 text-center text-sm text-red-700">
            {String(error)}
          </div>
        ) : (monthlySummary?.months ?? []).length === 0 ? (
          <div className="rounded-2xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            No hay datos mensuales para el rango seleccionado.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Mes</th>
                    <th className="px-4 py-3 text-right font-medium">Revenue</th>
                    <th className="px-4 py-3 text-right font-medium">ADR</th>
                    <th className="px-4 py-3 text-right font-medium">RevPAR</th>
                    <th className="px-4 py-3 text-right font-medium">OCC</th>
                    <th className="px-4 py-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {comparisonRows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{row.monthLabel}</td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {formatCurrency(row.currentRevenue)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {formatCurrency(row.currentAdr)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {formatCurrency(row.currentRevpar)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {formatPercent(row.currentOcc)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setDetailRow(row)}
                          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ver detalle por mes
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_1.4fr]">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Lectura rápida</h2>
            <p className="text-sm text-slate-600">
              Resumen automático del rendimiento del periodo.
            </p>
          </div>

          <div className="space-y-3">
            {insights.map((insight, index) => (
              <div
                key={`${insight}-${index}`}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">
                    {index + 1}
                  </div>
                  <p className="text-sm leading-6 text-slate-700">{insight}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Comparativa visual</h2>
              <p className="text-sm text-slate-600">
                {activeMetricLabel} actual vs comparativo por mes.
              </p>
            </div>

            <div className="inline-flex rounded-2xl bg-slate-100 p-1">
              {[
                { key: "revenue", label: "Revenue" },
                { key: "adr", label: "ADR" },
                { key: "revpar", label: "RevPAR" },
                { key: "occ", label: "OCC" },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key as MetricTab)}
                  className={`rounded-2xl px-4 py-2 text-sm font-medium transition ${
                    activeTab === tab.key
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barCategoryGap={16}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="monthLabel" tickLine={false} axisLine={false} />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) =>
                    activeTab === "occ" ? `${value}%` : `${formatNumber(value, 0)}`
                  }
                />
                <Tooltip
                  formatter={(value: number, name: string) => {
                    const formatted =
                      activeTab === "occ"
                        ? formatPercent(value, 1)
                        : formatCurrencyCompact(value);

                    if (name === "Periodo actual") return [formatted, "Periodo actual"];
                    if (name === "Periodo comparado") return [formatted, "Periodo comparado"];
                    return [formatted, name];
                  }}
                  labelFormatter={(label) => `Mes: ${label}`}
                />
                <Legend />
                <Bar dataKey="compareValue" name="Periodo comparado" radius={[8, 8, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`compare-${entry.monthLabel}-${index}`}
                      fill={entry.badge === "LOW" ? "#fca5a5" : "#cbd5e1"}
                    />
                  ))}
                </Bar>
                <Bar dataKey="currentValue" name="Periodo actual" radius={[8, 8, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`current-${entry.monthLabel}-${index}`}
                      fill={entry.badge === "TOP" ? "#10b981" : "#2563eb"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-medium text-emerald-700 ring-1 ring-emerald-200">
              Top = mejor delta de revenue
            </span>
            <span className="rounded-full bg-red-50 px-2.5 py-1 font-medium text-red-700 ring-1 ring-red-200">
              Bajo = peor delta de revenue
            </span>
            <span className="rounded-full bg-slate-50 px-2.5 py-1 font-medium text-slate-600 ring-1 ring-slate-200">
              Semáforo visible sin leer toda la tabla
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Comparativa mensual detallada</h2>
            <p className="text-sm text-slate-600">
              Vista comparativa construida desde months y compareMonths.
            </p>
          </div>

          <div className="text-sm text-slate-500">
            Tab activa: <span className="font-semibold text-slate-900">{activeMetricLabel}</span>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Mes</th>
                  <th className="px-4 py-3 text-left font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Actual</th>
                  <th className="px-4 py-3 text-right font-medium">Comparado</th>
                  <th className="px-4 py-3 text-right font-medium">Delta</th>
                  <th className="px-4 py-3 text-right font-medium">Delta %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {comparisonRows.map((row) => {
                  const currentValue = metricValueByTab(row, activeTab, "current");
                  const compareValue = metricValueByTab(row, activeTab, "compare");
                  const delta = metricDeltaByTab(row, activeTab);
                  const deltaPct = metricDeltaPctByTab(row, activeTab);
                  const isPercentMetric = activeTab === "occ";

                  return (
                    <tr key={`${row.id}-${activeTab}`} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">{row.monthLabel}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${badgeClasses(
                            row.badge,
                          )}`}
                        >
                          {row.badge === "TOP"
                            ? "Top"
                            : row.badge === "LOW"
                              ? "Bajo"
                              : "Neutro"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {isPercentMetric
                          ? formatPercent(currentValue, 1)
                          : formatCurrency(currentValue)}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">
                        {isPercentMetric
                          ? formatPercent(compareValue, 1)
                          : formatCurrency(compareValue)}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${metricDeltaTone(delta)}`}>
                        {isPercentMetric
                          ? `${delta >= 0 ? "+" : ""}${formatPercent(delta, 1)}`
                          : formatSignedCurrency(delta)}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${metricDeltaTone(deltaPct)}`}>
                        {formatSignedPercent(deltaPct)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {detailRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[90vh] w-full max-w-6xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">
                  Detalle diario · {detailRow.monthLabel}
                </h3>
                <p className="mt-1 text-sm text-slate-600">
                  Rango consultado: {detailRange.from} <ArrowRight className="mx-1 inline h-3.5 w-3.5" />{" "}
                  {detailRange.to}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setDetailRow(null)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 text-slate-600 transition hover:bg-slate-50"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 overflow-y-auto px-6 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-200">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Revenue mes</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">
                    {formatCurrency(detailRow.currentRevenue)}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-200">
                  <p className="text-xs uppercase tracking-wide text-slate-500">ADR mes</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">
                    {formatCurrency(detailRow.currentAdr)}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-200">
                  <p className="text-xs uppercase tracking-wide text-slate-500">RevPAR mes</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">
                    {formatCurrency(detailRow.currentRevpar)}
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-50 px-4 py-4 ring-1 ring-slate-200">
                  <p className="text-xs uppercase tracking-wide text-slate-500">OCC mes</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">
                    {formatPercent(detailRow.currentOcc)}
                  </p>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="mb-4">
                  <h4 className="text-lg font-semibold text-slate-900">Detalle diario</h4>
                  <p className="text-sm text-slate-600">
                    Desglose diario del mes seleccionado.
                  </p>
                </div>

                {dailySummary?.loading ? (
                  <div className="rounded-2xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    Cargando detalle diario…
                  </div>
                ) : dailySummary?.error ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-10 text-center text-sm text-red-700">
                    {String(dailySummary.error)}
                  </div>
                ) : (dailySummary?.daily ?? []).length === 0 ? (
                  <div className="rounded-2xl bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                    No hay detalle diario para este mes.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-slate-600">
                          <tr>
                            <th className="px-4 py-3 text-left font-medium">Día</th>
                            <th className="px-4 py-3 text-right font-medium">Revenue</th>
                            <th className="px-4 py-3 text-right font-medium">ADR</th>
                            <th className="px-4 py-3 text-right font-medium">RevPAR</th>
                            <th className="px-4 py-3 text-right font-medium">OCC</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                          {((dailySummary?.daily ?? []) as DailyRow[]).map((day, index) => (
                            <tr key={`${getDailyLabel(day, index)}-${index}`} className="hover:bg-slate-50">
                              <td className="px-4 py-3 font-medium text-slate-900">
                                {getDailyLabel(day, index)}
                              </td>
                              <td className="px-4 py-3 text-right text-slate-700">
                                {formatCurrency(pickNumeric(day, ["revenue", "totalRevenue", "total_revenue"]))}
                              </td>
                              <td className="px-4 py-3 text-right text-slate-700">
                                {formatCurrency(pickNumeric(day, ["adr", "averageDailyRate"]))}
                              </td>
                              <td className="px-4 py-3 text-right text-slate-700">
                                {formatCurrency(pickNumeric(day, ["revpar", "revPar"]))}
                              </td>
                              <td className="px-4 py-3 text-right text-slate-700">
                                {formatPercent(
                                  pickNumeric(day, ["occ", "occupancy", "occupancyRate"]),
                                  1,
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}