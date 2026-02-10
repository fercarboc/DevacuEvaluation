// src/components/SearchRatings.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  checkSignalsGlobal,
  searchMyRatingsInSupabase,
  getGlobalSummary,
  getGlobalRiskSnapshot,
  type GlobalRiskSnapshot,
  type GlobalSignals,
  type RiskLevel,
  type CountBucket,
  type MatchStrength,
} from "@/services/clientService";

import type { Rating, User } from "@/types/types";
import { StarRating } from "@/components/StarRating";
import {
  Search,
  Calendar,
  ShieldAlert,
  Info,
  ShieldCheck,
  Fingerprint,
  Shield,
  FileText,
  LockKeyhole,
} from "lucide-react";

/** -------------------------------------------------------
 * Objetivo legal (RGPD/LOPDGDD)
 * --------------------------------------------------------
 * - MODO GLOBAL ("Comprobación"): NUNCA renderiza lista de personas ni PII.
 *   Solo muestra señales agregadas y no identificables.
 * - MODO MINE ("Mis registros"): permite ver detalle SOLO de registros creados por el hotel actual.
 *
 * ⚠️ IMPORTANTE:
 * - checkSignalsGlobal(query) NO debe devolver full_name/email/phone/document ni filas individuales.
 * - searchMyRatingsInSupabase(query, limit) resuelve el autor en Edge con x-session-token.
 */

interface SearchRatingsProps {
  currentUser: User;
}

/** -------------------------------
 * Helpers: máscara (solo para “Mis registros”)
 * -------------------------------- */
function maskEmail(email?: string | null) {
  const e = (email || "").trim();
  if (!e || !e.includes("@")) return "";
  const [u, d] = e.split("@");
  const uMask = u.length <= 1 ? "*" : `${u[0]}***`;
  const dParts = d.split(".");
  const dMask = dParts.length
    ? `${dParts[0][0] || "*"}***.${dParts.slice(1).join(".") || "com"}`
    : "***";
  return `${uMask}@${dMask}`;
}

function maskPhone(phone?: string | null) {
  const p = (phone || "").replace(/\D/g, "");
  if (!p) return "";
  const last = p.slice(-3);
  return `•••${last}`;
}

function maskDoc(doc?: string | null) {
  const d = (doc || "").trim();
  if (!d) return "";
  if (d.length <= 4) return "••••";
  return `${d.slice(0, 2)}••••${d.slice(-2)}`;
}

/** En el nuevo UI NO mostramos nombre real. Devuelve etiqueta genérica. */
function displayClientLabel(_full?: string | null) {
  return "Nombre: **********";
}

/** -------------------------------
 * % list con counts (necesario para “Resto (X países más)”)
 * -------------------------------- */
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
  restLabelBuilder: (restCount: number) => string
) {
  const top = list.slice(0, topN);
  const rest = list.slice(topN);

  const restPct = rest.reduce((acc, x) => acc + x.pct, 0);
  const restCount = rest.length;

  const out =
    restPct >= 0.5
      ? [...top, { key: restLabelBuilder(restCount), count: 0, pct: restPct }]
      : top;

  // Ajuste para sumar 100 exacto (por redondeos)
  const sum = out.reduce((acc, x) => acc + x.pct, 0);
  const diff = 100 - sum;
  if (out.length && Math.abs(diff) >= 0.05) {
    out[0] = { ...out[0], pct: out[0].pct + diff };
  }

  return out;
}

/** -------------------------------
 * Parse comentarios estructurados (Mis registros)
 * -------------------------------- */
function parseControlledComment(comment?: string | null) {
  const raw = (comment || "").trim();
  const out: Record<string, string> = {};
  if (!raw) return out;

  raw
    .split("|")
    .map((p) => p.trim())
    .forEach((pair) => {
      const idx = pair.indexOf("=");
      if (idx === -1) return;
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      out[k] = v;
    });

  return out;
}

/** -------------------------------
 * Structured summary (Edge) helpers
 * -------------------------------- */
type StructuredSummaryUI = {
  hasEvidence?: boolean;
  dominantSignal?: string;
  pattern?: "LOW" | "MODERATE" | "HIGH" | string;
  timeWindow?: string;
  lastSeenLabel?: string;
  economicImpactRange?: any;
  netLossRange?: any;
};

function labelDominantSignal(s?: string | null) {
  const v = String(s ?? "").trim();
  if (!v) return "";
  if (v === "INCIDENT_ECONOMIC") return "Incidencia económica";
  if (v === "BAD_RATING") return "Valoración negativa";
  if (v === "NEUTRAL_RATING") return "Valoración neutra";
  if (v === "IMPACT_ITEMS") return "Objetos afectados";
  if (v === "INFO_ONLY") return "Registro informativo";
  return v.replace(/_/g, " ");
}

function labelPattern(p?: string | null) {
  const v = String(p ?? "").trim();
  if (!v) return "";
  if (v === "LOW") return "Bajo";
  if (v === "MODERATE") return "Moderado";
  if (v === "HIGH") return "Alto";
  return v;
}

