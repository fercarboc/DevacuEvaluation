// src/components/SearchRatings.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  // ✅ NUEVO: separa “global agregado” de “mis registros”
  checkSignalsGlobal,
  searchMyRatingsInSupabase,
  getGlobalSummary,
} from "../services/evaluationService";

import type { Rating, User } from "../types/types";
import { StarRating } from "./StarRating";
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
 * ⚠️ IMPORTANTE: el backend/service DEBE cumplir esto también:
 * - checkSignalsGlobal(query) NO debe devolver full_name/email/phone/document ni filas individuales.
 * - searchMyRatingsInSupabase(query, authorId) debe filtrar por authorId en BD (no filtrar en cliente).
 */

interface SearchRatingsProps {
  currentUser: User;
}

/** -------------------------------
 * Helpers: máscara (solo para “Mis registros”)
 * -------------------------------- */
function maskEmail(email: string) {
  const e = (email || "").trim();
  if (!e.includes("@")) return "";
  const [u, d] = e.split("@");
  const uMask = u.length <= 1 ? "*" : `${u[0]}***`;
  const dParts = d.split(".");
  const dMask = dParts.length ? `${dParts[0][0] || "*"}***.${dParts.slice(1).join(".") || "com"}` : "***";
  return `${uMask}@${dMask}`;
}

function maskPhone(phone: string) {
  const p = (phone || "").replace(/\D/g, "");
  if (!p) return "";
  const last = p.slice(-3);
  return `•••${last}`;
}

