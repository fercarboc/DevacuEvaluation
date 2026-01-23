import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/services/supabaseClient";
import type { Database } from "@/types/database";

const APP_CODE = "DEBACU_EVAL";
const STATUS_PRIORITY = ["ACTIVE", "PENDING_PAYMENT", "SUSPENDED"];
const PAYWALL_STATUSES = new Set(["PENDING_PAYMENT", "SUSPENDED"]);

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
};

export async function get_plan_by_id(plan_id: string): Promise<PlanRow | null> {
  const { data, error } = await supabase
    .from("plans")
    .select("*")
    .eq("id", plan_id)
    .maybeSingle();

  if (error) {
    console.debug("get_plan_by_id error", error);
    return null;
  }

  return data ?? null;
}

export async function get_current_subscription(
  customer_id: string,
  app_id: string = APP_CODE
): Promise<SubscriptionRow | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("customer_id", customer_id)
    .eq("app_id", app_id)
    .order("created_at", { ascending: false })
    .limit(25);

  if (error) {
    console.debug("get_current_subscription error", error);
    return null;
  }

  const subscriptions = data ?? [];
  const hasNonReplaced = subscriptions.some((item) => item.status !== "REPLACED");

  for (const status of STATUS_PRIORITY) {
    const candidate = subscriptions.find((item) => item.status === status);
    if (candidate && (candidate.status !== "REPLACED" || !hasNonReplaced)) {
      return candidate;
    }
  }

  if (hasNonReplaced) {
    const fallback = subscriptions.find((item) => item.status !== "REPLACED");
    if (fallback) return fallback;
  }

  return subscriptions[0] ?? null;
}

export async function build_subscription_ui_state(
  customer_id: string,
  app_id: string = APP_CODE
): Promise<SubscriptionUiState> {
  const subscription = await get_current_subscription(customer_id, app_id);
  const plan = subscription?.plan_id ? await get_plan_by_id(subscription.plan_id) : null;

  const plan_name = plan?.name ?? plan?.code ?? "Plan activo";
  const plan_code = plan?.code ? plan.code.toUpperCase() : null;
  const limits = plan?.max_queries_per_month ?? null;
  const status = subscription?.status ?? null;
  const next_billing_date = subscription?.next_billing_date ?? null;
  const is_paywalled = !!status && PAYWALL_STATUSES.has(status);

  return {
    subscription: subscription ?? null,
    plan: plan ?? null,
    plan_display_name: plan_name,
    plan_code: plan_code,
    limits_max_queries_per_month: limits,
    next_billing_date,
    status,
    is_paywalled,
  };
}

export function is_paywalled(state?: SubscriptionUiState | null) {
  return Boolean(state?.status && PAYWALL_STATUSES.has(state.status));
}

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
      setState(payload);
      setError(null);
      return payload;
    } catch (err: any) {
      console.debug("use_subscription_state error", err);
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

export function use_paywall_guard(customer_id?: string, app_id: string = APP_CODE) {
  const { state, loading, error, refresh } = use_subscription_state(customer_id, app_id);
  const paywalled = is_paywalled(state);
  return { state, loading, error, refresh, is_paywalled: paywalled };
}