function pickStructuredSummary(raw: any): StructuredSummaryUI | null {
  const ss = raw?.structured_summary ?? raw?.structuredSummary ?? null;
  if (!ss || typeof ss !== "object") return null;

  return {
    hasEvidence: typeof ss.hasEvidence === "boolean" ? ss.hasEvidence : undefined,
    dominantSignal: typeof ss.dominantSignal === "string" ? ss.dominantSignal : undefined,
    pattern: typeof ss.pattern === "string" ? ss.pattern : undefined,
    timeWindow: typeof ss.timeWindow === "string" ? ss.timeWindow : undefined,
    lastSeenLabel: typeof ss.lastSeenLabel === "string" ? ss.lastSeenLabel : undefined,
    economicImpactRange:
      ss.economicImpactRange ?? ss.economic_impact_range ?? ss.impactRange ?? undefined,
    netLossRange: ss.netLossRange ?? ss.net_loss_range ?? ss.lossRange ?? undefined,
  };
}

/** -------------------------------
 * Normalizadores (defensivos) para filas de “Mis registros”
 * -------------------------------- */
function toIsoDateString(v: unknown): string {
  if (!v) return new Date().toISOString();
  if (typeof v === "string") return v;
  try {
    return new Date(v as any).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function normalizeRating(raw: any): Rating {
  const clientRaw = raw?.clientData ?? raw?.client_data ?? {};

  const createdAt =
    raw?.createdAt ??
    raw?.created_at ??
    raw?.evaluationDate ??
    raw?.evaluation_date ??
    raw?.created ??
    null;

  const value =
    typeof raw?.value === "number"
      ? raw.value
      : typeof raw?.rating === "number"
      ? raw.rating
      : Number(raw?.value ?? raw?.rating ?? 0);

  const fullName =
    clientRaw?.fullName ??
    clientRaw?.full_name ??
    raw?.fullName ??
    raw?.full_name ??
    "";

  const document = clientRaw?.document ?? raw?.document ?? "";
  const email = clientRaw?.email ?? raw?.email ?? null;
  const phone = clientRaw?.phone ?? raw?.phone ?? null;
  const nationality = clientRaw?.nationality ?? raw?.nationality ?? null;

  const authorId =
    raw?.authorId ??
    raw?.author_id ??
    raw?.creatorCustomerId ??
    raw?.creator_customer_id ??
    raw?.creator_customer_uuid ??
    "";

  const authorName =
    raw?.authorName ??
    raw?.author_name ??
    raw?.creatorCustomerName ??
    raw?.creator_customer_name ??
    "";

  const platform = raw?.platform ?? null;
  const comment = raw?.comment ?? raw?.comments ?? raw?.notes ?? null;

  const structured_summary = pickStructuredSummary(raw);

  return {
    id: raw?.id ?? "",
    value,
    comment,
    createdAt: toIsoDateString(createdAt),
    authorId,
    authorName,
    clientData: {
      document,
      email,
      phone,
      fullName,
      nationality,
    },
    platform,
    ...(structured_summary ? ({ structured_summary } as any) : {}),
  } as Rating;
}

function safeNormalizeRating(raw: any): Rating | null {
  try {
    const r = normalizeRating(raw);
    if (!r?.id) return null;
    if (!r?.createdAt) r.createdAt = new Date().toISOString();
    return r;
  } catch (e) {
    console.error("normalizeRating failed for row:", raw, e);
    return null;
  }
}

/** -------------------------------
 * Normaliza summary GLOBAL (getGlobalSummary ya devuelve snake_case, pero defendemos legacy)
 * -------------------------------- */
function normalizeSummary(raw: any): {
  total_count: number;
  platform_counts: Record<string, number>;
  country_counts: Record<string, number>;
} {
  const total_count = Number(raw?.total_count ?? raw?.totalCount ?? raw?.total ?? 0);

  const platform_counts =
    raw?.platform_counts ??
    raw?.platformCounts ??
    raw?.platformSummary ??
    raw?.platform_summary ??
    {};

  const country_counts =
    raw?.country_counts ??
    raw?.countryCounts ??
    raw?.countrySummary ??
    raw?.country_summary ??
    {};

  const safeObj = (o: any) => (o && typeof o === "object" ? o : {});
  return {
    total_count,
    platform_counts: safeObj(platform_counts),
    country_counts: safeObj(country_counts),
  };
}

/** -------------------------------
 * UI helpers
 * -------------------------------- */
function riskBadgeClasses(risk: RiskLevel | undefined | null) {
  const r = risk ?? "NO_CONCLUYENTE";
  if (r === "BAJO") return "bg-green-100 text-green-700";
  if (r === "MEDIO") return "bg-amber-100 text-amber-800";
  if (r === "ALTO") return "bg-red-100 text-red-700";
  return "bg-slate-100 text-slate-700";
}

function bucketLabel(b: CountBucket) {
  if (b === "0") return "0";
  if (b === "1-2") return "1–2";
  if (b === "3-5") return "3–5";
  if (b === "6-10") return "6–10";
  return "10+";
}

function safeStars(v?: number | null) {
  if (typeof v !== "number" || Number.isNaN(v)) return null;
  return Math.max(0, Math.min(5, v));
}

/** Donut simple con conic-gradient (sin librerías) */
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

  if (acc < 100) {
    stops.push(`rgba(148, 163, 184, 0.15) ${acc}% 100%`);
  }

  return `conic-gradient(${stops.join(", ")})`;
}

/** -------------------------------
 * Rangos económicos
 * -------------------------------- */
type MoneyRange = { min: number; max: number } | null;

function formatMoneyEUR(n: number) {
  return new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 }).format(n);
}

