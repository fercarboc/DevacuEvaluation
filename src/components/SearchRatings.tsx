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
  User as UserIcon,
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
 * - searchMyRatingsInSupabase(query, authorId) debe filtrar por authorId en BD (no filtrar en cliente).
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
  const dMask = dParts.length ? `${dParts[0][0] || "*"}***.${dParts.slice(1).join(".") || "com"}` : "***";
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

/** -------------------------------
 * % list (sin mostrar totales)
 * -------------------------------- */
function calcPercentList(map: Record<string, number>) {
  const entries = Object.entries(map)
    .map(([k, v]) => ({ key: k, count: Number(v || 0) }))
    .filter((x) => x.count > 0);

  const total = entries.reduce((acc, x) => acc + x.count, 0);
  if (!total) return [];

  return entries
    .map((x) => ({ key: x.key, pct: (x.count / total) * 100 }))
    .sort((a, b) => b.pct - a.pct);
}

function groupTopAndRest(
  list: Array<{ key: string; pct: number }>,
  topN: number,
  restLabel: string
) {
  const top = list.slice(0, topN);
  const rest = list.slice(topN);
  const restPct = rest.reduce((acc, x) => acc + x.pct, 0);

  const out =
    restPct >= 0.5 ? [...top, { key: restLabel, pct: restPct }] : top;

  // Ajuste para que sume 100.0 (por decimales)
  const sum = out.reduce((acc, x) => acc + x.pct, 0);
  const diff = 100 - sum;
  if (out.length && Math.abs(diff) >= 0.05) {
    out[0] = { ...out[0], pct: out[0].pct + diff };
  }
  return out;
}

function parseControlledComment(comment?: string | null) {
  // Formato: reasons=... | severity=... | evidence=... | notes=...
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
 * Normalizadores (defensivos)
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
    "";
  const authorName =
    raw?.authorName ??
    raw?.author_name ??
    raw?.creatorCustomerName ??
    raw?.creator_customer_name ??
    "";

  const platform = raw?.platform ?? null;
  const comment = raw?.comment ?? raw?.comments ?? raw?.notes ?? null;

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
  } as Rating;
}

function normalizeSummary(raw: any): {
  totalCount: number;
  platformCounts: Record<string, number>;
  countryCounts: Record<string, number>;
} {
  const totalCount = Number(raw?.totalCount ?? raw?.total_count ?? raw?.total ?? 0);
  const platformCounts =
    raw?.platformCounts ??
    raw?.platform_counts ??
    raw?.platformSummary ??
    raw?.platform_summary ??
    {};
  const countryCounts =
    raw?.countryCounts ??
    raw?.country_counts ??
    raw?.countrySummary ??
    raw?.country_summary ??
    {};

  const safeObj = (o: any) => (o && typeof o === "object" ? o : {});
  return {
    totalCount,
    platformCounts: safeObj(platformCounts),
    countryCounts: safeObj(countryCounts),
  };
}

/** -------------------------------
 * UI helpers
 * -------------------------------- */
