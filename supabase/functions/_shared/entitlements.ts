// supabase/functions/_shared/entitlements.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export type OrgRole = "OWNER" | "ADMIN" | "STAFF";
export type SubStatus = "ACTIVE" | "TRIAL_ACTIVE" | "PENDING_PAYMENT" | "PAST_DUE" | "SUSPENDED" | "CANCELED" | "REPLACED" | string;

export function sbService() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function up(v: any) {
  return String(v ?? "").trim().toUpperCase();
}

export async function requireOrgMemberRole(sb: ReturnType<typeof sbService>, userId: string, orgId: string, roles: OrgRole[]) {
  const { data, error } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, role, status")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (error || !data) return null;
  const role = up(data.role) as OrgRole;
  if (!roles.includes(role)) return null;
  return { org_id: data.org_id as string, role };
}

export type OrgEntitlements = {
  org_id: string;
  customer_id: string | null;
  seats_used: number;
  plan_code: string | null;
  max_users: number | null;
  subscription_status: SubStatus | null;

  next_billing_date?: string | null;
  required_plan_code?: string | null;
  required_billing_frequency?: string | null;
  stripe_schedule_id?: string | null;
};

export async function getOrgEntitlements(sb: ReturnType<typeof sbService>, orgId: string) {
  const { data, error } = await sb
    .from("debacu_eval_org_entitlements_v")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    org_id: data.org_id,
    customer_id: data.customer_id ?? null,
    seats_used: Number(data.seats_used ?? 0),
    plan_code: data.plan_code ?? null,
    max_users: data.max_users == null ? null : Number(data.max_users),
    subscription_status: data.subscription_status ?? null,

    next_billing_date: data.next_billing_date ?? null,
    required_plan_code: data.required_plan_code ?? null,
    required_billing_frequency: data.required_billing_frequency ?? null,
    stripe_schedule_id: data.stripe_schedule_id ?? null,
  } as OrgEntitlements;
}

export function isAccessEnabled(status: SubStatus | null) {
  const s = up(status);
  return s === "ACTIVE" || s === "TRIAL_ACTIVE";
}

export function assertHasCustomer(ent: OrgEntitlements) {
  if (!ent.customer_id) throw new Error("missing_customer_id");
}

export function assertEnabled(ent: OrgEntitlements) {
  if (!isAccessEnabled(ent.subscription_status)) throw new Error("plan_not_active");
  if (!ent.plan_code || !ent.max_users) throw new Error("missing_plan_limits");
}

export function assertSeatAvailable(ent: OrgEntitlements) {
  if (ent.max_users == null) throw new Error("missing_plan_limits");
  if (ent.seats_used >= ent.max_users) throw new Error("seats_exceeded");
}