function maskDoc(doc: string) {
  const d = (doc || "").trim();
  if (!d) return "";
  if (d.length <= 4) return "••••";
  return `${d.slice(0, 2)}••••${d.slice(-2)}`;
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
 * Normalizadores (snake_case ⇄ camelCase)
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
  const createdAt = raw?.createdAt ?? raw?.created_at ?? raw?.evaluationDate ?? raw?.evaluation_date ?? raw?.created ?? null;

  const value =
    typeof raw?.value === "number"
      ? raw.value
      : typeof raw?.rating === "number"
      ? raw.rating
      : Number(raw?.value ?? raw?.rating ?? 0);

  const fullName = clientRaw?.fullName ?? clientRaw?.full_name ?? raw?.fullName ?? raw?.full_name ?? "";

  const document = clientRaw?.document ?? raw?.document ?? "";
  const email = clientRaw?.email ?? raw?.email ?? null;
  const phone = clientRaw?.phone ?? raw?.phone ?? null;
  const nationality = clientRaw?.nationality ?? raw?.nationality ?? null;

  const authorId = raw?.authorId ?? raw?.author_id ?? raw?.creatorCustomerId ?? raw?.creator_customer_id ?? "";
  const authorName = raw?.authorName ?? raw?.author_name ?? raw?.creatorCustomerName ?? raw?.creator_customer_name ?? "";

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

function normalizeSummary(raw: any): { totalCount: number; platformCounts: Record<string, number>; countryCounts: Record<string, number> } {
  const totalCount = Number(raw?.totalCount ?? raw?.total_count ?? raw?.total ?? 0);

  const platformCounts = raw?.platformCounts ?? raw?.platform_counts ?? raw?.platformSummary ?? raw?.platform_summary ?? {};
  const countryCounts = raw?.countryCounts ?? raw?.country_counts ?? raw?.countrySummary ?? raw?.country_summary ?? {};

  const safeObj = (o: any) => (o && typeof o === "object" ? o : {});
  return {
    totalCount,
    platformCounts: safeObj(platformCounts),
    countryCounts: safeObj(countryCounts),
  };
}

/** -------------------------------------------------------
 * Modelo GLOBAL agregado (NO PII / NO filas individuales)
 * ------------------------------------------------------*/
type MatchStrength = "STRONG" | "MEDIUM" | "WEAK";

type CountBucket = "0" | "1-2" | "3-5" | "6-10" | "10+";

type RiskLevel = "BAJO" | "MEDIO" | "ALTO" | "NO_CONCLUYENTE";

type GlobalSignals = {
  matchStrength: MatchStrength;

  // “Coincidencias” se expresa sin confirmar identidad
  hasMatches: boolean;

  // Anti-reidentificación: bucket
  countBucket: CountBucket;

  // Solo si matchStrength === "STRONG"
  avgStars?: number; // 0..5
  risk?: RiskLevel; // BAJO/MEDIO/ALTO

  // Tipologías agregadas (solo si k>=K)
  topTypologies?: string[];

  // Ventana temporal amplia
  timeWindow?: "12M" | "24M" | "36M";

  // Mensaje para UI
  message?: string;
};

/** -------------------------------------------------------
 * Clasificación local del query (capa extra de seguridad)
 * ------------------------------------------------------*/
function looksLikeEmail(q: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.trim());
}
function looksLikePhone(q: string) {
  const p = q.replace(/\D/g, "");
  return p.length >= 8 && p.length <= 15;
}
function looksLikeDoc(q: string) {
  // DNI/NIE/PASAPORTE (heurístico, sin ser estricto)
  const t = q.trim().toUpperCase();
  const alnum = t.replace(/\s+/g, "");
  // Ej: 12345678Z, X1234567T, etc.
  return /^[XYZ]?\d{5,10}[A-Z]?$/.test(alnum);
}
function looksLikeNameOnly(q: string) {
  const t = q.trim();
  if (t.length < 5) return false;
  if (looksLikeEmail(t) || looksLikePhone(t) || looksLikeDoc(t)) return false;
  // si contiene letras y espacios (2+ palabras)
  const parts = t.split(/\s+/).filter(Boolean);
  const hasLetters = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(t);
  return hasLetters && parts.length >= 2;
}
function classifyQuery(q: string): MatchStrength {
  if (looksLikeEmail(q) || looksLikePhone(q) || looksLikeDoc(q)) return "STRONG";
  if (looksLikeNameOnly(q)) return "WEAK";
  return "MEDIUM";
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

function safeStars(v?: number) {
  if (typeof v !== "number" || Number.isNaN(v)) return null;
  const clamped = Math.max(0, Math.min(5, v));
  return clamped;
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

  // Resumen global (panel izq + der)
  const [globalTotal, setGlobalTotal] = useState(0);
  const [platformSummary, setPlatformSummary] = useState<Record<string, number>>({});
  const [countrySummary, setCountrySummary] = useState<Record<string, number>>({});

  useEffect(() => {
    const load = async () => {
      try {
        const rawSummary = await getGlobalSummary();
        const summary = normalizeSummary(rawSummary);
        setGlobalTotal(summary.totalCount);
        setPlatformSummary(summary.platformCounts);
        setCountrySummary(summary.countryCounts);
      } catch (e) {
        console.error("Error cargando resumen global:", e);
        setGlobalTotal(0);
        setPlatformSummary({});
        setCountrySummary({});
      }
    };
    load();
  }, []);

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
        // ✅ Solo registros creados por este hotel (DEBE filtrar en BD, no en cliente)
        const raw = await searchMyRatingsInSupabase(q, currentUser.id);
        const data: Rating[] = Array.isArray(raw) ? raw.map(normalizeRating) : [];
        const sorted = [...data].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setMyResults(sorted);
        return;
      }

      // ✅ GLOBAL: capa extra
      const strength = classifyQuery(q);

      // Si es WEAK (nombre/apellidos), NO hacemos lookup “tipo buscador de personas”.
      // Devolvemos estado NO CONCLUYENTE y pedimos un identificador fuerte.
      if (strength === "WEAK") {
        setGlobalSignals({
          matchStrength: "WEAK",
          hasMatches: false,
          countBucket: "0",
          risk: "NO_CONCLUYENTE",
          timeWindow: "24M",
          message:
            "Resultado no concluyente: el dato aportado puede corresponder a varias personas. Para una comprobación técnica, añade un identificador de la solicitud (email/teléfono/documento).",
        });
        return;
      }

      // ✅ STRONG/MEDIUM: pedimos señales agregadas al backend
      // ⚠️ Este endpoint NO debe devolver PII ni filas individuales
      const s = await checkSignalsGlobal(q);

      // Normalizamos por si el service trae variaciones
      const normalized: GlobalSignals = {
        matchStrength: (s?.matchStrength ?? strength) as MatchStrength,
        hasMatches: Boolean(s?.hasMatches),
        countBucket: (s?.countBucket ?? "0") as CountBucket,
        avgStars: typeof s?.avgStars === "number" ? s.avgStars : undefined,
        risk: (s?.risk ?? (s?.hasMatches ? "MEDIO" : "NO_CONCLUYENTE")) as RiskLevel,
        topTypologies: Array.isArray(s?.topTypologies) ? s.topTypologies.slice(0, 6) : [],
        timeWindow: (s?.timeWindow ?? "24M") as "12M" | "24M" | "36M",
        message: s?.message ?? "",
      };

      setGlobalSignals(normalized);
    } catch (error) {
      console.error(error);
      if (mode === "GLOBAL") {
        setGlobalSignals({
          matchStrength: "MEDIUM",
          hasMatches: false,
          countBucket: "0",
          risk: "NO_CONCLUYENTE",
          timeWindow: "24M",
          message: "No se ha podido completar la comprobación. Inténtalo de nuevo.",
        });
      } else {
        setMyResults([]);
      }
    } finally {
      setLoading(false);
    }
  };

  const getMaskedAuthor = (authorName: string, authorId: string) => {
    if (authorId === currentUser.id) return `${authorName} (Tú)`;
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

  // Resumen plataformas
  const platformDisplay = useMemo(() => {
    const entries = Object.entries(platformSummary)
      .map(([platform, count]) => {
        const pct = globalTotal > 0 ? Math.round((Number(count) / globalTotal) * 100) : 0;
        return { platform, pct };
      })
      .filter((p) => p.pct > 0)
      .sort((a, b) => b.pct - a.pct);

    if (!entries.length) return [];
    const sumPct = entries.reduce((acc, p) => acc + p.pct, 0);
    const diff = 100 - sumPct;
    return diff >= 1 ? [...entries, { platform: "Otros", pct: diff }] : entries;
  }, [platformSummary, globalTotal]);

  // Países top
  const { topCountries, remainingCountries } = useMemo(() => {
    const entries = Object.entries(countrySummary)
      .map(([country, count]) => {
        const pct = globalTotal > 0 ? Math.round((Number(count) / globalTotal) * 100) : 0;
        return { country, pct };
      })
      .filter((c) => c.pct > 0)
      .sort((a, b) => b.pct - a.pct);

    const top = entries.slice(0, 6);
    return { topCountries: top, remainingCountries: Math.max(0, entries.length - top.length) };
  }, [countrySummary, globalTotal]);

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
        {/* Selector de modo */}
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
              mode === "GLOBAL" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
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
              mode === "MINE" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
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
          {mode === "GLOBAL" ? <LockKeyhole className="w-4 h-4 text-slate-500 mt-0.5" /> : <Fingerprint className="w-4 h-4 text-slate-500 mt-0.5" />}
          <div>
            <div className="font-semibold text-slate-800">{mode === "GLOBAL" ? "Privacidad reforzada (Global)" : "Privacidad por defecto"}</div>
            <div>
              {mode === "GLOBAL" ? (
                <>
                  Debacu no devuelve datos personales ni confirma identidades. Se muestran únicamente señales agregadas y no identificables.
                </>
              ) : (
                <>
                  Email/teléfono/documento se muestran enmascarados. El detalle completo debe resolverse por política (RLS/auditoría).
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
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-indigo-500" />
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Base global</h4>
                <p className="text-xs text-slate-500">
                  <span className="font-semibold">{globalTotal.toLocaleString("es-ES")}</span> registros.
                </p>
              </div>
            </div>

            <h5 className="text-xs font-semibold text-slate-500 uppercase mb-2">Plataformas</h5>
            {platformDisplay.length === 0 ? (
              <p className="text-xs text-slate-400">Sin datos.</p>
            ) : (
              <div className="space-y-2">
                {platformDisplay.map(({ platform, pct }) => (
                  <div key={platform} className="text-xs">
                    <div className="flex justify-between mb-1">
                      <span className="text-slate-600 truncate pr-2">{platform}</span>
                      <span className="text-slate-500">{pct}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
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
                        myKpi.avg >= 4 ? "bg-green-100 text-green-700" : myKpi.avg >= 3 ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-700"
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
                    {globalSignals.hasMatches ? "Coincidencias: Sí" : "Coincidencias: No"}
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
              {/* ---------------------
                  MODO GLOBAL (AGREGADO)
                  --------------------- */}
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
                                Ventana: <span className="font-semibold">{globalSignals.timeWindow.replace("M", " meses")}</span>
                              </span>
                            ) : null}
                          </div>

                          {/* Solo si STRONG: estrellas y tipologías */}
                          {globalSignals.matchStrength === "STRONG" ? (
                            <div className="mt-4 rounded-2xl bg-white border border-slate-200 p-4">
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                  <div className="text-xs font-semibold text-slate-700 mb-1">Valoración media agregada</div>
                                  {safeStars(globalSignals.avgStars) !== null ? (
                                    <StarRating rating={safeStars(globalSignals.avgStars) as number} size="lg" />
                                  ) : (
                                    <div className="text-xs text-slate-500">Información no disponible</div>
                                  )}
                                </div>

                                <div className="text-xs text-slate-500">
                                  Coincidencia técnica: <span className="font-semibold text-slate-700">Fuerte</span>
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
                          ) : (
                            <div className="mt-4 rounded-2xl bg-white border border-amber-200 p-4 text-xs text-amber-900">
                              Resultado no concluyente para este criterio. Para obtener señales agregadas fiables, utiliza email/teléfono/documento.
                            </div>
                          )}

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

              {/* ---------------------
                  MODO MINE (DETALLE)
                  --------------------- */}
              {mode === "MINE" &&
                searched &&
                myResults.map((rating) => {
                  const cc = parseControlledComment(rating.comment);
                  const reasons = (cc["reasons"] || "").split(",").filter(Boolean);
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

                            {rating.clientData.document && (
                              <span className="px-2 py-0.5 bg-white text-slate-600 text-xs rounded-full border border-slate-200">
                                {maskDoc(rating.clientData.document)}
                              </span>
                            )}

                            {rating.platform && (
                              <span className="px-2 py-0.5 bg-white text-slate-600 text-xs rounded-full border border-slate-200">
                                {rating.platform}
                              </span>
                            )}
                          </div>

                          {/* PII masked */}
                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mb-3">
                            {rating.clientData.email ? <span>{maskEmail(rating.clientData.email)}</span> : null}
                            {rating.clientData.phone ? <span>{maskPhone(rating.clientData.phone)}</span> : null}
                            {rating.clientData.nationality ? <span>{rating.clientData.nationality}</span> : null}
                          </div>

                          {/* Controlled payload */}
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
            <h5 className="text-xs font-semibold text-slate-500 uppercase mb-2">Países</h5>
            {topCountries.length === 0 ? (
              <p className="text-xs text-slate-400">Sin datos.</p>
            ) : (
              <div className="space-y-1.5">
                {topCountries.map(({ country, pct }) => (
                  <div key={country} className="flex justify-between text-xs text-slate-600">
                    <span>{country}</span>
                    <span>{pct}%</span>
                  </div>
                ))}
                {remainingCountries > 0 && <p className="text-[11px] text-slate-400 mt-1">+{remainingCountries} países con menos registros.</p>}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
