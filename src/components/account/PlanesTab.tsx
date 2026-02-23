// src/components/account/PlanesTab.tsx
import React, { useEffect, useMemo, useState } from "react";
import type { User, Invoice as InvoiceBase } from "@/types/types";
import { CreditCard, FileText, Loader2 } from "lucide-react";

import { getAccountBundle } from "@/services/accountService";
import { use_subscription_state } from "@/services/debacu_eval_subscription_state.service";
import { changeSubscriptionPlan } from "@/services/subscriptionChange.service";

import type { PlanCode, PaidPlanCode } from "@/types/types";
import { PAID_PLAN_CODES } from "@/types/types";
import { getEvalOrgId, setEvalOrgId } from "@/services/callEvalFn";

type TabProps = { user: User };

type AvailablePlan = {
  id: string;
  code: PaidPlanCode;
  name: string;
  priceMonthly: number;
  description: string;
  maxQueries: number;
};

type Invoice = InvoiceBase & {
  url?: string | null;
  number?: string | null;
};

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);

const formatDate = (value?: string | null) => (value ? new Date(value).toLocaleDateString("es-ES") : "-");

const PLAN_METADATA: Record<
  PlanCode,
  { name: string; description: string; maxQueries: number; defaultPrice: number }
> = {
  BASIC: { name: "Básico", description: "Ideal para validar la plataforma con hasta 150 consultas/mes.", maxQueries: 150, defaultPrice: 30 },
  MEDIUM: { name: "Medio", description: "Para equipos en crecimiento con soporte prioritario.", maxQueries: 500, defaultPrice: 50 },
  PREMIUM: { name: "Premium", description: "API completa y gestión avanzada con 2.000 consultas/mes.", maxQueries: 2000, defaultPrice: 75 },
  FREE: { name: "Free", description: "Portal de inicio sin facturación.", maxQueries: 25, defaultPrice: 0 },
};

const PLAN_RANK: Record<PlanCode, number> = { FREE: 0, BASIC: 1, MEDIUM: 2, PREMIUM: 3 };

function buildReturnTo() {
  return window.location.pathname + window.location.search;
}

function pickCheckoutUrl(resp: any): string | null {
  const v = resp?.checkoutUrl ?? resp?.checkout_url ?? resp?.url ?? null;
  return typeof v === "string" && v.startsWith("http") ? v : null;
}

