import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Hotel,
  Loader2,
  Lock,
  LockOpen,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  SlidersHorizontal,
  Wand2,
  X,
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

import {
  getRevenueCalendarContext,
  type RevenueCalendarContextRow,
} from "../services/revenueCalendarContext.service";

import { applyPricingRule } from "../services/revenuePricing.service";

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

type BulkScope = "ONE" | "MULTIPLE" | "ALL_VISIBLE";
type BulkDateMode = "VISIBLE_RANGE" | "CUSTOM_RANGE" | "WEEKENDS" | "WEEKDAYS";
type BulkStateMode = "NO_CHANGE" | "OPEN" | "CLOSED";

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

function normalizePriceInput(raw: string): string {
  const normalized = raw.replace(",", ".").replace(/[^\d.]/g, "");
  const firstDot = normalized.indexOf(".");
  if (firstDot === -1) return normalized;
  const intPart = normalized.slice(0, firstDot + 1);
  const decimals = normalized.slice(firstDot + 1).replace(/\./g, "");
  return intPart + decimals;
}

function isValidPriceInput(raw: string): boolean {
  if (!raw.trim()) return false;
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) && n >= 0;
}

function toDbPrice(raw: string): number {
  return Number(Number(raw.replace(",", ".")).toFixed(2));
}

function toVisualPrice(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  if (Number.isInteger(n)) return String(n);
  return String(n);
}

function toSafeMinStay(raw: string): boolean {
  if (!raw.trim()) return false;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1;
}

function unique<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

function markerLabel(row: RevenueCalendarContextRow) {
  if (row.source_type === "EVENT") return row.name;
  if (row.item_type === "HIGH" || row.item_type === "PEAK") return "Temporada alta";
  if (row.item_type === "LOW") return "Temporada baja";
  if (row.item_type === "MID") return "Temporada media";
  return row.name;
}

