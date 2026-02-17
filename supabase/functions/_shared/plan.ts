import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type PlanCode = "FREE" | "BASIC" | "MEDIUM" | "PREMIUM";
export type SubStatus =
  | "TRIAL_ACTIVE"
  | "ACTIVE"
  | "PENDING_PAYMENT"
  | "PAST_DUE"
  | "CANCELED"
  | "SUSPENDED";

export function planMaxUsers(plan: PlanCode): number {
  switch (plan) {
    case "FREE":
    case "BASIC":
      return 1;
    case "MEDIUM":
      return 2;
    case "PREMIUM":
      return 4;
  }
}

export function isAppEnabled(status: SubStatus): boolean {
  return status === "ACTIVE" || status === "TRIAL_ACTIVE";
}

export function supabaseAdmin(req: Request) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(url, key, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
}

export function supabaseUser(req: Request) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  return createClient(url, anon, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
}

export async function getAuthUserOrThrow(sbUser: ReturnType<typeof supabaseUser>) {
  const { data, error } = await sbUser.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

export async function getCustomerIdForUserOrThrow(
  sbAdmin: ReturnType<typeof supabaseAdmin>,
  userId: string
): Promise<string> {
  const { data, error } = await sbAdmin
    .from("debacu_eval_hotel_profile")
    .select("customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.customer_id) throw new Error("NO_CUSTOMER");
  return data.customer_id as string;
}

export type ActiveSub = {
  id: string;
  customer_id: string;
  plan_code: PlanCode;
  status: SubStatus;
};

export async function getCurrentSubscriptionOrThrow(
  sbAdmin: ReturnType<typeof supabaseAdmin>,
  customerId: string
): Promise<ActiveSub> {
  const { data, error } = await sbAdmin
    .from("subscriptions")
    .select("id, customer_id, plan_code, status")
    .eq("customer_id", customerId)
    .eq("app_id", "debacu_eval")
    .in("status", ["TRIAL_ACTIVE", "ACTIVE"])
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("NO_ACTIVE_SUBSCRIPTION");
  return data as ActiveSub;
}

export async function assertAppEnabledOrThrow(sub: ActiveSub) {
  if (!isAppEnabled(sub.status)) {
    throw new Error(`PLAN_NOT_ACTIVE:${sub.status}`);
  }
}
