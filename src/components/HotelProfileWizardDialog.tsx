// src/components/HotelProfileWizardDialog.tsx
import React, { useEffect, useMemo, useState } from "react";
import { X, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import {
  getHotelProfile,
  upsertHotelProfile,
} from "@/services/debacu_eval_hotel_profile.service";
import {
  listIncidentCatalog,
  // listItemCatalog, // ya no lo usamos directamente si hacemos merge por customer
  upsertHotelPricingOverrides,
  // ✅ NUEVAS (añádelas en el service)
  listHotelMergedItems,
  upsertHotelItemCatalogForCustomer,
} from "@/services/debacu_eval_pricing_catalog.service";

type PropertyType = "HOTEL" | "RURAL_HOUSE" | "HOSTEL" | "APARTMENTS" | "OTHER";
type WizardStepKey =
  | "IDENTIDAD"
  | "UBICACION"
  | "OPERACION"
  | "TEMPORADAS"
  | "CATALOGOS"
  | "FIN";

type WizardModel = {
  hotel_name: string;
  property_type: PropertyType | "";
  hotel_category: number | "";
  country: string;
  province: string;
  city: string;
  currency: string; // "EUR" default
  monthly_stays_estimated: number | "";
  adr_real: number | "";
  season_mult_high: number;
  season_mult_low: number;
};

type IncidentRow = {
  incident_type: string;
  title: string;
  description: string | null;
  severity: number | null;
  default_gross_min: number | null;
  default_gross_max: number | null;
  default_recovery_pct: number | null;
  suggested_actions: string | null;
  is_active: boolean;
  override: {
    unit_price_override: number | null;
    gross_min_override: number | null;
    gross_max_override: number | null;
    recovery_pct_override: number | null;
    notes: string | null;
    is_active: boolean;
  } | null;
};

type ItemRow = {
  item_code: string;
  title: string;
  category: string;
  unit_price: number;
  currency: string;
  description: string | null;
  is_active: boolean;
  unit_price_override: number | null;
  effective_unit_price: number;
};

type PricingOverrideDraft = {
  incident_type: string | null;
  item_code: string | null;
  unit_price_override: number | null;
  gross_min_override: number | null;
  gross_max_override: number | null;
  recovery_pct_override: number | null;
  notes: string | null;
  is_active: boolean;
};

// ----------------------- helpers -----------------------
function clampTextLive(s: string, max: number) {
  const t = String(s ?? "");
  return t.length > max ? t.slice(0, max) : t;
}
function clampTextSave(s: string, max: number) {
  const t = String(s ?? "").trim();
  return t.length > max ? t.slice(0, max) : t;
}
function clampText(s: string, max: number) {
  const t = String(s ?? "").trim();
  return t.length > max ? t.slice(0, max) : t;
}
function upper(s: string) {
  return String(s ?? "").trim().toUpperCase();
}
function asNumberOrEmpty(v: any): number | "" {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : "";
}
function asIntOrEmpty(v: any): number | "" {
  const n = asNumberOrEmpty(v);
  if (n === "") return "";
  return Math.trunc(Number(n));
}
function pickStr(v: any): string {
  return String(v ?? "").trim();
}
function safeNum(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function keyIncident(t: string) {
  return `I|${t}`;
}
function keyItem(c: string) {
  return `T|${c}`;
}
function methodForIncident(
  i: IncidentRow,
): "PERCENTAGE" | "RANGE" | "MULTIPLIER" | "CATALOG" {
  if (i.incident_type === "MISSING_ITEMS") return "CATALOG";
  if (i.default_gross_min != null || i.default_gross_max != null) return "RANGE";
  if (i.default_recovery_pct != null) return "PERCENTAGE";
  return "MULTIPLIER";
}

function computeMissingLocal(m: WizardModel) {
  const missing: string[] = [];
  if (!m.hotel_name) missing.push("Nombre del hotel");
  if (!m.property_type) missing.push("Tipo de alojamiento");
  if (!m.hotel_category) missing.push("Categoría (estrellas)");
  if (!m.country) missing.push("País");
  if (!m.province) missing.push("Provincia");
  if (!m.city) missing.push("Ciudad");
  if (!m.monthly_stays_estimated) missing.push("Estancias/mes (estimación)");
  if (!m.adr_real) missing.push("ADR real (€/noche)");
  if (!m.currency) missing.push("Moneda");
  return { missing, is_complete: missing.length === 0 };
}

function stepMissing(step: WizardStepKey, m: WizardModel) {
  const miss: string[] = [];
  if (step === "IDENTIDAD") {
    if (!m.hotel_name) miss.push("Nombre del hotel");
    if (!m.property_type) miss.push("Tipo de alojamiento");
    if (!m.hotel_category) miss.push("Categoría (estrellas)");
  }
  if (step === "UBICACION") {
    if (!m.country) miss.push("País");
    if (!m.province) miss.push("Provincia");
    if (!m.city) miss.push("Ciudad");
    if (!m.currency) miss.push("Moneda");
  }
  if (step === "OPERACION") {
    if (!m.monthly_stays_estimated) miss.push("Estancias/mes (estimación)");
    if (!m.adr_real) miss.push("ADR real (€/noche)");
  }
  if (step === "TEMPORADAS") {
    if (!(m.season_mult_high >= 1.0 && m.season_mult_high <= 3.0))
      miss.push("Multiplicador temporada alta (1.0..3.0)");
    if (!(m.season_mult_low >= 0.5 && m.season_mult_low <= 1.0))
      miss.push("Multiplicador temporada baja (0.5..1.0)");
  }
  return miss;
}

function isCatalogsConfigured(
  incidents: IncidentRow[],
  items: ItemRow[],
  draft: Record<string, PricingOverrideDraft>,
) {
  const activeInc = incidents.filter((x) => x.is_active);
  if (activeInc.length === 0) return false;

  const allIncOk = activeInc.every((i) => {
    const k = keyIncident(i.incident_type);
    const d = draft[k];
    const hasDraft = !!d;
    const hasStored = !!i.override;
    const hasDefaults =
      i.incident_type === "MISSING_ITEMS" ||
      i.default_gross_min != null ||
      i.default_gross_max != null ||
      i.default_recovery_pct != null ||
      i.suggested_actions != null ||
      i.severity != null;

    return hasDraft || hasStored || hasDefaults;
  });
  if (!allIncOk) return false;

  const missingItemsActive = activeInc.some((i) => i.incident_type === "MISSING_ITEMS");
  if (!missingItemsActive) return true;

  const activeItems = items.filter((x) => x.is_active);
  if (activeItems.length === 0) return false;

  return true;
}

// ----------------------- catálogo UX -----------------------
type ItemCategory =
  | "Linen"
  | "Bathroom"
  | "Electronics"
  | "Room"
  | "KeysAccess"
  | "Kitchen"
  | "Furniture"
  | "Other";

const ITEM_CATEGORIES: { value: ItemCategory; label: string }[] = [
  { value: "Linen", label: "Lencería" },
  { value: "Bathroom", label: "Baño" },
  { value: "Electronics", label: "Electrónica" },
  { value: "Room", label: "Habitación" },
  { value: "KeysAccess", label: "Llaves / Acceso" },
  { value: "Kitchen", label: "Cocina" },
  { value: "Furniture", label: "Mobiliario" },
  { value: "Other", label: "Otros" },
];

// artículos estándar (si no tienes seed aún, puedes usarlo para UX igualmente)
const PREDEFINED_ITEMS: Array<{
  item_code: string;
  title: string;
  category: ItemCategory;
  suggested_price: number;
}> = [
  { item_code: "TOWEL_SMALL", title: "Toalla pequeña", category: "Linen", suggested_price: 6 },
  { item_code: "TOWEL_LARGE", title: "Toalla grande", category: "Linen", suggested_price: 10 },
  { item_code: "BATHROBE", title: "Albornoz", category: "Linen", suggested_price: 28 },
  { item_code: "SHEET_SET", title: "Juego de sábanas", category: "Linen", suggested_price: 35 },
  { item_code: "PILLOW", title: "Almohada", category: "Linen", suggested_price: 18 },
  { item_code: "DUVET", title: "Edredón", category: "Linen", suggested_price: 55 },
  { item_code: "TV_REMOTE", title: "Mando TV", category: "Electronics", suggested_price: 18 },
  { item_code: "HAIR_DRYER", title: "Secador", category: "Electronics", suggested_price: 25 },
  { item_code: "IRON", title: "Plancha", category: "Electronics", suggested_price: 30 },
  { item_code: "ROOM_KEY", title: "Llave / tarjeta habitación", category: "KeysAccess", suggested_price: 8 },
];

// ----------------------- component -----------------------
export type HotelProfileWizardDialogProps = {
  open: boolean;
  onClose: () => void;
  onCompleted?: () => void;
};

export const HotelProfileWizardDialog: React.FC<HotelProfileWizardDialogProps> = ({
  open,
  onClose,
  onCompleted,
}) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [apiMissing, setApiMissing] = useState<string[]>([]);
  const [apiIsComplete, setApiIsComplete] = useState<boolean>(false);

  const [step, setStep] = useState<WizardStepKey>("IDENTIDAD");
  const [message, setMessage] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState<string>("");

  const [incidents, setIncidents] = useState<IncidentRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [pricingDraft, setPricingDraft] = useState<Record<string, PricingOverrideDraft>>({});

  const [catalogBootstrapping, setCatalogBootstrapping] = useState(false);

  // alta rápida (predefinido)
  const [selectedPredefinedCode, setSelectedPredefinedCode] = useState<string>("");

  // alta custom (opcional)
  const [newItem, setNewItem] = useState({
    item_code: "",
    title: "",
    category: "Linen" as ItemCategory,
    unit_price: "",
    currency: "EUR",
  });

  const [model, setModel] = useState<WizardModel>({
    hotel_name: "",
    property_type: "",
    hotel_category: "",
    country: "",
    province: "",
    city: "",
    currency: "EUR",
    monthly_stays_estimated: "",
    adr_real: "",
    season_mult_high: 1.25,
    season_mult_low: 0.9,
  });

  const stepMiss = useMemo(() => stepMissing(step, model), [step, model]);
  const canNext = useMemo(() => stepMiss.length === 0 && !saving, [stepMiss.length, saving]);

  const catalogsOk = useMemo(
    () => isCatalogsConfigured(incidents, items, pricingDraft),
    [incidents, items, pricingDraft],
  );

  const computedAllMissing = useMemo(() => {
    const base = computeMissingLocal(model).missing;
    const extra = [...base];
    if (!catalogsOk) extra.push("Configuración económica (incidencias y catálogo)");
    return { missing: extra, is_complete: extra.length === 0 };
  }, [model, catalogsOk]);

  const reloadCatalogs = async (cid: string) => {
    const [incRes, itemRes] = await Promise.all([
      listIncidentCatalog(),
      cid ? listHotelMergedItems(cid) : Promise.resolve({ items: [] }),
    ]);

    setIncidents(Array.isArray((incRes as any)?.incidents) ? (incRes as any).incidents : []);
    setItems(Array.isArray((itemRes as any)?.items) ? (itemRes as any).items : []);
  };

  // ---------------- load when open ----------------
useEffect(() => {
  if (!open) return;
  let cancelled = false;

  (async () => {
    setLoading(true);
    setMessage(null);

    try {
      const res = await getHotelProfile();
      if (cancelled) return;

      const customer = (res as any)?.customer ?? null;
      const p = (res as any)?.profile ?? null;

      const cid =
        (customer?.id ? String(customer.id) : "") ||
        (p?.customer_id ? String(p.customer_id) : "") ||
        (p?.customerId ? String(p.customerId) : "");

      if (!cid) {
        setMessage(
          "No tengo customerId. getHotelProfile() debe devolver { customer: { id }, profile: { customer_id } }. Revisa el service: probablemente estás devolviendo el wrapper y no data."
        );
        setLoading(false);
        return;
      }

      setCustomerId(cid);

      const m: WizardModel = {
        hotel_name: pickStr(p?.hotel_name) || pickStr(p?.hotelName) || pickStr(customer?.name) || "",
        property_type: ((pickStr(p?.property_type) || pickStr(p?.propertyType) || "") as any),
        hotel_category: ((asIntOrEmpty(p?.hotel_category) as any) ?? (asIntOrEmpty(p?.hotelCategory) as any) ?? ""),
        country: pickStr(p?.country) || "",
        province: pickStr(p?.province) || "",
        city: pickStr(p?.city) || "",
        currency: (pickStr(p?.currency) || "EUR").toUpperCase().slice(0, 3),
        monthly_stays_estimated:
          ((asIntOrEmpty(p?.monthly_stays_estimated) as any) ??
            (asIntOrEmpty(p?.monthlyStaysEstimated) as any) ??
            ""),
        adr_real: ((asNumberOrEmpty(p?.adr_real) as any) ?? (asNumberOrEmpty(p?.adrReal) as any) ?? ""),
        season_mult_high: Number(p?.season_mult_high ?? p?.seasonMultHigh ?? 1.25),
        season_mult_low: Number(p?.season_mult_low ?? p?.seasonMultLow ?? 0.9),
      };

      setModel((prev) => ({
        ...prev,
        hotel_name: m.hotel_name || prev.hotel_name,
        property_type: (m.property_type || prev.property_type) as any,
        hotel_category: (m.hotel_category !== "" ? m.hotel_category : prev.hotel_category) as any,
        country: m.country || prev.country,
        province: m.province || prev.province,
        city: m.city || prev.city,
        currency: m.currency || prev.currency || "EUR",
        monthly_stays_estimated:
          (m.monthly_stays_estimated !== "" ? m.monthly_stays_estimated : prev.monthly_stays_estimated) as any,
        adr_real: (m.adr_real !== "" ? m.adr_real : prev.adr_real) as any,
        season_mult_high: Number.isFinite(m.season_mult_high) ? m.season_mult_high : (prev.season_mult_high ?? 1.25),
        season_mult_low: Number.isFinite(m.season_mult_low) ? m.season_mult_low : (prev.season_mult_low ?? 0.9),
      }));

      await reloadCatalogs(cid);

      const missingFromGet = (res as any)?.profile?.missing;
      const isCompleteFromGet = (res as any)?.profile?.is_complete;

      if (Array.isArray(missingFromGet)) {
        setApiMissing(missingFromGet);
        setApiIsComplete(Boolean(isCompleteFromGet));
      } else {
        const local = computeMissingLocal(m);
        setApiMissing(local.missing);
        setApiIsComplete(local.is_complete);
      }

      const missIdentity = stepMissing("IDENTIDAD", m);
      const missLoc = stepMissing("UBICACION", m);
      const missOp = stepMissing("OPERACION", m);
      const missTemp = stepMissing("TEMPORADAS", m);

      if (missIdentity.length) setStep("IDENTIDAD");
      else if (missLoc.length) setStep("UBICACION");
      else if (missOp.length) setStep("OPERACION");
      else if (missTemp.length) setStep("TEMPORADAS");
      else setStep("CATALOGOS");
    } catch (e: any) {
      console.error(e);
      setMessage("No se pudo cargar la configuración del hotel.");
    } finally {
      if (!cancelled) setLoading(false);
    }
  })();

  return () => {
    cancelled = true;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [open]);


  // ---------------- save profile ----------------
  const doUpsertProfile = async () => {
    const payload = {
      hotel_name: clampTextSave(model.hotel_name, 120),
      country: clampTextSave(model.country, 60),
      province: clampTextSave(model.province, 60),
      city: clampTextSave(model.city, 60),
      property_type: model.property_type || null,
      hotel_category: model.hotel_category === "" ? null : Number(model.hotel_category),
      currency: clampText(model.currency || "EUR", 3).toUpperCase(),
      monthly_stays_estimated: model.monthly_stays_estimated === "" ? null : Number(model.monthly_stays_estimated),
      adr_real: model.adr_real === "" ? null : Number(model.adr_real),
      season_mult_high: Number(model.season_mult_high ?? 1.25),
      season_mult_low: Number(model.season_mult_low ?? 0.9),
    };

    const res = await upsertHotelProfile(payload as any);
    const data = (res as any)?.data ?? (res as any)?.profile ?? null;

    const missing = Array.isArray(data?.missing) ? data.missing : computeMissingLocal(model).missing;
    const is_complete = typeof data?.is_complete === "boolean" ? data.is_complete : missing.length === 0;

    setApiMissing(missing);
    setApiIsComplete(is_complete);

    return { ok: true as const, missing, is_complete };
  };

  // ---------------- save catalogs overrides ----------------
  const doUpsertCatalogs = async () => {
    const rows = Object.values(pricingDraft).map((d) => ({
      incident_type: d.incident_type,
      item_code: d.item_code,
      unit_price_override: d.unit_price_override,
      gross_min_override: d.gross_min_override,
      gross_max_override: d.gross_max_override,
      recovery_pct_override: d.recovery_pct_override,
      notes: d.notes,
      is_active: d.is_active,
    }));

    const res = await upsertHotelPricingOverrides({ rows });
    const ok = Boolean((res as any)?.ok ?? true);
    return { ok };
  };

  // ---------------- unified save used in flow ----------------
  const doUpsert = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await doUpsertProfile();

      if (step === "CATALOGOS" || step === "FIN") {
        const c = await doUpsertCatalogs();
        if (!c.ok) {
          setMessage("No se pudo guardar la configuración económica (revisa permisos/RLS).");
          return { ok: false as const, missing: [] as string[], is_complete: false };
        }
      }

      const missingAll = computedAllMissing.missing;
      const isCompleteAll = missingAll.length === 0;

      setApiMissing(missingAll);
      setApiIsComplete(isCompleteAll);

      return { ok: true as const, missing: missingAll, is_complete: isCompleteAll };
    } catch (e: any) {
      console.error(e);
      setMessage("No se pudo guardar. Revisa sesión/permisos.");
      return { ok: false as const, missing: [] as string[], is_complete: false };
    } finally {
      setSaving(false);
    }
  };

  const next = async () => {
    if (step === "FIN") return;
    if (step !== "CATALOGOS" && stepMiss.length) return;

    if (step === "CATALOGOS" && !catalogsOk) {
      setMessage("Completa la configuración económica (incidencias y/o catálogo) para continuar.");
      return;
    }

    const saved = await doUpsert();
    if (!saved.ok) return;

    if (step === "IDENTIDAD") setStep("UBICACION");
    else if (step === "UBICACION") setStep("OPERACION");
    else if (step === "OPERACION") setStep("TEMPORADAS");
    else if (step === "TEMPORADAS") setStep("CATALOGOS");
    else if (step === "CATALOGOS") setStep("FIN");
  };

  const back = () => {
    setMessage(null);
    if (step === "UBICACION") setStep("IDENTIDAD");
    else if (step === "OPERACION") setStep("UBICACION");
    else if (step === "TEMPORADAS") setStep("OPERACION");
    else if (step === "CATALOGOS") setStep("TEMPORADAS");
    else if (step === "FIN") setStep("CATALOGOS");
  };

  const closeGuarded = () => {
    onClose();
  };

  const finish = async () => {
    const saved = await doUpsert();
    if (!saved.ok) return;

    if (!saved.is_complete) {
      setMessage("Aún faltan datos. Completa los campos requeridos.");
      return;
    }

    setMessage(null);
    onCompleted?.();
    onClose();
  };

  // ---------------- catalog helpers (UI) ----------------
  const initDraftFromCatalogs = () => {
    const nextDraft: Record<string, PricingOverrideDraft> = { ...pricingDraft };

    for (const i of incidents) {
      if (!i.is_active) continue;

      const k = keyIncident(i.incident_type);
      if (!nextDraft[k]) {
        nextDraft[k] = {
          incident_type: i.incident_type,
          item_code: null,
          unit_price_override: null,
          gross_min_override: null,
          gross_max_override: null,
          recovery_pct_override: null,
          notes: null,
          is_active: i.override?.is_active ?? true,
        };
      }
    }

    setPricingDraft(nextDraft);
  };

  const setDraftField = (k: string, patch: Partial<PricingOverrideDraft>) => {
    setPricingDraft((prev) => {
      const cur = prev[k];
      if (!cur) return prev;
      return { ...prev, [k]: { ...cur, ...patch } };
    });
  };

  const ensureItemDraft = (item: ItemRow) => {
    const k = keyItem(item.item_code);
    setPricingDraft((prev) => {
      if (prev[k]) return prev;
      return {
        ...prev,
        [k]: {
          incident_type: "MISSING_ITEMS",
          item_code: item.item_code,
          unit_price_override: item.unit_price_override ?? null,
          gross_min_override: null,
          gross_max_override: null,
          recovery_pct_override: null,
          notes: null,
          is_active: true,
        },
      };
    });
  };

  const effectiveIncidentValueText = (i: IncidentRow) => {
    const m = methodForIncident(i);
    const o = i.override;

    if (m === "CATALOG") return "Catálogo de artículos";
    if (m === "PERCENTAGE") {
      const v = o?.recovery_pct_override ?? i.default_recovery_pct;
      return v == null ? "—" : `${Number(v)} %`;
    }
    if (m === "RANGE") {
      const a = o?.gross_min_override ?? i.default_gross_min;
      const b = o?.gross_max_override ?? i.default_gross_max;
      if (a == null && b == null) return "—";
      if (a != null && b != null) return `${Number(a)} – ${Number(b)} ${model.currency || "EUR"}`;
      if (a != null) return `≥ ${Number(a)} ${model.currency || "EUR"}`;
      return `≤ ${Number(b)} ${model.currency || "EUR"}`;
    }
    const mul = o?.unit_price_override;
    return mul == null ? "—" : String(mul).replace(".", ",");
  };

  const addPredefinedItemForHotel = async () => {
    if (!customerId) {
      setMessage("No tengo customerId. Revisa getHotelProfile() / profile.customer_id.");
      return;
    }
    if (!selectedPredefinedCode) return;

    const base = PREDEFINED_ITEMS.find((x) => x.item_code === selectedPredefinedCode);
    if (!base) return;

    setCatalogBootstrapping(true);
    setMessage(null);
    try {
      await upsertHotelItemCatalogForCustomer(customerId, {
        item_code: base.item_code,
        title: base.title,
        category: base.category,
        unit_price: base.suggested_price,
        currency: model.currency || "EUR",
        is_active: true,
      });

      await reloadCatalogs(customerId);

      setSelectedPredefinedCode("");
    } catch (e: any) {
      console.error(e);
      setMessage("No se pudo añadir el artículo. Revisa RLS/permisos.");
    } finally {
      setCatalogBootstrapping(false);
    }
  };

  const normalizeItemCode = (s: string) =>
    upper(s)
      .replace(/[^A-Z0-9_ ]/g, "")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 40);

  const addCustomItemForHotel = async () => {
    if (!customerId) {
      setMessage("No tengo customerId. Revisa getHotelProfile() / profile.customer_id.");
      return;
    }

    const item_code = normalizeItemCode(newItem.item_code || newItem.title);
    const title = clampTextSave(newItem.title, 120);
    const category = newItem.category;
    const unit_price = safeNum(newItem.unit_price);

    if (!item_code || !title || !category || unit_price == null) {
      setMessage("Completa Código/Título/Categoría/Precio para añadir el artículo.");
      return;
    }

    setCatalogBootstrapping(true);
    setMessage(null);
    try {
      await upsertHotelItemCatalogForCustomer(customerId, {
        item_code,
        title,
        category,
        unit_price,
        currency: model.currency || "EUR",
        is_active: true,
      });

      await reloadCatalogs(customerId);

      setNewItem({
        item_code: "",
        title: "",
        category: "Linen",
        unit_price: "",
        currency: model.currency || "EUR",
      });
    } catch (e: any) {
      console.error(e);
      setMessage("No se pudo añadir el artículo personalizado. Revisa si el código ya existe.");
    } finally {
      setCatalogBootstrapping(false);
    }
  };

  // ---------------- render ----------------
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={closeGuarded} />

      <div className="relative w-[min(1020px,95vw)] max-h-[90vh] overflow-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 p-6 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Completar configuración del hotel</h3>
            <p className="text-xs text-slate-500">Necesario para comparativas, auditoría y métricas. Guardado incremental.</p>
          </div>
          <button
            type="button"
            onClick={closeGuarded}
            className="rounded-xl border border-slate-200 bg-white p-2 hover:bg-slate-50"
            title="Cerrar"
          >
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
            <div className="flex items-center gap-2">
              {computedAllMissing.is_complete ? (
                <CheckCircle className="w-4 h-4 text-green-600" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              )}
              <span className="text-sm font-semibold text-slate-800">
                {computedAllMissing.is_complete ? "Completo" : "Incompleto"}
              </span>
              {!computedAllMissing.is_complete && (
                <span className="text-xs text-slate-500">Faltan: {computedAllMissing.missing.join(" · ")}</span>
              )}
            </div>

            <div className="text-[11px] text-slate-500">
              Paso:{" "}
              <span className="font-semibold text-slate-700">
                {step === "IDENTIDAD"
                  ? "Identidad"
                  : step === "UBICACION"
                  ? "Ubicación"
                  : step === "OPERACION"
                  ? "Operación"
                  : step === "TEMPORADAS"
                  ? "Temporadas"
                  : step === "CATALOGOS"
                  ? "Incidencias y Catálogo"
                  : "Finalizar"}
              </span>
            </div>
          </div>

          {message && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {message}
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
            </div>
          ) : (
            <>
              {/* IDENTIDAD */}
              {step === "IDENTIDAD" && (
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-900">Identidad</div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="text-xs font-semibold text-slate-600">Nombre del hotel *</label>
                      <input
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-400/50"
                        value={model.hotel_name}
                        onChange={(e) => setModel((p) => ({ ...p, hotel_name: clampTextLive(e.target.value, 120) }))}
                        placeholder="Ej: Hotel La Rasilla"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-600">Tipo de alojamiento *</label>
                      <select
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-400/50"
                        value={model.property_type}
                        onChange={(e) => setModel((p) => ({ ...p, property_type: e.target.value as any }))}
                      >
                        <option value="">Selecciona…</option>
                        <option value="HOTEL">Hotel</option>
                        <option value="RURAL_HOUSE">Casa rural</option>
                        <option value="HOSTEL">Hostal</option>
                        <option value="APARTMENTS">Apartamentos</option>
                        <option value="OTHER">Otro</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-600">Categoría (★) *</label>
                      <select
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-400/50"
                        value={model.hotel_category}
                        onChange={(e) =>
                          setModel((p) => ({ ...p, hotel_category: e.target.value === "" ? "" : (Number(e.target.value) as any) }))
                        }
                      >
                        <option value="">Selecciona…</option>
                        <option value={1}>1 ★</option>
                        <option value={2}>2 ★</option>
                        <option value={3}>3 ★</option>
                        <option value={4}>4 ★</option>
                        <option value={5}>5 ★</option>
                      </select>
                    </div>
                  </div>

                  {stepMiss.length > 0 && <div className="text-xs text-red-600">Falta: {stepMiss.join(" · ")}</div>}
                </div>
              )}

              {/* UBICACION */}
              {step === "UBICACION" && (
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-900">Ubicación</div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-xs font-semibold text-slate-600">País *</label>
                      <input
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-400/50"
                        value={model.country}
                        onChange={(e) => setModel((p) => ({ ...p, country: clampText(e.target.value, 60) }))}
                        placeholder="España"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Provincia *</label>
                      <input
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-400/50"
                        value={model.province}
                        onChange={(e) => setModel((p) => ({ ...p, province: clampText(e.target.value, 60) }))}
                        placeholder="Cantabria"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Ciudad *</label>
                      <input
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-400/50"
                        value={model.city}
                        onChange={(e) => setModel((p) => ({ ...p, city: clampText(e.target.value, 60) }))}
                        placeholder="Torrelavega"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Moneda *</label>
                      <input
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm uppercase"
                        value={upper(model.currency || "EUR").slice(0, 3)}
                        onChange={(e) => setModel((p) => ({ ...p, currency: upper(e.target.value).slice(0, 3) }))}
                        placeholder="EUR"
                        maxLength={3}
                      />
                    </div>
                  </div>

                  {stepMiss.length > 0 && <div className="text-xs text-red-600">Falta: {stepMiss.join(" · ")}</div>}
                </div>
              )}

              {/* OPERACION */}
              {step === "OPERACION" && (
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-900">Operación</div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Estancias mensuales (estimación) *</label>
                      <input
                        type="number"
                        min={0}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-400/50"
                        value={model.monthly_stays_estimated}
                        onChange={(e) =>
                          setModel((p) => ({
                            ...p,
                            monthly_stays_estimated: e.target.value === "" ? "" : Math.max(0, Number(e.target.value)),
                          }))
                        }
                        placeholder="Ej: 120"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Se usa para calcular incidencias por 100 estancias y pérdidas por estancia.
                      </p>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-600">ADR real (€/noche) *</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-400/50"
                        value={model.adr_real}
                        onChange={(e) =>
                          setModel((p) => ({
                            ...p,
                            adr_real: e.target.value === "" ? "" : Math.max(0, Number(e.target.value)),
                          }))
                        }
                        placeholder="Ej: 85.50"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">Si no lo pones, la comparativa ADR pierde precisión.</p>
                    </div>
                  </div>

                  {stepMiss.length > 0 && <div className="text-xs text-red-600">Falta: {stepMiss.join(" · ")}</div>}
                </div>
              )}

              {/* TEMPORADAS */}
              {step === "TEMPORADAS" && (
                <div className="space-y-4">
                  <div className="text-sm font-semibold text-slate-900">Temporadas</div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="text-xs font-semibold text-slate-600">Multiplicador temporada alta *</label>
                      <input
                        type="number"
                        step="0.01"
                        min={1}
                        max={3}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-400/50"
                        value={model.season_mult_high}
                        onChange={(e) => setModel((p) => ({ ...p, season_mult_high: Number(e.target.value) }))}
                      />
                      <p className="mt-1 text-[11px] text-slate-500">Rango recomendado: 1.00 a 3.00</p>
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-slate-600">Multiplicador temporada baja *</label>
                      <input
                        type="number"
                        step="0.01"
                        min={0.5}
                        max={1}
                        className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-400/50"
                        value={model.season_mult_low}
                        onChange={(e) => setModel((p) => ({ ...p, season_mult_low: Number(e.target.value) }))}
                      />
                      <p className="mt-1 text-[11px] text-slate-500">Rango recomendado: 0.50 a 1.00</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-600">
                    Esto alimenta comparativas por temporada (pérdidas, ADR efectivo, etc.).
                  </div>

                  {stepMiss.length > 0 && <div className="text-xs text-red-600">Falta: {stepMiss.join(" · ")}</div>}
                </div>
              )}

              {/* CATALOGOS */}
              {step === "CATALOGOS" && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Configuración económica</div>
                      <div className="text-xs text-slate-500">
                        Define importes por incidencia y el catálogo de artículos para “Missing items”.
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={initDraftFromCatalogs}
                      className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Inicializar configuración
                    </button>
                  </div>

                  {!customerId && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      No tengo <b>customerId</b>. Podrás ver/editar incidencias, pero para añadir artículos del hotel necesito
                      que <code>getHotelProfile()</code> devuelva <code>customer.id</code> o <code>profile.customer_id</code>.
                    </div>
                  )}

                  {!catalogsOk && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      Pendiente: debes dejar lista la configuración de incidencias/catálogo para poder usar “Registrar incidencia”.
                    </div>
                  )}

                  {/* Incidents table */}
                  <div className="rounded-2xl border border-slate-100 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                      <div className="text-xs font-semibold text-slate-700">Cálculos por Incidencia</div>
                    </div>

                    <div className="overflow-auto">
                      <table className="min-w-[900px] w-full text-sm">
                        <thead className="text-[11px] text-slate-500">
                          <tr className="border-b border-slate-100">
                            <th className="text-left font-semibold px-4 py-3">INCIDENCIA</th>
                            <th className="text-left font-semibold px-4 py-3">MÉTODO</th>
                            <th className="text-left font-semibold px-4 py-3">VALOR</th>
                            <th className="text-left font-semibold px-4 py-3">ACTIVO</th>
                            <th className="text-left font-semibold px-4 py-3">OVERRIDE</th>
                            <th className="text-left font-semibold px-4 py-3">NOTAS</th>
                          </tr>
                        </thead>

                        <tbody className="text-slate-800">
                          {incidents
                            .filter((i) => i.is_active)
                            .map((i) => {
                              const k = keyIncident(i.incident_type);
                              const d = pricingDraft[k];
                              const m = methodForIncident(i);

                              const isActive = d?.is_active ?? i.override?.is_active ?? true;
                              const valueDisplay = effectiveIncidentValueText(i);
                              const overrideEnabled = Boolean(d);

                              return (
                                <tr key={i.incident_type} className="border-b border-slate-100">
                                  <td className="px-4 py-3">
                                    <div className="font-semibold text-slate-900">{i.incident_type}</div>
                                    <div className="text-[11px] text-slate-500">{i.title}</div>
                                  </td>

                                  <td className="px-4 py-3">
                                    <span className="inline-flex rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold">
                                      {m}
                                    </span>
                                  </td>

                                  <td className="px-4 py-3">
                                    <div className="text-sm font-semibold">{valueDisplay}</div>

                                    {overrideEnabled && m === "PERCENTAGE" && (
                                      <div className="mt-2 flex items-center gap-2">
                                        <span className="text-[11px] text-slate-500">%</span>
                                        <input
                                          type="number"
                                          step="0.01"
                                          min={0}
                                          className="w-28 border rounded-md px-2 py-1 text-sm"
                                          value={d.recovery_pct_override ?? ""}
                                          onChange={(e) => setDraftField(k, { recovery_pct_override: safeNum(e.target.value) })}
                                          placeholder={String(i.default_recovery_pct ?? "")}
                                        />
                                      </div>
                                    )}

                                    {overrideEnabled && m === "RANGE" && (
                                      <div className="mt-2 flex flex-wrap items-center gap-2">
                                        <input
                                          type="number"
                                          step="0.01"
                                          min={0}
                                          className="w-28 border rounded-md px-2 py-1 text-sm"
                                          value={d.gross_min_override ?? ""}
                                          onChange={(e) => setDraftField(k, { gross_min_override: safeNum(e.target.value) })}
                                          placeholder={String(i.default_gross_min ?? "")}
                                        />
                                        <span className="text-[11px] text-slate-500">a</span>
                                        <input
                                          type="number"
                                          step="0.01"
                                          min={0}
                                          className="w-28 border rounded-md px-2 py-1 text-sm"
                                          value={d.gross_max_override ?? ""}
                                          onChange={(e) => setDraftField(k, { gross_max_override: safeNum(e.target.value) })}
                                          placeholder={String(i.default_gross_max ?? "")}
                                        />
                                        <span className="text-[11px] text-slate-500">{model.currency || "EUR"}</span>
                                      </div>
                                    )}

                                    {overrideEnabled && m === "MULTIPLIER" && (
                                      <div className="mt-2 flex items-center gap-2">
                                        <input
                                          type="number"
                                          step="0.01"
                                          min={0}
                                          className="w-28 border rounded-md px-2 py-1 text-sm"
                                          value={d.unit_price_override ?? ""}
                                          onChange={(e) => setDraftField(k, { unit_price_override: safeNum(e.target.value) })}
                                          placeholder="Ej: 1,5"
                                        />
                                        <span className="text-[11px] text-slate-500">(multiplicador)</span>
                                      </div>
                                    )}

                                    {m === "CATALOG" && (
                                      <div className="mt-1 text-[11px] text-slate-500">
                                        Se configura abajo en “Catálogo de artículos”.
                                      </div>
                                    )}
                                  </td>

                                  <td className="px-4 py-3">
                                    <label className="inline-flex items-center gap-2 text-xs">
                                      <input
                                        type="checkbox"
                                        checked={isActive}
                                        onChange={(e) => {
                                          if (!pricingDraft[k]) {
                                            setPricingDraft((prev) => ({
                                              ...prev,
                                              [k]: {
                                                incident_type: i.incident_type,
                                                item_code: null,
                                                unit_price_override: i.override?.unit_price_override ?? null,
                                                gross_min_override: i.override?.gross_min_override ?? null,
                                                gross_max_override: i.override?.gross_max_override ?? null,
                                                recovery_pct_override: i.override?.recovery_pct_override ?? null,
                                                notes: i.override?.notes ?? null,
                                                is_active: e.target.checked,
                                              },
                                            }));
                                          } else {
                                            setDraftField(k, { is_active: e.target.checked });
                                          }
                                        }}
                                      />
                                      <span className="text-slate-700">Activo</span>
                                    </label>
                                  </td>

                                  <td className="px-4 py-3">
                                    <button
                                      type="button"
                                      className="px-3 py-1.5 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                      onClick={() => {
                                        if (!pricingDraft[k]) {
                                          setPricingDraft((prev) => ({
                                            ...prev,
                                            [k]: {
                                              incident_type: i.incident_type,
                                              item_code: null,
                                              unit_price_override: i.override?.unit_price_override ?? null,
                                              gross_min_override: i.override?.gross_min_override ?? null,
                                              gross_max_override: i.override?.gross_max_override ?? null,
                                              recovery_pct_override: i.override?.recovery_pct_override ?? null,
                                              notes: i.override?.notes ?? null,
                                              is_active: i.override?.is_active ?? true,
                                            },
                                          }));
                                        }
                                      }}
                                    >
                                      {pricingDraft[k] ? "Editando" : "Editar"}
                                    </button>

                                    {pricingDraft[k] && (
                                      <button
                                        type="button"
                                        className="ml-2 px-3 py-1.5 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                        onClick={() => {
                                          setPricingDraft((prev) => {
                                            const next = { ...prev };
                                            delete next[k];
                                            return next;
                                          });
                                        }}
                                      >
                                        Quitar
                                      </button>
                                    )}
                                  </td>

                                  <td className="px-4 py-3">
                                    {pricingDraft[k] ? (
                                      <input
                                        className="w-[260px] border rounded-md px-2 py-1 text-sm"
                                        value={pricingDraft[k].notes ?? ""}
                                        onChange={(e) => setDraftField(k, { notes: clampText(e.target.value, 500) })}
                                        placeholder="Notas internas…"
                                      />
                                    ) : (
                                      <span className="text-[12px] text-slate-400">—</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}

                          {incidents.filter((i) => i.is_active).length === 0 && (
                            <tr>
                              <td colSpan={6} className="px-4 py-6 text-sm text-slate-500">
                                No hay incidencias activas en el catálogo.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Alta predefinidos */}
                  <div className="rounded-2xl border border-slate-100 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                      <div className="text-xs font-semibold text-slate-700">Añadir artículo (rápido)</div>
                      <div className="text-[11px] text-slate-500">
                        Recomendado: elige un artículo estándar y luego ajustas el precio en la tabla.
                      </div>
                    </div>

                    <div className="p-4 grid gap-3 md:grid-cols-3">
                      <div className="md:col-span-2">
                        <label className="text-xs font-semibold text-slate-600">Artículo estándar</label>
                        <select
                          className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-400/50"
                          value={selectedPredefinedCode}
                          onChange={(e) => setSelectedPredefinedCode(e.target.value)}
                        >
                          <option value="">Selecciona…</option>
                          {PREDEFINED_ITEMS.map((x) => (
                            <option key={x.item_code} value={x.item_code}>
                              {x.title} ({x.item_code})
                            </option>
                          ))}
                        </select>
                        <div className="mt-1 text-[11px] text-slate-500">
                          Moneda: <b>{model.currency || "EUR"}</b>
                        </div>
                      </div>

                      <div className="flex items-end">
                        <button
                          type="button"
                          disabled={!customerId || !selectedPredefinedCode || catalogBootstrapping}
                          onClick={addPredefinedItemForHotel}
                          className="w-full px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-40"
                        >
                          {catalogBootstrapping ? "Añadiendo…" : "Añadir"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Alta custom (opcional) */}
                  <div className="rounded-2xl border border-slate-100 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100">
                      <div className="text-xs font-semibold text-slate-700">Artículo personalizado (opcional)</div>
                      <div className="text-[11px] text-slate-500">
                        Solo si necesitas algo que no exista. El código se normaliza automáticamente.
                      </div>
                    </div>

                    <div className="p-4 grid gap-3 md:grid-cols-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-600">Código (opcional)</label>
                        <input
                          className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-400/50"
                          value={newItem.item_code}
                          onChange={(e) => setNewItem((p) => ({ ...p, item_code: clampTextLive(e.target.value, 40) }))}
                          placeholder="EJ: PHOTO_FRAME"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <label className="text-xs font-semibold text-slate-600">Artículo *</label>
                        <input
                          className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-400/50"
                          value={newItem.title}
                          onChange={(e) => setNewItem((p) => ({ ...p, title: clampTextLive(e.target.value, 120) }))}
                          placeholder="Ej: Marco fotos"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-semibold text-slate-600">Categoría *</label>
                        <select
                          className="mt-1 w-full border rounded-lg px-3 py-2 text-sm text-slate-900 bg-white focus:outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-400/50"
                          value={newItem.category}
                          onChange={(e) => setNewItem((p) => ({ ...p, category: e.target.value as ItemCategory }))}
                        >
                          {ITEM_CATEGORIES.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="md:col-span-3">
                        <label className="text-xs font-semibold text-slate-600">Precio *</label>
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            className="w-40 border rounded-lg px-3 py-2 text-sm"
                            value={newItem.unit_price}
                            onChange={(e) => setNewItem((p) => ({ ...p, unit_price: e.target.value }))}
                            placeholder="12.00"
                          />
                          <span className="text-sm text-slate-600">{model.currency || "EUR"}</span>
                        </div>
                      </div>

                      <div className="flex items-end justify-end gap-2">
                        <button
                          type="button"
                          className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700"
                          onClick={() =>
                            setNewItem({
                              item_code: "",
                              title: "",
                              category: "Linen",
                              unit_price: "",
                              currency: model.currency || "EUR",
                            })
                          }
                        >
                          Limpiar
                        </button>
                        <button
                          type="button"
                          disabled={!customerId || catalogBootstrapping}
                          onClick={addCustomItemForHotel}
                          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-40"
                        >
                          {catalogBootstrapping ? "Añadiendo…" : "Añadir artículo"}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Items table */}
                  <div className="rounded-2xl border border-slate-100 overflow-hidden">
                    <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                      <div className="text-xs font-semibold text-slate-700">Catálogo de artículos (Missing Items)</div>
                      <div className="text-[11px] text-slate-500">
                        Moneda: <span className="font-semibold">{model.currency || "EUR"}</span>
                      </div>
                    </div>

                    <div className="overflow-auto">
                      <table className="min-w-[900px] w-full text-sm">
                        <thead className="text-[11px] text-slate-500">
                          <tr className="border-b border-slate-100">
                            <th className="text-left font-semibold px-4 py-3">CÓDIGO</th>
                            <th className="text-left font-semibold px-4 py-3">ARTÍCULO</th>
                            <th className="text-left font-semibold px-4 py-3">PRECIO BASE</th>
                            <th className="text-left font-semibold px-4 py-3">OVERRIDE</th>
                            <th className="text-left font-semibold px-4 py-3">EFECTIVO</th>
                            <th className="text-left font-semibold px-4 py-3">ACTIVO</th>
                          </tr>
                        </thead>

                        <tbody className="text-slate-800">
                          {items
                            .filter((it) => it.is_active)
                            .map((it) => {
                              const k = keyItem(it.item_code);
                              const d = pricingDraft[k];
                              const effective = (d?.unit_price_override ?? it.unit_price_override ?? null) ?? it.unit_price;

                              return (
                                <tr key={it.item_code} className="border-b border-slate-100">
                                  <td className="px-4 py-3 font-semibold text-slate-900">{it.item_code}</td>
                                  <td className="px-4 py-3">
                                    <div className="font-semibold">{it.title}</div>
                                    <div className="text-[11px] text-slate-500">{it.category}</div>
                                  </td>
                                  <td className="px-4 py-3">
                                    {Number(it.unit_price).toFixed(2)} {it.currency || model.currency || "EUR"}
                                  </td>

                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="number"
                                        step="0.01"
                                        min={0}
                                        className="w-32 border rounded-md px-2 py-1 text-sm"
                                        value={d?.unit_price_override ?? ""}
                                        onChange={(e) => {
                                          ensureItemDraft(it);
                                          const v = safeNum(e.target.value);
                                          setTimeout(() => setDraftField(k, { unit_price_override: v }), 0);
                                        }}
                                        placeholder={String(it.unit_price_override ?? "")}
                                      />
                                      <span className="text-[11px] text-slate-500">{model.currency || "EUR"}</span>
                                    </div>
                                  </td>

                                  <td className="px-4 py-3 font-semibold">
                                    {Number(effective).toFixed(2)} {model.currency || "EUR"}
                                  </td>

                                  <td className="px-4 py-3">
                                    <label className="inline-flex items-center gap-2 text-xs">
                                      <input
                                        type="checkbox"
                                        checked={d?.is_active ?? true}
                                        onChange={(e) => {
                                          ensureItemDraft(it);
                                          setTimeout(() => setDraftField(k, { is_active: e.target.checked }), 0);
                                        }}
                                      />
                                      <span className="text-slate-700">Activo</span>
                                    </label>
                                  </td>
                                </tr>
                              );
                            })}

                          {items.filter((x) => x.is_active).length === 0 && (
                            <tr>
                              <td colSpan={6} className="px-4 py-6 text-sm text-slate-500">
                                No hay artículos activos en el catálogo.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="px-4 py-3 text-[11px] text-slate-500 bg-white border-t border-slate-100">
                      Nota: los overrides de artículos solo se guardan si tocas el precio (para no crear filas innecesarias).
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-600">
                    Si aquí no está configurado, “Registrar incidencia” no puede calcular impacto económico ni cargar catálogos.
                  </div>
                </div>
              )}

              {/* FIN */}
              {step === "FIN" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <div className="text-sm font-semibold text-slate-900">Listo para finalizar</div>
                  </div>

                  {!computedAllMissing.is_complete ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      Aún faltan datos: <b>{computedAllMissing.missing.join(" · ")}</b>
                      <div className="text-xs text-amber-800 mt-1">Pulsa “Atrás” para completar lo pendiente.</div>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
                      Configuración completa. Ya puedes usar métricas, comparativas y registrar incidencias con impacto económico.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="p-6 border-t border-slate-100 flex items-center justify-between gap-3">
          <div className="text-xs text-slate-500">
            {saving
              ? "Guardando…"
              : step !== "FIN"
              ? step === "CATALOGOS"
                ? "Inicializa/ajusta incidencias y catálogo para continuar."
                : "Completa el paso para continuar."
              : "Finaliza para cerrar."}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={back}
              disabled={saving || loading || step === "IDENTIDAD"}
              className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 bg-white disabled:opacity-50"
            >
              Atrás
            </button>

            {step !== "FIN" ? (
              <button
                type="button"
                onClick={next}
                disabled={saving || loading || (step !== "CATALOGOS" && !canNext) || (step === "CATALOGOS" && !catalogsOk)}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold disabled:opacity-40"
              >
                {saving ? "Guardando…" : "Siguiente"}
              </button>
            ) : (
              <button
                type="button"
                onClick={finish}
                disabled={saving || loading || !computedAllMissing.is_complete}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-40"
              >
                {saving ? "Guardando…" : "Finalizar"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
