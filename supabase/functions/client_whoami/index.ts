// supabase/functions/client_whoami/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const APP_ID = "DEBACU_EVAL";

// Ajusta si tu schema difiere
const MEMBERSHIP_STATUS_COLUMN = "status";
const MEMBERSHIP_ACTIVE_VALUE = "ACTIVE";

type ReqBody = {
  org_id?: string; // recomendado: UI manda org_id cuando el user tiene varios hoteles
};

function supabaseServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

function normEmail(email: string | null): string | null {
  const e = (email ?? "").trim().toLowerCase();
  return e ? e : null;
}

type PlanRow = {
  id: string;
  name: string;
  code: string | null;
  extra_config: any | null;
};

function includedSeatsFromPlan(plan: PlanRow | null): number {
  const cfg = plan?.extra_config ?? {};
  const v = cfg?.included_seats ?? cfg?.seats_included ?? null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

async function findPlanByCode(sb: any, code: string) {
  const { data, error } = await sb
    .from("plans")
    .select("id, name, code, extra_config")
    .eq("code", code)
    .eq("app_id", APP_ID)
    .maybeSingle();

  if (error) throw new Error(`plan_lookup_failed:${error.message}`);
  return data as PlanRow | null;
}

/**
 * Garantiza customer por email:
 * - Si no hay email -> crea customer genérico
 * - Si hay email -> busca por email, si no existe hace upsert por email
 *
 * NOTA: requiere UNIQUE(email) en customers si usas upsert por email.
 */
async function ensureCustomerByEmail(sb: any, email: string | null) {
  const e = normEmail(email);

  if (!e) {
    const { data, error } = await sb
      .from("customers")
      .insert({
        name: "Nueva organización",
        email: null,
        is_active: true,
        trial_used: false,
        app_id: APP_ID,
      })
      .select("id, email, name")
      .single();

    if (error) throw new Error(`customer_create_failed:${error.message}`);
    return data;
  }

  const { data: found, error: fErr } = await sb
    .from("customers")
    .select("id, email, name")
    .eq("email", e)
    .eq("app_id", APP_ID)
    .maybeSingle();

  if (fErr) throw new Error(`customer_lookup_failed:${fErr.message}`);
  if (found?.id) return found;

  const { data: created, error: cErr } = await sb
    .from("customers")
    .upsert(
      {
        name: `Org ${e}`,
        email: e,
        is_active: true,
        trial_used: false,
        app_id: APP_ID,
      },
      { onConflict: "email" },
    )
    .select("id, email, name")
    .single();

  if (cErr) throw new Error(`customer_create_failed:${cErr.message}`);
  return created;
}

/**
 * org_members.org_id tiene FK -> debacu_eval_organizations(id)
 * Garantizamos organization id = customer.id (tu modelo actual).
 */
async function ensureOrganizationForCustomer(
  sb: any,
  customer: { id: string; name?: string | null; email?: string | null },
) {
  const orgId = customer.id;

  const { data: org, error: oErr } = await sb
    .from("debacu_eval_organizations")
    .select("id")
    .eq("id", orgId)
    .maybeSingle();

  if (oErr) throw new Error(`org_lookup_failed:${oErr.message}`);
  if (org?.id) return { id: orgId };

  const name =
    (customer?.name ?? "").trim() ||
    (customer?.email ? `Org ${customer.email}` : "Nueva organización");

  const { data: created, error: cErr } = await sb
    .from("debacu_eval_organizations")
    .insert({
      id: orgId,
      name,
    })
    .select("id")
    .single();

  if (cErr) throw new Error(`org_create_failed:${cErr.message}`);
  return created;
}

async function ensureMembership(sb: any, org_id: string, user_id: string) {
  const { data: member, error: mErr } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, role, status")
    .eq("org_id", org_id)
    .eq("user_id", user_id)
    .maybeSingle();

  if (mErr) throw new Error(`membership_lookup_failed:${mErr.message}`);
  if (member?.org_id) return member;

  // por defecto OWNER + ACTIVE (ajusta si tu tabla tiene defaults/constraints)
  const { data: created, error: cErr } = await sb
    .from("debacu_eval_org_members")
    .insert({ org_id, user_id, role: "OWNER", [MEMBERSHIP_STATUS_COLUMN]: MEMBERSHIP_ACTIVE_VALUE })
    .select("org_id, role, status")
    .single();

  if (cErr) throw new Error(`membership_create_failed:${cErr.message}`);
  return created;
}

/**
 * Opcional: crea suscripción FREE si no hay ninguna.
 * OJO: esto es bootstrap de producto. Si tu flujo real ya lo hace el onboarding,
 * puedes quitarlo para no meter efectos colaterales en whoami.
 */
async function ensureSubscriptionIfNone(sb: any, customer_id: string) {
  const { data: sub, error: sErr } = await sb
    .from("subscriptions")
    .select("id")
    .eq("customer_id", customer_id)
    .eq("app_id", APP_ID)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sErr) throw new Error(`subscription_lookup_failed:${sErr.message}`);
  if (sub?.id) return;

  const freePlan = await findPlanByCode(sb, "FREE");
  if (!freePlan?.id) return;

  const today = new Date().toISOString().slice(0, 10);

  const { error: iErr } = await sb.from("subscriptions").insert({
    customer_id,
    app_id: APP_ID,
    plan_id: freePlan.id,
    billing_frequency: "FREE_TRIAL",
    start_date: today,
    status: "ACTIVE",
    provider: "manual",
    extra_seats: 0,
  });

  if (iErr) {
    // whoami NO debe caerse por esto
    console.warn("subscription_bootstrap_failed", iErr.message);
  }
}