function riskBadgeClasses(risk: RiskLevel | undefined) {
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
  // Colores neutros (no fijamos una paleta muy viva)
  const palette = [
    "rgba(15, 23, 42, 0.80)",  // slate-900
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

  // Si por decimales no llega a 100, rellena con gris muy suave
  if (acc < 100) {
    stops.push(`rgba(148, 163, 184, 0.15) ${acc}% 100%`); // slate-400 suave
  }

  return `conic-gradient(${stops.join(", ")})`;
}

export const SearchRatings: React.FC<SearchRatingsProps> = ({ currentUser }) => {
  const [mode, setMode] = useState<"GLOBAL" | "MINE">("GLOBAL");
  const [query, setQuery] = useState("");

  // MODO MINE (detalle)
  const [myResults, setMyResults] = useState<Rating[]>([]);

  // MODO GLOBAL (agregado)
  const [globalSignals, setGlobalSignals] = useState<GlobalSignals | null>(null);

  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Resumen global (no mostramos el total en UI)
  const [platformSummary, setPlatformSummary] = useState<Record<string, number>>({});
  const [countrySummary, setCountrySummary] = useState<Record<string, number>>({});

  // ✅ Indicador riesgo (distribución por estrellas, vía Edge)
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskError, setRiskError] = useState<string>("");
  const [riskSnap, setRiskSnap] = useState<GlobalRiskSnapshot | null>(null);
  const [riskWindow, setRiskWindow] = useState<3 | 6 | 12>(6);

  // 🔑 En vuestro modelo nuevo: authorId debe ser el customer/org id (no el auth.user.id).
  // Si tu User ya trae orgId/customerId, úsalo aquí.
  const authorIdForMine = ((currentUser as any)?.org_id || (currentUser as any)?.customer_id || currentUser.id) as string;

  useEffect(() => {
    const load = async () => {
      try {
        const rawSummary = await getGlobalSummary();
        const summary = normalizeSummary(rawSummary);
        setPlatformSummary(summary.platformCounts);
        setCountrySummary(summary.countryCounts);
      } catch (e) {
        console.error("Error cargando resumen global:", e);
        setPlatformSummary({});
        setCountrySummary({});
      }
    };
    void load();
  }, []);

  // ✅ Carga distribución riesgo desde BD (3/6/12 meses)
  useEffect(() => {
    let alive = true;

    const loadRisk = async () => {
      setRiskLoading(true);
      setRiskError("");
      try {
        const r = await getGlobalRiskSnapshot({ months: riskWindow });
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
  }, [riskWindow]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setSearched(true);

    // Reset
    setMyResults([]);
    setGlobalSignals(null);

    try {
      if (mode === "MINE") {
        const raw = await searchMyRatingsInSupabase(q, authorIdForMine);
        const data: Rating[] = Array.isArray(raw) ? raw.map(normalizeRating) : [];
        const sorted = [...data].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setMyResults(sorted);
        return;
      }

      // GLOBAL (RGPD-safe)
      const s = await checkSignalsGlobal(q, 24);

      const normalized: GlobalSignals = {
        matchStrength: (s?.matchStrength ?? "MEDIUM") as MatchStrength,
        hasMatches: Boolean(s?.hasMatches),
        countExact: typeof (s as any)?.countExact === "number" ? (s as any).countExact : undefined,
        countBucket: (s?.countBucket ?? "0") as CountBucket,
        avgStars: typeof s?.avgStars === "number" ? s.avgStars : null,
        risk: (s?.risk ?? "NO_CONCLUYENTE") as RiskLevel,
        topTypologies: Array.isArray(s?.topTypologies) ? s.topTypologies.slice(0, 6) : [],
        timeWindow: s?.timeWindow ?? "24M",
        message: s?.message ?? "",
      };

      setGlobalSignals(normalized);
    } catch (error) {
      console.error(error);
      if (mode === "GLOBAL") {
        setGlobalSignals({
          matchStrength: "MEDIUM",
          hasMatches: false,
          countExact: 0,
          countBucket: "0",
          avgStars: null,
          risk: "NO_CONCLUYENTE",
          timeWindow: "24M",
          message: "No se ha podido completar la comprobación. Inténtalo de nuevo.",
          topTypologies: [],
        });
      } else {
        setMyResults([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const getMaskedAuthor = (authorName: string, authorId: string) => {
    if (authorId === authorIdForMine) return `${authorName} (Tú)`;
    const parts = (authorName || "").split(" ").filter(Boolean);
    return parts.map((p) => (p ? p[0] + "*".repeat(Math.max(p.length - 1, 0)) : "")).join(" ");
  };

  // KPI “Mis registros”
  const myKpi = useMemo(() => {
    if (!myResults.length) return null;
    const avg = myResults.reduce((acc, r) => acc + (r.value || 0), 0) / myResults.length;
    const last = myResults[0];
    const score = avg >= 4 ? "Bajo riesgo" : avg >= 3 ? "Riesgo medio" : "Riesgo alto";
    return { avg, count: myResults.length, lastDate: last.createdAt, score };
  }, [myResults]);

  /** -------------------------------
   * Plataformas (donut + lista top + otros)
   * -------------------------------- */
  const platformPctList = useMemo(() => {
    const list = calcPercentList(platformSummary);
    return groupTopAndRest(list, 6, "Otros");
  }, [platformSummary]);

  const platformDonutGradient = useMemo(() => {
    const items = platformPctList.map((x) => ({ label: x.key, pct: x.pct }));
    return items.length ? buildConicGradient(items) : "";
  }, [platformPctList]);

  /** -------------------------------
   * Países (barras top 10 + resto)
   * -------------------------------- */
  const countryPctList = useMemo(() => {
    const list = calcPercentList(countrySummary);
    return groupTopAndRest(list, 10, "Resto");
  }, [countrySummary]);

  // Header dinámico
  const headerTitle = mode === "GLOBAL" ? "Comprobación asociada a solicitud" : "Mis registros";
  const headerSubtitle =
    mode === "GLOBAL"
      ? "Introduce un identificador de la solicitud (email/teléfono/documento). El resultado muestra señales agregadas y no identificables."
      : "Revisa y gestiona únicamente los registros creados por tu establecimiento.";

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
              placeholder={mode === "GLOBAL" ? "Email, teléfono o documento…" : "Documento, email, teléfono o nombre…"}
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
                <>Debacu no devuelve datos personales ni confirma identidades. Se muestran únicamente señales agregadas y no identificables.</>
              ) : (
                <>Email/teléfono/documento se muestran enmascarados. El detalle completo debe resolverse por política (RLS/auditoría).</>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* IZQ (Plataformas visual) */}
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
                    {/* agujero */}
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

                <div className="mt-3 text-[11px] text-slate-400">
                  * Cada registro cuenta como una fila (puede repetirse una persona en días/hoteles distintos).
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
                myKpi ? (
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full border px-3 py-1 text-slate-700 bg-white">{myKpi.count} registros</span>
                    <span
                      className={`rounded-full px-3 py-1 font-semibold ${
                        myKpi.avg >= 4
                          ? "bg-green-100 text-green-700"
                          : myKpi.avg >= 3
                          ? "bg-amber-100 text-amber-800"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {myKpi.score} · {myKpi.avg.toFixed(1)}
                    </span>
                  </div>
                ) : (
                  <div className="text-sm text-slate-500">Sin registros.</div>
                )
              ) : globalSignals ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-full border px-3 py-1 text-slate-700 bg-white">
                    Coincidencias: {globalSignals.hasMatches ? "Sí" : "No"}
                  </span>
                  <span className={`rounded-full px-3 py-1 font-semibold ${riskBadgeClasses(globalSignals.risk)}`}>
                    {globalSignals.risk ?? "NO CONCLUYENTE"}
                  </span>
                </div>
              ) : (
                <div className="text-sm text-slate-500">Sin información.</div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4">
              {/* MODO GLOBAL */}
              {mode === "GLOBAL" && searched && (
                <>
                  {globalSignals ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Shield className="w-4 h-4 text-slate-600" />
                            <h4 className="font-bold text-sm text-slate-900">Señales agregadas (no identificables)</h4>
                          </div>

                          <div className="text-xs text-slate-600 mb-3">
                            {globalSignals.message?.trim()
                              ? globalSignals.message
                              : "El resultado no confirma identidades ni muestra datos personales. Está asociado a la solicitud consultada."}
                          </div>

                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full border bg-white px-3 py-1 text-slate-700">
                              Coincidencias: <span className="font-semibold">{globalSignals.hasMatches ? "Sí" : "No"}</span>
                            </span>

                            <span className="rounded-full border bg-white px-3 py-1 text-slate-700">
                              Nº registros: <span className="font-semibold">{bucketLabel(globalSignals.countBucket)}</span>
                            </span>

                            <span className={`rounded-full px-3 py-1 font-semibold ${riskBadgeClasses(globalSignals.risk)}`}>
                              {globalSignals.risk ?? "NO CONCLUYENTE"}
                            </span>

                            {globalSignals.timeWindow ? (
                              <span className="rounded-full border bg-white px-3 py-1 text-slate-700">
                                Ventana:{" "}
                                <span className="font-semibold">{String(globalSignals.timeWindow).replace("M", " meses")}</span>
                              </span>
                            ) : null}
                          </div>

                          {/* Valoración agregada */}
                          <div className="mt-4 rounded-2xl bg-white border border-slate-200 p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div>
                                <div className="text-xs font-semibold text-slate-700 mb-1">Valoración media agregada</div>
                                {safeStars(globalSignals.avgStars ?? null) !== null ? (
                                  <StarRating rating={safeStars(globalSignals.avgStars ?? null) as number} size="lg" />
                                ) : (
                                  <div className="text-xs text-slate-500">Información no disponible</div>
                                )}
                              </div>

                              <div className="text-xs text-slate-500">
                                Coincidencia técnica:{" "}
                                <span className="font-semibold text-slate-700">
                                  {globalSignals.matchStrength === "STRONG"
                                    ? "Fuerte"
                                    : globalSignals.matchStrength === "MEDIUM"
                                    ? "Media"
                                    : "Débil"}
                                </span>
                              </div>
                            </div>

                            <div className="mt-3">
                              <div className="text-xs font-semibold text-slate-700 mb-2">Tipologías agregadas</div>
                              <div className="flex flex-wrap gap-2">
                                {(globalSignals.topTypologies ?? []).length ? (
                                  (globalSignals.topTypologies ?? []).map((t) => (
                                    <span key={t} className="text-xs rounded-full border bg-slate-50 px-3 py-1 text-slate-700">
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
                            Debacu no confirma identidades ni revela fuentes. Este resultado está diseñado para apoyo operativo cumpliendo RGPD/LOPDGDD.
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 text-center mt-2">
                      <ShieldAlert className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                      <h4 className="text-blue-900 font-semibold">Sin resultado</h4>
                      <p className="text-blue-700 text-sm mt-1">No hay señales para este criterio o no es concluyente.</p>
                    </div>
                  )}
                </>
              )}

              {/* MODO MINE */}
              {mode === "MINE" &&
                searched &&
                myResults.map((rating) => {
                  const cc = parseControlledComment(rating.comment);
                  const reasons = (cc["reasons"] || "").split(",").map((x) => x.trim()).filter(Boolean);
                  const severity = cc["severity"] || "";
                  const evidence = cc["evidence"] || "";
                  const notes = cc["notes"] || "";
                  const hasControlled = !!cc["reasons"] || !!cc["severity"] || !!cc["evidence"];

                  return (
                    <div
                      key={rating.id}
                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h4 className="font-bold text-base text-slate-900 uppercase">{rating.clientData.fullName}</h4>

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
                                <div className="text-xs font-semibold text-slate-700">Resumen estructurado</div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                {reasons.slice(0, 6).map((r) => (
                                  <span key={r} className="text-xs rounded-full border bg-slate-50 px-3 py-1 text-slate-700">
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
                            </div>
                          ) : (
                            <div className="rounded-2xl bg-white border border-amber-200 p-3 text-xs text-amber-900">
                              Comentario antiguo sin estructura. Recomienda migrar a registro guiado.
                            </div>
                          )}

                          <div className="mt-3 flex items-center gap-6 text-xs text-slate-500">
                            <div className="flex items-center gap-1">
                              <UserIcon className="w-3 h-3" />
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
                            {rating.value >= 4 ? "Bajo riesgo" : rating.value >= 3 ? "Riesgo medio" : "Riesgo alto"}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}

              {mode === "MINE" && searched && myResults.length === 0 && !loading && (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 text-center mt-2">
                  <ShieldAlert className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                  <h4 className="text-blue-900 font-semibold">Sin registros propios</h4>
                  <p className="text-blue-700 text-sm mt-1">No hay registros creados por tu establecimiento para este criterio.</p>
                </div>
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
                  title="Barras horizontales: top 10 países por % de registros agregados del periodo. 'Resto' agrupa los países de baja frecuencia. No se muestran totales."
                >
                  Top 10 + Resto (en %)
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

            {/* ✅ INDICADOR DE RIESGO (solo porcentajes) */}
            <div className="mt-6 border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between gap-2">
                <div
                  className="text-xs font-semibold text-slate-700 uppercase"
                  title="Distribución agregada por estrellas del periodo seleccionado. Bajo = 4–5★, Medio = 3★, Alto = 1–2★."
                >
                  Control del riesgo a día de hoy
                </div>

                <select
                  className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700"
                  value={riskWindow}
                  onChange={(e) => setRiskWindow(Number(e.target.value) as 3 | 6 | 12)}
                  aria-label="Ventana de meses"
                  title="Ventana temporal para el cálculo del riesgo agregado"
                >
                  <option value={3}>3M</option>
                  <option value={6}>6M</option>
                  <option value={12}>12M</option>
                </select>
              </div>

              {riskLoading ? (
                <div className="mt-2 text-xs text-slate-500">Cargando…</div>
              ) : riskError ? (
                <div className="mt-2 text-xs text-red-600">{riskError}</div>
              ) : !riskSnap ? (
                <div className="mt-2 text-xs text-slate-500">Sin datos.</div>
              ) : (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  {/* Texto Bajo/Medio/Alto */}
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

                  {/* Barras por estrellas (solo %) */}
                  {[
                    { label: "5★", pct: riskSnap.pct5 },
                    { label: "4★", pct: riskSnap.pct4 },
                    { label: "3★", pct: riskSnap.pct3 },
                    { label: "2★", pct: riskSnap.pct2 },
                    { label: "1★", pct: riskSnap.pct1 },
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

              <div className="mt-2 text-[11px] text-slate-400">Indicadores agregados: no identifican ni confirman identidades.</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
