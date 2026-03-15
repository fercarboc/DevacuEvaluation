// supabase/functions/_shared/plans.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Planes soportados (plan_code) */
export type PlanCode = "FREE" | "BASIC" | "MEDIUM" | "PREMIUM";

/**
 * Estados soportados (subscription_status / status)
 * OJO: tu vista devuelve TRIAL_ACTIVE (y quizá otros).
 */
export type SubStatus =
  | "TRIAL_ACTIVE"
  | "ACTIVE"
  | "PENDING_PAYMENT"
  | "PAST_DUE"
  | "CANCELED"
  | "SUSPENDED";

/** Entitlements (vista org_entitlements_v) */
export type OrgEntitlements = {
  org_id: string;
  customer_id: string;
  plan_code: string | null;
  subscription_status: string | null;
  seats_used: number | null;
  max_users: number | null;
};

/** Límite de usuarios por plan (si lo necesitas en UI/BE) */
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

/**
 * ✅ Helper robusto: acepta unknown, normaliza
 * Sirve tanto para subscription_status (vista) como status (subscriptions),
 * siempre que uses los mismos literales.
 */
export function isAppEnabledStatus(status: unknown): boolean {
  const v = String(status ?? "").toUpperCase();
  return v === "ACTIVE" || v === "TRIAL_ACTIVE";
}

/** Lanza error estándar si no está habilitado */
export function assertAppEnabledStatusOrThrow(status: unknown) {
  if (!isAppEnabledStatus(status)) throw new Error("PLAN_NOT_ACTIVE");
}

/**
 * Admin client (service role) – añade Authorization del request
 * (mantiene tu patrón actual).
 */
export function supabaseAdmin(req?: Request) {
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req?.headers?.get("Authorization") ?? "";
  return createClient(url, key, {
    global: { headers: { Authorization: auth } },
  });
}

/** User client (anon) – añade Authorization del request */
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

/**
 * ✅ Entitlements por ORG (multi-org correcto)
 * Esto es lo que deben usar exports/informes.
 */
export async function getOrgEntitlementsOrThrow(
  sbAdmin: ReturnType<typeof supabaseAdmin>,
  orgId: string
): Promise<OrgEntitlements> {
  const { data, error } = await sbAdmin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, seats_used, plan_code, max_users, subscription_status")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`ENTITLEMENTS_FAILED:${error.message}`);
  if (!data?.org_id || !data?.customer_id) throw new Error("FORBIDDEN_NO_CUSTOMER");

  return data as OrgEntitlements;
}

/** ✅ Valida acceso habilitado (ACTIVE o TRIAL_ACTIVE) */
export function assertOrgEnabledOrThrow(ent: OrgEntitlements) {
  if (!isAppEnabledStatus(ent.subscription_status)) throw new Error("PLAN_NOT_ACTIVE");
}