export const PlanesTab: React.FC<TabProps> = ({ user }) => {
  const [loading, setLoading] = useState(true);
  const [planError, setPlanError] = useState<string | null>(null);

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [availablePlans, setAvailablePlans] = useState<AvailablePlan[]>([]);

  const [isChangingPlan, setIsChangingPlan] = useState(false);
  const [selectedPlanCode, setSelectedPlanCode] = useState<PlanCode | null>(null);

  const { state: subscriptionState, refresh } = use_subscription_state();

  const activeSub = subscriptionState?.subscription ?? null;
  const activePlanRow = subscriptionState?.plan ?? null;

  const currentPlanCode: PlanCode = useMemo(() => {
    const code = String(subscriptionState?.plan_code ?? "").toUpperCase();
    if (code === "BASIC" || code === "MEDIUM" || code === "PREMIUM") return code;
    return "FREE";
  }, [subscriptionState?.plan_code]);

  const currentRank = PLAN_RANK[currentPlanCode] ?? 0;

  const monthlyFee = useMemo(() => {
    const fromDb = (activePlanRow as any)?.price_monthly;
    if (typeof fromDb === "number") return fromDb;
    return PLAN_METADATA[currentPlanCode]?.defaultPrice ?? 0;
  }, [activePlanRow, currentPlanCode]);

  const isFreePlan =
    currentPlanCode === "FREE" ||
    (activeSub as any)?.billing_frequency === "FREE_TRIAL" ||
    monthlyFee === 0;

  const planDisplayName =
    (activePlanRow as any)?.name ??
    PLAN_METADATA[currentPlanCode]?.name ??
    subscriptionState?.plan_display_name ??
    "Plan";

  const limitDescription =
    PLAN_METADATA[currentPlanCode]?.description ??
    (subscriptionState?.limits_max_queries_per_month
      ? `Hasta ${subscriptionState.limits_max_queries_per_month.toLocaleString("es-ES")} consultas/mes`
      : "Límites según plan");

  const maxQueries = subscriptionState?.limits_max_queries_per_month ?? PLAN_METADATA[currentPlanCode]?.maxQueries ?? null;

  const planPriceLabel = isFreePlan ? "Gratis" : formatCurrency(monthlyFee);

  const hasPendingChange = (activeSub?.status ?? subscriptionState?.status) === "PENDING_PAYMENT";

  const requiredPlan = String((activeSub as any)?.required_plan_code ?? "").trim();
  const hasScheduledDowngrade = Boolean((activeSub as any)?.stripe_schedule_id || requiredPlan);

  useEffect(() => {
    // ✅ si vuelves de Stripe con org_id, guárdalo para evitar “no puedo cargar dashboard”
    const u = new URL(window.location.href);
    const orgId = u.searchParams.get("org_id");
    if (orgId) setEvalOrgId(orgId);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setPlanError(null);

      try {
        const idToTry = (user as any)?.customerId ?? (user as any)?.customer_id ?? user.id;

        const bundle = await getAccountBundle(idToTry);
        if (cancelled) return;

        const invoiceRows = (bundle?.invoices ?? []) as any[];
        setInvoices(
          invoiceRows.map((row) => {
            const statusPaid = String(row.status ?? "").toLowerCase() === "paid";
            const invUrl = row.hosted_invoice_url ?? row.invoice_pdf ?? row.url ?? null;
            const invNumber = row.invoice_number ?? row.number ?? null;

            const desc =
              row.plan_name
                ? String(row.plan_name)
                : row.plan_code
                  ? `Plan Debacu ${String(row.plan_code)}`
                  : `Plan Debacu ${planDisplayName}`;

            return {
              id: String(row.stripe_invoice_id ?? row.id ?? ""),
              date: row.invoice_created_at ?? row.date ?? null,
              amount: typeof row.amount === "number" ? row.amount : Number(row.amount_total ?? 0) / 100,
              description: desc,
              status: statusPaid ? "Paid" : "Pending",
              url: invUrl,
              number: invNumber,
            } as Invoice;
          })
        );

        const planRows = (bundle?.plans ?? []) as any[];

        const constructedPlans: AvailablePlan[] = PAID_PLAN_CODES.map((code) => {
          const row = planRows.find((p) => String(p.code ?? "").toUpperCase() === code) ?? null;
          const meta = PLAN_METADATA[code];

          return {
            id: String(row?.id ?? code),
            code,
            name: String(row?.name ?? meta.name),
            priceMonthly: Number(row?.priceMonthly ?? row?.price_monthly ?? meta.defaultPrice),
            description: String(row?.description ?? meta.description),
            maxQueries: Number(row?.maxQueries ?? row?.max_queries_per_month ?? meta.maxQueries),
          };
        });

        setAvailablePlans(constructedPlans);

        const url = new URL(window.location.href);
        const hasSessionId = url.searchParams.has("session_id");
        if (hasSessionId) {
          url.searchParams.delete("session_id");
          window.history.replaceState({}, "", url.toString());
          setTimeout(() => void refresh(), 2500);
        }
      } catch (e: any) {
        console.error(e);
        if (!cancelled) setPlanError(e?.message ?? "Error cargando datos de plan.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, refresh, planDisplayName]);

  const handlePlanChange = async (target: PaidPlanCode) => {
    setPlanError(null);
    setSelectedPlanCode(target);
    setIsChangingPlan(true);

    const org_id = getEvalOrgId();
    const return_to = buildReturnTo();

    try {
      if (!org_id) {
        setPlanError("No se pudo resolver el org_id actual (contexto de hotel).");
        return;
      }

      if (hasPendingChange) {
        setPlanError("Ya existe un cambio de plan pendiente. Espera confirmación de Stripe.");
        return;
      }

      const targetRank = PLAN_RANK[target] ?? 0;
      const isUpgrade = targetRank > currentRank;
      const isDowngrade = targetRank < currentRank;

      if (!isUpgrade && !isDowngrade) return;

      // ✅ Downgrade: se programa para el siguiente ciclo
      if (isDowngrade && !isFreePlan) {
        const resp = await changeSubscriptionPlan({
          org_id,
          action: "SCHEDULE_DOWNGRADE",
          plan_code: target,
          billing_frequency: "MONTHLY",
          return_to,
        });

        if ((resp as any)?.ok) {
          await refresh();
          return;
        }

        await refresh();
        return;
      }

      // ✅ Upgrade (y también FREE->pago): CHANGE => crea checkout
      const resp = await changeSubscriptionPlan({
        org_id,
        action: "CHANGE",
        plan_code: target,
        billing_frequency: "MONTHLY",
        return_to,
      });

      const checkoutUrl = pickCheckoutUrl(resp);
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
        return;
      }

      await refresh();
    } catch (e: any) {
      console.error(e);
      const detail = String(e?.message ?? "");
      if (detail.includes("USE_SCHEDULE_DOWNGRADE")) {
        setPlanError("Para bajar de plan debes programarlo para el próximo ciclo (no se aplica al momento).");
      } else {
        setPlanError(e?.message ?? "No se pudo iniciar el cambio de plan.");
      }
    } finally {
      setIsChangingPlan(false);
      setSelectedPlanCode(null);
    }
  };

  const handleCancelScheduledDowngrade = async () => {
    setPlanError(null);
    setIsChangingPlan(true);

    const org_id = getEvalOrgId();
    const return_to = buildReturnTo();

    try {
      if (!org_id) {
        setPlanError("No se pudo resolver el org_id actual (contexto de hotel).");
        return;
      }

      await changeSubscriptionPlan({
        org_id,
        action: "CANCEL_DOWNGRADE",
        return_to,
      });

      await refresh();
    } catch (e: any) {
      console.error(e);
      setPlanError(e?.message ?? "No se pudo cancelar la bajada programada.");
    } finally {
      setIsChangingPlan(false);
    }
  };

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.9fr)]">
      <div className="space-y-6">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="px-6 py-5 flex items-center justify-between border-b border-slate-100">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-slate-600" />
              <p className="text-sm font-semibold text-slate-900">Plan actual</p>
            </div>

            <span className="text-[11px] uppercase tracking-wide px-3 py-1 rounded-full border border-slate-200 text-slate-600 bg-white">
              {activeSub?.status ?? "ACTIVE"}
            </span>
          </div>

          {hasScheduledDowngrade && (
            <div className="mx-6 mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-amber-800 uppercase">Bajada de plan programada</p>
                  <p className="text-sm text-amber-900">
                    Tu plan bajará a <b>{requiredPlan || "BASIC"}</b> en la próxima renovación.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isChangingPlan || hasPendingChange}
                  onClick={handleCancelScheduledDowngrade}
                  className={`shrink-0 px-3 py-2 rounded-lg text-xs font-semibold uppercase transition ${
                    isChangingPlan || hasPendingChange
                      ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                      : "bg-amber-700 text-white hover:bg-amber-800"
                  }`}
                >
                  {isChangingPlan ? "Procesando..." : "Cancelar bajada"}
                </button>
              </div>
            </div>
          )}

          <div className="p-6 space-y-5">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-3xl font-bold text-slate-900">{planPriceLabel}</p>
                {!isFreePlan && <p className="text-xs text-slate-500">/mes</p>}
              </div>
              <div className="text-right text-sm text-slate-600">
                <p>Inicio: {formatDate((activeSub as any)?.start_date)}</p>
                <p>Próxima factura: {formatDate((activeSub as any)?.next_billing_date ?? subscriptionState?.next_billing_date)}</p>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">Plan</p>
              <p className="text-lg font-semibold text-slate-900">{planDisplayName}</p>
              <p className="text-xs text-slate-500">{limitDescription}</p>
              {typeof maxQueries === "number" ? (
                <p className="text-[11px] text-slate-500">
                  Límite mensual: <span className="font-semibold">{maxQueries.toLocaleString("es-ES")}</span> consultas
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-500" /> Facturas recientes
            </p>
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
                  <div className="flex flex-col">
                    <span>{formatDate(inv.date)}</span>
                    <span className="text-xs text-slate-500">
                      {inv.description}
                      {inv.number ? ` · ${inv.number}` : ""}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="font-semibold text-slate-900">{formatCurrency(Number(inv.amount ?? 0))}</span>
                      <span className="text-[11px] ml-2 rounded-full border px-2 py-0.5">{String(inv.status ?? "")}</span>
                    </div>

                    {inv.url ? (
                      <a href={inv.url} target="_blank" rel="noreferrer" className="text-xs text-indigo-600 hover:underline">
                        Ver PDF
                      </a>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {planError && <p className="text-sm text-red-600">{planError}</p>}
      </div>

      <div className="space-y-4">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm">
          <div className="px-6 py-4">
            <p className="text-sm font-semibold text-slate-900">Planes disponibles</p>
            <p className="text-xs text-slate-500">Actualiza tu plan y completa el pago seguro en Stripe.</p>
          </div>

          <div className="space-y-4 px-6 py-5">
            {availablePlans.length === 0 ? (
              <p className="text-sm text-slate-500">Cargando planes...</p>
            ) : (
              availablePlans.map((option) => {
                const isActive = option.code === currentPlanCode;
                const optionRank = PLAN_RANK[option.code] ?? 0;
                const canChange = optionRank !== currentRank;

                const buttonDisabled = isChangingPlan || hasPendingChange || isActive || !canChange;

                const buttonLabel = isActive
                  ? "Plan actual"
                  : optionRank > currentRank
                    ? "Subir plan"
                    : "Bajar plan";

                return (
                  <div
                    key={option.code}
                    className={`rounded-2xl border p-4 transition ${
                      isActive ? "border-green-200 bg-green-50" : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{option.name}</p>
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
                        disabled={buttonDisabled}
                        onClick={() => handlePlanChange(option.code)}
                        className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase transition ${
                          buttonDisabled
                            ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                            : "bg-slate-900 text-white hover:bg-slate-800"
                        }`}
                      >
                        {isChangingPlan && selectedPlanCode === option.code ? "Procesando..." : buttonLabel}
                      </button>
                    </div>

                    <p className="mt-3 text-xs uppercase tracking-wide text-slate-500">
                      Hasta {option.maxQueries.toLocaleString("es-ES")} consultas/mes
                    </p>
                  </div>
                );
              })
            )}
          </div>

          {hasPendingChange && (
            <div className="px-6 pb-4">
              <p className="text-xs font-semibold text-amber-700 uppercase">
                Cambio de plan pendiente · espera confirmación de Stripe
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};