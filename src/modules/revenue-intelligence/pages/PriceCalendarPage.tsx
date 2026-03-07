import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCcw, Save, AlertTriangle, Hotel } from "lucide-react";

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
};

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function buildDateRange(days: number): string[] {
  const today = new Date();
  return Array.from({ length: days }, (_, i) => formatDate(addDays(today, i)));
}

function prettyDayLabel(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
  });
}

function weekdayLabel(value: string): string {
  const d = new Date(`${value}T00:00:00`);
  return d.toLocaleDateString("es-ES", {
    weekday: "short",
  });
}

function cellKey(roomTypeId: string, date: string) {
  return `${roomTypeId}__${date}`;
}

const PriceCalendarPage: React.FC<PriceCalendarPageProps> = ({
  selectedPropertyId,
  selectedPropertyName,
  selectedOrgId,
}) => {
  const [roomTypes, setRoomTypes] = useState<RevenueRoomType[]>([]);
  const [prices, setPrices] = useState<Record<string, EditableCell>>({});
  const [loadingRoomTypes, setLoadingRoomTypes] = useState(false);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  const dates = useMemo(() => buildDateRange(14), []);
  const from = dates[0];
  const to = dates[dates.length - 1];

  const propertyTitle = useMemo(() => {
    return selectedPropertyName || "la propiedad seleccionada";
  }, [selectedPropertyName]);

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
      return;
    }

    try {
      setLoadingPrices(true);
      setPageError(null);

      const rows = await getRoomPrices(selectedPropertyId, from, to);
      const map: Record<string, EditableCell> = {};

      rows.forEach((row: RevenueRoomPrice) => {
        map[cellKey(row.roomTypeId, row.date)] = {
          price: String(row.price ?? 0),
          minStay: String(row.minStay ?? 1),
          closed: row.closed,
          dirty: false,
          saving: false,
        };
      });

      setPrices(map);
    } catch (e: any) {
      setPageError(e?.message ?? "No se pudieron cargar los precios");
      setPrices({});
    } finally {
      setLoadingPrices(false);
    }
  }, [selectedPropertyId, from, to]);

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
        };

        return {
          ...prev,
          [key]: {
            ...current,
            ...patch,
            dirty: true,
          },
        };
      });
    },
    []
  );

  const saveCell = useCallback(
    async (roomType: RevenueRoomType, date: string) => {
      if (!selectedPropertyId || !selectedOrgId) {
        alert("Falta la propiedad o la organización seleccionada.");
        return;
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
        alert("El precio debe ser un número válido mayor o igual a 0.");
        return;
      }

      if (!Number.isInteger(parsedMinStay) || parsedMinStay < 1) {
        alert("La estancia mínima debe ser un entero mayor o igual a 1.");
        return;
      }

      setPrices((prev) => ({
        ...prev,
        [key]: {
          ...current,
          saving: true,
        },
      }));

      try {
        const saved = await upsertRoomPrice({
          org_id: selectedOrgId,
          property_id: selectedPropertyId,
          room_type_id: roomType.id,
          date,
          price: parsedPrice,
          min_stay: parsedMinStay,
          closed: current.closed,
        });

        setPrices((prev) => ({
          ...prev,
          [key]: {
            price: String(saved.price ?? 0),
            minStay: String(saved.minStay ?? 1),
            closed: saved.closed,
            dirty: false,
            saving: false,
          },
        }));
      } catch (e: any) {
        alert(e?.message ?? "No se pudo guardar el precio");

        setPrices((prev) => ({
          ...prev,
          [key]: {
            ...current,
            saving: false,
          },
        }));
      }
    },
    [prices, selectedOrgId, selectedPropertyId]
  );

  if (!selectedPropertyId) {
    return (
      <div className="bg-white rounded-3xl border border-gray-200 p-10 text-center text-gray-500">
        Selecciona una propiedad para gestionar su calendario de precios.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calendario de Precios</h1>
          <p className="text-gray-500">
            Configura precio diario, estancia mínima y cierres para {propertyTitle}
          </p>
        </div>

        <button
          type="button"
          onClick={() => setRefreshTick((v) => v + 1)}
          className="flex items-center gap-2 px-5 py-3 bg-gray-900 text-white rounded-2xl font-bold hover:bg-gray-800 transition-all shadow-lg shadow-gray-200"
        >
          <RefreshCcw size={18} />
          Recargar
        </button>
      </div>

      {pageError && (
        <div className="flex items-center gap-3 bg-rose-50 text-rose-700 px-4 py-3 rounded-2xl border border-rose-100">
          <AlertTriangle size={18} />
          <span className="text-sm font-semibold">{pageError}</span>
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50 flex flex-wrap gap-6 text-sm text-gray-600">
          <div>
            <span className="font-semibold text-gray-900">Desde:</span> {from}
          </div>
          <div>
            <span className="font-semibold text-gray-900">Hasta:</span> {to}
          </div>
          <div>
            <span className="font-semibold text-gray-900">Días:</span> {dates.length}
          </div>
        </div>

        {(loadingRoomTypes || loadingPrices) && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-gray-500">
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
            <table className="w-full text-sm text-left min-w-max">
              <thead className="bg-gray-50 text-gray-500 font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="sticky left-0 z-20 bg-gray-50 px-8 py-5 min-w-[260px]">
                    Tipo de habitación
                  </th>

                  {dates.map((date) => (
                    <th
                      key={date}
                      className="px-4 py-5 text-center min-w-[190px]"
                    >
                      <div className="font-bold text-gray-800">{prettyDayLabel(date)}</div>
                      <div className="text-[10px] lowercase text-gray-500">
                        {weekdayLabel(date)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-gray-100">
                {roomTypes.map((roomType) => (
                  <tr key={roomType.id} className="hover:bg-gray-50 transition-colors">
                    <td className="sticky left-0 z-10 bg-white px-8 py-5 align-top border-r border-gray-100">
                      <div className="font-bold text-gray-900">{roomType.name}</div>
                      <div className="text-xs text-gray-500 mt-1">Código: {roomType.code}</div>
                      <div className="text-xs text-gray-500">Capacidad: {roomType.capacity ?? 0} pax</div>
                      <div className="text-xs text-gray-500">
                        Habitaciones: {roomType.roomsCount ?? 0}
                      </div>
                      <div className="text-xs font-bold text-gray-700 mt-1">
                        Base: {Number(roomType.basePrice ?? 0).toFixed(2)} €
                      </div>
                    </td>

                    {dates.map((date) => {
                      const cell = getCell(roomType, date);

                      return (
                        <td key={date} className="px-3 py-4 align-top">
                          <div className="space-y-2 rounded-2xl border border-gray-100 p-3 bg-white">
                            <div>
                              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                                Precio
                              </label>
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
                                className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm font-semibold"
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
                                Min stay
                              </label>
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
                                className="w-full px-3 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-sm"
                              />
                            </div>

                            <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
                              <input
                                type="checkbox"
                                checked={cell.closed}
                                onChange={(e) =>
                                  updateCell(roomType.id, date, {
                                    closed: e.target.checked,
                                  })
                                }
                              />
                              Cerrado
                            </label>

                            <button
                              type="button"
                              onClick={() => void saveCell(roomType, date)}
                              disabled={!!cell.saving}
                              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all disabled:opacity-60"
                            >
                              {cell.saving ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  Guardando...
                                </>
                              ) : (
                                <>
                                  <Save size={14} />
                                  {cell.dirty ? "Guardar" : "Reguardar"}
                                </>
                              )}
                            </button>
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