const TOKEN_KEY = "debacu_eval_token";
const FUNCTION_NAME = "debacu_eval_subscription_manage";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
if (!supabaseUrl) throw new Error("Missing VITE_SUPABASE_URL environment variable");

const functionsBase = supabaseUrl.replace(".supabase.co", ".functions.supabase.co");
const FUNCTIONS_ENDPOINT = `${functionsBase}/functions/v1/${FUNCTION_NAME}`;

export type PlanCode = "FREE" | "BASIC" | "MEDIUM" | "PREMIUM";
export type BillingFrequency = "MONTHLY" | "YEARLY" | "FREE_TRIAL";

const DEFAULT_APP_ID = "DEBACU_EVAL";

export interface ChangePlanParams {
  target_plan_code: Exclude<PlanCode, "FREE">;
  customer_id: string;
  billing_frequency?: BillingFrequency;
  app_id?: string;
}

export interface ChangePlanResponse {
  checkout_url: string;
  pending_subscription_id?: string;
}

export async function changePlan(params: ChangePlanParams): Promise<ChangePlanResponse> {
  const token = typeof window !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
  if (!token) throw new Error("Sesión no detectada. Inicia sesión nuevamente.");

  const response = await fetch(FUNCTIONS_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      action: "CHANGE",
      target_plan_code: params.target_plan_code,
      billing_frequency: params.billing_frequency ?? "MONTHLY",
      customer_id: params.customer_id,
      app_id: params.app_id ?? DEFAULT_APP_ID,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  // ✅ Caso especial: ya hay pendiente
  if (response.status === 409) {
    const err: any = new Error(payload?.error ?? "Ya existe un cambio de plan pendiente.");
    err.code = "PENDING_CHANGE";
    err.pending_subscription_id = payload?.pending_subscription_id ?? payload?.pendingSubscriptionId;
    throw err;
  }

  if (!response.ok) {
    throw new Error(payload?.error ?? "No se pudo iniciar el cambio de plan.");
  }

  const checkout_url = payload?.checkout_url ?? payload?.checkoutUrl;
  const pending_subscription_id = payload?.pending_subscription_id ?? payload?.pendingSubscriptionId;

  if (!checkout_url) throw new Error("La respuesta del servidor no contiene checkout_url.");

  return { checkout_url, pending_subscription_id };
}
