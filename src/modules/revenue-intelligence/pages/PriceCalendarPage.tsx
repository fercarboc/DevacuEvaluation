import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Hotel,
  Loader2,
  Lock,
  LockOpen,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
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
  const [roomTypeFilter, setRoomTypeFilter] = useState("");

  const dates = useMemo(() => buildDateRange(appliedFrom, appliedTo), [appliedFrom, appliedTo]);

  const propertyTitle = useMemo(() => {
    return selectedPropertyName || "la propiedad seleccionada";
  }, [selectedPropertyName]);

  const pendingCount = useMemo(() => {
    return Object.values(prices).filter((cell) => cell.dirty).length;
  }, [prices]);

  const hasPendingChanges = pendingCount > 0;

  const filteredRoomTypes = useMemo(() => {
    const q = roomTypeFilter.trim().toLowerCase();
    if (!q) return roomTypes;

    return roomTypes.filter((rt) => {
      const hay =
        rt.name.toLowerCase().includes(q) ||
        rt.code.toLowerCase().includes(q);
      return hay;
    });
  }, [roomTypes, roomTypeFilter]);

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
      }, 1000);
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

    if (diffDays > 45) {
      alert("No conviene cargar más de 45 días de golpe en esta versión.");
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
    <div className="space-y-4">
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
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

        <div className="px-5 py-4 flex flex-col 2xl:flex-row 2xl:items-end 2xl:justify-between gap-4">
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

      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm px-5 py-4">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
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

            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={roomTypeFilter}
                onChange={(e) => setRoomTypeFilter(e.target.value)}
                placeholder="Filtrar tipo de habitación..."
                className="pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 text-sm w-[260px] focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              />
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
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        {(loadingRoomTypes || loadingPrices) && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-500 border-b border-gray-100">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando datos…
          </div>
        )}

        {!loadingRoomTypes && filteredRoomTypes.length === 0 ? (
          <div className="px-8 py-12 text-center text-gray-400">
            <Hotel size={42} className="mx-auto mb-4 opacity-20" />
            <p className="font-bold">
              {roomTypeFilter
                ? "No hay tipos que coincidan con el filtro"
                : "No hay tipos de habitación configurados"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-max border-collapse">
              <thead className="sticky top-0 z-20">
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="sticky left-0 z-30 bg-gray-50 text-left px-4 py-3 min-w-[220px] border-r border-gray-100">
                    <div className="text-[11px] font-black uppercase tracking-widest text-gray-500">
                      Tipo de habitación
                    </div>
                  </th>

                  {dates.map((date) => (
                    <th
                      key={date}
                      className={`px-1.5 py-2 text-center min-w-[88px] border-l border-gray-100 ${
                        isWeekend(date) ? "bg-slate-100" : "bg-gray-50"
                      }`}
                    >
                      <div className="text-sm font-bold text-gray-900 leading-tight">
                        {prettyDayLabel(date)}
                      </div>
                      <div className="text-[10px] lowercase text-gray-500 font-semibold leading-tight">
                        {weekdayLabel(date)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredRoomTypes.map((roomType, rowIndex) => (
                  <tr
                    key={roomType.id}
                    className={rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50/40"}
                  >
                    <td className="sticky left-0 z-10 px-4 py-3 align-middle border-r border-b border-gray-100 bg-inherit">
                      <div className="font-bold text-gray-900 text-[15px] leading-tight">
                        {roomType.name}
                      </div>
                      <div className="mt-1 text-sm text-gray-500 leading-tight">
                        {roomType.code} · {roomType.capacity ?? 0} pax · {roomType.roomsCount ?? 0} hab.
                      </div>
                      <div className="mt-1 text-sm font-bold text-gray-700 leading-tight">
                        Base {Number(roomType.basePrice ?? 0).toFixed(2)} €
                      </div>
                    </td>

                    {dates.map((date) => {
                      const cell = getCell(roomType, date);
                      const closed = cell.closed;

                      return (
                        <td
                          key={date}
                          className={`px-1.5 py-1.5 align-middle border-l border-b border-gray-100 ${
                            closed
                              ? "bg-slate-200/70"
                              : isWeekend(date)
                              ? "bg-slate-50/70"
                              : "bg-white"
                          }`}
                        >
                          <div
                            className={`rounded-xl border px-2 py-1.5 transition-all ${
                              closed
                                ? "border-slate-300 bg-slate-200/80"
                                : cell.dirty
                                ? "border-amber-300 bg-amber-50/60"
                                : cell.saved
                                ? "border-emerald-300 bg-emerald-50/60"
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
                              className={`w-full bg-transparent text-center text-[18px] leading-none font-bold outline-none ${
                                closed ? "text-slate-500" : "text-gray-900"
                              }`}
                              title={`Precio ${date}`}
                            />

                            <div className="mt-1 flex items-center justify-center gap-1 text-[10px] font-semibold text-gray-500">
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
                                className={`w-8 bg-transparent text-center font-bold outline-none border-b border-dashed ${
                                  closed
                                    ? "text-slate-500 border-slate-400"
                                    : "text-gray-700 border-gray-300"
                                }`}
                                title={`Estancia mínima ${date}`}
                              />
                            </div>

                            <div className="mt-1.5 flex items-center justify-center">
                              <button
                                type="button"
                                onClick={() =>
                                  updateCell(roomType.id, date, {
                                    closed: !cell.closed,
                                  })
                                }
                                className={`inline-flex items-center justify-center rounded-md p-1 transition-all ${
                                  closed
                                    ? "text-slate-700 hover:bg-slate-300/60"
                                    : "text-slate-400 hover:bg-slate-100"
                                }`}
                                title={
                                  closed
                                    ? `Día cerrado (${date}). Pulsa para abrir.`
                                    : `Día abierto (${date}). Pulsa para cerrar.`
                                }
                              >
                                {closed ? <Lock size={14} /> : <LockOpen size={14} />}
                              </button>
                            </div>

                            <div className="mt-1 h-[12px] flex items-center justify-center">
                              {cell.saving ? (
                                <Loader2 size={11} className="animate-spin text-blue-600" />
                              ) : cell.saved ? (
                                <CheckCircle2 size={11} className="text-emerald-600" />
                              ) : cell.dirty ? (
                                <AlertTriangle size={11} className="text-amber-600" />
                              ) : null}
                            </div>
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