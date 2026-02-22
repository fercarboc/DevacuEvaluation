// src/services/subscriptionChange.service.ts
import { callEvalFn } from "@/services/callEvalFn";

export type BillingFrequency = "MONTHLY" | "YEARLY";
export type PaidPlanCode = "BASIC" | "MEDIUM" | "PREMIUM";

export type ChangeSubscriptionAction = "CHANGE" | "CANCEL_DOWNGRADE";

export type ChangeSubscriptionInput =
  | {
      org_id: string;
      action: "CHANGE";
      plan_code: PaidPlanCode; // requerido en CHANGE
      billing_frequency?: BillingFrequency;
      return_to?: string; // opcional (si tu Edge lo soporta)
      app_id?: string; // opcional, por defecto DEBACU_EVAL
    }
  | {
      org_id: string;
      action: "CANCEL_DOWNGRADE";
      return_to?: string;
      app_id?: string;
    };

type ChangeSubscriptionResponse = {
  ok: boolean;
  // algunos backends devuelven esto
  data?: {
    checkout_url?: string; // si upgrade => Stripe checkout
    url?: string; // compat
    upgrade?: boolean;
    downgrade_scheduled?: boolean;
    scheduled?: boolean;
    canceled?: boolean;
    status?: string;
  };
  // compat con versiones antiguas que devolvían flags en root
  upgrade?: boolean;
  downgrade_scheduled?: boolean;

  error?: string;
  detail?: string;
};

export async function changeSubscriptionPlan(input: ChangeSubscriptionInput) {
  const payload: Record<string, unknown> = {
    org_id: input.org_id,
    action: input.action,
    app_id: (input as any).app_id ?? "DEBACU_EVAL",
    return_to: (input as any).return_to ?? "",
  };

  if (input.action === "CHANGE") {
    payload.plan_code = input.plan_code;
    payload.billing_frequency = input.billing_frequency ?? "MONTHLY";
  }

  const res = await callEvalFn<ChangeSubscriptionResponse>(
    "debacu_eval_subscription_change_plan",
    payload
  );

  if (!res?.ok) {
    throw new Error(res?.detail || res?.error || "subscription_change_failed");
  }

  // normalizamos flags/checkout_url para el front
  const checkout_url = res.data?.checkout_url || res.data?.url;
  const upgrade = Boolean(res.data?.upgrade ?? res.upgrade);
  const downgrade_scheduled = Boolean(
    res.data?.downgrade_scheduled ?? res.data?.scheduled ?? res.downgrade_scheduled
  );

  return {
    ...res,
    checkout_url,
    upgrade,
    downgrade_scheduled,
  };
}