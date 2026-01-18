// src/components/SubscriptionManager.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/services/supabaseClient";

import type { User, Invoice } from "@/types/types";
import { PlanType } from "@/types/types";

import { CreditCard, FileText, Check, AlertTriangle, XCircle, Download, Mail, Loader2 } from "lucide-react";

/**
 * OPCIÓN B (la que quieres):
 * ✅ Evita el bucle loco de “buscando facturas”:
 *    - NO llama a onUserUpdate dentro de los useEffect de carga.
 *    - Dependencias de efectos saneadas (no dependen del objeto user entero).
 * ✅ Evita los errores TS “No overload matches this call”:
 *    - Para tablas fuera del schema tipado (customers/subscriptions/receipts),
 *      usa un cliente “no tipado” local: const sb = supabase as any.
 *      (Tú ahora tienes tipado solo para debacu_evaluations / views, por eso peta)
 *
 * Nota brutal: ahora mismo tu typing está “cortado” a 2-3 tablas. O generas Database completo
 * o aceptas este cast para las tablas de billing. Si no, vas a seguir chocando cada 5 minutos.
 */

interface SubscriptionProps {
  user: User;
  onUserUpdate: (updatedUser: User) => void; // lo dejamos, pero lo usamos SOLO en acciones explícitas
}

type PlanData = {
  planType: PlanType | "UNKNOWN";
  label: string;
  priceMonthly: number;
  startDate: string | null;
  nextBillingDate: string | null;
};

type CustomerBankRow = {
  id: string;
  iban: string | null;
  swift: string | null;
  bankName: string | null;
  bankAddress: string | null;
};

type SubscriptionRow = {
  id: string;
  billingFrequency: string | null;
  startDate: string | null;
  nextBillingDate: string | null;
  status: string | null;
  plans?: {
    id: string;
    name: string | null;
    code: string | null;
    price_monthly: number | null;
    price_yearly: number | null;
  } | null;
};

type ReceiptRow = {
  id: string;
  date: string;
  amount: number | string | null;
  concept: string | null;
  status: string | null;
};

function normalizePlanTypeFromCode(code: string | null | undefined, fallback: PlanType): PlanType {
  const c = (code ?? "").toUpperCase();
  if (c.includes("BASIC")) return PlanType.BASIC;
  if (c.includes("PRO")) return PlanType.PROFESSIONAL;
  if (c.includes("ENTER")) return PlanType.ENTERPRISE;
  return fallback;
}

