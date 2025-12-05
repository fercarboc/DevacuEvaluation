// src/components/SearchRatings.tsx
import React, { useState, useEffect } from 'react';
import {
  searchRatingsInSupabase,
  getGlobalSummary,
} from '../services/evaluationService';

import { Rating, User } from '../types';
import { StarRating } from './StarRating';
import {
  Search,
  Calendar,
  User as UserIcon,
  ShieldAlert,
  Info,
} from 'lucide-react';

interface SearchRatingsProps {
  currentUser: User;
}

export const SearchRatings: React.FC<SearchRatingsProps> = ({
  currentUser,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Rating[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Resumen global
  const [globalTotal, setGlobalTotal] = useState(0);
  const [platformSummary, setPlatformSummary] = useState<
    Record<string, number>
  >({});
  const [countrySummary, setCountrySummary] = useState<
    Record<string, number>
  >({});

  useEffect(() => {
    const load = async () => {
      try {
        const summary = await getGlobalSummary();
        setGlobalTotal(summary.totalCount);
        setPlatformSummary(summary.platformCounts);
        setCountrySummary(summary.countryCounts);
      } catch (e) {
        console.error('Error cargando resumen global:', e);
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
      setResults(data);
    } catch (error) {
      console.error(error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const getMaskedName = (authorName: string, authorId: string) => {
    if (authorId === currentUser.id) {
      return `${authorName} (Tú)`;
    }
    const parts = authorName.split(' ');
    return parts
      .map((p) => (p ? p[0] + '*'.repeat(Math.max(p.length - 1, 0)) : ''))
      .join(' ');
  };

  // ======= RESUMEN PLATAFORMAS =======
  const platformEntries = Object.entries(platformSummary)
    .map(([platform, count]) => {
      const pct =
        globalTotal > 0 ? Math.round((Number(count) / globalTotal) * 100) : 0;
      return { platform, pct };
    })
    .filter((p) => p.pct > 0)
    .sort((a, b) => b.pct - a.pct);

  const platformDisplay = [...platformEntries];
  if (platformDisplay.length > 0) {
    const sumPct = platformDisplay.reduce((acc, p) => acc + p.pct, 0);
    const diff = 100 - sumPct;
    if (diff >= 1) {
      platformDisplay.push({ platform: 'Otros', pct: diff });
    }
  }

  // ======= RESUMEN PAÍSES =======
  const countryEntries = Object.entries(countrySummary)
    .map(([country, count]) => {
      const pct =
        globalTotal > 0 ? Math.round((Number(count) / globalTotal) * 100) : 0;
      return { country, pct };
    })
    .filter((c) => c.pct > 0)
    .sort((a, b) => b.pct - a.pct);

  const topCountries = countryEntries.slice(0, 6);
  const remainingCountries = countryEntries.length - topCountries.length;

  const effectivePlanTotal = globalTotal;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Cabecera y buscador */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-800 mb-2">
          Consultar Historial
        </h2>
        <p className="text-slate-600">
          Busca por nombre, teléfono, email o documento para ver la reputación
          del cliente.
        </p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 mb-8">
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-slate-400" />
            </div>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="block w-full pl-10 pr-3 py-3 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
              placeholder="Ej: Juan Perez, 555-0199, juan@gmail.com..."
            />
          </div>
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="px-6 py-3 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Buscando...' : 'Consultar'}
          </button>
        </form>
      </div>

      {/* Tres cards: Plataformas - Resultados - Países */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* IZQUIERDA: Resumen + Plataformas */}
        <section className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 h-full flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-indigo-500" />
              <div>
                <h4 className="text-sm font-semibold text-slate-800">
                  Resumen global de la base
                </h4>
                <p className="text-xs text-slate-500">
                  <span className="font-semibold">
                    {effectivePlanTotal.toLocaleString('es-ES')}
                  </span>{' '}
                  registros totales.
                </p>
              </div>
            </div>

            <div className="mt-2">
              <h5 className="text-xs font-semibold text-slate-500 uppercase mb-2">
                Principales plataformas
              </h5>
              {platformDisplay.length === 0 ? (
                <p className="text-xs text-slate-400">Sin datos.</p>
              ) : (
                <div className="space-y-2">
                  {platformDisplay.map(({ platform, pct }) => (
                    <div key={platform} className="text-xs">
                      <div className="flex justify-between mb-1">
                        <span className="text-slate-600 truncate pr-2">
                          {platform}
                        </span>
                        <span className="text-slate-500">{pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* CENTRO: Resultados (altura fija + scroll vertical) */}
        <section className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col max-h-[600px]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-slate-800">
                Resultados
              </h3>
              {!searched && (
                <p className="text-slate-500 text-sm">
                  Introduce un nombre, teléfono, email o documento en el
                  buscador superior para consultar el historial de un cliente.
                </p>
              )}
              {searched && results.length === 0 && !loading && (
                <p className="text-slate-500 text-sm">
                  No se encontraron registros.
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4">
              {searched &&
                results.map((rating) => (
                  <div
                    key={rating.id}
                    className="bg-slate-50 p-4 rounded-xl border border-slate-200 hover:border-indigo-200 transition-colors"
                  >
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-bold text-lg text-slate-900 uppercase">
                            {rating.clientData.fullName}
                          </h4>
                          {rating.clientData.document && (
                            <span className="px-2 py-0.5 bg-white text-slate-600 text-xs rounded-full border border-slate-200">
                              {rating.clientData.document}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 mb-4">
                          {rating.clientData.email && (
                            <span>{rating.clientData.email}</span>
                          )}
                          {rating.clientData.phone && (
                            <span>{rating.clientData.phone}</span>
                          )}
                        </div>

                        <div className="bg-white p-3 rounded-lg mb-3 border border-slate-100">
                          <p className="text-slate-700 italic text-sm">
                            {rating.comment?.trim()
                              ? `"${rating.comment}"`
                              : '"Sin comentario en la última valoración."'}
                          </p>
                        </div>

                        <div className="flex items-center gap-6 text-xs text-slate-500">
                          <div className="flex items-center gap-1">
                            <UserIcon className="w-3 h-3" />
                            <span>
                              Por:{' '}
                              {getMaskedName(
                                rating.authorName,
                                rating.authorId
                              )}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>
                              {new Date(
                                rating.createdAt
                              ).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-col items-end min-w-[120px]">
                        <div className="mb-2">
                          <StarRating rating={rating.value} size="lg" />
                        </div>
                        <span
                          className={`text-sm font-medium px-3 py-1 rounded-full ${
                            rating.value >= 4
                              ? 'bg-green-100 text-green-700'
                              : rating.value >= 3
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {rating.value >= 4
                            ? 'Recomendado'
                            : rating.value >= 3
                            ? 'Regular'
                            : 'No Recomendado'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

              {searched && results.length === 0 && !loading && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg p-6 text-center mt-4">
                  <ShieldAlert className="w-12 h-12 text-blue-400 mx-auto mb-3" />
                  <h4 className="text-blue-900 font-medium">
                    Sin historial negativo (ni positivo)
                  </h4>
                  <p className="text-blue-700 text-sm mt-1">
                    Este cliente no tiene valoraciones registradas. ¡Sé el
                    primero en valorarlo!
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* DERECHA: Países */}
        <section className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 h-full">
            <h5 className="text-xs font-semibold text-slate-500 uppercase mb-2">
              Distribución por país
            </h5>
            {topCountries.length === 0 ? (
              <p className="text-xs text-slate-400">Sin datos.</p>
            ) : (
              <div className="space-y-1.5">
                {topCountries.map(({ country, pct }) => (
                  <div
                    key={country}
                    className="flex justify-between text-xs text-slate-600"
                  >
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
