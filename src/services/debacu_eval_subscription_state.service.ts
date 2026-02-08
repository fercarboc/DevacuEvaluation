// src/services/debacu_eval_subscription_state.service.ts
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Database } from "@/types/database";
import { callEvalFn } from "@/services/callEvalFn";

const APP_CODE = "DEBACU_EVAL";

/**
 * IMPORTANTE
 * - Aquí NO se usa supabase.from("subscriptions") ni supabase.from("plans")
 * - Todo sale de Edge Functions (service_role) para evitar RLS/PII y tener una única source of truth.
 */

const STATUS_PRIORITY = ["ACTIVE", "PENDING_PAYMENT", "SUSPENDED"] as const;
const PAYWALL_STATUSES = new Set<string>(["PENDING_PAYMENT", "SUSPENDED"]);

export type SubscriptionRow = Database["public"]["Tables"]["subscriptions"]["Row"];
export type PlanRow = Database["public"]["Tables"]["plans"]["Row"];

export type SubscriptionUiState = {
  subscription: SubscriptionRow | null;
  plan: PlanRow | null;
  plan_display_name: string;
  plan_code: string | null;
  limits_max_queries_per_month: number | null;
  next_billing_date: string | null;
  status: string | null;
  is_paywalled: boolean;

  // opcional: para debugging/telemetría (no lo uses para lógica de negocio)
  source?: "edge";
};

type EdgeSubscriptionStatePayload = {
  // el edge debe resolver customer/org y devolver el estado correcto
  subscription: SubscriptionRow | null;
  plan: PlanRow | null;

  // redundantes pero útiles para UI sin depender del row
  plan_display_name?: string | null;
  plan_code?: string | null;
  limits_max_queries_per_month?: number | null;
  next_billing_date?: string | null;
  status?: string | null;
};

/**
 * Edge Function esperada:
 * - nombre: debacu_eval_subscription_state_get
 * - input: { customer_id, app_id }
 * - output: EdgeSubscriptionStatePayload
 */
async function fetch_subscription_state_edge(params: {
  customer_id: string;
  app_id?: string;
}): Promise<EdgeSubscriptionStatePayload> {
  const { customer_id, app_id = APP_CODE } = params;

  return callEvalFn<EdgeSubscriptionStatePayload>("debacu_eval_subscription_state_get", {
    customer_id,
    app_id,
  });
}

/**
 * Compatibilidad: antes tenías get_plan_by_id leyendo tabla plans.
 * Ahora NO se puede (RLS). Devolvemos null de forma segura.
 * Si de verdad lo necesitas, crea un edge "debacu_eval_plan_get" y llámalo aquí.
 */
export async function get_plan_by_id(_plan_id: string): Promise<PlanRow | null> {
  return null;
}

/**
 * Compatibilidad: antes devolvías 1 subscription row (prioridad por status)
 * Ahora devolvemos la que nos da el edge (ya resuelta).
 */
export async function get_current_subscription(
  customer_id: string,
  app_id: string = APP_CODE
): Promise<SubscriptionRow | null> {
  try {
    const payload = await fetch_subscription_state_edge({ customer_id, app_id });
    return payload?.subscription ?? null;
  } catch (err) {
    console.debug("get_current_subscription(edge) error", err);
    return null;
  }
}

/**
 * Source of truth para UI: viene TODO del edge.
 */
export async function build_subscription_ui_state(
  customer_id: string,
  app_id: string = APP_CODE
): Promise<SubscriptionUiState> {
  const payload = await fetch_subscription_state_edge({ customer_id, app_id });

  // Normaliza status / next_billing
  const subscription = payload?.subscription ?? null;
  const plan = payload?.plan ?? null;

  const status = (payload?.status ?? subscription?.status ?? null) as string | null;

  const next_billing_date = payload?.next_billing_date ?? subscription?.next_billing_date ?? null;

  /**
   * ⚠️ IMPORTANTE:
   * NO usar subscription.required_plan_code como "plan actual".
   * required_plan_code es el plan programado para la próxima renovación (downgrade),
   * y si lo mezclas aquí puedes pintar BASIC/MEDIUM cuando el plan ACTUAL es PREMIUM.
   */
  const plan_code_raw = payload?.plan_code ?? (plan as any)?.code ?? null;
  const plan_code = plan_code_raw ? String(plan_code_raw).toUpperCase() : null;

  const plan_display_name =
    payload?.plan_display_name ?? plan?.name ?? (plan_code ? plan_code : "Plan activo");

  const limits_max_queries_per_month =
    payload?.limits_max_queries_per_month ?? (plan as any)?.max_queries_per_month ?? null;

  const is_paywalled = !!status && PAYWALL_STATUSES.has(status);

  return {
    subscription,
    plan,
    plan_display_name,
    plan_code,
    limits_max_queries_per_month,
    next_billing_date,
    status,
    is_paywalled,
    source: "edge",
  };
}

export function is_paywalled(state?: SubscriptionUiState | null) {
  return Boolean(state?.status && PAYWALL_STATUSES.has(state.status));
}

/**
 * Hook principal
 */
export function use_subscription_state(customer_id?: string, app_id: string = APP_CODE) {
  const [state, setState] = useState<SubscriptionUiState | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!customer_id) {
      setState(null);
      setError(null);
      setLoading(false);
      return null;
    }

    setLoading(true);
    try {
      const payload = await build_subscription_ui_state(customer_id, app_id);

      // Si por cualquier razón el edge devuelve status raro, aplica prioridad mínima
      // (NO debería hacer falta si el edge ya lo hace bien)
      const normalized = { ...payload };

      if (normalized.subscription?.status) {
        const s = String(normalized.subscription.status);
        const isKnown = STATUS_PRIORITY.includes(s as any);
        if (!isKnown && s === "REPLACED") {
          // no hagas nada: edge debería filtrar
        }
      }

      setState(normalized);
      setError(null);
      return normalized;
    } catch (err: any) {
      console.debug("use_subscription_state(edge) error", err);
      setState(null);
      setError(err?.message ?? "No se pudo cargar la suscripción");
      return null;
    } finally {
      setLoading(false);
    }
  }, [customer_id, app_id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, loading, error, refresh };
}

/**
 * Hook de “paywall guard”
 */
export function use_paywall_guard(customer_id?: string, app_id: string = APP_CODE) {
  const { state, loading, error, refresh } = use_subscription_state(customer_id, app_id);
  const paywalled = useMemo(() => is_paywalled(state), [state]);
  return { state, loading, error, refresh, is_paywalled: paywalled };
}
