// src/services/checkoutCreate.service.ts
import { callEvalFn } from "@/services/callEvalFn";

export type CreateCheckoutInput = {
  org_id: string;
  plan_code: "BASIC" | "MEDIUM" | "PREMIUM";
  billing_frequency?: "MONTHLY" | "YEARLY";
  return_to?: string; // opcional (si tu Edge lo soporta)
};

type CreateCheckoutResponse = {
  ok: boolean;
  data?: {
    url?: string;
    checkout_url?: string; // compat si cambias el nombre en backend
    pending_subscription_id?: string;
    stripe_checkout_session_id?: string;
  };
  error?: string;
  detail?: string;
};

export async function createCheckout(input: CreateCheckoutInput): Promise<{ url: string }> {
  const res = await callEvalFn<CreateCheckoutResponse>("debacu_eval_checkout_create", {
    org_id: input.org_id,
    plan_code: input.plan_code,
    billing_frequency: input.billing_frequency ?? "MONTHLY",
    // si tu backend no lo usa, lo ignorará sin romper
    return_to: input.return_to ?? "",
    app_id: "DEBACU_EVAL",
  });

  const url = res?.data?.url || res?.data?.checkout_url;

  if (!res?.ok || !url) {
    throw new Error(res?.detail || res?.error || "checkout_create_failed");
  }

  return { url };
}