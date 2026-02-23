// src/services/subscriptionChange.service.ts
import { callEvalFn } from "@/services/callEvalFn";

export type BillingFrequency = "MONTHLY" | "YEARLY";
export type PaidPlanCode = "BASIC" | "MEDIUM" | "PREMIUM";

export type ManageAction = "CHANGE" | "SCHEDULE_DOWNGRADE" | "CANCEL_DOWNGRADE";

export type ChangeSubscriptionInput = {
  org_id: string;
  action: ManageAction;

  // Para CHANGE y SCHEDULE_DOWNGRADE
  plan_code?: PaidPlanCode;
  billing_frequency?: BillingFrequency;

  // navegación
  return_to?: string;
};

function toPlanCode(v?: string) {
  const up = String(v ?? "").toUpperCase().trim();
  if (up === "BASIC" || up === "MEDIUM" || up === "PREMIUM") return up as PaidPlanCode;
  return undefined;
}

function toBillingFrequency(v?: string) {
  const up = String(v ?? "").toUpperCase().trim();
  if (up === "MONTHLY" || up === "YEARLY") return up as BillingFrequency;
  return "MONTHLY";
}

export async function changeSubscriptionPlan(input: ChangeSubscriptionInput): Promise<any> {
  const org_id = String(input.org_id ?? "").trim();
  if (!org_id) throw new Error("missing_org_id");

  const action = String(input.action ?? "").toUpperCase().trim() as ManageAction;
  if (!action || (action !== "CHANGE" && action !== "SCHEDULE_DOWNGRADE" && action !== "CANCEL_DOWNGRADE")) {
    throw new Error("invalid_action");
  }

  const plan_code = toPlanCode((input as any).plan_code);
  const billing_frequency = toBillingFrequency((input as any).billing_frequency);
  const return_to = String(input.return_to ?? "").trim();

  // ✅ Payload compatible con tu Edge Function:
  // - action: "CHANGE" | "SCHEDULE_DOWNGRADE" | "CANCEL_DOWNGRADE"
  // - target_plan_code / billing_frequency
  const payload: Record<string, any> = {
    action,
    org_id,
  };

  if (return_to) payload.return_to = return_to;

  // Solo para CHANGE y SCHEDULE_DOWNGRADE pedimos target plan
  if (action === "CHANGE" || action === "SCHEDULE_DOWNGRADE") {
    if (!plan_code) throw new Error("missing_target_plan_code");
    payload.target_plan_code = plan_code;
    payload.billing_frequency = billing_frequency;
  }

  // ✅ Importante: esta función debe llamar a debacu_eval_subscription_manage
  // (no a otra) para que no vuelvas a tener caminos duplicados.
  const resp = await callEvalFn("debacu_eval_subscription_manage", payload);

  // Normalización suave: a veces devuelves checkoutUrl y otras checkout_url
  if (resp?.checkoutUrl && !resp.checkout_url) resp.checkout_url = resp.checkoutUrl;
  if (resp?.checkout_url && !resp.checkoutUrl) resp.checkoutUrl = resp.checkout_url;

  return resp;
}