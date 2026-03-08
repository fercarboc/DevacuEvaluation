import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Hotel,
  Loader2,
  RefreshCcw,
  RotateCcw,
  Save,
  CheckCircle2,
  Lock,
  Unlock,
} from "lucide-react";

import {
  getRoomTypes,
  type RevenueRoomType,
} from "../services/revenueRoomTypes.service";

import {
  getRoomPrices,
  upsertRoomPrice,
  type RevenueRoomPrice,
} from "../services/revenueRoomPrices.service";

type PriceCalendarPageProps = {
  selectedPropertyId: string | null;
  selectedPropertyName?: string | null;
  selectedOrgId: string | null;
};

type EditableCell = {
  price: string;
  minStay: string;
  closed: boolean;
  dirty?: boolean;
  saving?: boolean;
  saved?: boolean;
};

type EditableMap = Record<string, EditableCell>;

const DEFAULT_VISIBLE_DAYS = 15;

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseLocalDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function buildDateRange(from: string, to: string): string[] {
  const start = parseLocalDate(from);
  const end = parseLocalDate(to);

  const out: string[] = [];
  const cursor = new Date(start);

  while (cursor <= end) {
    out.push(formatDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return out;
}

function prettyDayLabel(value: string): string {
  const d = parseLocalDate(value);
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
  });
}

function weekdayLabel(value: string): string {
  const d = parseLocalDate(value);
  return d.toLocaleDateString("es-ES", {
    weekday: "short",
  });
}

function isWeekend(value: string) {
  const day = parseLocalDate(value).getDay();
  return day === 0 || day === 6;
}

function cellKey(roomTypeId: string, date: string) {
  return `${roomTypeId}__${date}`;
}

function makeDefaultRange() {
  const today = new Date();
  const from = formatDate(today);
  const to = formatDate(addDays(today, DEFAULT_VISIBLE_DAYS - 1));
  return { from, to };
}

function cloneMap<T>(obj: Record<string, T>): Record<string, T> {
  return JSON.parse(JSON.stringify(obj));
}

