// src/services/subscriptionManage.ts

const TOKEN_KEY = "debacu_eval_token";
const FUNCTION_NAME = "debacu_eval_subscription_manage";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
if (!supabaseUrl) throw new Error("Missing VITE_SUPABASE_URL environment variable");

const functionsBase = supabaseUrl.replace(".supabase.co", ".functions.supabase.co");
const FUNCTIONS_ENDPOINT = `${functionsBase}/functions/v1/${FUNCTION_NAME}`;

export type PaidPlanCode = "BASIC" | "MEDIUM" | "PREMIUM";
export type PlanCode = "FREE" | PaidPlanCode;

export type BillingFrequency = "MONTHLY" | "YEARLY" | "FREE_TRIAL";

const DEFAULT_APP_ID = "DEBACU_EVAL";

/** Acciones soportadas por el backend */
export type SubscriptionManageAction = "CHANGE" | "SCHEDULE_DOWNGRADE" | "CANCEL_DOWNGRADE";

/** Params comunes */
type BaseParams = {
  customer_id: string;
  app_id?: string;
  billing_frequency?: Exclude<BillingFrequency, "FREE_TRIAL">;
};

/** ✅ Unión discriminada por action (tipado correcto) */
export type ManagePlanParams =
  | (BaseParams & {
      action: "CHANGE";
      target_plan_code: PaidPlanCode;
    })
  | (BaseParams & {
      action: "SCHEDULE_DOWNGRADE";
      target_plan_code: PaidPlanCode;
    })
  | (BaseParams & {
      action: "CANCEL_DOWNGRADE";
      // NO target_plan_code aquí
    });

/** Response al hacer CHANGE (upgrade) */
export interface ChangePlanResponse {
  checkout_url: string;
  pending_subscription_id?: string;
}

/** Response al hacer SCHEDULE_DOWNGRADE (next_cycle) */
export interface ScheduleDowngradeResponse {
  ok: true;
  scheduled: boolean;
  effective_date?: string | null;
  current_plan_code?: PaidPlanCode | null;
  target_plan_code?: PaidPlanCode | null;
}

/** Response al hacer CANCEL_DOWNGRADE */
export interface CancelDowngradeResponse {
  ok: true;
}

/** Union de responses */
export type ManagePlanResponse = ChangePlanResponse | ScheduleDowngradeResponse | CancelDowngradeResponse;

function getTokenOrThrow() {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  if (!token) throw new Error("Sesión no detectada. Inicia sesión nuevamente.");
  return token;
}

async function post(body: any) {
  const token = getTokenOrThrow();

  const response = await fetch(FUNCTIONS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));

  // ✅ Caso especial: ya hay pendiente
  if (response.status === 409) {
    const err: any = new Error(payload?.error ?? "Ya existe un cambio de plan pendiente.");
    err.code = payload?.code ?? "PENDING_CHANGE";
    err.pending_subscription_id = payload?.pending_subscription_id ?? payload?.pendingSubscriptionId;
    throw err;
  }

  if (!response.ok) {
    throw new Error(payload?.error ?? "No se pudo completar la operación.");
  }

  return payload;
}

/**
 * API principal:
 * - action CHANGE -> devuelve checkout_url
 * - action SCHEDULE_DOWNGRADE -> devuelve ok/scheduled/effective_date...
 * - action CANCEL_DOWNGRADE -> devuelve ok
 */
export async function managePlan(params: ManagePlanParams): Promise<ManagePlanResponse> {
  // Construimos body de forma limpia según action
  const body: any = {
    action: params.action,
    customer_id: params.customer_id,
    app_id: params.app_id ?? DEFAULT_APP_ID,
  };

  // Solo si aplica
  if (params.action === "CHANGE" || params.action === "SCHEDULE_DOWNGRADE") {
    body.target_plan_code = params.target_plan_code;
    body.billing_frequency = params.billing_frequency ?? "MONTHLY";
  }

  const payload = await post(body);

  // ✅ CHANGE
  if (params.action === "CHANGE") {
    const checkout_url = payload?.checkout_url ?? payload?.checkoutUrl ?? null;
    const pending_subscription_id =
      payload?.pending_subscription_id ?? payload?.pendingSubscriptionId ?? undefined;

    if (!checkout_url) throw new Error("La respuesta del servidor no contiene checkout_url.");
    return { checkout_url, pending_subscription_id };
  }

  // ✅ CANCEL_DOWNGRADE
  if (params.action === "CANCEL_DOWNGRADE") {
    const ok = Boolean(payload?.ok);
    if (!ok) throw new Error(payload?.error ?? "No se pudo cancelar la bajada programada.");
    return { ok: true };
  }

  // ✅ SCHEDULE_DOWNGRADE
  const ok = Boolean(payload?.ok ?? true);
  const scheduled = Boolean(payload?.scheduled ?? true);

  if (!ok) {
    throw new Error(payload?.error ?? "No se pudo programar la bajada de plan.");
  }

  return {
    ok: true,
    scheduled,
    effective_date: payload?.effective_date ?? payload?.effectiveDate ?? null,
    current_plan_code: payload?.current_plan_code ?? payload?.currentPlanCode ?? null,
    target_plan_code: payload?.target_plan_code ?? payload?.targetPlanCode ?? params.target_plan_code,
  };
}

/** Compat: upgrade (CHANGE) */
export interface ChangePlanParams {
  target_plan_code: PaidPlanCode;
  customer_id: string;
  billing_frequency?: Exclude<BillingFrequency, "FREE_TRIAL">;
  app_id?: string;
}

export async function changePlan(params: ChangePlanParams): Promise<ChangePlanResponse> {
  const res = await managePlan({
    action: "CHANGE",
    target_plan_code: params.target_plan_code,
    billing_frequency: params.billing_frequency ?? "MONTHLY",
    customer_id: params.customer_id,
    app_id: params.app_id ?? DEFAULT_APP_ID,
  });

  return res as ChangePlanResponse;
}

/** Downgrade (next_cycle) */
export async function scheduleDowngrade(params: ChangePlanParams): Promise<ScheduleDowngradeResponse> {
  const res = await managePlan({
    action: "SCHEDULE_DOWNGRADE",
    target_plan_code: params.target_plan_code,
    billing_frequency: params.billing_frequency ?? "MONTHLY",
    customer_id: params.customer_id,
    app_id: params.app_id ?? DEFAULT_APP_ID,
  });

  return res as ScheduleDowngradeResponse;
}

/** Cancel downgrade */
export async function cancelDowngrade(params: {
  customer_id: string;
  app_id?: string;
}): Promise<CancelDowngradeResponse> {
  const res = await managePlan({
    action: "CANCEL_DOWNGRADE",
    customer_id: params.customer_id,
    app_id: params.app_id ?? DEFAULT_APP_ID,
  });

  return res as CancelDowngradeResponse;
}
