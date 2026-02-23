// src/services/subscriptionChange.service.ts
import { callEvalFn } from "@/services/callEvalFn";

export type BillingFrequency = "MONTHLY" | "YEARLY";
export type PaidPlanCode = "BASIC" | "MEDIUM" | "PREMIUM";

export type ManageAction = "CHANGE" | "SCHEDULE_DOWNGRADE" | "CANCEL_DOWNGRADE" | "GET";

export type ChangeSubscriptionInput = {
  org_id: string;
  action: ManageAction;

  // para CHANGE y SCHEDULE_DOWNGRADE
  plan_code?: PaidPlanCode;
  billing_frequency?: BillingFrequency;

  // opcional
  return_to?: string;
};

function normalizeResp(resp: any) {
  // Tu backend devuelve { checkoutUrl } (camel) en handleChange
  // y en frontend a veces esperas checkout_url. Normalizamos.
  const checkoutUrl = resp?.checkoutUrl ?? resp?.checkout_url ?? resp?.url ?? null;
  return { ...resp, checkoutUrl };
}

export async function changeSubscriptionPlan(input: ChangeSubscriptionInput) {
  const payload: any = {
    org_id: input.org_id,
    action: input.action,
    return_to: input.return_to ?? undefined,
  };

  if (input.plan_code) payload.target_plan_code = input.plan_code;
  if (input.billing_frequency) payload.billing_frequency = input.billing_frequency;

  const resp = await callEvalFn("debacu_eval_subscription_manage", payload);
  return normalizeResp(resp);
}