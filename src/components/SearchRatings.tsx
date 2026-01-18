// src/components/SearchRatings.tsx
import React, { useEffect, useMemo, useState } from "react";
import { searchRatingsInSupabase, getGlobalSummary } from "../services/evaluationService";
import type { Rating, User } from "../types/types";
import { StarRating } from "./StarRating";
import { Search, Calendar, User as UserIcon, ShieldAlert, Info, ShieldCheck, Fingerprint } from "lucide-react";

interface SearchRatingsProps {
  currentUser: User;
}

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
  raw.split("|").map((p) => p.trim()).forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    out[k] = v;
  });
  return out;
}

export const SearchRatings: React.FC<SearchRatingsProps> = ({ currentUser }) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Resumen global
  const [globalTotal, setGlobalTotal] = useState(0);
  const [platformSummary, setPlatformSummary] = useState<Record<string, number>>({});
  const [countrySummary, setCountrySummary] = useState<Record<string, number>>({});

  useEffect(() => {
    const load = async () => {
      try {
        const summary = await getGlobalSummary();
        setGlobalTotal(summary.totalCount);
        setPlatformSummary(summary.platformCounts);
        setCountrySummary(summary.countryCounts);
      } catch (e) {
        console.error("Error cargando resumen global:", e);
      }
    };
    load();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setSearched(true);
    try {
      const data = await searchRatingsInSupabase(query);
      // orden: más recientes primero
      const sorted = [...data].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setResults(sorted);
    } catch (error) {
      console.error(error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const getMaskedAuthor = (authorName: string, authorId: string) => {
    if (authorId === currentUser.id) return `${authorName} (Tú)`;
    const parts = (authorName || "").split(" ").filter(Boolean);
    return parts.map((p) => (p ? p[0] + "*".repeat(Math.max(p.length - 1, 0)) : "")).join(" ");
  };

  // KPI del resultado
  const resultKpi = useMemo(() => {
    if (!results.length) return null;
    const avg = results.reduce((acc, r) => acc + (r.value || 0), 0) / results.length;
    const last = results[0];
    const score =
      avg >= 4 ? "Bajo riesgo" : avg >= 3 ? "Riesgo medio" : "Riesgo alto";
    return { avg, count: results.length, lastDate: last.createdAt, score };
  }, [results]);

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

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-900 mb-1">Consultar historial</h2>
        <p className="text-sm text-slate-600">
          Consulta por documento, email, teléfono o nombre. La vista protege PII (datos sensibles) por defecto.
        </p>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-6">
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
              placeholder="Documento, email, teléfono o nombre…"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-6 py-3 rounded-2xl bg-slate-900 text-white font-semibold hover:bg-black disabled:opacity-50 transition-colors"
          >
            {loading ? "Buscando…" : "Consultar"}
          </button>
        </form>

        <div className="mt-4 flex items-start gap-2 rounded-2xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-600">
          <Fingerprint className="w-4 h-4 text-slate-500 mt-0.5" />
          <div>
            <div className="font-semibold text-slate-800">Privacidad por defecto</div>
            <div>
              Email/teléfono/documento se muestran enmascarados. El detalle completo debe resolverse por política (RLS/auditoría).
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
              ) : resultKpi ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="rounded-full border px-3 py-1 text-slate-700 bg-white">
                    {resultKpi.count} registros
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 font-semibold ${
                      resultKpi.avg >= 4
                        ? "bg-green-100 text-green-700"
                        : resultKpi.avg >= 3
                        ? "bg-amber-100 text-amber-800"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {resultKpi.score} · {resultKpi.avg.toFixed(1)}
                  </span>
                </div>
              ) : (
                <div className="text-sm text-slate-500">Sin registros.</div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4">
              {searched &&
                results.map((rating) => {
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
                            <h4 className="font-bold text-base text-slate-900 uppercase">
                              {rating.clientData.fullName}
                            </h4>

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

              {searched && results.length === 0 && !loading && (
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 text-center mt-2">
                  <ShieldAlert className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                  <h4 className="text-blue-900 font-semibold">Sin historial</h4>
                  <p className="text-blue-700 text-sm mt-1">
                    No hay registros asociados a este criterio. Si procede, registra un nuevo evento.
                  </p>
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
                {remainingCountries > 0 && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    +{remainingCountries} países con menos registros.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};