/** ======================================================
 * Multi-org resolution (UI should send org_id)
 * ====================================================== */
async function resolveOrgIdOrThrow(
  sb: any,
  userId: string,
  requestedOrgId?: string | null,
) {
  if (requestedOrgId) {
    const orgId = String(requestedOrgId).trim();
    if (!isUuid(orgId)) throw new Error("invalid_org_id");

    const { data, error } = await sb
      .from("debacu_eval_org_members")
      .select("org_id")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq(MEMBERSHIP_STATUS_COLUMN, MEMBERSHIP_ACTIVE_VALUE)
      .maybeSingle();

    if (error) throw new Error(`membership_lookup_failed:${error.message}`);
    if (!data?.org_id) throw new Error("FORBIDDEN");
    return orgId;
  }

  const { data, error } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .eq("user_id", userId)
    .eq(MEMBERSHIP_STATUS_COLUMN, MEMBERSHIP_ACTIVE_VALUE)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`membership_lookup_failed:${error.message}`);
  if (!data?.org_id) throw new Error("FORBIDDEN");
  return String(data.org_id);
}

/** ======================================================
 * Entitlements, subscription, plan, seats
 * ====================================================== */
type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  subscription_status: string | null;
  plan_code: string | null;
  max_users: number | null;
  seats_used: number | null;
};

async function loadEntitlements(sb: any, orgId: string): Promise<EntitlementsRow | null> {
  const { data, error } = await sb
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, subscription_status, plan_code, max_users, seats_used")
    .eq("org_id", orgId)
    .maybeSingle();

  // whoami: best-effort (si falla view, devolvemos null y seguimos con fallback)
  if (error) return null;
  return (data ?? null) as EntitlementsRow | null;
}

async function loadLatestSubscription(sb: any, customer_id: string) {
  const { data, error } = await sb
    .from("subscriptions")
    .select("id, plan_id, status, trial_ends_at, grace_ends_at, suspended_at, extra_seats, billing_frequency")
    .eq("customer_id", customer_id)
    .eq("app_id", APP_ID)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`subscription_query_failed:${error.message}`);
  return data ?? null;
}

async function loadPlanById(sb: any, plan_id: string) {
  const { data, error } = await sb
    .from("plans")
    .select("id, name, code, extra_config")
    .eq("id", plan_id)
    .maybeSingle();

  if (error) throw new Error(`plan_query_failed:${error.message}`);
  return (data ?? null) as PlanRow | null;
}

async function countSeatsUsed(sb: any, org_id: string) {
  // si quieres excluir INVITED/SUSPENDED, aquí debes filtrar status.
  const { count, error } = await sb
    .from("debacu_eval_org_members")
    .select("id", { count: "exact", head: true })
    .eq("org_id", org_id);

  if (error) throw new Error(`seat_count_failed:${error.message}`);
  return count ?? 0;
}

