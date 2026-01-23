import React, { useEffect, useState } from "react";
import { supabase } from "@/services/supabaseClient";
import type { User, Invoice } from "@/types/types";
import { PlanType } from "@/types/types";
import { CreditCard, FileText, Loader2, Eye, EyeOff } from "lucide-react";
import { changePlan, type PlanCode } from "@/services/subscriptionManage";

interface SubscriptionProps {
  user: User;
  onUserUpdate: (updatedUser: User) => void;
}

type TabKey = "plan" | "empresa" | "banco" | "seguridad";

type ActivePlanSummary = {
  planType: PlanType;
  label: string;
  priceMonthly: number;
  startDate: string | null;
  nextBillingDate: string | null;
  billingFrequency: string | null;
  status: string | null;
  planCode: PlanCode;
  planName: string;
};

const TAB_LIST: { key: TabKey; label: string }[] = [
  { key: "plan", label: "Planes" },
  { key: "empresa", label: "Datos empresa" },
  { key: "banco", label: "Datos bancarios" },
  { key: "seguridad", label: "Seguridad" },
];

const planFeatures: Record<PlanType, { price: number; label: string; limits: string }> = {
  [PlanType.BASIC]: { price: 19.99, label: "Basico", limits: "Hasta 50 consultas/mes" },
  [PlanType.PROFESSIONAL]: { price: 49.99, label: "Profesional", limits: "Consultas ilimitadas" },
  [PlanType.ENTERPRISE]: { price: 99.99, label: "Enterprise", limits: "API + multiusuario" },
  [PlanType.INACTIVE]: { price: 0, label: "Inactivo", limits: "Sin acceso activo" },
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString("es-ES") : "-");

type AvailablePlan = {
  id: string;
  code: PlanCode;
  name: string;
  priceMonthly: number;
  description: string;
  maxQueries: number;
};

const PLAN_METADATA: Record<PlanCode, { name: string; description: string; maxQueries: number; defaultPrice: number }> = {
  BASIC: {
    name: "Básico",
    description: "Ideal para validar la plataforma con hasta 150 consultas/mes.",
    maxQueries: 150,
    defaultPrice: 30,
  },
  MEDIUM: {
    name: "Medio",
    description: "Para equipos en crecimiento con soporte prioritario.",
    maxQueries: 500,
    defaultPrice: 50,
  },
  PREMIUM: {
    name: "Premium",
    description: "API completa y gestión avanzada con 2.000 consultas/mes.",
    maxQueries: 2000,
    defaultPrice: 75,
  },
  FREE: {
    name: "Free",
    description: "Portal de inicio sin facturación.",
    maxQueries: 25,
    defaultPrice: 0,
  },
};

const PLAN_SEQUENCE: PlanCode[] = ["BASIC", "MEDIUM", "PREMIUM"];

const planTypeFromCode = (code?: string): PlanType => {
  if (!code) return PlanType.BASIC;
  const normalized = code.toUpperCase();
  if (normalized.includes("BASIC")) return PlanType.BASIC;
  if (normalized.includes("PRO")) return PlanType.PROFESSIONAL;
  if (normalized.includes("ENTER")) return PlanType.ENTERPRISE;
  return PlanType.BASIC;
};

const PLAN_RANK: Record<PlanCode, number> = {
  FREE: 0,
  BASIC: 1,
  MEDIUM: 2,
  PREMIUM: 3,
};

const mapPlanTypeToCode = (planType?: PlanType): PlanCode => {
  if (!planType) return "BASIC";
  switch (planType) {
    case PlanType.BASIC:
      return "BASIC";
    case PlanType.PROFESSIONAL:
      return "MEDIUM";
    case PlanType.ENTERPRISE:
      return "PREMIUM";
    case PlanType.INACTIVE:
      return "FREE";
    default:
      return "BASIC";
  }
};