export const SubscriptionManager: React.FC<SubscriptionProps> = ({ user, onUserUpdate }) => {
  // 🔧 Cliente NO tipado para tablas fuera del Database actual
  const sb = supabase as any;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [changingPlan, setChangingPlan] = useState<boolean>(false);
  const [processingInvoiceId, setProcessingInvoiceId] = useState<string | null>(null);
  const [planData, setPlanData] = useState<PlanData | null>(null);

  // customerId defensivo
  const initialCustomerId = (user as unknown as { customerId?: string }).customerId ?? null;
  const [customerId, setCustomerId] = useState<string | null>(initialCustomerId);

  // datos bancarios
  const [bankIban, setBankIban] = useState<string>("");
  const [bankSwift, setBankSwift] = useState<string>("");
  const [bankName, setBankName] = useState<string>("");
  const [bankAddress, setBankAddress] = useState<string>("");
  const [savingBankData, setSavingBankData] = useState<boolean>(false);

  // para NO repetir resolve / load en bucle
  const resolvedCustomerOnceRef = useRef(false);
  const loadedOnceForCustomerRef = useRef<string | null>(null);

  const planFeatures: Record<PlanType, { price: number; label: string; limits: string }> = useMemo(
    () => ({
      [PlanType.BASIC]: { price: 19.99, label: "Básico", limits: "50 consultas/mes" },
      [PlanType.PROFESSIONAL]: { price: 49.99, label: "Profesional", limits: "Consultas ilimitadas" },
      [PlanType.ENTERPRISE]: { price: 99.99, label: "Empresas", limits: "API Access + Multi-user" },
      [PlanType.INACTIVE]: { price: 0, label: "Inactivo", limits: "Sin acceso" },
    }),
    []
  );

  const planOrder: PlanType[] = useMemo(() => [PlanType.BASIC, PlanType.PROFESSIONAL, PlanType.ENTERPRISE], []);

  // ---------------------------------------------------------------------------
  // 1) Resolver customerId (si no viene en user lo buscamos por email)
  //    IMPORTANTE: no llamar a onUserUpdate aquí (para no provocar bucle)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const resolveCustomerId = async () => {
      if (customerId) return;
      if (resolvedCustomerOnceRef.current) return;

      const email = (user.email || "").trim().toLowerCase();
      if (!email) return;

      resolvedCustomerOnceRef.current = true;

      const { data, error } = await sb.from("customers").select("id").eq("email", email).maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("Error buscando customer por email:", error);
        return;
      }

      if (!data?.id) {
        console.warn(`No existe customer para email ${email}`);
        return;
      }

      setCustomerId(data.id);
    };

    void resolveCustomerId();

    return () => {
      cancelled = true;
    };
  }, [customerId, user.email, sb]);

  // ---------------------------------------------------------------------------
  // 2) Carga: suscripción, facturas, banco
  //    ✅ 1 sola carga por customerId (evita “se vuelve loco”)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const loadFromSupabase = async () => {
      if (!customerId) return;
      if (loadedOnceForCustomerRef.current === customerId) return;

      loadedOnceForCustomerRef.current = customerId;

      setLoading(true);
      try {
        // 2.1) Suscripción + Plan (última)
        const { data: sub, error: subError } = await sb
          .from("subscriptions")
          .select(
            `
            id,
            billingFrequency,
            startDate,
            nextBillingDate,
            status,
            plans:planId (
              id,
              name,
              code,
              price_monthly,
              price_yearly
            )
          `
          )
          .eq("customerId", customerId)
          .order("startDate", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!cancelled) {
          if (subError) {
            console.error("Error cargando suscripción:", subError);
          } else if (sub) {
            const s = sub as SubscriptionRow;
            const plan = s.plans ?? null;

            const fallbackPlan = user.plan ?? PlanType.BASIC;
            const planType = normalizePlanTypeFromCode(plan?.code, fallbackPlan);
            const priceMonthly = Number(plan?.price_monthly ?? user.monthlyFee ?? 0);

            setPlanData({
              planType,
              label: plan?.name ?? "Plan actual",
              priceMonthly,
              startDate: s.startDate ?? null,
              nextBillingDate: s.nextBillingDate ?? null,
            });
          }
        }

        // 2.2) Facturas (receipts)
        const { data: receipts, error: recError } = await sb
          .from("receipts")
          .select("id,date,amount,concept,status")
          .eq("customerId", customerId)
          .order("date", { ascending: false })
          .limit(12);

        if (!cancelled) {
          if (recError) {
            console.error("Error cargando facturas (receipts):", recError);
            setInvoices([]);
          } else {
            const mapped: Invoice[] = ((receipts ?? []) as ReceiptRow[]).map((r) => ({
              id: r.id,
              date: r.date,
              amount: Number(r.amount) || 0,
              description: r.concept || "Suscripción Debacu Evaluation360",
              status: r.status === "PAID" ? "Paid" : "Pending",
            }));
            setInvoices(mapped);
          }
        }

        // 2.3) Datos bancarios del customer
        const { data: customer, error: customerError } = await sb
          .from("customers")
          .select("id, iban, swift, bankName, bankAddress")
          .eq("id", customerId)
          .maybeSingle();

        if (!cancelled) {
          if (customerError) {
            console.error("Error cargando datos bancarios:", customerError);
          } else if (customer) {
            const c = customer as CustomerBankRow;
            setBankIban(c.iban ?? "");
            setBankSwift(c.swift ?? "");
            setBankName(c.bankName ?? "");
            setBankAddress(c.bankAddress ?? "");
          }
        }
      } catch (e) {
        if (!cancelled) console.error("Error general cargando datos:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadFromSupabase();

    return () => {
      cancelled = true;
    };
  }, [customerId, sb, user.plan, user.monthlyFee]);

  // ---------------------------------------------------------------------------
  // Cambio de plan (simulado). Aquí sí puedes tocar user si quieres.
  // ---------------------------------------------------------------------------
  const handleChangePlan = async (newPlan: PlanType) => {
    const ok = window.confirm(`¿Estás seguro de cambiar al plan ${newPlan}?`);
    if (!ok) return;

    setChangingPlan(true);
    try {
      const next = planFeatures[newPlan] ?? { price: 0, label: "Plan", limits: "" };

      setPlanData((prev) => ({
        planType: newPlan,
        label: next.label,
        priceMonthly: next.price,
        startDate: prev?.startDate ?? (user.planStartDate as any) ?? null,
        nextBillingDate: prev?.nextBillingDate ?? null,
      }));

      // si quieres actualizar el user en el estado global, hazlo SOLO aquí (acción explícita)
      onUserUpdate({
        ...user,
        ...(customerId ? ({ customerId } as any) : {}),
        plan: newPlan,
        monthlyFee: next.price,
      });

      alert("Cambio de plan simulado (falta lógica real de cobro/actualización en BD).");
    } catch (e) {
      console.error(e);
      alert("Error al actualizar el plan (simulado).");
    } finally {
      setChangingPlan(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Guardar datos bancarios
  // ---------------------------------------------------------------------------
  const handleSaveBankData = async () => {
    if (!customerId) return;

    setSavingBankData(true);
    try {
      const { error } = await sb
        .from("customers")
        .update({
          iban: bankIban.trim() || null,
          swift: bankSwift.trim() || null,
          bankName: bankName.trim() || null,
          bankAddress: bankAddress.trim() || null,
        })
        .eq("id", customerId);

      if (error) {
        console.error("Error actualizando datos bancarios:", error);
        alert("Error al guardar los datos bancarios.");
        return;
      }

      alert("Datos bancarios actualizados correctamente.");
    } catch (e) {
      console.error("Error general al guardar datos bancarios:", e);
      alert("Error al guardar los datos bancarios.");
    } finally {
      setSavingBankData(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Acciones sobre facturas (placeholder)
  // ---------------------------------------------------------------------------
  const handleDownloadInvoice = async (id: string) => {
    setProcessingInvoiceId(id);
    try {
      alert("Descarga de factura pendiente de implementar en backend.");
    } finally {
      setProcessingInvoiceId(null);
    }
  };

  const handleEmailInvoice = async (id: string) => {
    setProcessingInvoiceId(id);
    try {
      alert(`Envío de factura por email pendiente de implementar. Se enviaría a ${user.email}`);
    } finally {
      setProcessingInvoiceId(null);
    }
  };

  const effectivePlan =
    planData?.planType && planData.planType !== "UNKNOWN"
      ? planData.planType
      : (user.plan ?? PlanType.BASIC);

  const monthlyFee =
    planData?.priceMonthly ??
    user.monthlyFee ??
    planFeatures[effectivePlan]?.price ??
    planFeatures[PlanType.BASIC].price;

  const memberSince = planData?.startDate ?? (user.planStartDate as any) ?? new Date().toISOString();
  const nextBilling = planData?.nextBillingDate ?? null;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Mi cuenta & plan</h2>
        <p className="text-slate-600">Gestión de plan, facturación y preferencias.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Columna izquierda */}
        <div className="lg:col-span-2 space-y-8">
          {/* Plan actual */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Plan Actual
              </h3>
              <span className="bg-indigo-500 px-3 py-1 rounded-full text-xs font-bold tracking-wider uppercase">
                {effectivePlan}
              </span>
            </div>

            <div className="p-6">
              <div className="flex justify-between items-baseline mb-6">
                <div>
                  <p className="text-3xl font-bold text-slate-900">
                    ${monthlyFee}
                    <span className="text-sm font-normal text-slate-500">/mes</span>
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    Miembro desde {new Date(memberSince).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-slate-600">Próxima factura</p>
                  <p className="text-slate-900 font-semibold">
                    {nextBilling ? new Date(nextBilling).toLocaleDateString() : "—"}
                  </p>
                </div>
              </div>

              <div className="border-t border-slate-100 pt-6">
                <h4 className="text-sm font-medium text-slate-900 mb-4">Cambiar Plan</h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {planOrder.map((pType) => (
                    <button
                      key={pType}
                      onClick={() => handleChangePlan(pType)}
                      disabled={changingPlan || effectivePlan === pType}
                      className={`relative p-4 rounded-lg border-2 text-left transition-all ${
                        effectivePlan === pType
                          ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      {effectivePlan === pType && (
                        <div className="absolute top-0 right-0 transform translate-x-1/3 -translate-y-1/3">
                          <div className="bg-indigo-600 text-white rounded-full p-1 shadow-sm">
                            <Check className="w-3 h-3" />
                          </div>
                        </div>
                      )}
                      <p className="font-semibold text-slate-900">{planFeatures[pType].label}</p>
                      <p className="text-sm text-slate-500 mb-2">${planFeatures[pType].price}</p>
                      <p className="text-xs text-slate-400">{planFeatures[pType].limits}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-slate-100">
                <button
                  onClick={() => handleChangePlan(PlanType.INACTIVE)}
                  className="flex items-center text-red-600 text-sm hover:text-red-700 font-medium"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  Cancelar suscripción
                </button>
              </div>
            </div>
          </div>

          {/* Datos bancarios */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-indigo-600 px-6 py-3 text-white">
              <h3 className="text-sm font-semibold">Datos bancarios para facturación</h3>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">IBAN</label>
                  <input
                    type="text"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="ES00 0000 0000 0000 0000 0000"
                    value={bankIban}
                    onChange={(e) => setBankIban(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">SWIFT / BIC</label>
                  <input
                    type="text"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                    placeholder="BBVAESMMXXX"
                    value={bankSwift}
                    onChange={(e) => setBankSwift(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre del banco</label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Banco Ejemplo, S.A."
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Dirección del banco</label>
                <input
                  type="text"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Calle y ciudad del banco"
                  value={bankAddress}
                  onChange={(e) => setBankAddress(e.target.value)}
                />
              </div>

              <div className="pt-2">
                <button
                  onClick={handleSaveBankData}
                  disabled={savingBankData || !customerId}
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-60"
                >
                  {savingBankData && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Guardar cambios
                </button>
                {!customerId && (
                  <p className="text-xs text-slate-400 mt-2">
                    No se pudo resolver tu customerId aún (revisa tabla customers/email).
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Historial de facturas */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 h-full">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-500" />
                Facturas
              </h3>
              <button className="text-xs text-indigo-600 font-medium hover:underline">Ver todas</button>
            </div>

            <div className="p-2">
              {loading && invoices.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-slate-500 text-sm gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Cargando facturas...
                </div>
              ) : invoices.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-sm">No hay facturas disponibles</div>
              ) : (
                <div className="space-y-1">
                  {invoices.map((inv) => (
                    <div
                      key={inv.id}
                      className="p-3 hover:bg-slate-50 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 transition-colors"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium text-slate-900">{new Date(inv.date).toLocaleDateString()}</p>
                        <p className="text-xs text-slate-500 truncate max-w-[160px]">{inv.description}</p>
                        <div className="mt-1 sm:hidden flex items-center justify-between w-full">
                          <p className="text-sm font-semibold text-slate-900">${inv.amount}</p>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full ${
                              inv.status === "Paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                            }`}
                          >
                            {inv.status === "Paid" ? "Pagado" : "Pend"}
                          </span>
                        </div>
                      </div>

                      <div className="hidden sm:block text-right">
                        <p className="text-sm font-semibold text-slate-900">${inv.amount}</p>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full ${
                            inv.status === "Paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {inv.status === "Paid" ? "Pagado" : "Pend"}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 sm:ml-2 border-t sm:border-t-0 sm:border-l border-slate-100 pt-2 sm:pt-0 pl-0 sm:pl-2 w-full sm:w-auto justify-end">
                        {processingInvoiceId === inv.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                        ) : (
                          <>
                            <button
                              onClick={() => handleDownloadInvoice(inv.id)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                              title="Descargar PDF"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleEmailInvoice(inv.id)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors"
                              title="Reenviar por Email"
                            >
                              <Mail className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-xl">
              <div className="flex items-start gap-2 text-xs text-slate-500">
                <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
                <p>Si tienes problemas con la facturación, contacta a informacion@debacu.com</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Debug mínimo (opcional): te ayuda a ver si está resolviendo customerId */}
      <div className="text-[11px] text-slate-400">
        customerId: <span className="font-mono">{customerId ?? "null"}</span>
      </div>
    </div>
  );
};