/** ======================================================
 * MAIN
 * ====================================================== */
export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  const sb = supabaseServiceClient();

  try {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const user_id = user.id;
    const email = normEmail(user.email ?? null);

    // 1) ¿tiene membership?
    const { data: member0, error: m0Err } = await sb
      .from("debacu_eval_org_members")
      .select("org_id, role, status, created_at")
      .eq("user_id", user_id)
      .order("created_at", { ascending: true })
      .limit(50);

    if (m0Err) throw new Error(`membership_query_failed:${m0Err.message}`);

    const memberships = (member0 ?? []).map((m: any) => ({
      org_id: String(m.org_id),
      role: (m.role ?? null) as string | null,
      status: (m.status ?? null) as string | null,
      created_at: m.created_at ?? null,
    }));

    // 2) Bootstrap si NO tiene ninguna membership (solo en este caso)
    if (memberships.length === 0) {
      const customer = await ensureCustomerByEmail(sb, email);
      const org = await ensureOrganizationForCustomer(sb, customer);
      const mem = await ensureMembership(sb, org.id, user_id);

      // opcional (ver comentario)
      await ensureSubscriptionIfNone(sb, customer.id);

      memberships.push({
        org_id: String(mem.org_id),
        role: (mem.role ?? "OWNER") as string,
        status: (mem.status ?? MEMBERSHIP_ACTIVE_VALUE) as string,
        created_at: null,
      });
    }

    // 3) Resolver org actual (UI manda org_id si multi-org)
    const org_id = await resolveOrgIdOrThrow(sb, user_id, body?.org_id ?? null);

    // 4) Entitlements (best-effort). Si no hay, asumimos customer_id = org_id (tu modelo)
    const ent = await loadEntitlements(sb, org_id);
    const customer_id = String(ent?.customer_id ?? org_id);

    // 5) Subscription + plan (best-effort controlado)
    const sub = await loadLatestSubscription(sb, customer_id);

    let plan: PlanRow | null = null;
    if (sub?.plan_id) {
      plan = await loadPlanById(sb, String(sub.plan_id));
    }

    // 6) Seats
    const used = await countSeatsUsed(sb, org_id);

    const included = includedSeatsFromPlan(plan);
    const extra = Number.isFinite(Number(sub?.extra_seats)) ? Math.max(0, Number(sub?.extra_seats)) : 0;
    const allowed = included + extra;

    // 7) Trial flags (no bloquea whoami)
    const now = new Date();
    const trialEnds = sub?.trial_ends_at ? new Date(sub.trial_ends_at) : null;
    const trialActive = !!trialEnds && trialEnds.getTime() > now.getTime();
    const trialExpired = !!trialEnds && trialEnds.getTime() <= now.getTime();

    return json(req, 200, {
      ok: true,
      data: {
        user_id,
        email,
        // multi-org
        org_id,
        memberships,
        // entitlements (si existe)
        entitlements: ent
          ? {
              subscription_status: ent.subscription_status ?? null,
              plan_code: ent.plan_code ?? null,
              max_users: ent.max_users ?? null,
              seats_used: ent.seats_used ?? null,
            }
          : null,
        // plan/subscription (según tablas)
        plan: plan ? { id: plan.id, name: plan.name, code: plan.code, included_seats: included } : null,
        subscription: sub
          ? {
              id: sub.id,
              status: sub.status ?? null,
              billing_frequency: sub.billing_frequency ?? null,
              suspended_at: sub.suspended_at ?? null,
              grace_ends_at: sub.grace_ends_at ?? null,
            }
          : null,
        seats: { used, included, extra, allowed },
        trial: {
          active: trialActive,
          ends_at: trialEnds ? trialEnds.toISOString() : null,
          expired: trialExpired,
        },
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, { ok: false, error: "UNAUTHENTICATED" });
    }

    if (msg.startsWith("invalid_") || msg.startsWith("missing_")) {
      return json(req, 400, { ok: false, error: msg });
    }

    if (msg === "FORBIDDEN" || msg.startsWith("forbidden_")) {
      return json(req, 403, { ok: false, error: "FORBIDDEN" });
    }

    // no filtramos trazas
    console.error("client_whoami error:", msg);
    return json(req, 500, { ok: false, error: "request_failed", detail: "internal_error" });
  }
});