export const SubscriptionManager2: React.FC<SubscriptionProps> = ({ user, onUserUpdate }) => {
  const [activeTab, setActiveTab] = useState<TabKey>("plan");
  const [activePlan, setActivePlan] = useState<ActivePlanSummary | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [bankSaving, setBankSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [bankMessage, setBankMessage] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [planError, setPlanError] = useState<string | null>(null);
  const [isChangingPlan, setIsChangingPlan] = useState(false);
  const [selectedPlanCode, setSelectedPlanCode] = useState<PlanCode | null>(null);
  const [availablePlans, setAvailablePlans] = useState<AvailablePlan[]>([]);
  const [pendingChange, setPendingChange] = useState(false);

  const [customerProfile, setCustomerProfile] = useState({
    name: "",
    nif: "",
    address: "",
    postalCode: "",
    city: "",
    province: "",
    country: "",
    phone: "",
    email: user.email ?? "",
  });

  const [bankData, setBankData] = useState({
    iban: "",
    swift: "",
    bankName: "",
    bankAddress: "",
  });

  const sb = supabase as any;
  const customerId = (user as any)?.customerId ?? user.id;

  useEffect(() => {
    if (!customerId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setPlanError(null);
      try {
        const [subscriptionResult, customerResult, receiptsResult, plansResult, pendingResult] = await Promise.all([
          sb
            .from("subscriptions")
            .select("id,billing_frequency,start_date,next_billing_date,status,plan_id,app_id")
            .eq("customer_id", customerId)
            .eq("app_id", "DEBACU_EVAL")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          sb
            .from("customers")
            .select("name,nif,address,postal_code,city,province,country,phone,email,iban,swift,bank_name,bank_address")
            .eq("id", customerId)
            .maybeSingle(),
          sb
            .from("receipts")
            .select("id,date,amount,concept,status")
            .eq("customer_id", customerId)
            .order("date", { ascending: false })
            .limit(5),
          sb
            .from("plans")
            .select("id,name,code,price_monthly")
            .eq("app_id", "DEBACU_EVAL")
            .in("code", PLAN_SEQUENCE),
          sb
            .from("subscriptions")
            .select("id,status")
            .eq("customer_id", customerId)
            .eq("app_id", "DEBACU_EVAL")
            .eq("status", "PENDING_PAYMENT")
            .limit(1)
            .maybeSingle(),
            
        ]);
        
        console.log("🔎 subscriptionResult:", subscriptionResult);
        console.log("🔎 subscriptionResult.data:", subscriptionResult?.data);


        if (!cancelled) {
          const subscription = subscriptionResult?.data;
          const planRows = (plansResult?.data ?? []) as Array<{
            id: string;
            code: string | null;
            name: string;
            price_monthly: number | null;
          }>;

          if (subscription) {
          const rowForPlan = planRows.find((plan) => plan.id === subscription.plan_id);

              const normalizedCode = (rowForPlan?.code ?? "BASIC").toUpperCase() as PlanCode;
              const planCode: PlanCode =
                PLAN_SEQUENCE.includes(normalizedCode as PlanCode) ? (normalizedCode as PlanCode) : "BASIC";

              const planName = rowForPlan?.name ?? PLAN_METADATA[planCode].name;

            setActivePlan({
              planType: planTypeFromCode(rowForPlan?.code),
              label: planName,
              planName,
              planCode,
              priceMonthly: Number(rowForPlan?.price_monthly ?? user.monthlyFee ?? 0),
             startDate: subscription.start_date ?? null,
              nextBillingDate: subscription.next_billing_date ?? null,
              billingFrequency: subscription.billing_frequency ?? null,
              status: subscription.status ?? null,
             });

          }

          const profile = customerResult?.data;
          if (profile) {
            setCustomerProfile((prev) => ({
              ...prev,
              name: profile.name ?? prev.name,
              nif: profile.nif ?? prev.nif,
              address: profile.address ?? prev.address,
              postalCode: profile.postal_code ?? prev.postalCode,
              city: profile.city ?? prev.city,
              province: profile.province ?? prev.province,
              country: profile.country ?? prev.country,
              phone: profile.phone ?? prev.phone,
              email: profile.email ?? prev.email,
            }));
            setBankData({
              iban: profile.iban ?? "",
              swift: profile.swift ?? "",
              bankName: profile.bank_name ?? "",
              bankAddress: profile.bank_address ?? "",
            });
          }

          const receipts = (receiptsResult?.data ?? []) as any[];
          setInvoices(
            receipts.map((row) => ({
              id: row.id,
              date: row.date,
              amount: Number(row.amount) || 0,
              description: row.concept ?? "Factura",
              status: row.status === "PAID" ? "Paid" : "Pending",
            }))
          );

          const constructedPlans: AvailablePlan[] = PLAN_SEQUENCE.map((code) => {
            const row = planRows.find((plan) => String(plan.code ?? "").toUpperCase() === code);
            const meta = PLAN_METADATA[code];
            return {
              id: row?.id ?? code,
              code,
              name: row?.name ?? meta.name,
              priceMonthly: Number(row?.price_monthly ?? meta.defaultPrice),
              description: meta.description,
              maxQueries: meta.maxQueries,
            };
          });
          setAvailablePlans(constructedPlans);

          setPendingChange(Boolean(pendingResult?.data));
        }
      } catch (error: any) {
        console.error("Error cargando datos de plan:", error);
        if (!cancelled) setPlanError(error?.message ?? "Error cargando datos de plan.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

      const url = new URL(window.location.href);
      const hasSessionId = url.searchParams.has("session_id");
      if (hasSessionId) {
        // opcional: limpiar la URL para que no quede fea
        url.searchParams.delete("session_id");
        window.history.replaceState({}, "", url.toString());
      }
    void load();
    if (hasSessionId) {
        setTimeout(() => { void load(); }, 2500);
      }
    return () => {
      cancelled = true;
    };
  }, [customerId, sb, user.monthlyFee, user]);

  const handleSaveProfile = async () => {
    if (!customerId) return;
    setProfileSaving(true);
    setProfileMessage(null);
    try {
      const { error } = await sb
        .from("customers")
        .update({
          name: customerProfile.name || null,
          nif: customerProfile.nif || null,
          address: customerProfile.address || null,
          postal_code: customerProfile.postalCode || null,
          city: customerProfile.city || null,
          province: customerProfile.province || null,
          country: customerProfile.country || null,
          phone: customerProfile.phone || null,
          email: customerProfile.email || null,
        })
        .eq("id", customerId);
      if (error) throw error;
      setProfileMessage("Datos guardados");
    } catch (error: any) {
      console.error(error);
      setProfileMessage("Error al guardar los datos");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveBankData = async () => {
    if (!customerId) return;
    setBankSaving(true);
    setBankMessage(null);
    try {
      const { error } = await sb
        .from("customers")
        .update({
          iban: bankData.iban || null,
          swift: bankData.swift || null,
          bank_name: bankData.bankName || null,
          bank_address: bankData.bankAddress || null,
        })
        .eq("id", customerId);
      if (error) throw error;
      setBankMessage("Datos bancarios guardados");
    } catch (error) {
      console.error(error);
      setBankMessage("Error guardando datos bancarios");
    } finally {
      setBankSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 8) {
      setPasswordMessage("La nueva contraseña debe tener al menos 8 caracteres");
      return;
    }
    setChangingPassword(true);
    setPasswordMessage(null);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordMessage("Contraseña actualizada");
      setCurrentPassword("");
      setNewPassword("");
    } catch (error: any) {
      console.error(error);
      setPasswordMessage("No se pudo actualizar la contraseña");
    } finally {
      setChangingPassword(false);
    }
  };

const handlePlanUpgrade = async (planCode: PlanCode) => {
  setPlanError(null);
  setSelectedPlanCode(planCode);
  setIsChangingPlan(true);

    try {
      const { checkout_url } = await changePlan({
        target_plan_code: planCode,
        billing_frequency: "MONTHLY",
        customer_id: customerId || user.id,
      });

      // Redirige al checkout de Stripe
      window.location.href = checkout_url;
  } catch (error: any) {
    console.error("Error cambiando plan:", error);

    if (error?.code === "PENDING_CHANGE") {
      setPendingChange(true);
      setPlanError("Ya existe un cambio de plan pendiente. Espera a la confirmación de Stripe.");
    } else {
      setPlanError(error?.message ?? "No se pudo iniciar el cambio de plan.");
    }
  } finally {
    setIsChangingPlan(false);
    setSelectedPlanCode(null);
  }
};


  const effectivePlanType = activePlan?.planType ?? (user.plan ?? PlanType.BASIC);
  const planInfo = planFeatures[effectivePlanType];
  const monthlyFee = activePlan?.priceMonthly ?? user.monthlyFee ?? planInfo.price;
  const currentPlanCode: PlanCode = activePlan?.planCode ?? mapPlanTypeToCode(effectivePlanType);
  const currentPlanRank = PLAN_RANK[currentPlanCode] ?? 0;
  const limitDescription = PLAN_METADATA[currentPlanCode]?.description ?? planInfo.limits;
  const isFreePlan = currentPlanCode === "FREE" || activePlan?.billingFrequency === "FREE_TRIAL";
  const planPriceLabel = isFreePlan ? "Gratis" : formatCurrency(monthlyFee);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-slate-800">Mi cuenta & plan</h2>
        <p className="text-sm text-slate-500">Gestiona plan, datos del hotel, facturación y seguridad.</p>
      </div>

      <div className="flex flex-wrap gap-3 border-b border-slate-200 pb-2">
        {TAB_LIST.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-sm font-semibold rounded-full transition ${
              activeTab === tab.key ? "bg-slate-900 text-white" : "border border-slate-300 text-slate-600"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "plan" && (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
                <div className="px-6 py-5 flex items-center justify-between border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-slate-600" />
                    <p className="text-sm font-semibold text-slate-900">Plan actual</p>
                  </div>
                  <span
                    className={`text-[11px] uppercase tracking-wide px-3 py-1 rounded-full border ${
                    activePlan?.status === "ACTIVE"
                      ? "border-green-200 text-green-700 bg-green-50"
                      : "border-slate-200 text-slate-600 bg-white"
                    }`}
                  >
                    {activePlan?.status ?? "Activo"}
                  </span>
                </div>
              <div className="p-6 space-y-5">
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-3xl font-bold text-slate-900">{planPriceLabel}</p>
                    {!isFreePlan && <p className="text-xs text-slate-500">/mes</p>}
                  </div>
                  <div className="text-right text-sm text-slate-600">
                    <p>Inicio: {formatDate(activePlan?.startDate)}</p>
                    <p>Próxima factura: {formatDate(activePlan?.nextBillingDate)}</p>
                    <p>Facturación: {activePlan?.billingFrequency ?? "Mensual"}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Plan</p>
                  <p className="text-lg font-semibold text-slate-900">{activePlan?.planName ?? planInfo.label}</p>
                  <p className="text-xs text-slate-500">{limitDescription}</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 rounded-2xl border border-slate-100 p-5 space-y-2">
              <span className="text-xs uppercase tracking-wide text-slate-500">Límites</span>
              <p className="text-sm text-slate-700">{planInfo.limits}</p>
              <p className="text-xs text-slate-500">
                Estos límites se aplican al mes en curso y se reinician automáticamente.
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
              <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-500" /> Facturas recientes
                </p>
                <button className="text-xs text-indigo-600">Ver todas</button>
              </div>
              <div className="p-4 space-y-3">
                {loading && invoices.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
                  </div>
                ) : invoices.length === 0 ? (
                  <p className="text-sm text-slate-500">No hay facturas recientes</p>
                ) : (
                  invoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between text-sm text-slate-600">
                      <span>{formatDate(inv.date)}</span>
                      <div>
                        <span className="font-semibold text-slate-900">{formatCurrency(inv.amount)}</span>
                        <span className="text-[11px] ml-2 rounded-full border px-2 py-0.5">{inv.status}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
              <div className="px-6 py-4 flex items-start justify-between border-b border-slate-100 gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Planes disponibles</p>
                  <p className="text-xs text-slate-500">
                    Actualiza tu plan en segundos y completa el pago seguro en Stripe.
                  </p>
                </div>
              </div>
              <div className="space-y-4 px-6 py-5">
                {availablePlans.length === 0 ? (
                  <p className="text-sm text-slate-500">Cargando planes...</p>
                ) : (
                  availablePlans.map((option) => {
                    const isActive = option.code === currentPlanCode;
                    const optionRank = PLAN_RANK[option.code] ?? 0;
                    const canUpgrade = optionRank > currentPlanRank;
                    const buttonDisabled = isChangingPlan || pendingChange || !canUpgrade || isActive;
                    const actionAllowed = !buttonDisabled && !isActive && canUpgrade;
                    const buttonLabel = isActive ? "Plan actual" : "Ampliar plan";
                    return (
                      <PlanCard
                        key={option.code}
                        option={option}
                        isActive={isActive}
                        disabled={buttonDisabled}
                        loading={isChangingPlan && selectedPlanCode === option.code}
                        buttonLabel={buttonLabel}
                        recommended={!isActive && currentPlanCode === "FREE" && option.code === "BASIC"}
                        onAction={actionAllowed ? () => handlePlanUpgrade(option.code) : undefined}
                      />
                    );
                  })
                )}
              </div>
              {pendingChange && (
                <div className="px-6 pb-4">
                  <p className="text-xs font-semibold text-amber-700 uppercase">
                    Cambio de plan pendiente · espera confirmación de Stripe
                  </p>
                </div>
              )}
              {planError && (
                <div className="px-6 pb-5">
                  <p className="text-sm text-red-600">{planError}</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {activeTab === "empresa" && (
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="p-6 space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Datos profesionales</h3>
              <p className="text-xs text-slate-500">Actualiza nombre, CIF y dirección del hotel.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">Nombre comercial</label>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                value={customerProfile.name}
                onChange={(event) => setCustomerProfile((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-slate-600">CIF / NIF</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={customerProfile.nif}
                  onChange={(event) => setCustomerProfile((prev) => ({ ...prev, nif: event.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Teléfono</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={customerProfile.phone}
                  onChange={(event) => setCustomerProfile((prev) => ({ ...prev, phone: event.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-slate-600">Email de contacto</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={customerProfile.email}
                  onChange={(event) => setCustomerProfile((prev) => ({ ...prev, email: event.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Código postal</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={customerProfile.postalCode}
                  onChange={(event) => setCustomerProfile((prev) => ({ ...prev, postalCode: event.target.value }))}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="text-xs font-semibold text-slate-600">Ciudad</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={customerProfile.city}
                  onChange={(event) => setCustomerProfile((prev) => ({ ...prev, city: event.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Provincia</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={customerProfile.province}
                  onChange={(event) => setCustomerProfile((prev) => ({ ...prev, province: event.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">País</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={customerProfile.country}
                  onChange={(event) => setCustomerProfile((prev) => ({ ...prev, country: event.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                disabled={profileSaving}
                onClick={handleSaveProfile}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-60"
              >
                {profileSaving ? "Guardando..." : "Guardar datos"}
              </button>
              {profileMessage && <p className="text-sm text-slate-500">{profileMessage}</p>}
            </div>
          </div>
        </section>
      )}

      {activeTab === "banco" && (
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Datos bancarios</h3>
              <p className="text-xs text-slate-500">Mantén actualizado IBAN, SWIFT y entidad.</p>
            </div>
            <div className="grid gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600">IBAN</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={bankData.iban}
                  onChange={(event) => setBankData((prev) => ({ ...prev, iban: event.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">SWIFT / BIC</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={bankData.swift}
                  onChange={(event) => setBankData((prev) => ({ ...prev, swift: event.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Nombre del banco</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={bankData.bankName}
                  onChange={(event) => setBankData((prev) => ({ ...prev, bankName: event.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Dirección del banco</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={bankData.bankAddress}
                  onChange={(event) => setBankData((prev) => ({ ...prev, bankAddress: event.target.value }))}
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveBankData}
                disabled={bankSaving}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-60"
              >
                {bankSaving ? "Guardando..." : "Guardar datos bancarios"}
              </button>
              {bankMessage && <p className="text-sm text-slate-500">{bankMessage}</p>}
            </div>
          </div>
        </section>
      )}

      {activeTab === "seguridad" && (
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Seguridad</h3>
              <p className="text-xs text-slate-500">Cambia la contraseña y protege tu acceso.</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="text-xs font-semibold text-slate-600">Contraseña actual</label>
                <div className="mt-1 relative">
                  <input
                    type={showCurrentPwd ? "text" : "password"}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPwd((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"
                  >
                    {showCurrentPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600">Nueva contraseña</label>
                <div className="mt-1 relative">
                  <input
                    type={showNewPwd ? "text" : "password"}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPwd((prev) => !prev)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500"
                  >
                    {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleChangePassword}
                disabled={changingPassword}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold disabled:opacity-60"
              >
                {changingPassword ? "Actualizando..." : "Cambiar contraseña"}
              </button>
              {passwordMessage && <p className="text-sm text-slate-500">{passwordMessage}</p>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

type PlanCardProps = {
  option: AvailablePlan;
  isActive: boolean;
  disabled: boolean;
  loading: boolean;
  buttonLabel: string;
  recommended?: boolean;
  onAction?: () => void;
};

const PlanCard: React.FC<PlanCardProps> = ({
  option,
  isActive,
  disabled,
  loading,
  buttonLabel,
  recommended,
  onAction,
}) => (
  <div
    className={`rounded-2xl border p-4 transition ${
      isActive ? "border-green-200 bg-green-50" : "border-slate-200 bg-white hover:border-slate-300"
    }`}
  >
    <div className="flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-900">{option.name}</p>
          {recommended && (
            <span className="text-[10px] px-2 py-1 rounded-full border border-indigo-100 bg-indigo-50 text-indigo-700 uppercase tracking-wide">
              Recomendado
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500">{option.description}</p>
      </div>
      {isActive && (
        <span className="text-[11px] px-2 py-1 rounded-full border border-green-200 bg-green-100 text-green-700 uppercase tracking-wide">
          Activo
        </span>
      )}
    </div>
    <div className="mt-4 flex items-end justify-between gap-4">
      <div>
        <p className="text-2xl font-bold text-slate-900">{formatCurrency(option.priceMonthly)}</p>
        <p className="text-xs text-slate-500">/mes</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onAction}
        className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase transition ${
          disabled ? "bg-slate-200 text-slate-500 cursor-not-allowed" : "bg-slate-900 text-white hover:bg-slate-800"
        }`}
      >
        {loading ? "Procesando..." : buttonLabel}
      </button>
    </div>
    <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">
      Hasta {option.maxQueries.toLocaleString("es-ES")} consultas/mes
    </p>
  </div>
);
