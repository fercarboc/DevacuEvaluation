import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar,
  Clock,
  FileText,
  Fingerprint,
  Info,
  LockKeyhole,
  PlusCircle,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";

import { callEvalFn } from "@/services/callEvalFn";
import {
  getGlobalSummary,
  getGlobalRiskSnapshot,
  type GlobalRiskSnapshot,
} from "@/services/clientService";

import type { User } from "@/types/types";

type ViewMode = "GLOBAL" | "MINE";
type ManualQueryType = "DOCUMENT" | "EMAIL" | "PHONE" | "FULL_NAME";
type RiskLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "NO_CONCLUYENTE";

type ManualCheckGlobalProfile = {
  identityKey: string;
  riskLevel: RiskLevel;
  riskScore: number;
  incidentsTotal: number;
  incidentsHigh?: number;
  incidentsCritical?: number;
  distinctOrgsCount?: number;
  distinctPropertiesCount?: number;
  lastIncidentAt?: string | null;
  staysCount?: number;
  totalNetLoss?: number;
  firstSeenDate?: string | null;
  lastSeenDate?: string | null;
};

type ManualCheckGlobalSummary = {
  hasSignals: boolean;
  riskLevel: RiskLevel;
  riskScore: number;
  incidentsTotal: number;
  incidentsHigh?: number;
  incidentsCritical?: number;
  distinctOrgsCount?: number;
  distinctPropertiesCount?: number;
  lastIncidentAt?: string | null;
  staysCount?: number;
  totalNetLoss?: number;
  firstSeenDate?: string | null;
  lastSeenDate?: string | null;
  profiles?: ManualCheckGlobalProfile[];
};

type ManualCheckMineRecord = {
  identityKey: string;
  fullName?: string | null;
  fullNameMasked?: string | null;
  maskedDocument?: string | null;
  maskedEmail?: string | null;
  maskedPhone?: string | null;
  incidentType?: string | null;
  severity?: string | null;
  incidentDate?: string | null;
  economicImpact?: number | null;
  incidentsCount?: number;
  lastIncidentAt?: string | null;
  riskLevel?: RiskLevel;
  riskScore?: number;
  country?: string | null;
};

type ManualCheckMineSummary = {
  totalMatches: number;
  riskLevel?: RiskLevel;
  records: ManualCheckMineRecord[];
};

type ManualCheckResponse = {
  checkId: string;
  propertyId: string;
  orgId: string;
  mode: ViewMode;
  criteria: {
    type: ManualQueryType;
    valueMasked: string | null;
  };
  globalSummary: ManualCheckGlobalSummary | null;
  mineSummary: ManualCheckMineSummary | null;
  previousRiskLevel: RiskLevel | null;
  currentRiskLevel: RiskLevel | null;
  debug?: Record<string, unknown> | null;
};

type RecentSearch = {
  id: string;
  query: string;
  queryMasked: string | null;
  riskLevel: RiskLevel | null;
  hasSignals: boolean;
  mode: ViewMode;
  searchedAt: string;
};

interface SearchRatingsProps {
  currentUser: User;
  selectedPropertyId?: string | null;
  selectedPropertyName?: string | null;
}

function clean(v?: string | null) {
  return String(v ?? "").trim();
}

function inferQueryType(query: string): ManualQueryType {
  const q = clean(query);
  if (!q) return "FULL_NAME";

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
  if (emailRe.test(q)) return "EMAIL";

  const compact = q.toUpperCase().replace(/\s+/g, "").replace(/-/g, "");
  if (/^\d{8}[A-Z]$/.test(compact)) return "DOCUMENT";
  if (/^[XYZ]\d{7}[A-Z]$/.test(compact)) return "DOCUMENT";

  if (/[A-Z]/.test(compact) && /\d/.test(compact) && compact.length >= 7 && compact.length <= 20) {
    return "DOCUMENT";
  }

  const digits = q.replace(/\D/g, "");
  if (digits.length >= 7 && digits.length <= 15) return "PHONE";

  return "FULL_NAME";
}

function formatDate(v?: string | null) {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES");
}