function getContextPricingLabel(row?: RevenueCalendarContextRow | null) {
  if (!row) return "";
  const operation = (row as any).pricing_operation ?? null;
  const adjustmentType = (row as any).pricing_adjustment_type ?? null;
  const adjustmentValue = (row as any).pricing_adjustment_value ?? null;

  if (!operation || !adjustmentType || adjustmentValue == null) return "";

  const value =
    adjustmentType === "PERCENT" ? `${adjustmentValue}%` : `${adjustmentValue}€`;

  if (operation === "INCREASE") return `+${value}`;
  if (operation === "DECREASE") return `-${value}`;
  if (operation === "SET") return `=${value}`;
  return "";
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

  const [calendarContext, setCalendarContext] = useState<RevenueCalendarContextRow[]>([]);
  const [loadingCalendarContext, setLoadingCalendarContext] = useState(false);

  const [loadingRoomTypes, setLoadingRoomTypes] = useState(false);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [savingAll, setSavingAll] = useState(false);

  const [pageError, setPageError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [roomTypeFilter, setRoomTypeFilter] = useState("");

  const [bulkDrawerOpen, setBulkDrawerOpen] = useState(false);

  const [bulkScope, setBulkScope] = useState<BulkScope>("ALL_VISIBLE");
  const [bulkDateMode, setBulkDateMode] = useState<BulkDateMode>("VISIBLE_RANGE");

  const [bulkOneRoomTypeId, setBulkOneRoomTypeId] = useState<string>("");
  const [bulkMultipleRoomTypeIds, setBulkMultipleRoomTypeIds] = useState<string[]>([]);

  const [bulkCustomFrom, setBulkCustomFrom] = useState(initialRange.from);
  const [bulkCustomTo, setBulkCustomTo] = useState(initialRange.to);

  const [bulkApplyPrice, setBulkApplyPrice] = useState(false);
  const [bulkPrice, setBulkPrice] = useState("");

  const [bulkApplyMinStay, setBulkApplyMinStay] = useState(false);
  const [bulkMinStay, setBulkMinStay] = useState("1");

  const [bulkStateMode, setBulkStateMode] = useState<BulkStateMode>("NO_CHANGE");

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
      return rt.name.toLowerCase().includes(q) || rt.code.toLowerCase().includes(q);
    });
  }, [roomTypes, roomTypeFilter]);

  const calendarContextByDate = useMemo(() => {
    const map = new Map<string, RevenueCalendarContextRow>();
    calendarContext.forEach((row) => {
      map.set(row.calendar_date, row);
    });
    return map;
  }, [calendarContext]);

  const visibleLegend = useMemo(() => {
    const map = new Map<string, RevenueCalendarContextRow>();

    calendarContext.forEach((row) => {
      const key = `${row.source_type}__${row.name}__${row.color}`;
      if (!map.has(key)) {
        map.set(key, row);
      }
    });

    return Array.from(map.values()).sort((a, b) => a.priority - b.priority);
  }, [calendarContext]);

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

      if (rows.length > 0) {
        setBulkOneRoomTypeId((prev) => prev || rows[0].id);
        setBulkMultipleRoomTypeIds((prev) => (prev.length ? prev : [rows[0].id]));
      }
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
          price: toVisualPrice(row.price),
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

  const loadCalendarContext = useCallback(async () => {
    if (!selectedPropertyId) {
      setCalendarContext([]);
      return;
    }

    try {
      setLoadingCalendarContext(true);

      const rows = await getRevenueCalendarContext({
        propertyId: selectedPropertyId,
        from: appliedFrom,
        to: appliedTo,
      });

      setCalendarContext(rows);
    } catch (e: any) {
      setPageError(e?.message ?? "No se pudo cargar el contexto del calendario");
      setCalendarContext([]);
    } finally {
      setLoadingCalendarContext(false);
    }
  }, [selectedPropertyId, appliedFrom, appliedTo]);

  useEffect(() => {
    void loadRoomTypes();
  }, [loadRoomTypes, refreshTick]);

  useEffect(() => {
    void loadPrices();
  }, [loadPrices, refreshTick]);

  useEffect(() => {
    void loadCalendarContext();
  }, [loadCalendarContext, refreshTick]);

  const getCalculatedDefaultPrice = useCallback(
    (roomType: RevenueRoomType, date: string): string => {
      const context = calendarContextByDate.get(date);

      const calculated = applyPricingRule(roomType.basePrice ?? 0, {
        pricingOperation: (context as any)?.pricing_operation ?? null,
        pricingAdjustmentType: (context as any)?.pricing_adjustment_type ?? null,
        pricingAdjustmentValue: (context as any)?.pricing_adjustment_value ?? null,
      });

      return toVisualPrice(calculated ?? roomType.basePrice ?? 0);
    },
    [calendarContextByDate]
  );

  const getCell = useCallback(
    (roomType: RevenueRoomType, date: string): EditableCell => {
      const key = cellKey(roomType.id, date);

      return (
        prices[key] ?? {
          price: getCalculatedDefaultPrice(roomType, date),
          minStay: "1",
          closed: false,
          dirty: false,
          saving: false,
          saved: false,
        }
      );
    },
    [prices, getCalculatedDefaultPrice]
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
        price: getCalculatedDefaultPrice(roomType, date),
        minStay: "1",
        closed: false,
      };

      if (!isValidPriceInput(current.price)) {
        throw new Error(`Precio inválido en ${roomType.name} (${date}).`);
      }

      if (!toSafeMinStay(current.minStay)) {
        throw new Error(`Min stay inválido en ${roomType.name} (${date}).`);
      }

      const parsedPrice = toDbPrice(current.price);
      const parsedMinStay = Number(current.minStay);

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
        price: toVisualPrice(saved.price),
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
      }, 900);
    },
    [prices, selectedOrgId, selectedPropertyId, getCalculatedDefaultPrice]
  );

  const saveClosedState = useCallback(
    async (roomType: RevenueRoomType, date: string, nextClosed: boolean) => {
      if (!selectedPropertyId || !selectedOrgId) {
        throw new Error("Falta la propiedad o la organización seleccionada.");
      }

      const key = cellKey(roomType.id, date);
      const current = prices[key] ?? {
        price: getCalculatedDefaultPrice(roomType, date),
        minStay: "1",
        closed: false,
      };

      if (!isValidPriceInput(current.price)) {
        throw new Error(`Precio inválido en ${roomType.name} (${date}).`);
      }

      if (!toSafeMinStay(current.minStay)) {
        throw new Error(`Min stay inválido en ${roomType.name} (${date}).`);
      }

      const parsedPrice = toDbPrice(current.price);
      const parsedMinStay = Number(current.minStay);

      setPrices((prev) => ({
        ...prev,
        [key]: {
          ...(prev[key] ?? current),
          closed: nextClosed,
          dirty: true,
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
        closed: nextClosed,
      });

      const nextCell: EditableCell = {
        price: toVisualPrice(saved.price),
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
      }, 900);
    },
    [prices, selectedOrgId, selectedPropertyId, getCalculatedDefaultPrice]
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

    if (diffDays > 60) {
      alert("No conviene cargar más de 60 días de golpe en esta versión.");
      return;
    }

    setAppliedFrom(dateFrom);
    setAppliedTo(dateTo);
    setRefreshTick((v) => v + 1);
  }, [dateFrom, dateTo]);

  const shiftRange = useCallback(
    (days: number) => {
      const fromDate = parseLocalDate(appliedFrom);
      const toDate = parseLocalDate(appliedTo);

      const nextFrom = formatDate(addDays(fromDate, days));
      const nextTo = formatDate(addDays(toDate, days));

      setDateFrom(nextFrom);
      setDateTo(nextTo);
      setAppliedFrom(nextFrom);
      setAppliedTo(nextTo);
      setRefreshTick((v) => v + 1);
    },
    [appliedFrom, appliedTo]
  );

  const handleGoToday = useCallback(() => {
    const next = makeDefaultRange();
    setDateFrom(next.from);
    setDateTo(next.to);
    setAppliedFrom(next.from);
    setAppliedTo(next.to);
    setRefreshTick((v) => v + 1);
  }, []);

  const handleCopyRowBase = useCallback(
    (roomType: RevenueRoomType) => {
      dates.forEach((date) => {
        updateCell(roomType.id, date, {
          price: toVisualPrice(roomType.basePrice ?? 0),
          minStay: "1",
          closed: false,
        });
      });
    },
    [dates, updateCell]
  );

  const handleCopyCalculatedRow = useCallback(
    (roomType: RevenueRoomType) => {
      dates.forEach((date) => {
        updateCell(roomType.id, date, {
          price: getCalculatedDefaultPrice(roomType, date),
          minStay: "1",
          closed: false,
        });
      });
    },
    [dates, updateCell, getCalculatedDefaultPrice]
  );

  const bulkTargetRoomTypeIds = useMemo(() => {
    if (bulkScope === "ALL_VISIBLE") {
      return filteredRoomTypes.map((rt) => rt.id);
    }

    if (bulkScope === "ONE") {
      return bulkOneRoomTypeId ? [bulkOneRoomTypeId] : [];
    }

    return unique(bulkMultipleRoomTypeIds).filter(Boolean);
  }, [bulkScope, filteredRoomTypes, bulkOneRoomTypeId, bulkMultipleRoomTypeIds]);

  const bulkTargetDates = useMemo(() => {
    if (bulkDateMode === "VISIBLE_RANGE") return dates;
    if (bulkDateMode === "WEEKENDS") return dates.filter(isWeekend);
    if (bulkDateMode === "WEEKDAYS") return dates.filter((d) => !isWeekend(d));

    if (!bulkCustomFrom || !bulkCustomTo || bulkCustomFrom > bulkCustomTo) return [];
    return buildDateRange(bulkCustomFrom, bulkCustomTo);
  }, [bulkCustomFrom, bulkCustomTo, bulkDateMode, dates]);

  const handleApplyBulk = useCallback(() => {
    if (!bulkTargetRoomTypeIds.length) {
      alert("No hay tipos de habitación seleccionados.");
      return;
    }

    if (!bulkTargetDates.length) {
      alert("No hay fechas válidas seleccionadas para la edición masiva.");
      return;
    }

    if (!bulkApplyPrice && !bulkApplyMinStay && bulkStateMode === "NO_CHANGE") {
      alert("No has definido ningún cambio para aplicar.");
      return;
    }

    if (bulkApplyPrice && !isValidPriceInput(bulkPrice)) {
      alert("El precio masivo no es válido.");
      return;
    }

    if (bulkApplyMinStay && !toSafeMinStay(bulkMinStay)) {
      alert("La estancia mínima masiva no es válida.");
      return;
    }

    bulkTargetRoomTypeIds.forEach((roomTypeId) => {
      bulkTargetDates.forEach((date) => {
        const patch: Partial<EditableCell> = {};

        if (bulkApplyPrice) patch.price = normalizePriceInput(bulkPrice);
        if (bulkApplyMinStay) patch.minStay = bulkMinStay.replace(/[^\d]/g, "");
        if (bulkStateMode === "OPEN") patch.closed = false;
        if (bulkStateMode === "CLOSED") patch.closed = true;

        updateCell(roomTypeId, date, patch);
      });
    });

    setBulkDrawerOpen(false);
  }, [
    bulkApplyMinStay,
    bulkApplyPrice,
    bulkMinStay,
    bulkPrice,
    bulkStateMode,
    bulkTargetDates,
    bulkTargetRoomTypeIds,
    updateCell,
  ]);

  if (!selectedPropertyId) {
    return (
      <div className="bg-white rounded-3xl border border-gray-200 p-10 text-center text-gray-500">
        Selecciona una propiedad para gestionar su calendario de precios.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm">
        <div className="px-4 py-3 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 border-b border-gray-100">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900">Calendario de Precios</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Pricing diario, estancia mínima y cierres para {propertyTitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => shiftRange(-1)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <ChevronLeft size={13} />
              Día anterior
            </button>

            <button
              type="button"
              onClick={handleGoToday}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <CalendarDays size={13} />
              Hoy
            </button>

            <button
              type="button"
              onClick={() => shiftRange(1)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Día siguiente
              <ChevronRight size={13} />
            </button>

            <button
              type="button"
              onClick={() => setRefreshTick((v) => v + 1)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              <RefreshCcw size={13} />
              Recargar
            </button>
          </div>
        </div>

        <div className="px-4 py-3 flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 ml-1">
              Desde
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 ml-1">
              Hasta
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleApplyRange}
            className="inline-flex items-center gap-2 px-4 py-1.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-gray-800"
          >
            Aplicar rango
          </button>

          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <span className="font-semibold text-slate-900">Desde:</span> {appliedFrom}
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <span className="font-semibold text-slate-900">Hasta:</span> {appliedTo}
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <span className="font-semibold text-slate-900">Días:</span> {dates.length}
            </div>
          </div>
        </div>
      </div>

      {pageError && (
        <div className="flex items-center gap-3 bg-rose-50 text-rose-700 px-4 py-2.5 rounded-2xl border border-rose-100">
          <AlertTriangle size={14} />
          <span className="text-xs font-semibold">{pageError}</span>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm px-4 py-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setBulkDrawerOpen(true)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50"
              >
                <SlidersHorizontal size={13} />
                Edición masiva
              </button>

              <div
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-2xl border text-xs font-semibold ${
                  hasPendingChanges
                    ? "bg-amber-50 text-amber-700 border-amber-200"
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                }`}
              >
                {hasPendingChanges ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
                {hasPendingChanges
                  ? `${pendingCount} pendiente${pendingCount === 1 ? "" : "s"}`
                  : "Sin cambios"}
              </div>

              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={roomTypeFilter}
                  onChange={(e) => setRoomTypeFilter(e.target.value)}
                  placeholder="Filtrar tipo..."
                  className="pl-8 pr-3 py-1.5 rounded-xl border border-gray-200 text-xs w-[170px] focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleDiscardChanges}
                disabled={!hasPendingChanges || savingAll}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                <RotateCcw size={13} />
                Descartar
              </button>

              <button
                type="button"
                onClick={() => void handleSaveAll()}
                disabled={!hasPendingChanges || savingAll}
                className="inline-flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-60"
              >
                {savingAll ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Guardando...
                  </>
                ) : (
                  <>
                    <Save size={13} />
                    Guardar cambios
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
            {visibleLegend.length === 0 ? (
              <div className="text-slate-400">Sin eventos o temporadas en el rango visible</div>
            ) : (
              visibleLegend.map((item) => (
                <div
                  key={`${item.source_type}-${(item as any).source_id ?? item.calendar_date}-${item.color}`}
                  className="inline-flex items-center gap-2"
                  title={`${item.name} · ${item.item_type}`}
                >
                  <span
                    className="w-3 h-3 rounded-full border border-slate-200"
                    style={{ backgroundColor: item.color }}
                  />
                  <span>
                    {markerLabel(item)}
                    {getContextPricingLabel(item) ? ` · ${getContextPricingLabel(item)}` : ""}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
        {(loadingRoomTypes || loadingPrices || loadingCalendarContext) && (
          <div className="flex items-center justify-center gap-2 py-5 text-xs text-gray-500 border-b border-gray-100">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando datos…
          </div>
        )}

        {!loadingRoomTypes && filteredRoomTypes.length === 0 ? (
          <div className="px-8 py-8 text-center text-gray-400">
            <Hotel size={32} className="mx-auto mb-3 opacity-20" />
            <p className="font-bold text-sm">
              {roomTypeFilter
                ? "No hay tipos que coincidan con el filtro"
                : "No hay tipos de habitación configurados"}
            </p>
          </div>
        ) : (
          <div className="max-h-[68vh] overflow-auto">
            <table className="w-full text-xs min-w-max border-collapse">
              <thead className="sticky top-0 z-20">
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="sticky left-0 z-30 bg-gray-50 text-left px-2 py-2 min-w-[160px] border-r border-gray-100">
                    <div className="text-[9px] font-black uppercase tracking-widest text-gray-500">
                      Tipo habitación
                    </div>
                  </th>

                  {dates.map((date) => {
                    const context = calendarContextByDate.get(date);

                    return (
                      <th
                        key={date}
                        className={`px-0.5 py-1 text-center min-w-[48px] border-l border-gray-100 ${
                          isWeekend(date) ? "bg-slate-100" : "bg-gray-50"
                        }`}
                      >
                        <div className="text-[12px] font-bold text-gray-900 leading-none">
                          {prettyDayLabel(date)}
                        </div>
                        <div className="text-[9px] lowercase text-gray-500 font-semibold leading-none mt-0.5">
                          {weekdayLabel(date)}
                        </div>
                        <div className="mt-1 flex items-center justify-center gap-1">
                          <span
                            className="w-2.5 h-2.5 rounded-full border border-slate-200"
                            style={{ backgroundColor: context?.color ?? "#CBD5E1" }}
                            title={
                              context
                                ? `${context.name} · ${context.item_type} · ${context.source_type}`
                                : "Sin evento/temporada"
                            }
                          />
                        </div>
                        {context && (
                          <div
                            className="mt-0.5 text-[8px] font-bold text-slate-500 leading-none"
                            title={getContextPricingLabel(context)}
                          >
                            {getContextPricingLabel(context)}
                          </div>
                        )}
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {filteredRoomTypes.map((roomType, rowIndex) => (
                  <tr key={roomType.id} className={rowIndex % 2 === 0 ? "bg-white" : "bg-slate-50/40"}>
                    <td className="sticky left-0 z-10 px-2 py-2 align-middle border-r border-b border-gray-100 bg-inherit">
                      <div className="font-bold text-gray-900 text-[11px] leading-tight">
                        {roomType.name}
                      </div>
                      <div className="mt-0.5 text-[9px] text-gray-500 leading-tight">
                        {roomType.code} · {roomType.capacity ?? 0}p · {roomType.roomsCount ?? 0}h
                      </div>
                      <div className="mt-0.5 text-[10px] font-bold text-gray-700 leading-tight">
                        Base {Number(roomType.basePrice ?? 0).toFixed(0)}€
                      </div>

                      <div className="mt-1 flex flex-wrap gap-1">
                        <button
                          type="button"
                          onClick={() => handleCopyRowBase(roomType)}
                          className="inline-flex items-center gap-1 text-[9px] text-blue-600 font-bold hover:text-blue-700"
                          title="Copiar precio base a todos los días visibles"
                        >
                          <Copy size={10} />
                          Base
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopyCalculatedRow(roomType)}
                          className="inline-flex items-center gap-1 text-[9px] text-emerald-600 font-bold hover:text-emerald-700"
                          title="Copiar precio calculado por contexto a todos los días visibles"
                        >
                          <Wand2 size={10} />
                          Regla
                        </button>
                      </div>
                    </td>

                    {dates.map((date) => {
                      const cell = getCell(roomType, date);
                      const closed = cell.closed;
                      const context = calendarContextByDate.get(date);
                      const suggestedPrice = getCalculatedDefaultPrice(roomType, date);
                      const isSuggested =
                        !prices[cellKey(roomType.id, date)] && cell.price === suggestedPrice;

                      return (
                        <td
                          key={date}
                          className={`px-0 py-0 align-middle border-l border-b border-gray-100 ${
                            closed
                              ? "bg-slate-300/70"
                              : isWeekend(date)
                              ? "bg-slate-50/70"
                              : "bg-white"
                          }`}
                        >
                          <div
                            className={`px-0.5 py-0.5 min-h-[56px] ${
                              closed
                                ? "bg-slate-300/70"
                                : cell.dirty
                                ? "bg-amber-50/70"
                                : cell.saved
                                ? "bg-emerald-50/70"
                                : "bg-transparent"
                            }`}
                          >
                            <input
                              type="text"
                              inputMode="decimal"
                              value={cell.price}
                              onChange={(e) => {
                                updateCell(roomType.id, date, {
                                  price: normalizePriceInput(e.target.value),
                                });
                              }}
                              onBlur={() => {
                                const current = getCell(roomType, date);
                                if (isValidPriceInput(current.price) && toSafeMinStay(current.minStay)) {
                                  void saveOneCell(roomType, date).catch(() => {});
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.currentTarget.blur();
                                }
                              }}
                              className={`w-full bg-transparent text-center text-[10px] leading-none font-bold outline-none ${
                                closed ? "text-slate-600" : "text-gray-900"
                              }`}
                              title={`Precio ${date}`}
                            />

                            <div className="mt-0.5 flex items-center justify-center gap-1 text-[8px] font-semibold leading-none">
                              {isSuggested ? (
                                <span className="text-emerald-700" title="Precio calculado por regla">
                                  auto
                                </span>
                              ) : (
                                <span className="text-gray-400" title="Precio grabado manualmente">
                                  fijo
                                </span>
                              )}

                              {context ? (
                                <span
                                  className="truncate max-w-[34px] text-slate-500"
                                  title={`${context.name}${getContextPricingLabel(context) ? ` · ${getContextPricingLabel(context)}` : ""}`}
                                >
                                  {context.source_type === "EVENT" ? "evt" : "tmp"}
                                </span>
                              ) : null}
                            </div>

                            <div className="mt-0.5 flex items-center justify-center gap-0.5 text-[9px] font-semibold text-gray-500 leading-none">
                              <span>MS</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                value={cell.minStay}
                                onChange={(e) => {
                                  updateCell(roomType.id, date, {
                                    minStay: e.target.value.replace(/[^\d]/g, ""),
                                  });
                                }}
                                onBlur={() => {
                                  const current = getCell(roomType, date);
                                  if (isValidPriceInput(current.price) && toSafeMinStay(current.minStay)) {
                                    void saveOneCell(roomType, date).catch(() => {});
                                  }
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.currentTarget.blur();
                                  }
                                }}
                                className={`w-4 bg-transparent text-center font-bold outline-none ${
                                  closed ? "text-slate-600" : "text-gray-700"
                                }`}
                                title={`Estancia mínima ${date}`}
                              />
                            </div>

                            <div className="mt-0.5 flex items-center justify-center">
                              <button
                                type="button"
                                onClick={async () => {
                                  const nextClosed = !cell.closed;
                                  const actionLabel = nextClosed ? "cerrar" : "abrir";

                                  const confirmed = window.confirm(
                                    `¿Quieres ${actionLabel} el día ${date} para "${roomType.name}"?`
                                  );

                                  if (!confirmed) return;

                                  try {
                                    await saveClosedState(roomType, date, nextClosed);
                                  } catch (e: any) {
                                    alert(e?.message ?? `No se pudo ${actionLabel} el día.`);
                                  }
                                }}
                                className={`inline-flex items-center justify-center rounded-md p-1.5 ${
                                  closed
                                    ? "text-slate-800 hover:bg-slate-400/40"
                                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                                }`}
                                title={
                                  closed
                                    ? `Día cerrado (${date}). Pulsa para abrir.`
                                    : `Día abierto (${date}). Pulsa para cerrar.`
                                }
                              >
                                {closed ? <Lock size={16} /> : <LockOpen size={16} />}
                              </button>
                            </div>

                            <div className="mt-0.5 h-[8px] flex items-center justify-center">
                              {cell.saving ? (
                                <Loader2 size={8} className="animate-spin text-blue-600" />
                              ) : cell.saved ? (
                                <CheckCircle2 size={8} className="text-emerald-600" />
                              ) : cell.dirty ? (
                                <AlertTriangle size={8} className="text-amber-600" />
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

      {bulkDrawerOpen && (
        <div className="fixed inset-0 z-[120]">
          <div
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]"
            onClick={() => setBulkDrawerOpen(false)}
          />

          <div className="absolute right-0 top-0 h-full w-full max-w-[460px] bg-white shadow-2xl border-l border-slate-200 flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Edición masiva</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Aplica cambios a una fila, varias o todas las visibles.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setBulkDrawerOpen(false)}
                className="inline-flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
              <div className="rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Alcance
                </div>

                <div className="space-y-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={bulkScope === "ONE"}
                      onChange={() => setBulkScope("ONE")}
                    />
                    Una fila
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={bulkScope === "MULTIPLE"}
                      onChange={() => setBulkScope("MULTIPLE")}
                    />
                    Varias filas
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={bulkScope === "ALL_VISIBLE"}
                      onChange={() => setBulkScope("ALL_VISIBLE")}
                    />
                    Todas las visibles
                  </label>
                </div>

                {bulkScope === "ONE" && (
                  <div className="mt-3">
                    <select
                      value={bulkOneRoomTypeId}
                      onChange={(e) => setBulkOneRoomTypeId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      {roomTypes.map((rt) => (
                        <option key={rt.id} value={rt.id}>
                          {rt.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {bulkScope === "MULTIPLE" && (
                  <div className="mt-3 max-h-40 overflow-auto rounded-xl border border-slate-200 bg-white p-3 space-y-2">
                    {roomTypes.map((rt) => {
                      const checked = bulkMultipleRoomTypeIds.includes(rt.id);
                      return (
                        <label key={rt.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setBulkMultipleRoomTypeIds((prev) => {
                                if (e.target.checked) return unique([...prev, rt.id]);
                                return prev.filter((x) => x !== rt.id);
                              });
                            }}
                          />
                          <span>{rt.name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Fechas
                </div>

                <div className="space-y-2 text-sm">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={bulkDateMode === "VISIBLE_RANGE"}
                      onChange={() => setBulkDateMode("VISIBLE_RANGE")}
                    />
                    Rango visible actual
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={bulkDateMode === "CUSTOM_RANGE"}
                      onChange={() => setBulkDateMode("CUSTOM_RANGE")}
                    />
                    Rango personalizado
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={bulkDateMode === "WEEKENDS"}
                      onChange={() => setBulkDateMode("WEEKENDS")}
                    />
                    Fines de semana
                  </label>

                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      checked={bulkDateMode === "WEEKDAYS"}
                      onChange={() => setBulkDateMode("WEEKDAYS")}
                    />
                    Laborables
                  </label>
                </div>

                {bulkDateMode === "CUSTOM_RANGE" && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={bulkCustomFrom}
                      onChange={(e) => setBulkCustomFrom(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                    <input
                      type="date"
                      value={bulkCustomTo}
                      onChange={(e) => setBulkCustomTo(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Cambios a aplicar
                </div>

                <div className="space-y-3">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={bulkApplyPrice}
                      onChange={(e) => setBulkApplyPrice(e.target.checked)}
                    />
                    Aplicar precio
                  </label>

                  <input
                    type="text"
                    inputMode="decimal"
                    value={bulkPrice}
                    onChange={(e) => setBulkPrice(normalizePriceInput(e.target.value))}
                    placeholder="120"
                    disabled={!bulkApplyPrice}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                  />

                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={bulkApplyMinStay}
                      onChange={(e) => setBulkApplyMinStay(e.target.checked)}
                    />
                    Aplicar estancia mínima
                  </label>

                  <input
                    type="text"
                    inputMode="numeric"
                    value={bulkMinStay}
                    onChange={(e) => setBulkMinStay(e.target.value.replace(/[^\d]/g, ""))}
                    disabled={!bulkApplyMinStay}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-slate-100"
                  />

                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
                      Estado
                    </label>
                    <select
                      value={bulkStateMode}
                      onChange={(e) => setBulkStateMode(e.target.value as BulkStateMode)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="NO_CHANGE">No tocar</option>
                      <option value="OPEN">Abrir</option>
                      <option value="CLOSED">Cerrar</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-4 py-3">
                <div className="text-[10px] font-black uppercase tracking-widest text-blue-700/70 mb-2">
                  Aviso
                </div>
                <p className="text-xs text-slate-700 leading-relaxed">
                  Si una celda no tiene precio grabado, el sistema muestra el precio calculado
                  desde la tarifa base del tipo de habitación y la regla activa de temporada o
                  evento. Cuando grabas manualmente una celda, ese precio pasa a mandar sobre la
                  sugerencia.
                </p>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-slate-100 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setBulkDrawerOpen(false)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleApplyBulk}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-bold hover:bg-gray-800"
              >
                <Wand2 size={14} />
                Aplicar cambios
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PriceCalendarPage;