// supabase/functions/client_whoami/index.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const APP_ID = "DEBACU_EVAL";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function getBearer(req: Request) {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
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
 * IMPORTANTE: para upsert requiere UNIQUE(email) en customers.
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
      { onConflict: "email" }
    )
    .select("id, email, name")
    .single();

  if (cErr) throw new Error(`customer_create_failed:${cErr.message}`);
  return created;
}

/**
 * ⚠️ CLAVE:
 * org_members.org_id tiene FK -> debacu_eval_organizations(id)
 * Por eso garantizamos que exista una organization con id = customer.id
 *
 * Esto evita tener que mapear ids distintos (customer_id / org_id).
 */
async function ensureOrganizationForCustomer(
  sb: any,
  customer: { id: string; name?: string | null; email?: string | null }
) {
  const orgId = customer.id;

  // 1) Si ya existe, listo
  const { data: org, error: oErr } = await sb
    .from("debacu_eval_organizations")
    .select("id")
    .eq("id", orgId)
    .maybeSingle();

  if (oErr) throw new Error(`org_lookup_failed:${oErr.message}`);
  if (org?.id) return { id: orgId };

  // 2) Crear org con el mismo id (para que org_members FK no falle)
  // Nota: created_at normalmente tiene default now() así que no hace falta.
  // Rellenamos solo lo mínimo seguro: id + name.
  const name =
    (customer?.name ?? "").trim() ||
    (customer?.email ? `Org ${customer.email}` : "Nueva organización");

  const { data: created, error: cErr } = await sb
    .from("debacu_eval_organizations")
    .insert({
      id: orgId,
      name,
      // opcional:
      // country: "ESP",
    })
    .select("id")
    .single();

  if (cErr) throw new Error(`org_create_failed:${cErr.message}`);
  return created;
}


async function ensureMembership(sb: any, org_id: string, user_id: string) {
  const { data: member, error: mErr } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, role")
    .eq("org_id", org_id)
    .eq("user_id", user_id)
    .maybeSingle();

  if (mErr) throw new Error(`membership_lookup_failed:${mErr.message}`);
  if (member?.org_id) return member;

  const { data: created, error: cErr } = await sb
    .from("debacu_eval_org_members")
    .insert({ org_id, user_id, role: "OWNER" })
    .select("org_id, role")
    .single();

  if (cErr) throw new Error(`membership_create_failed:${cErr.message}`);
  return created;
}

/**
 * Opcional: crea suscripción FREE_TRIAL si no hay ninguna
 * (si ya tienes un flujo distinto, puedes quitar esto)
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
  if (!freePlan?.id) return; // si no existe, no hacemos nada

  // OJO: tu tabla subscriptions ya tiene billing_frequency tipo FREE_TRIAL en ejemplos.
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
    // no tiramos whoami si esto falla
    console.warn("subscription_bootstrap_failed", iErr.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  try {
    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
    const SRV_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const token = getBearer(req);
    if (!token) return json(401, { ok: false, error: "missing_bearer" });

    // 1) Validar JWT con ANON
    const sbUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await sbUser.auth.getUser();
    if (uErr || !u?.user) return json(401, { ok: false, error: "invalid_token" });

    const user_id = u.user.id;
    const email = normEmail(u.user.email ?? null);

    // 2) Service role
    const sb = createClient(SUPABASE_URL, SRV_KEY, { auth: { persistSession: false } });

    // 3) ¿ya tiene membership?
    const { data: member0, error: m0Err } = await sb
      .from("debacu_eval_org_members")
      .select("org_id, role")
      .eq("user_id", user_id)
      .maybeSingle();

    if (m0Err) return json(500, { ok: false, error: "membership_query_failed", detail: m0Err.message });

    let org_id: string | null = member0?.org_id ?? null;
    let role: string | null = member0?.role ?? null;

    // 4) Bootstrap si no tiene org/membership
    if (!org_id) {
      const customer = await ensureCustomerByEmail(sb, email);
      const org = await ensureOrganizationForCustomer(sb, customer); // ✅ aquí se arregla tu FK
      const member = await ensureMembership(sb, org.id, user_id);

      org_id = member.org_id;
      role = member.role ?? "OWNER";

      // opcional: si no hay subs, crea FREE_TRIAL
      await ensureSubscriptionIfNone(sb, customer.id);
    }

    // 5) Subscription actual (última)
    const { data: sub, error: sErr } = await sb
      .from("subscriptions")
      .select("id, plan_id, status, trial_ends_at, grace_ends_at, suspended_at, extra_seats, billing_frequency")
      .eq("customer_id", org_id) // ✅ porque org_id == customer_id en nuestro modelo
      .eq("app_id", APP_ID)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sErr) return json(500, { ok: false, error: "subscription_query_failed", detail: sErr.message });

    // 6) Plan
    let plan: PlanRow | null = null;
    if (sub?.plan_id) {
      const { data: p, error: pErr } = await sb
        .from("plans")
        .select("id, name, code, extra_config")
        .eq("id", sub.plan_id)
        .maybeSingle();

      if (pErr) return json(500, { ok: false, error: "plan_query_failed", detail: pErr.message });
      plan = (p ?? null) as PlanRow | null;
    }

    // 7) Seats used
    const { count: used, error: usedErr } = await sb
      .from("debacu_eval_org_members")
      .select("*", { count: "exact", head: true })
      .eq("org_id", org_id);

    if (usedErr) return json(500, { ok: false, error: "seat_count_failed", detail: usedErr.message });

    const included = includedSeatsFromPlan(plan);
    const extra = Number.isFinite(Number(sub?.extra_seats)) ? Math.max(0, Number(sub?.extra_seats)) : 0;
    const allowed = included + extra;

    // 8) Trial flags
    const now = new Date();
    const trialEnds = sub?.trial_ends_at ? new Date(sub.trial_ends_at) : null;
    const trialActive = !!trialEnds && trialEnds.getTime() > now.getTime();
    const trialExpired = !!trialEnds && trialEnds.getTime() <= now.getTime();

    return json(200, {
      ok: true,
      data: {
        user_id,
        email,
        org_id,
        role,
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
        seats: { used: used ?? 0, included, extra, allowed },
        trial: {
          active: trialActive,
          ends_at: trialEnds ? trialEnds.toISOString() : null,
          expired: trialExpired,
        },
      },
    });
  } catch (e: any) {
    return json(500, { ok: false, error: "unexpected", detail: e?.message ?? String(e) });
  }
});