function formatMoneyEUR(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function riskBadgeClasses(risk?: RiskLevel | null) {
  const r = risk ?? "NO_CONCLUYENTE";
  if (r === "LOW") return "bg-green-100 text-green-700";
  if (r === "MEDIUM") return "bg-amber-100 text-amber-800";
  if (r === "HIGH") return "bg-red-100 text-red-700";
  if (r === "NONE") return "bg-slate-100 text-slate-700";
  return "bg-slate-100 text-slate-700";
}

function riskLabel(risk?: RiskLevel | null) {
  const r = risk ?? "NO_CONCLUYENTE";
  if (r === "LOW") return "Bajo";
  if (r === "MEDIUM") return "Medio";
  if (r === "HIGH") return "Alto";
  if (r === "NONE") return "Sin señales";
  return "No concluyente";
}

function severityBadgeClasses(severity?: string | null) {
  const s = String(severity ?? "").toUpperCase();
  if (s === "LOW") return "bg-green-100 text-green-700";
  if (s === "MEDIUM") return "bg-amber-100 text-amber-800";
  if (s === "HIGH" || s === "CRITICAL") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-700";
}

function severityLabel(severity?: string | null) {
  const s = String(severity ?? "").toUpperCase();
  if (s === "LOW") return "Baja";
  if (s === "MEDIUM") return "Media";
  if (s === "HIGH") return "Alta";
  if (s === "CRITICAL") return "Crítica";
  return s || "—";
}

function incidentTypeLabel(type?: string | null) {
  const t = String(type ?? "").toUpperCase();
  switch (t) {
    case "FRAUD":
      return "Fraude";
    case "NO_SHOW":
      return "No show";
    case "PAYMENT_INCIDENT":
      return "Incidencia de pago";
    case "PROPERTY_DAMAGE":
      return "Daños materiales";
    case "RULES_VIOLATION":
      return "Incumplimiento de normas";
    case "AGGRESSIVE_BEHAVIOR":
      return "Comportamiento agresivo";
    case "BLACKLIST_MATCH":
      return "Coincidencia blacklist";
    case "OTHER":
      return "Otra incidencia";
    default:
      return t || "—";
  }
}

function calcPercentListWithCounts(map: Record<string, number>) {
  const entries = Object.entries(map)
    .map(([k, v]) => ({ key: k, count: Number(v || 0) }))
    .filter((x) => x.count > 0);

  const total = entries.reduce((acc, x) => acc + x.count, 0);
  if (!total) {
    return {
      list: [] as Array<{ key: string; count: number; pct: number }>,
      total: 0,
    };
  }

  const list = entries
    .map((x) => ({ key: x.key, count: x.count, pct: (x.count / total) * 100 }))
    .sort((a, b) => b.pct - a.pct);

  return { list, total };
}

function groupTopAndRestWithMeta(
  list: Array<{ key: string; count: number; pct: number }>,
  topN: number,
  restLabelBuilder: (restCount: number) => string,
) {
  const top = list.slice(0, topN);
  const rest = list.slice(topN);
  const restPct = rest.reduce((acc, x) => acc + x.pct, 0);
  const restCount = rest.length;

  const out =
    restPct >= 0.5
      ? [...top, { key: restLabelBuilder(restCount), count: 0, pct: restPct }]
      : top;

  const sum = out.reduce((acc, x) => acc + x.pct, 0);
  const diff = 100 - sum;
  if (out.length && Math.abs(diff) >= 0.05) {
    out[0] = { ...out[0], pct: out[0].pct + diff };
  }

  return out;
}

function buildConicGradient(items: Array<{ label: string; pct: number }>) {
  const palette = [
    "rgba(15, 23, 42, 0.80)",
    "rgba(15, 23, 42, 0.60)",
    "rgba(15, 23, 42, 0.45)",
    "rgba(15, 23, 42, 0.30)",
    "rgba(15, 23, 42, 0.20)",
    "rgba(15, 23, 42, 0.12)",
    "rgba(15, 23, 42, 0.08)",
  ];

  let acc = 0;
  const stops = items.map((it, idx) => {
    const start = acc;
    acc += Math.max(0, it.pct);
    const end = acc;
    const color = palette[idx % palette.length];
    return `${color} ${start}% ${end}%`;
  });

  if (acc < 100) stops.push(`rgba(148, 163, 184, 0.15) ${acc}% 100%`);
  return `conic-gradient(${stops.join(", ")})`;
}

function scoreLevel(score?: number | null): "LOW" | "MEDIUM" | "HIGH" {
  const s = Number(score ?? 0);
  if (s >= 60) return "HIGH";
  if (s >= 30) return "MEDIUM";
  return "LOW";
}

function scoreLevelLabel(score?: number | null) {
  const level = scoreLevel(score);
  if (level === "HIGH") return "Alto";
  if (level === "MEDIUM") return "Medio";
  return "Bajo";
}

function scoreBarClasses(score?: number | null) {
  const level = scoreLevel(score);
  if (level === "HIGH") return "bg-red-500";
  if (level === "MEDIUM") return "bg-amber-500";
  return "bg-emerald-500";
}

function scorePanelClasses(score?: number | null) {
  const level = scoreLevel(score);
  if (level === "HIGH") return "border-red-200 bg-red-50";
  if (level === "MEDIUM") return "border-amber-200 bg-amber-50";
  return "border-emerald-200 bg-emerald-50";
}

function clampScore(score?: number | null) {
  const s = Number(score ?? 0);
  if (!Number.isFinite(s)) return 0;
  return Math.max(0, Math.min(100, Math.round(s)));
}

function monthsSince(dateValue?: string | null) {
  if (!dateValue) return null;
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return null;

  const now = new Date();
  const months =
    (now.getFullYear() - d.getFullYear()) * 12 +
    (now.getMonth() - d.getMonth());

  return Math.max(0, months);
}

function formatTimeWindow(dateValue?: string | null) {
  const months = monthsSince(dateValue);
  if (months == null) return "Sin actividad";
  if (months <= 3) return "≤ 3 meses";
  if (months <= 6) return "3–6 meses";
  if (months <= 12) return "6–12 meses";
  return "> 12 meses";
}

async function manualCheckScreening(payload: {
  property_id: string;
  mode: ViewMode;
  criteria: {
    type: ManualQueryType;
    value: string;
  };
}): Promise<ManualCheckResponse> {
  const functionName =
    payload.mode === "MINE"
      ? "debacu_eval_manual_check_mine"
      : "debacu_eval_manual_check";

  const requestBody =
    payload.mode === "MINE"
      ? {
          property_id: payload.property_id,
          criteria: payload.criteria,
        }
      : {
          property_id: payload.property_id,
          mode: payload.mode,
          criteria: payload.criteria,
        };

  const res = await callEvalFn(functionName, requestBody);

  if (!res?.ok) {
    throw new Error(res?.detail || `${functionName}_failed`);
  }

  if (!res?.data) {
    throw new Error(`${functionName}_empty_response`);
  }

  return {
    globalSummary: null,
    mineSummary: null,
    previousRiskLevel: null,
    currentRiskLevel: null,
    ...res.data,
  } as ManualCheckResponse;
}

export const SearchRatings: React.FC<SearchRatingsProps> = ({
  currentUser,
  selectedPropertyId,
  selectedPropertyName,
}) => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<ViewMode>("GLOBAL");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [result, setResult] = useState<ManualCheckResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [platformSummary, setPlatformSummary] = useState<Record<string, number>>({});
  const [countrySummary, setCountrySummary] = useState<Record<string, number>>({});
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState("");
  const [riskSnap, setRiskSnap] = useState<GlobalRiskSnapshot | null>(null);
  const [recentSearches, setRecentSearches] = useState<RecentSearch[]>(() => {
    try {
      const stored = localStorage.getItem("debacu_recent_searches");
      return stored ? (JSON.parse(stored) as RecentSearch[]) : [];
    } catch {
      return [];
    }
  });

  const activePropertyId = useMemo(() => {
    return clean(selectedPropertyId) || clean(window.localStorage.getItem("selectedPropertyId")) || "";
  }, [selectedPropertyId]);

  const activePropertyName = useMemo(() => {
    return clean(selectedPropertyName) || clean(window.localStorage.getItem("selectedPropertyName")) || "Propiedad activa";
  }, [selectedPropertyName]);

  useEffect(() => {
    void currentUser;
  }, [currentUser]);

  useEffect(() => {
    const load = async () => {
      try {
        const rawSummary = await getGlobalSummary();

        setPlatformSummary(
          rawSummary?.platform_counts && typeof rawSummary.platform_counts === "object"
            ? rawSummary.platform_counts
            : {},
        );

        setCountrySummary(
          rawSummary?.country_counts && typeof rawSummary.country_counts === "object"
            ? rawSummary.country_counts
            : {},
        );
      } catch (e) {
        console.error("Error cargando resumen global:", e);
        setPlatformSummary({});
        setCountrySummary({});
      }
    };

    void load();
  }, []);

  useEffect(() => {
    let alive = true;

    const loadRisk = async () => {
      setRiskLoading(true);
      setRiskError("");

      try {
        const r = await getGlobalRiskSnapshot();
        if (!alive) return;
        setRiskSnap(r);
      } catch (e: any) {
        if (!alive) return;
        setRiskError(e?.message ?? "Error cargando indicador de riesgo");
        setRiskSnap(null);
      } finally {
        if (alive) setRiskLoading(false);
      }
    };

    void loadRisk();

    return () => {
      alive = false;
    };
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    const q = clean(query);
    if (!q) return;

    if (!activePropertyId) {
      setErrorMsg("Selecciona primero una propiedad activa.");
      setSearched(true);
      setResult(null);
      return;
    }

    setLoading(true);
    setSearched(true);
    setErrorMsg("");
    setResult(null);

    try {
      const type = inferQueryType(q);

      const data = await manualCheckScreening({
        property_id: activePropertyId,
        mode,
        criteria: { type, value: q },
      });

      setResult(data);

      const entry: RecentSearch = {
        id: data.checkId,
        query: q,
        queryMasked: data.criteria?.valueMasked ?? null,
        riskLevel: data.globalSummary?.riskLevel ?? data.mineSummary?.riskLevel ?? null,
        hasSignals: data.globalSummary?.hasSignals ?? (data.mineSummary?.totalMatches ?? 0) > 0,
        mode,
        searchedAt: new Date().toISOString(),
      };
      setRecentSearches((prev) => {
        const updated = [entry, ...prev.filter((s) => s.id !== entry.id)].slice(0, 10);
        try { localStorage.setItem("debacu_recent_searches", JSON.stringify(updated)); } catch {}
        return updated;
      });
    } catch (error: any) {
      console.error(error);
      setErrorMsg(error?.message ?? "No se ha podido completar la consulta.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  const platformPctList = useMemo(() => {
    const { list } = calcPercentListWithCounts(platformSummary);
    return groupTopAndRestWithMeta(list, 6, () => "Otros");
  }, [platformSummary]);

  const platformDonutGradient = useMemo(() => {
    const items = platformPctList.map((x) => ({ label: x.key, pct: x.pct }));
    return items.length ? buildConicGradient(items) : "";
  }, [platformPctList]);

  const countryPctList = useMemo(() => {
    const { list } = calcPercentListWithCounts(countrySummary);
    return groupTopAndRestWithMeta(list, 5, (n) => (n > 0 ? `Resto (${n} países más)` : "Resto"));
  }, [countrySummary]);

  const headerTitle = mode === "GLOBAL" ? "Comprobación asociada a solicitud" : "Mis registros";
  const headerSubtitle =
    mode === "GLOBAL"
      ? "Introduce documento, email, teléfono o nombre. El resultado global muestra solo señales agregadas y no identificables."
      : "Consulta únicamente incidencias y trazas propias de la propiedad activa.";

  const mineRecords = result?.mineSummary?.records ?? [];
  const mineCount = result?.mineSummary?.totalMatches ?? 0;
  const globalSummary = result?.globalSummary ?? null;

  return (
    <div className="mx-auto max-w-6xl rounded-3xl bg-slate-100/80 p-1">
      <div className="mb-5">
        <h2 className="mb-1 text-2xl font-bold text-slate-950">{headerTitle}</h2>
        <p className="text-sm text-slate-600">{headerSubtitle}</p>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
            Propiedad activa: <span className="font-semibold">{activePropertyName}</span>
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
      </div>

      <div className="mb-5 rounded-2xl border border-slate-300 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setMode("GLOBAL");
              setSearched(false);
              setResult(null);
              setErrorMsg("");
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              mode === "GLOBAL"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
            }`}
          >
            <Shield className="mr-1 inline-block h-3.5 w-3.5 -mt-0.5" />
            Comprobación (Global)
          </button>

          <button
            type="button"
            onClick={() => {
              setMode("MINE");
              setSearched(false);
              setResult(null);
              setErrorMsg("");
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              mode === "MINE"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
            }`}
          >
            <FileText className="mr-1 inline-block h-3.5 w-3.5 -mt-0.5" />
            Mis registros
          </button>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-5 w-5 text-slate-400" />
            </div>

            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="block w-full rounded-2xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-sm text-slate-900 caret-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 placeholder:text-slate-400"
              placeholder="Documento, email, teléfono o nombre…"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !query.trim() || !activePropertyId}
            className="rounded-2xl bg-slate-900 px-6 py-3 font-semibold text-white transition-colors hover:bg-black disabled:opacity-50"
          >
            {loading ? "Buscando…" : mode === "GLOBAL" ? "Comprobar" : "Consultar"}
          </button>
        </form>

        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-slate-300 bg-slate-100 p-4 text-xs text-slate-700">
          {mode === "GLOBAL" ? (
            <LockKeyhole className="mt-0.5 h-4 w-4 text-slate-500" />
          ) : (
            <Fingerprint className="mt-0.5 h-4 w-4 text-slate-500" />
          )}
          <div>
            <div className="font-semibold text-slate-900">
              {mode === "GLOBAL" ? "Privacidad reforzada (Global)" : "Privacidad por defecto"}
            </div>
            <div>
              {mode === "GLOBAL" ? (
                <>Debacu no devuelve datos personales ni confirma identidades. Solo se muestran señales agregadas y no identificables.</>
              ) : (
                <>En modo “Mis registros” solo se muestran incidencias de la propiedad activa y los identificadores aparecen enmascarados.</>
              )}
            </div>
          </div>
        </div>

        {!!errorMsg && (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMsg}
          </div>
        )}
      </div>

      {recentSearches.length > 0 && (
        <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-400" />
              <h4 className="text-sm font-semibold text-slate-700">Búsquedas recientes</h4>
            </div>
            <button
              type="button"
              onClick={() => {
                setRecentSearches([]);
                try { localStorage.removeItem("debacu_recent_searches"); } catch {}
              }}
              className="text-[11px] text-slate-400 hover:text-slate-600 transition-colors"
            >
              Borrar historial
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {recentSearches.slice(0, 8).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setQuery(s.query);
                  if (s.mode !== mode) setMode(s.mode);
                }}
                className="group flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 transition-colors hover:border-slate-300 hover:bg-white"
              >
                <span
                  className={`h-2 w-2 rounded-full flex-shrink-0 ${
                    s.riskLevel === "HIGH"
                      ? "bg-red-400"
                      : s.riskLevel === "MEDIUM"
                        ? "bg-amber-400"
                        : s.riskLevel === "LOW"
                          ? "bg-emerald-400"
                          : "bg-slate-300"
                  }`}
                />
                <span className="max-w-[120px] truncate font-medium">
                  {s.queryMasked ?? s.query}
                </span>
                <span className="text-slate-400">{s.mode === "MINE" ? "Propio" : "Global"}</span>
                <X
                  className="h-3 w-3 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRecentSearches((prev) => {
                      const updated = prev.filter((r) => r.id !== s.id);
                      try { localStorage.setItem("debacu_recent_searches", JSON.stringify(updated)); } catch {}
                      return updated;
                    });
                  }}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-4">
        <section className="lg:col-span-1">
          <div className="h-full rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Info className="h-4 w-4 text-indigo-500" />
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">Plataformas</h4>
                  <p className="text-[11px] text-slate-500" title="Distribución agregada del histórico global.">
                    Distribución (%) · top + Otros
                  </p>
                </div>
              </div>
            </div>

            {platformPctList.length === 0 ? (
              <p className="text-xs text-slate-400">Sin datos.</p>
            ) : (
              <>
                <div className="my-3 flex items-center justify-center">
                  <div
                    className="relative h-28 w-28 rounded-full"
                    style={{ background: platformDonutGradient || "rgba(148,163,184,0.15)" }}
                  >
                    <div className="absolute inset-3 rounded-full border border-slate-200 bg-white" />
                  </div>
                </div>

                <div className="space-y-2">
                  {platformPctList.map((row) => (
                    <div key={row.key} className="flex items-center justify-between text-xs">
                      <span className="truncate pr-2 text-slate-700">{row.key}</span>
                      <span className="font-semibold text-slate-600">{row.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        <section className="lg:col-span-2">
          <div className="flex max-h-[680px] flex-col rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-950">Resultados</h3>

              {!searched ? (
                <div className="text-sm text-slate-500">Introduce un criterio arriba.</div>
              ) : mode === "GLOBAL" ? (
                globalSummary ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full border bg-white px-3 py-1 text-slate-700">
                      Coincidencias: <span className="font-semibold">{globalSummary.hasSignals ? "Sí" : "No"}</span>
                    </span>
                    <span className={`rounded-full px-3 py-1 font-semibold ${riskBadgeClasses(globalSummary.riskLevel)}`}>
                      {riskLabel(globalSummary.riskLevel)}
                    </span>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">Sin información.</div>
                )
              ) : result?.mineSummary ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-full border bg-white px-3 py-1 text-slate-700">
                    {mineCount} incidencias
                  </span>
                  <span className={`rounded-full px-3 py-1 font-semibold ${riskBadgeClasses(result.mineSummary.riskLevel ?? "NONE")}`}>
                    {riskLabel(result.mineSummary.riskLevel ?? "NONE")}
                  </span>
                </div>
              ) : (
                <div className="text-sm text-slate-500">Sin información.</div>
              )}
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto pr-1">
              {mode === "MINE" && searched && (
                <>
                  {mineCount > 0 ? (
                    <>
                      <div className="rounded-2xl border border-slate-300 bg-slate-100 p-4">
                        <div className="mb-2 flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-slate-600" />
                          <h4 className="text-sm font-bold text-slate-900">
                            Incidencias propias del establecimiento
                          </h4>
                        </div>

                        <div className="rounded-2xl border border-slate-300 bg-white p-4">
                          <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <div className="text-slate-500">Incidencias</div>
                              <div className="mt-1 font-bold text-slate-900">{mineCount}</div>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <div className="text-slate-500">Nivel</div>
                              <div className="mt-1 font-bold text-slate-900">
                                {riskLabel(result?.mineSummary?.riskLevel ?? "NONE")}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 text-[11px] text-slate-500">
                            Resultado limitado a la propiedad activa. No se mezclan registros de otras propiedades.
                          </div>
                        </div>
                      </div>

                      {mineRecords.map((record, idx) => (
                        <div
                          key={`${record.identityKey}-${record.incidentDate}-${idx}`}
                          className="rounded-2xl border border-slate-300 bg-slate-100 p-4 transition-colors hover:border-slate-400"
                        >
                          <div className="flex-1">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <h4 className="text-sm font-bold uppercase text-slate-900">
                                {record.fullNameMasked || "Identidad enmascarada"}
                              </h4>

                              {record.maskedDocument ? (
                                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600">
                                  {record.maskedDocument}
                                </span>
                              ) : null}

                              {record.country ? (
                                <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-600">
                                  {record.country}
                                </span>
                              ) : null}
                            </div>

                            <div className="mb-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                              {record.maskedEmail ? <span>{record.maskedEmail}</span> : null}
                              {record.maskedPhone ? <span>{record.maskedPhone}</span> : null}
                              {record.lastIncidentAt ? <span>Última: {formatDate(record.lastIncidentAt)}</span> : null}
                            </div>

                            <div className="rounded-2xl border border-slate-300 bg-white p-3">
                              <div className="mb-3 flex flex-wrap gap-2">
                                <span className="rounded-full border bg-slate-50 px-3 py-1 text-[11px] text-slate-700">
                                  Tipo: <span className="font-semibold">{incidentTypeLabel(record.incidentType)}</span>
                                </span>

                                <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${severityBadgeClasses(record.severity)}`}>
                                  Severidad: {severityLabel(record.severity)}
                                </span>

                                {record.riskLevel ? (
                                  <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${riskBadgeClasses(record.riskLevel)}`}>
                                    Riesgo: {riskLabel(record.riskLevel)}
                                  </span>
                                ) : null}
                              </div>

                              <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                  <div className="mb-1 text-slate-500">Fecha</div>
                                  <div className="font-semibold text-slate-800">
                                    {formatDate(record.incidentDate)}
                                  </div>
                                </div>

                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                  <div className="mb-1 text-slate-500">Impacto</div>
                                  <div className="font-semibold text-slate-800">
                                    {formatMoneyEUR(record.economicImpact)}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="mt-3 flex items-center gap-5 text-[11px] text-slate-500">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                <span>{formatDate(record.incidentDate)}</span>
                              </div>

                              {typeof record.incidentsCount === "number" ? (
                                <div className="flex items-center gap-1">
                                  <span>Total identidad: {record.incidentsCount}</span>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="mt-2 rounded-2xl border border-blue-100 bg-blue-50 p-6 text-center">
                      <ShieldAlert className="mx-auto mb-3 h-12 w-12 text-blue-400" />
                      <h4 className="font-semibold text-blue-900">Sin registros propios</h4>
                      <p className="mt-1 text-sm text-blue-700">
                        No hay incidencias propias de la propiedad activa para este criterio.
                      </p>
                    </div>
                  )}
                </>
              )}

              {mode === "GLOBAL" && searched && (
                <>
                  {!globalSummary ? (
                    <div className="mt-2 rounded-2xl border border-blue-100 bg-blue-50 p-6 text-center">
                      <ShieldAlert className="mx-auto mb-3 h-12 w-12 text-blue-400" />
                      <h4 className="font-semibold text-blue-900">Sin resultado</h4>
                      <p className="mt-1 text-sm text-blue-700">
                        No se ha podido obtener información para este criterio.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-slate-300 bg-slate-100 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="mb-3 flex items-center gap-2">
                            <Shield className="h-4 w-4 text-slate-600" />
                            <h4 className="text-sm font-bold text-slate-950">
                              Señales agregadas (no identificables)
                            </h4>
                          </div>

                          <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
                            <div className={`rounded-2xl border p-4 ${scorePanelClasses(globalSummary.riskScore)}`}>
                              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                Score Debacu
                              </div>

                              <div className="flex items-end gap-2">
                                <div className="text-3xl font-bold leading-none text-slate-950">
                                  {clampScore(globalSummary.riskScore)}
                                </div>
                                <div className="pb-0.5 text-sm text-slate-500">/100</div>
                              </div>

                              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
                                <div
                                  className={`h-full rounded-full ${scoreBarClasses(globalSummary.riskScore)}`}
                                  style={{ width: `${clampScore(globalSummary.riskScore)}%` }}
                                />
                              </div>

                              <div className="mt-3 flex items-center justify-between">
                                <span className="text-sm font-semibold text-slate-800">
                                  Riesgo {scoreLevelLabel(globalSummary.riskScore).toLowerCase()}
                                </span>
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${riskBadgeClasses(globalSummary.riskLevel)}`}>
                                  {riskLabel(globalSummary.riskLevel)}
                                </span>
                              </div>
                            </div>

                            <div className="rounded-2xl border border-slate-300 bg-white p-4">
                              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                Resumen agregado
                              </div>
                              <div className="space-y-1.5 text-sm">
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-600">Perfiles</span>
                                  <span className="font-semibold text-slate-900">
                                    {globalSummary.profiles?.length ?? (globalSummary.hasSignals ? 1 : 0)}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-600">Incidencias</span>
                                  <span className="font-semibold text-slate-900">
                                    {globalSummary.incidentsTotal ?? 0}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-600">Estancias</span>
                                  <span className="font-semibold text-slate-900">
                                    {globalSummary.staysCount ?? 0}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-600">Impacto</span>
                                  <span className="font-semibold text-slate-900">
                                    {formatMoneyEUR(globalSummary.totalNetLoss)}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="rounded-2xl border border-slate-300 bg-white p-4">
                              <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                                Contexto temporal
                              </div>

                              <div className="space-y-1.5 text-[13px]">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-slate-600">Vent.</span>
                                  <span className="text-right font-semibold leading-tight text-slate-900">
                                    {formatTimeWindow(globalSummary.lastIncidentAt ?? globalSummary.lastSeenDate)}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-slate-600">Orgs</span>
                                  <span className="font-semibold text-slate-900">
                                    {globalSummary.distinctOrgsCount ?? 0}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-slate-600">Props</span>
                                  <span className="font-semibold text-slate-900">
                                    {globalSummary.distinctPropertiesCount ?? 0}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-slate-600">Match</span>
                                  <span className="font-semibold text-slate-900">
                                    {globalSummary.hasSignals ? "Sí" : "No"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="mb-3 text-xs text-slate-600">
                            Este resultado no confirma identidades ni muestra PII. Se limita a señales agregadas para apoyo operativo.
                          </div>

                          {globalSummary.hasSignals && (
                            <div className={`mb-4 rounded-2xl border p-4 text-sm ${
                              globalSummary.riskLevel === "HIGH"
                                ? "border-red-200 bg-red-50"
                                : globalSummary.riskLevel === "MEDIUM"
                                  ? "border-amber-100 bg-amber-50"
                                  : "border-emerald-100 bg-emerald-50"
                            }`}>
                              <div className="mb-2 flex items-center gap-2">
                                <Info className={`h-4 w-4 flex-shrink-0 ${
                                  globalSummary.riskLevel === "HIGH"
                                    ? "text-red-500"
                                    : globalSummary.riskLevel === "MEDIUM"
                                      ? "text-amber-600"
                                      : "text-emerald-600"
                                }`} />
                                <span className="font-semibold text-slate-800">
                                  ¿Por qué este nivel de riesgo?
                                </span>
                              </div>
                              <ul className="space-y-1 text-xs text-slate-700">
                                {(globalSummary.incidentsTotal ?? 0) > 0 && (
                                  <li>
                                    · Se han registrado{" "}
                                    <strong>{globalSummary.incidentsTotal}</strong>{" "}
                                    {globalSummary.incidentsTotal === 1 ? "incidencia" : "incidencias"}{" "}
                                    en la plataforma para esta identidad.
                                  </li>
                                )}
                                {(globalSummary.incidentsCritical ?? 0) > 0 && (
                                  <li>
                                    · <strong>{globalSummary.incidentsCritical}</strong>{" "}
                                    {(globalSummary.incidentsCritical ?? 0) === 1
                                      ? "incidencia es de nivel crítico"
                                      : "incidencias son de nivel crítico"}.
                                  </li>
                                )}
                                {(globalSummary.incidentsHigh ?? 0) > 0 && (
                                  <li>
                                    · <strong>{globalSummary.incidentsHigh}</strong>{" "}
                                    {(globalSummary.incidentsHigh ?? 0) === 1
                                      ? "incidencia es de severidad alta"
                                      : "incidencias son de severidad alta"}.
                                  </li>
                                )}
                                {(globalSummary.distinctOrgsCount ?? 0) > 1 && (
                                  <li>
                                    · Reportado por{" "}
                                    <strong>{globalSummary.distinctOrgsCount}</strong>{" "}
                                    establecimientos distintos.
                                  </li>
                                )}
                                {(globalSummary.totalNetLoss ?? 0) > 0 && (
                                  <li>
                                    · Pérdida económica neta acumulada:{" "}
                                    <strong>{formatMoneyEUR(globalSummary.totalNetLoss)}</strong>.
                                  </li>
                                )}
                                {globalSummary.lastIncidentAt && (
                                  <li>
                                    · Última incidencia registrada:{" "}
                                    <strong>{formatTimeWindow(globalSummary.lastIncidentAt)}</strong>.
                                  </li>
                                )}
                              </ul>
                            </div>
                          )}

                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full border bg-white px-3 py-1 text-slate-700">
                              Coincidencias: <span className="font-semibold">{globalSummary.hasSignals ? "Sí" : "No"}</span>
                            </span>

                            <span className={`rounded-full px-3 py-1 font-semibold ${riskBadgeClasses(globalSummary.riskLevel)}`}>
                              {riskLabel(globalSummary.riskLevel)}
                            </span>

                            {result?.criteria?.valueMasked ? (
                              <span className="rounded-full border bg-white px-3 py-1 text-slate-700">
                                Criterio: <span className="font-semibold">{result.criteria.valueMasked}</span>
                              </span>
                            ) : null}

                            {typeof globalSummary.profiles?.length === "number" && globalSummary.profiles.length > 1 ? (
                              <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 font-semibold text-indigo-700">
                                {globalSummary.profiles.length} perfiles relacionados
                              </span>
                            ) : null}
                          </div>

                          {Array.isArray(globalSummary.profiles) && globalSummary.profiles.length > 0 ? (
                            <div className="mt-4">
                              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                Desglose de perfiles agregados
                              </div>

                              <div className="space-y-3">
                                {globalSummary.profiles.map((profile, idx) => (
                                  <div
                                    key={`${profile.identityKey}-${idx}`}
                                    className="rounded-2xl border border-slate-300 bg-white p-3"
                                  >
                                    <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold text-slate-700">
                                          Perfil {idx + 1}
                                        </span>
                                        <span className={`rounded-full px-3 py-1 text-[11px] font-semibold ${riskBadgeClasses(profile.riskLevel)}`}>
                                          {riskLabel(profile.riskLevel)}
                                        </span>
                                      </div>

                                      <div className="text-sm font-semibold text-slate-900">
                                        Score {clampScore(profile.riskScore)}/100
                                      </div>
                                    </div>

                                    <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
                                      <div
                                        className={`h-full rounded-full ${scoreBarClasses(profile.riskScore)}`}
                                        style={{ width: `${clampScore(profile.riskScore)}%` }}
                                      />
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                        <div className="mb-1 text-[11px] text-slate-500">Incidencias</div>
                                        <div className="font-semibold text-slate-900">
                                          {profile.incidentsTotal ?? 0}
                                        </div>
                                      </div>

                                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                        <div className="mb-1 text-[11px] text-slate-500">Estancias</div>
                                        <div className="font-semibold text-slate-900">
                                          {profile.staysCount ?? 0}
                                        </div>
                                      </div>

                                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                        <div className="mb-1 text-[11px] text-slate-500">Impacto</div>
                                        <div className="font-semibold text-slate-900">
                                          {formatMoneyEUR(profile.totalNetLoss)}
                                        </div>
                                      </div>

                                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                        <div className="mb-1 text-[11px] text-slate-500">Ventana</div>
                                        <div className="font-semibold text-slate-900">
                                          {formatTimeWindow(profile.lastSeenDate ?? profile.lastIncidentAt)}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}

                          <div className="mt-4 text-[11px] text-slate-500">
                            Consulta auditada · check_id:{" "}
                            <span className="font-semibold text-slate-700">{result?.checkId ?? "—"}</span>
                            {" · "}
                            riesgo previo:{" "}
                            <span className="font-semibold text-slate-700">
                              {riskLabel(result?.previousRiskLevel ?? "NONE")}
                            </span>
                            {" · "}
                            riesgo actual:{" "}
                            <span className="font-semibold text-slate-700">
                              {riskLabel(result?.currentRiskLevel ?? "NONE")}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {searched && (
              <div className="mt-4 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => navigate("/app/registrar")}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-300 hover:bg-white"
                >
                  <PlusCircle className="h-4 w-4 text-slate-500" />
                  Registrar incidencia sobre este criterio
                </button>
              </div>
            )}
          </div>
        </section>

        <section className="lg:col-span-1">
          <div className="h-full rounded-2xl border border-slate-300 bg-white p-4 shadow-sm">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <h5 className="text-xs font-semibold uppercase text-slate-500">Países</h5>
                <div className="text-[11px] text-slate-500" title="Top 5 países por % de registros agregados del histórico global.">
                  Top 5 + Resto (en %)
                </div>
              </div>
            </div>

            {countryPctList.length === 0 ? (
              <p className="text-xs text-slate-400">Sin datos.</p>
            ) : (
              <div className="space-y-2">
                {countryPctList.map((row) => (
                  <div key={row.key} className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-600">
                      <span className="truncate pr-2">{row.key}</span>
                      <span className="font-semibold">{row.pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                      <div
                        className="h-full rounded-full bg-slate-900/70"
                        style={{ width: `${Math.max(0, Math.min(100, row.pct))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-6 border-t border-slate-100 pt-4">
              <div className="text-xs font-semibold uppercase text-slate-700" title="Distribución agregada por estrellas sobre el total histórico.">
                Control del riesgo a día de hoy
              </div>

              {riskLoading ? (
                <div className="mt-2 text-xs text-slate-500">Cargando…</div>
              ) : riskError ? (
                <div className="mt-2 text-xs text-red-600">{riskError}</div>
              ) : !riskSnap ? (
                <div className="mt-2 text-xs text-slate-500">Sin datos.</div>
              ) : (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-3 grid grid-cols-3 gap-2 text-[11px]">
                    <div className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-slate-700">
                      <span className="font-semibold">Bajo</span>: {riskSnap.pct_bajo.toFixed(1)}%
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-slate-700">
                      <span className="font-semibold">Medio</span>: {riskSnap.pct_medio.toFixed(1)}%
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white px-2 py-1 text-slate-700">
                      <span className="font-semibold">Alto</span>: {riskSnap.pct_alto.toFixed(1)}%
                    </div>
                  </div>

                  {[
                    { label: "5★", pct: riskSnap.pct_5 },
                    { label: "4★", pct: riskSnap.pct_4 },
                    { label: "3★", pct: riskSnap.pct_3 },
                    { label: "2★", pct: riskSnap.pct_2 },
                    { label: "1★", pct: riskSnap.pct_1 },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center gap-2 py-1">
                      <div className="w-8 text-xs text-slate-600">{row.label}</div>

                      <div className="h-2 flex-1 overflow-hidden rounded-full border border-slate-200 bg-white">
                        <div
                          className="h-full rounded-full bg-slate-900/70"
                          style={{ width: `${Math.max(0, Math.min(100, row.pct))}%` }}
                        />
                      </div>

                      <div className="w-[52px] text-right text-[11px] text-slate-600">
                        {row.pct.toFixed(1)}%
                      </div>
                    </div>
                  ))}

                  <div className="mt-2 text-[11px] text-slate-500">
                    Base de referencia: <span className="font-semibold">100%</span> · Bajo = 4–5★ · Medio = 3★ · Alto = 1–2★
                  </div>
                </div>
              )}

              <div className="mt-2 text-[11px] text-slate-400">
                Indicadores agregados: no identifican ni confirman identidades. Solo valoración del riesgo real existente.
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};