function formatMoneyRangeEUR(r: MoneyRange) {
  if (!r) return "—";
  const a = Math.round(r.min);
  const b = Math.round(r.max);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "—";
  if (a === 0 && b === 0) return "0 €";
  if (b >= 999999999) return `≥ ${formatMoneyEUR(a)} €`;
  return `${formatMoneyEUR(a)}–${formatMoneyEUR(b)} €`;
}

/** "1.500" -> 1500 ; "1.500,25" -> 1500.25 */
function parseEsNumber(raw: string): number {
  const s = raw.trim().replace(/\./g, "").replace(/,/g, ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Acepta {min,max} o "301–400 €" o "751–1.000 €" o "5.001+ €" o "0 €" o "≥ 600 €" */
function coerceMoneyRange(v: any): MoneyRange {
  if (!v) return null;

  // {min,max}
  if (typeof v === "object" && typeof v.min === "number" && typeof v.max === "number") {
    return { min: v.min, max: v.max };
  }

  if (typeof v !== "string") return null;

  const s0 = v.trim();

  // "0 €"
  if (/^0\s*€?$/.test(s0.replace(/\s/g, ""))) {
    return { min: 0, max: 0 };
  }

  // "≥ 600 €"  o ">= 600 €"
  const ge = s0.match(/^(?:≥|>=)\s*([\d\.,]+)\s*€?$/);
  if (ge) {
    const min = parseEsNumber(ge[1]);
    if (!Number.isFinite(min)) return null;
    return { min, max: 999999999 };
  }

  // "5.001+ €"  o "5001+"
  const plus = s0.match(/^([\d\.,]+)\s*\+\s*€?$/);
  if (plus) {
    const min = parseEsNumber(plus[1]);
    if (!Number.isFinite(min)) return null;
    return { min, max: 999999999 };
  }

  // "751–1.000 €" (soporta –, - , —)
  const range = s0.match(/^([\d\.,]+)\s*[\-–—]\s*([\d\.,]+)\s*€?$/);
  if (range) {
    const min = parseEsNumber(range[1]);
    const max = parseEsNumber(range[2]);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max };
  }

  return null;
}

/** Extendemos GlobalSignals (snake_case) con tolerancia a legacy */
type GlobalSignalsExt = GlobalSignals & {
  // tolerancia legacy (si en algún sitio queda algo viejo)
  matchStrength?: MatchStrength;
  hasMatches?: boolean;
  countExact?: number;
  countBucket?: CountBucket;
  avgStars?: number | null;
  risk?: RiskLevel;

  economicGrossLabel?: string | null;
  economicNetLabel?: string | null;
  economicGrossBucket?: string | null;
  economicNetBucket?: string | null;
  economicTimeWindow?: string | null;
  hotelCategory?: number | null;
  starsMultiplier?: number | null;
};

function getEconomicRangesForGlobal(
  globalSignals: GlobalSignalsExt | null
): { impact: MoneyRange; loss: MoneyRange } {
  if (!globalSignals) return { impact: null, loss: null };

  // ✅ snake_case (modelo actual)
  const impactFromLabels = coerceMoneyRange(
    (globalSignals as any)?.economic_gross_label ?? (globalSignals as any)?.economicGrossLabel ?? null
  );
  const lossFromLabels = coerceMoneyRange(
    (globalSignals as any)?.economic_net_label ?? (globalSignals as any)?.economicNetLabel ?? null
  );

  if (impactFromLabels || lossFromLabels) {
    return { impact: impactFromLabels, loss: lossFromLabels };
  }

  const ss =
    (globalSignals as any)?.structured_summary ??
    (globalSignals as any)?.structuredSummary ??
    null;

  const impact = coerceMoneyRange(ss?.economicImpactRange ?? ss?.economic_impact_range ?? null);
  const loss = coerceMoneyRange(ss?.netLossRange ?? ss?.net_loss_range ?? null);

  return { impact, loss };
}

function getEconomicRangesForMineSignals(mySignals: any): { impact: MoneyRange; loss: MoneyRange } {
  if (!mySignals) return { impact: null, loss: null };

  const impact = coerceMoneyRange(
    mySignals?.economic_gross_label ?? mySignals?.economicGrossLabel ?? null
  );
  const loss = coerceMoneyRange(
    mySignals?.economic_net_label ?? mySignals?.economicNetLabel ?? null
  );
  return { impact, loss };
}

export const SearchRatings: React.FC<SearchRatingsProps> = ({ currentUser }) => {
  const [mode, setMode] = useState<"GLOBAL" | "MINE">("GLOBAL");
  const [query, setQuery] = useState("");

  // ✅ ventana global configurable
  const GLOBAL_WINDOW_MONTHS: 12 | 24 | 36 = 24;

  /** -------------------------------
   * MINE (Edge) -> snake_case (modelo actual)
   * -------------------------------- */
  type MySignals = {
    has_matches: boolean;
    count_exact: number;
    count_bucket: CountBucket;
    avg_stars: number | null;
    risk_level: RiskLevel;
    time_window: "MINE";
    top_typologies: string[];
    economic_gross_label: string | null;
    economic_net_label: string | null;
    economic_time_window: "MINE";
    last_seen_label: string | null;
  };

  const [mySignals, setMySignals] = useState<MySignals | null>(null);
  const [myResults, setMyResults] = useState<Rating[]>([]);

  // ✅ GLOBAL signals (Edge) snake_case
  const [globalSignals, setGlobalSignals] = useState<GlobalSignalsExt | null>(null);

  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const [platformSummary, setPlatformSummary] = useState<Record<string, number>>({});
  const [countrySummary, setCountrySummary] = useState<Record<string, number>>({});

  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState<string>("");
  const [riskSnap, setRiskSnap] = useState<GlobalRiskSnapshot | null>(null);

  // (compat, ya no se usa en Edge MINE, pero lo dejo por si lo referencian fuera)
  const authorIdForMine = (
    (currentUser as any)?.org_id ||
    (currentUser as any)?.customer_id ||
    currentUser.id
  ) as string;
  void authorIdForMine;

  useEffect(() => {
    const load = async () => {
      try {
        const rawSummary = await getGlobalSummary();
        const summary = normalizeSummary(rawSummary);
        setPlatformSummary(summary.platform_counts);
        setCountrySummary(summary.country_counts);
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
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setSearched(true);

    // reset
    setMyResults([]);
    setMySignals(null);
    setGlobalSignals(null);

    try {
      if (mode === "MINE") {
        const res = await searchMyRatingsInSupabase(q, 50);

        // ✅ signals snake_case (modelo actual)
        const s = (res as any)?.signals ?? null;
        const normalizedSignals: MySignals | null = s
          ? {
              has_matches: Boolean(s?.has_matches ?? s?.hasMatches ?? false),
              count_exact: Number(s?.count_exact ?? s?.countExact ?? 0),
              count_bucket: (s?.count_bucket ?? s?.countBucket ?? "0") as CountBucket,
              avg_stars: (s?.avg_stars ?? s?.avgStars ?? null) as number | null,
              risk_level: (s?.risk_level ?? s?.riskLevel ?? s?.risk ?? "NO_CONCLUYENTE") as RiskLevel,
              time_window: "MINE",
              top_typologies: Array.isArray(s?.top_typologies)
                ? s.top_typologies
                : Array.isArray(s?.topTypologies)
                ? s.topTypologies
                : [],
              economic_gross_label: s?.economic_gross_label ?? s?.economicGrossLabel ?? null,
              economic_net_label: s?.economic_net_label ?? s?.economicNetLabel ?? null,
              economic_time_window: "MINE",
              last_seen_label: s?.last_seen_label ?? s?.lastSeenLabel ?? null,
            }
          : null;

        setMySignals(normalizedSignals);

        // ✅ rows
        const rows = Array.isArray((res as any)?.rows) ? (res as any).rows : [];

        // ✅ normaliza sin matar el render
        const data: Rating[] = rows
          .map((x: any) => safeNormalizeRating(x))
          .filter(Boolean) as Rating[];

        const sorted = [...data].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        setMyResults(sorted);

        // DEBUG: signals>0 pero lista vacía => normalize/shape
        if ((normalizedSignals?.count_exact ?? 0) > 0 && sorted.length === 0) {
          console.warn("MINE: signals>0 pero myResults=0. Revisa normalizeRating/shape.", {
            signals: normalizedSignals,
            firstRow: rows[0],
          });
        }

        return;
      }

      // GLOBAL (RGPD-safe) -> ya viene en snake_case desde clientService.ts
      const res = await checkSignalsGlobal(q, GLOBAL_WINDOW_MONTHS);

      // tolerancia legacy por si quedó algo viejo en runtime
      const normalized: GlobalSignalsExt = {
        ...(res as any),
        // si vinieran camelCase, los rellenamos
        match_strength: (res as any)?.match_strength ?? (res as any)?.matchStrength ?? "MEDIUM",
        has_matches: Boolean((res as any)?.has_matches ?? (res as any)?.hasMatches ?? false),
        count_exact: Number((res as any)?.count_exact ?? (res as any)?.countExact ?? 0),
        count_bucket: ((res as any)?.count_bucket ?? (res as any)?.countBucket ?? "0") as CountBucket,
        avg_stars: ((res as any)?.avg_stars ?? (res as any)?.avgStars ?? null) as number | null,
        risk_level: ((res as any)?.risk_level ?? (res as any)?.riskLevel ?? (res as any)?.risk ?? "NO_CONCLUYENTE") as RiskLevel,
        top_typologies: Array.isArray((res as any)?.top_typologies)
          ? (res as any).top_typologies
          : Array.isArray((res as any)?.topTypologies)
          ? (res as any).topTypologies
          : [],
        time_window: String((res as any)?.time_window ?? (res as any)?.timeWindow ?? `${GLOBAL_WINDOW_MONTHS}M`),
        message: String((res as any)?.message ?? ""),
      };

      setGlobalSignals(normalized);
    } catch (error) {
      console.error(error);

      if (mode === "GLOBAL") {
        setGlobalSignals({
          match_strength: "MEDIUM",
          has_matches: false,
          count_exact: 0,
          count_bucket: "0",
          avg_stars: null,
          risk_level: "NO_CONCLUYENTE",
          time_window: `${GLOBAL_WINDOW_MONTHS}M`,
          message: "No se ha podido completar la comprobación. Inténtalo de nuevo.",
          top_typologies: [],
          structured_summary: null,
          economic_time_window: null,
          economic_gross_bucket: null,
          economic_gross_label: null,
          economic_net_bucket: null,
          economic_net_label: null,
          sources_label: null,
          last_seen_bucket: null,
          documents_bucket: null,
          hotel_category: null,
          stars_multiplier: null,
        } as any);
      } else {
        setMyResults([]);
        setMySignals(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const getMaskedAuthor = (_authorName: string, _authorId: string) => "Establecimiento";

  /** KPI MINE: si no hay lista, no inventamos avg; usamos signals para count */
  const myKpi = useMemo(() => {
    if (!myResults.length) return null;
    const avg = myResults.reduce((acc, r) => acc + (r.value || 0), 0) / myResults.length;
    const last = myResults[0];
    const score = avg >= 4 ? "Bajo riesgo" : avg >= 3 ? "Riesgo medio" : "Riesgo alto";
    return { avg, count: myResults.length, lastDate: last.createdAt, score };
  }, [myResults]);

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
      ? "Introduce un identificador de la solicitud (email/teléfono/documento). El resultado muestra señales agregadas y no identificables."
      : "Revisa y gestiona únicamente los registros propios del establecimiento.";

  const globalRanges = useMemo(() => getEconomicRangesForGlobal(globalSignals), [globalSignals]);
  const mineRanges = useMemo(() => getEconomicRangesForMineSignals(mySignals), [mySignals]);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-1">{headerTitle}</h2>
        <p className="text-sm text-slate-600">{headerSubtitle}</p>
      </div>

      {/* CARD SEARCH */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => {
              setMode("GLOBAL");
              setSearched(false);
              setGlobalSignals(null);
              setMyResults([]);
              setMySignals(null);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              mode === "GLOBAL"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
            }`}
          >
            <Shield className="inline-block w-3.5 h-3.5 mr-1 -mt-0.5" />
            Comprobación (Global)
          </button>

          <button
            type="button"
            onClick={() => {
              setMode("MINE");
              setSearched(false);
              setGlobalSignals(null);
              setMyResults([]);
              setMySignals(null);
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
              mode === "MINE"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
            }`}
          >
            <FileText className="inline-block w-3.5 h-3.5 mr-1 -mt-0.5" />
            Mis registros
          </button>
        </div>

        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-400" />
            </div>

            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-2xl focus:ring-indigo-500 focus:border-indigo-500"
              placeholder={mode === "GLOBAL" ? "Email, teléfono o documento…" : "Documento, email o teléfono…"}
              autoComplete="off"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-6 py-3 rounded-2xl bg-slate-900 text-white font-semibold hover:bg-black disabled:opacity-50 transition-colors"
          >
            {loading ? "Buscando…" : mode === "GLOBAL" ? "Comprobar" : "Consultar"}
          </button>
        </form>

        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-600">
          {mode === "GLOBAL" ? (
            <LockKeyhole className="w-4 h-4 text-slate-500 mt-0.5" />
          ) : (
            <Fingerprint className="w-4 h-4 text-slate-500 mt-0.5" />
          )}
          <div>
            <div className="font-semibold text-slate-800">
              {mode === "GLOBAL" ? "Privacidad reforzada (Global)" : "Privacidad por defecto"}
            </div>
            <div>
              {mode === "GLOBAL" ? (
                <>
                  Debacu no devuelve datos personales ni confirma identidades. Se muestran únicamente señales agregadas y
                  no identificables.
                </>
              ) : (
                <>
                  Email/teléfono/documento se muestran enmascarados. El detalle completo debe resolverse por política
                  (RLS/auditoría).
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* IZQ */}
        <section className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 h-full">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-indigo-500" />
                <div>
                  <h4 className="text-sm font-semibold text-slate-900">Plataformas</h4>
                  <p
                    className="text-[11px] text-slate-500"
                    title="Porcentajes calculados sobre el total de registros agregados del periodo (sin mostrar totales). 'Otros' agrupa el resto de plataformas de baja frecuencia."
                  >
                    Distribución (%) · top + Otros
                  </p>
                </div>
              </div>
            </div>

            {platformPctList.length === 0 ? (
              <p className="text-xs text-slate-400">Sin datos.</p>
            ) : (
              <>
                <div className="flex items-center justify-center my-3">
                  <div
                    className="relative w-28 h-28 rounded-full"
                    style={{ background: platformDonutGradient || "rgba(148,163,184,0.15)" }}
                    title="Gráfico de anillo: cada segmento representa el % por plataforma. 'Otros' agrupa el resto."
                  >
                    <div className="absolute inset-3 rounded-full bg-white border border-slate-200" />
                  </div>
                </div>

                <div className="space-y-2">
                  {platformPctList.map((row) => (
                    <div key={row.key} className="flex items-center justify-between text-xs">
                      <span className="text-slate-700 truncate pr-2">{row.key}</span>
                      <span className="text-slate-600 font-semibold">{row.pct.toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* CENTRO */}
        <section className="lg:col-span-2">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 flex flex-col max-h-[680px]">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Resultados</h3>

              {!searched ? (
                <div className="text-sm text-slate-500">Introduce un criterio arriba.</div>
              ) : mode === "MINE" ? (
                mySignals ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full border px-3 py-1 text-slate-700 bg-white">
                      {mySignals.count_exact} registros
                    </span>
                    <span className={`rounded-full px-3 py-1 font-semibold ${riskBadgeClasses(mySignals.risk_level)}`}>
                      {mySignals.risk_level} · {mySignals.avg_stars ?? "—"}
                    </span>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">Sin registros.</div>
                )
              ) : globalSignals ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-full border px-3 py-1 text-slate-700 bg-white">
                    Coincidencias: {(globalSignals as any).has_matches ? "Sí" : "No"}
                  </span>
                  <span className={`rounded-full px-3 py-1 font-semibold ${riskBadgeClasses((globalSignals as any).risk_level)}`}>
                    {(globalSignals as any).risk_level ?? "NO_CONCLUYENTE"}
                  </span>
                </div>
              ) : (
                <div className="text-sm text-slate-500">Sin información.</div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4">
              {/* =========================
                  MODO: MINE
                 ========================= */}
              {mode === "MINE" && searched && (
                <>
                  {(() => {
                    const mineCount = Number(mySignals?.count_exact ?? myResults.length ?? 0);
                    const showMineEconomics = mineCount > 0;

                    return (
                      <>
                        {showMineEconomics ? (
                          <>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                              <div className="flex items-center gap-2 mb-2">
                                <ShieldCheck className="w-4 h-4 text-slate-600" />
                                <h4 className="font-bold text-sm text-slate-900">
                                  Estimación basada en tus registros
                                </h4>
                              </div>

                              <div className="rounded-2xl bg-white border border-slate-200 p-4">
                                <div className="text-xs text-slate-700 font-semibold mb-2">
                                  Impacto económico estimado en tus registros:{" "}
                                  <span className="font-bold">{formatMoneyRangeEUR(mineRanges.impact)}</span>
                                </div>
                                <div className="text-xs text-slate-700 font-semibold mb-2">
                                  Pérdida neta estimada:{" "}
                                  <span className="font-bold">{formatMoneyRangeEUR(mineRanges.loss)}</span>
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  Estimación basada únicamente en registros propios del establecimiento.
                                </div>
                              </div>

                              <div className="mt-3 text-[11px] text-slate-500">
                                Los datos personales se muestran enmascarados.
                              </div>
                            </div>

                            {/* LISTA */}
                            {myResults.map((rating) => {
                              const cc = parseControlledComment(rating.comment);
                              const reasons = (cc["reasons"] || "")
                                .split(",")
                                .map((x) => x.trim())
                                .filter(Boolean);
                              const severity = cc["severity"] || "";
                              const evidence = cc["evidence"] || "";
                              const notes = cc["notes"] || "";
                              const hasControlled = !!cc["reasons"] || !!cc["severity"] || !!cc["evidence"];

                              const ss: StructuredSummaryUI | null = (rating as any)?.structured_summary ?? null;
                              const ssHasAny =
                                !!ss?.dominantSignal ||
                                !!ss?.pattern ||
                                !!ss?.timeWindow ||
                                !!ss?.lastSeenLabel ||
                                typeof ss?.hasEvidence === "boolean";

                              return (
                                <div
                                  key={rating.id}
                                  className="rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:border-slate-300 transition-colors"
                                >
                                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                    <div className="flex-1">
                                      <div className="flex flex-wrap items-center gap-2 mb-2">
                                        <h4 className="font-bold text-base text-slate-900 uppercase">
                                          {displayClientLabel(rating.clientData.fullName)}
                                        </h4>

                                        {rating.clientData.document ? (
                                          <span className="px-2 py-0.5 bg-white text-slate-600 text-xs rounded-full border border-slate-200">
                                            {maskDoc(rating.clientData.document)}
                                          </span>
                                        ) : null}

                                        {rating.platform ? (
                                          <span className="px-2 py-0.5 bg-white text-slate-600 text-xs rounded-full border border-slate-200">
                                            {rating.platform}
                                          </span>
                                        ) : null}
                                      </div>

                                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mb-3">
                                        {rating.clientData.email ? <span>{maskEmail(rating.clientData.email)}</span> : null}
                                        {rating.clientData.phone ? <span>{maskPhone(rating.clientData.phone)}</span> : null}
                                        {rating.clientData.nationality ? <span>{rating.clientData.nationality}</span> : null}
                                      </div>

                                      {hasControlled ? (
                                        <div className="rounded-2xl bg-white border border-slate-200 p-3">
                                          <div className="flex items-center gap-2 mb-2">
                                            <ShieldCheck className="w-4 h-4 text-slate-500" />
                                            <div className="text-xs font-semibold text-slate-700">
                                              Resumen estructurado
                                            </div>
                                          </div>

                                          <div className="flex flex-wrap gap-2">
                                            {reasons.slice(0, 6).map((r) => (
                                              <span
                                                key={r}
                                                className="text-xs rounded-full border bg-slate-50 px-3 py-1 text-slate-700"
                                              >
                                                {r}
                                              </span>
                                            ))}
                                            {reasons.length > 6 ? (
                                              <span className="text-xs rounded-full border bg-slate-50 px-3 py-1 text-slate-500">
                                                +{reasons.length - 6}
                                              </span>
                                            ) : null}
                                          </div>

                                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                                            {severity ? (
                                              <span className="rounded-full border px-3 py-1 bg-white text-slate-700">
                                                Severidad: <span className="font-semibold">{severity}</span>
                                              </span>
                                            ) : null}
                                            {evidence ? (
                                              <span className="rounded-full border px-3 py-1 bg-white text-slate-700">
                                                Evidencia: <span className="font-semibold">{evidence}</span>
                                              </span>
                                            ) : null}
                                          </div>

                                          {notes ? (
                                            <div className="mt-3 text-xs text-slate-600">
                                              <span className="font-semibold text-slate-700">Observación:</span> {notes}
                                            </div>
                                          ) : null}

                                          {ssHasAny ? (
                                            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                              <div className="text-[11px] text-slate-600 space-y-1">
                                                {ss?.dominantSignal ? (
                                                  <div>
                                                    Señal dominante:{" "}
                                                    <span className="font-semibold text-slate-800">
                                                      {labelDominantSignal(ss.dominantSignal)}
                                                    </span>
                                                  </div>
                                                ) : null}

                                                {ss?.pattern ? (
                                                  <div>
                                                    Patrón:{" "}
                                                    <span className="font-semibold text-slate-800">
                                                      {labelPattern(ss.pattern)}
                                                    </span>
                                                  </div>
                                                ) : null}

                                                {ss?.timeWindow || ss?.lastSeenLabel ? (
                                                  <div>
                                                    Ventana:{" "}
                                                    <span className="font-semibold text-slate-800">
                                                      {ss?.timeWindow ?? "-"}
                                                    </span>
                                                    {" · "}
                                                    Última:{" "}
                                                    <span className="font-semibold text-slate-800">
                                                      {ss?.lastSeenLabel ?? "-"}
                                                    </span>
                                                  </div>
                                                ) : null}

                                                {typeof ss?.hasEvidence === "boolean" ? (
                                                  <div>
                                                    Evidencia (Edge):{" "}
                                                    <span className="font-semibold text-slate-800">
                                                      {ss.hasEvidence ? "Sí" : "No"}
                                                    </span>
                                                  </div>
                                                ) : null}
                                              </div>
                                            </div>
                                          ) : null}
                                        </div>
                                      ) : (
                                        <div className="rounded-2xl bg-white border border-amber-200 p-3 text-xs text-amber-900">
                                          Comentario antiguo sin estructura. Recomienda migrar a registro guiado.
                                        </div>
                                      )}

                                      <div className="mt-3 flex items-center gap-6 text-xs text-slate-500">
                                        <div className="flex items-center gap-1">
                                          <span>Por: {getMaskedAuthor(rating.authorName, rating.authorId)}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <Calendar className="w-3 h-3" />
                                          <span>{new Date(rating.createdAt).toLocaleDateString()}</span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex flex-col items-end min-w-[130px]">
                                      <div className="mb-2">
                                        <StarRating rating={rating.value} size="lg" />
                                      </div>
                                      <span
                                        className={`text-xs font-semibold px-3 py-1 rounded-full ${
                                          rating.value >= 4
                                            ? "bg-green-100 text-green-700"
                                            : rating.value >= 3
                                            ? "bg-amber-100 text-amber-800"
                                            : "bg-red-100 text-red-700"
                                        }`}
                                      >
                                        {rating.value >= 4
                                          ? "Bajo riesgo"
                                          : rating.value >= 3
                                          ? "Riesgo medio"
                                          : "Riesgo alto"}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </>
                        ) : (
                          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 text-center mt-2">
                            <ShieldAlert className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                            <h4 className="text-blue-900 font-semibold">Sin registros propios</h4>
                            <p className="text-blue-700 text-sm mt-1">
                              No hay registros creados por tu establecimiento para este criterio.
                            </p>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </>
              )}

              {/* =========================
                  MODO: GLOBAL
                 ========================= */}
              {mode === "GLOBAL" && searched && (
                <>
                  {(() => {
                    if (!globalSignals) {
                      return (
                        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 text-center mt-2">
                          <ShieldAlert className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                          <h4 className="text-blue-900 font-semibold">Sin resultado</h4>
                          <p className="text-blue-700 text-sm mt-1">
                            No hay señales para este criterio o no es concluyente.
                          </p>
                        </div>
                      );
                    }

                    const hasMatches = Boolean((globalSignals as any).has_matches);
                    const bucketNotZero = ((globalSignals as any).count_bucket ?? "0") !== "0";

                    const grossLabel = (globalSignals as any).economic_gross_label ?? null;
                    const netLabel = (globalSignals as any).economic_net_label ?? null;

                    const impactRange = globalRanges.impact;
                    const lossRange = globalRanges.loss;

                    const hasEconomicRanges = !!impactRange || !!lossRange;
                    const labelNotZero =
                      (grossLabel && String(grossLabel).trim() !== "0 €") ||
                      (netLabel && String(netLabel).trim() !== "0 €");

                    const showGlobalEconomics = hasMatches && bucketNotZero && labelNotZero && hasEconomicRanges;

                    const risk = ((globalSignals as any).risk_level ?? "NO_CONCLUYENTE") as RiskLevel;
                    const avgStars = (globalSignals as any).avg_stars as number | null;
                    const matchStrength = ((globalSignals as any).match_strength ?? "MEDIUM") as MatchStrength;
                    const countBucket = ((globalSignals as any).count_bucket ?? "0") as CountBucket;
                    const msg = String((globalSignals as any).message ?? "");

                    return (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Shield className="w-4 h-4 text-slate-600" />
                              <h4 className="font-bold text-sm text-slate-900">
                                Señales agregadas (no identificables)
                              </h4>
                            </div>

                            {showGlobalEconomics ? (
                              <div className="rounded-2xl bg-white border border-slate-200 p-4 mb-3">
                                <div className="text-xs text-slate-700 font-semibold mb-2">
                                  Impacto económico estimado (agregado):{" "}
                                  <span className="font-bold">{formatMoneyRangeEUR(globalRanges.impact)}</span>
                                </div>
                                <div className="text-xs text-slate-700 font-semibold mb-2">
                                  Pérdida neta estimada:{" "}
                                  <span className="font-bold">{formatMoneyRangeEUR(globalRanges.loss)}</span>
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  Estimación basada en señales agregadas de múltiples fuentes, ajustadas por categoría
                                  del establecimiento. Resultado no identificable, uso exclusivamente operativo.
                                </div>
                              </div>
                            ) : (
                              <div className="rounded-2xl bg-white border border-slate-200 p-4 mb-3">
                                <div className="text-xs text-slate-700 font-semibold">
                                  Sin base económica suficiente para estimar impacto.
                                </div>
                                <div className="text-[11px] text-slate-500 mt-1">
                                  Hay señales agregadas, pero no hay datos cuantificables para mostrar un rango económico fiable.
                                </div>
                              </div>
                            )}

                            <div className="text-xs text-slate-600 mb-3">
                              {msg.trim()
                                ? msg
                                : "El resultado no confirma identidades ni muestra datos personales. Está asociado a la solicitud consultada."}
                            </div>

                            <div className="flex flex-wrap gap-2 text-xs">
                              <span className="rounded-full border bg-white px-3 py-1 text-slate-700">
                                Coincidencias:{" "}
                                <span className="font-semibold">{hasMatches ? "Sí" : "No"}</span>
                              </span>

                              <span className="rounded-full border bg-white px-3 py-1 text-slate-700">
                                Nº registros:{" "}
                                <span className="font-semibold">{bucketLabel(countBucket)}</span>
                              </span>

                              <span className={`rounded-full px-3 py-1 font-semibold ${riskBadgeClasses(risk)}`}>
                                {risk ?? "NO_CONCLUYENTE"}
                              </span>
                            </div>

                            <div className="mt-4 rounded-2xl bg-white border border-slate-200 p-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                  <div className="text-xs font-semibold text-slate-700 mb-1">
                                    Valoración media agregada
                                  </div>
                                  {safeStars(avgStars) !== null ? (
                                    <StarRating rating={safeStars(avgStars) as number} size="lg" />
                                  ) : (
                                    <div className="text-xs text-slate-500">Información no disponible</div>
                                  )}
                                </div>

                                <div className="text-xs text-slate-500">
                                  Coincidencia técnica:{" "}
                                  <span className="font-semibold text-slate-700">
                                    {matchStrength === "STRONG"
                                      ? "Fuerte"
                                      : matchStrength === "MEDIUM"
                                      ? "Media"
                                      : "Débil"}
                                  </span>
                                </div>
                              </div>

                              <div className="mt-3">
                                <div className="text-xs font-semibold text-slate-700 mb-2">Tipologías agregadas</div>
                                <div className="flex flex-wrap gap-2">
                                  {((globalSignals as any).top_typologies ?? []).length ? (
                                    ((globalSignals as any).top_typologies ?? []).slice(0, 10).map((t: string) => (
                                      <span
                                        key={t}
                                        className="text-xs rounded-full border bg-slate-50 px-3 py-1 text-slate-700"
                                      >
                                        {t}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-xs text-slate-500">Sin tipologías destacadas.</span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 text-[11px] text-slate-500">
                              Estimación orientada a decisión operativa. No identifica ni confirma identidades.
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </>
              )}
            </div>
          </div>
        </section>

        {/* DER */}
        <section className="lg:col-span-1">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 h-full">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <h5 className="text-xs font-semibold text-slate-500 uppercase">Países</h5>
                <div
                  className="text-[11px] text-slate-500"
                  title="Barras horizontales: top 5 países por % de registros agregados del periodo. 'Resto' agrupa países de baja frecuencia."
                >
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
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                      <div
                        className="h-full bg-slate-900/70 rounded-full"
                        style={{ width: `${Math.max(0, Math.min(100, row.pct))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* INDICADOR DE RIESGO */}
            <div className="mt-6 border-t border-slate-100 pt-4">
              <div
                className="text-xs font-semibold text-slate-700 uppercase"
                title="Distribución agregada por estrellas sobre el total histórico. Bajo = 4–5★, Medio = 3★, Alto = 1–2★."
              >
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
                  <div className="grid grid-cols-3 gap-2 text-[11px] mb-3">
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

                      <div className="flex-1 h-2 rounded-full bg-white border border-slate-200 overflow-hidden">
                        <div
                          className="h-full bg-slate-900/70 rounded-full"
                          style={{ width: `${Math.max(0, Math.min(100, row.pct))}%` }}
                        />
                      </div>

                      <div className="w-[52px] text-right text-[11px] text-slate-600">{row.pct.toFixed(1)}%</div>
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