const PriceCalendarPage: React.FC<PriceCalendarPageProps> = ({
  selectedPropertyId,
  selectedPropertyName,
  selectedOrgId,
}) => {
  const initialRange = useMemo(() => makeDefaultRange(), []);

  const [dateFrom, setDateFrom] = useState(initialRange.from);
  const [dateTo, setDateTo] = useState(initialRange.to);

  const [appliedFrom, setAppliedFrom] = useState(initialRange.from);
  const [appliedTo, setAppliedTo] = useState(initialRange.to);

  const [roomTypes, setRoomTypes] = useState<RevenueRoomType[]>([]);
  const [prices, setPrices] = useState<EditableMap>({});
  const [serverSnapshot, setServerSnapshot] = useState<EditableMap>({});

  const [loadingRoomTypes, setLoadingRoomTypes] = useState(false);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [savingAll, setSavingAll] = useState(false);

  const [pageError, setPageError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const dates = useMemo(() => buildDateRange(appliedFrom, appliedTo), [appliedFrom, appliedTo]);

  const propertyTitle = useMemo(() => {
    return selectedPropertyName || "la propiedad seleccionada";
  }, [selectedPropertyName]);

  const pendingCount = useMemo(() => {
    return Object.values(prices).filter((cell) => cell.dirty).length;
  }, [prices]);

  const hasPendingChanges = pendingCount > 0;

  const loadRoomTypes = useCallback(async () => {
    if (!selectedPropertyId) {
      setRoomTypes([]);
      return;
    }

    try {
      setLoadingRoomTypes(true);
      setPageError(null);
      const rows = await getRoomTypes(selectedPropertyId);
      setRoomTypes(rows);
    } catch (e: any) {
      setPageError(e?.message ?? "No se pudieron cargar los tipos de habitación");
      setRoomTypes([]);
    } finally {
      setLoadingRoomTypes(false);
    }
  }, [selectedPropertyId]);

  const loadPrices = useCallback(async () => {
    if (!selectedPropertyId) {
      setPrices({});
      setServerSnapshot({});
      return;
    }

    try {
      setLoadingPrices(true);
      setPageError(null);

      const rows = await getRoomPrices(selectedPropertyId, appliedFrom, appliedTo);
      const map: EditableMap = {};

      rows.forEach((row: RevenueRoomPrice) => {
        map[cellKey(row.roomTypeId, row.date)] = {
          price: String(row.price ?? 0),
          minStay: String(row.minStay ?? 1),
          closed: row.closed,
          dirty: false,
          saving: false,
          saved: false,
        };
      });

      setPrices(map);
      setServerSnapshot(cloneMap(map));
    } catch (e: any) {
      setPageError(e?.message ?? "No se pudieron cargar los precios");
      setPrices({});
      setServerSnapshot({});
    } finally {
      setLoadingPrices(false);
    }
  }, [selectedPropertyId, appliedFrom, appliedTo]);

  useEffect(() => {
    void loadRoomTypes();
  }, [loadRoomTypes, refreshTick]);

  useEffect(() => {
    void loadPrices();
  }, [loadPrices, refreshTick]);

  const getCell = useCallback(
    (roomType: RevenueRoomType, date: string): EditableCell => {
      const key = cellKey(roomType.id, date);

      return (
        prices[key] ?? {
          price: String(roomType.basePrice ?? 0),
          minStay: "1",
          closed: false,
          dirty: false,
          saving: false,
          saved: false,
        }
      );
    },
    [prices]
  );

  const updateCell = useCallback(
    (roomTypeId: string, date: string, patch: Partial<EditableCell>) => {
      const key = cellKey(roomTypeId, date);

      setPrices((prev) => {
        const current = prev[key] ?? {
          price: "",
          minStay: "1",
          closed: false,
          dirty: false,
          saving: false,
          saved: false,
        };

        return {
          ...prev,
          [key]: {
            ...current,
            ...patch,
            dirty: true,
            saved: false,
          },
        };
      });
    },
    []
  );

  const saveOneCell = useCallback(
    async (roomType: RevenueRoomType, date: string) => {
      if (!selectedPropertyId || !selectedOrgId) {
        throw new Error("Falta la propiedad o la organización seleccionada.");
      }

      const key = cellKey(roomType.id, date);
      const current = prices[key] ?? {
        price: String(roomType.basePrice ?? 0),
        minStay: "1",
        closed: false,
      };

      const parsedPrice = Number(current.price);
      const parsedMinStay = Number(current.minStay);

      if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
        throw new Error(`Precio inválido en ${roomType.name} (${date}).`);
      }

      if (!Number.isInteger(parsedMinStay) || parsedMinStay < 1) {
        throw new Error(`Min stay inválido en ${roomType.name} (${date}).`);
      }

      setPrices((prev) => ({
        ...prev,
        [key]: {
          ...prev[key],
          saving: true,
          saved: false,
        },
      }));

      const saved = await upsertRoomPrice({
        org_id: selectedOrgId,
        property_id: selectedPropertyId,
        room_type_id: roomType.id,
        date,
        price: parsedPrice,
        min_stay: parsedMinStay,
        closed: current.closed,
      });

      const nextCell: EditableCell = {
        price: String(saved.price ?? 0),
        minStay: String(saved.minStay ?? 1),
        closed: saved.closed,
        dirty: false,
        saving: false,
        saved: true,
      };

      setPrices((prev) => ({
        ...prev,
        [key]: nextCell,
      }));

      setServerSnapshot((prev) => ({
        ...prev,
        [key]: nextCell,
      }));

      window.setTimeout(() => {
        setPrices((prev) => {
          const existing = prev[key];
          if (!existing) return prev;
          return {
            ...prev,
            [key]: {
              ...existing,
              saved: false,
            },
          };
        });
      }, 1200);
    },
    [prices, selectedOrgId, selectedPropertyId]
  );

  const handleSaveAll = useCallback(async () => {
    if (!selectedPropertyId || !selectedOrgId) {
      alert("Falta la propiedad o la organización seleccionada.");
      return;
    }

    const dirtyEntries = Object.entries(prices).filter(([, cell]) => cell.dirty);

    if (!dirtyEntries.length) return;

    try {
      setSavingAll(true);
      setPageError(null);

      for (const [key] of dirtyEntries) {
        const [roomTypeId, date] = key.split("__");
        const roomType = roomTypes.find((rt) => rt.id === roomTypeId);
        if (!roomType) continue;
        await saveOneCell(roomType, date);
      }
    } catch (e: any) {
      alert(e?.message ?? "No se pudieron guardar los cambios.");
    } finally {
      setSavingAll(false);
    }
  }, [prices, roomTypes, saveOneCell, selectedOrgId, selectedPropertyId]);

  const handleDiscardChanges = useCallback(() => {
    setPrices(cloneMap(serverSnapshot));
  }, [serverSnapshot]);

  const handleApplyRange = useCallback(() => {
    if (!dateFrom || !dateTo) {
      alert("Debes indicar fecha desde y fecha hasta.");
      return;
    }

    if (dateFrom > dateTo) {
      alert("La fecha desde no puede ser mayor que la fecha hasta.");
      return;
    }

    const diffMs = parseLocalDate(dateTo).getTime() - parseLocalDate(dateFrom).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;

    if (diffDays < 1) {
      alert("El rango de fechas no es válido.");
      return;
    }

    if (diffDays > 31) {
      alert("No conviene cargar más de 31 días de golpe en esta primera versión.");
      return;
    }

    setAppliedFrom(dateFrom);
    setAppliedTo(dateTo);
    setRefreshTick((v) => v + 1);
  }, [dateFrom, dateTo]);

  const shiftRange = useCallback(
    (days: number) => {
      const nextFrom = formatDate(addDays(parseLocalDate(appliedFrom), days));
      const nextTo = formatDate(addDays(parseLocalDate(appliedTo), days));

      setDateFrom(nextFrom);
      setDateTo(nextTo);
      setAppliedFrom(nextFrom);
      setAppliedTo(nextTo);
    },
    [appliedFrom, appliedTo]
  );

  const handleGoToday = useCallback(() => {
    const next = makeDefaultRange();
    setDateFrom(next.from);
    setDateTo(next.to);
    setAppliedFrom(next.from);
    setAppliedTo(next.to);
  }, []);

  if (!selectedPropertyId) {
    return (
      <div className="bg-white rounded-3xl border border-gray-200 p-10 text-center text-gray-500">
        Selecciona una propiedad para gestionar su calendario de precios.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm">
        <div className="px-6 py-5 border-b border-gray-100 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Calendario de Precios</h1>
            <p className="text-sm text-gray-500 mt-1">
              Pricing diario, estancia mínima y cierres para {propertyTitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => shiftRange(-1)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all"
            >
              <ChevronLeft size={16} />
              Día anterior
            </button>

            <button
              type="button"
              onClick={handleGoToday}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all"
            >
              <CalendarDays size={16} />
              Hoy
            </button>

            <button
              type="button"
              onClick={() => shiftRange(1)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all"
            >
              Día siguiente
              <ChevronRight size={16} />
            </button>

            <button
              type="button"
              onClick={() => setRefreshTick((v) => v + 1)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all"
            >
              <RefreshCcw size={16} />
              Recargar
            </button>
          </div>
        </div>

        <div className="px-6 py-4 flex flex-col 2xl:flex-row 2xl:items-end 2xl:justify-between gap-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                Desde
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 ml-1">
                Hasta
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
            </div>

            <button
              type="button"
              onClick={handleApplyRange}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-all shadow-sm"
            >
              Aplicar rango
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm">
              <span className="font-semibold text-slate-900">Desde:</span>{" "}
              <span className="text-slate-600">{appliedFrom}</span>
            </div>
            <div className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm">
              <span className="font-semibold text-slate-900">Hasta:</span>{" "}
              <span className="text-slate-600">{appliedTo}</span>
            </div>
            <div className="px-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-sm">
              <span className="font-semibold text-slate-900">Días:</span>{" "}
              <span className="text-slate-600">{dates.length}</span>
            </div>
          </div>
        </div>
      </div>

      {pageError && (
        <div className="flex items-center gap-3 bg-rose-50 text-rose-700 px-4 py-3 rounded-2xl border border-rose-100">
          <AlertTriangle size={18} />
          <span className="text-sm font-semibold">{pageError}</span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-2xl border text-sm font-semibold ${
              hasPendingChanges
                ? "bg-amber-50 text-amber-700 border-amber-200"
                : "bg-emerald-50 text-emerald-700 border-emerald-200"
            }`}
          >
            {hasPendingChanges ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            {hasPendingChanges
              ? `${pendingCount} cambio${pendingCount === 1 ? "" : "s"} pendiente${pendingCount === 1 ? "" : "s"}`
              : "Sin cambios pendientes"}
          </div>

          <div className="text-sm text-gray-500">
            Edición compacta para ver más días y guardar de forma más limpia.
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleDiscardChanges}
            disabled={!hasPendingChanges || savingAll}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            <RotateCcw size={16} />
            Descartar cambios
          </button>

          <button
            type="button"
            onClick={() => void handleSaveAll()}
            disabled={!hasPendingChanges || savingAll}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-sm disabled:opacity-60"
          >
            {savingAll ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save size={16} />
                Guardar cambios
              </>
            )}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        {(loadingRoomTypes || loadingPrices) && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500 border-b border-gray-100">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando datos…
          </div>
        )}

        {!loadingRoomTypes && roomTypes.length === 0 ? (
          <div className="px-8 py-12 text-center text-gray-400">
            <Hotel size={48} className="mx-auto mb-4 opacity-20" />
            <p className="font-bold">No hay tipos de habitación configurados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-max border-collapse">
              <thead className="sticky top-0 z-20">
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="sticky left-0 z-30 bg-gray-50 text-left px-6 py-4 min-w-[260px] border-r border-gray-100">
                    <div className="text-[11px] font-black uppercase tracking-widest text-gray-500">
                      Tipo de habitación
                    </div>
                  </th>

                  {dates.map((date) => (
                    <th
                      key={date}
                      className={`px-2 py-3 text-center min-w-[110px] border-l border-gray-100 ${
                        isWeekend(date) ? "bg-slate-100" : "bg-gray-50"
                      }`}
                    >
                      <div className="text-sm font-bold text-gray-900">{prettyDayLabel(date)}</div>
                      <div className="text-[10px] lowercase text-gray-500 font-semibold">
                        {weekdayLabel(date)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {roomTypes.map((roomType) => (
                  <tr key={roomType.id} className="border-b border-gray-100">
                    <td className="sticky left-0 z-10 bg-white px-6 py-4 align-top border-r border-gray-100">
                      <div className="font-bold text-gray-900 text-base leading-tight">
                        {roomType.name}
                      </div>
                      <div className="mt-2 text-sm text-gray-500">
                        {roomType.code} · {roomType.capacity ?? 0} pax · {roomType.roomsCount ?? 0} hab.
                      </div>
                      <div className="mt-1 text-sm font-bold text-gray-700">
                        Base {Number(roomType.basePrice ?? 0).toFixed(2)} €
                      </div>
                    </td>

                    {dates.map((date) => {
                      const cell = getCell(roomType, date);

                      return (
                        <td
                          key={date}
                          className={`px-2 py-3 align-top border-l border-gray-100 ${
                            isWeekend(date) ? "bg-slate-50/70" : "bg-white"
                          }`}
                        >
                          <div
                            className={`rounded-2xl border p-2.5 transition-all ${
                              cell.dirty
                                ? "border-amber-300 bg-amber-50/50"
                                : cell.saved
                                ? "border-emerald-300 bg-emerald-50/50"
                                : "border-gray-100 bg-white"
                            }`}
                          >
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={cell.price}
                              onChange={(e) =>
                                updateCell(roomType.id, date, {
                                  price: e.target.value,
                                })
                              }
                              className="w-full bg-transparent text-center text-lg font-bold text-gray-900 outline-none"
                            />

                            <div className="mt-2 flex items-center justify-center gap-1 text-[11px] text-gray-500 font-semibold">
                              <span>MS</span>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={cell.minStay}
                                onChange={(e) =>
                                  updateCell(roomType.id, date, {
                                    minStay: e.target.value,
                                  })
                                }
                                className="w-10 bg-transparent text-center font-bold text-gray-700 outline-none border-b border-dashed border-gray-300"
                              />
                            </div>

                            <button
                              type="button"
                              onClick={() =>
                                updateCell(roomType.id, date, {
                                  closed: !cell.closed,
                                })
                              }
                              className={`mt-2 w-full inline-flex items-center justify-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-bold transition-all ${
                                cell.closed
                                  ? "bg-rose-50 text-rose-700 border border-rose-200"
                                  : "bg-slate-50 text-slate-600 border border-slate-200"
                              }`}
                            >
                              {cell.closed ? <Lock size={12} /> : <Unlock size={12} />}
                              {cell.closed ? "Cerrado" : "Abierto"}
                            </button>

                            {cell.saving ? (
                              <div className="mt-2 flex items-center justify-center gap-1 text-[10px] text-blue-600 font-semibold">
                                <Loader2 size={12} className="animate-spin" />
                                Guardando
                              </div>
                            ) : cell.saved ? (
                              <div className="mt-2 flex items-center justify-center gap-1 text-[10px] text-emerald-600 font-semibold">
                                <CheckCircle2 size={12} />
                                Guardado
                              </div>
                            ) : cell.dirty ? (
                              <div className="mt-2 flex items-center justify-center gap-1 text-[10px] text-amber-600 font-semibold">
                                <AlertTriangle size={12} />
                                Pendiente
                              </div>
                            ) : (
                              <div className="mt-2 h-[16px]" />
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default PriceCalendarPage;