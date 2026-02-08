// supabase/functions/client_dashboard/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import Stripe from "https://esm.sh/stripe@16.12.0?target=deno";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") || "";

const stripe = STRIPE_SECRET_KEY ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: "2024-06-20" }) : null;

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function corsHeaders(origin: string | null) {
  const o = origin ?? "";
  const allowOrigin = ALLOWED_ORIGINS.has(o) ? o : "https://debacu.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-session-token",
    "Access-Control-Max-Age": "86400",
  };
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

function monthStartISO() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  return d.toISOString();
}

function safeUpper(v?: string | null) {
  return (v ?? "").toUpperCase();
}

function prettyEvent(eventType?: string | null, action?: string | null) {
  const e = safeUpper(eventType);
  const a = safeUpper(action);
  if (e === "CHECK_SIGNALS") return "Consulta";
  if (a === "INSERT" || a === "CREATE") return "Registro";
  if (a === "UPDATE") return "Actualización";
  if (a === "DELETE") return "Eliminación";
  return "Actividad";
}

function prettyDetail(entity?: string | null) {
  const en = safeUpper(entity);
  if (en === "EVALUATION_SEARCH") return "Consulta de registro";
  if (en === "EVALUATION_CREATE") return "Alta de registro";
  if (en === "EVALUATION_UPDATE") return "Edición de registro";
  return "—";
}

const APP_ID = "DEBACU_EVAL"; // subscriptions.app_id
const APP_CODE = "DEBACU_EVAL"; // sessions.app_code

function readSessionToken(req: Request) {
  return (req.headers.get("x-session-token") ?? "").trim();
}

/** ======================================================
 *  Auth (JWT real) + session + org member
 *  ====================================================== */
function userClient(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

async function requireJwtUser(req: Request) {
  const sb = userClient(req);
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function requireEvalSession(token: string) {
  const { data: session, error } = await admin
    .from("debacu_eval_sessions")
    .select("customer_id, app_code, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !session) throw new Error("SESSION_INVALID");
  if (session.app_code !== APP_CODE) throw new Error("SESSION_INVALID_APP");
  if (session.revoked_at) throw new Error("SESSION_REVOKED");
  if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) throw new Error("SESSION_EXPIRED");

  return session.customer_id as string;
}

async function requireOrgMember(customer_id: string, user_id: string) {
  const { data: org, error: orgErr } = await admin
    .from("debacu_eval_organizations")
    .select("id")
    .eq("customer_id", customer_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (orgErr) throw new Error(`ORG_LOOKUP_FAILED:${orgErr.message}`);
  if (!org?.id) throw new Error("FORBIDDEN_NO_ORG");

  const { data: mem, error: memErr } = await admin
    .from("debacu_eval_org_members")
    .select("id, role")
    .eq("org_id", org.id)
    .eq("user_id", user_id)
    .maybeSingle();

  if (memErr) throw new Error(`MEMBERSHIP_FAILED:${memErr.message}`);
  if (!mem?.id) throw new Error("FORBIDDEN");

  return { org_id: org.id, role: mem.role ?? null };
}

/** ======================================================
 *  Subscription selection (priority + ignore REPLACED)
 *  ====================================================== */
// 🔧 Ajuste mínimo: prioriza el plan vigente y contempla TRIAL_ACTIVE.
// PENDING_PAYMENT al final porque suele ser “intento de cambio”, no plan actual.
const STATUS_ORDER = ["ACTIVE", "TRIAL_ACTIVE", "SUSPENDED", "PENDING_PAYMENT"] as const;

function scoreStatus(s?: string | null) {
  const up = safeUpper(s);
  const idx = STATUS_ORDER.indexOf(up as any);
  return idx === -1 ? 999 : idx;
}

async function getBestSubscription(customer_id: string) {
  const { data, error } = await admin
    .from("subscriptions")
    .select(
      "id,status,billing_frequency,next_billing_date,plan_id,created_at,updated_at,start_date,stripe_subscription_id,provider_subscription_id",
    )
    .eq("customer_id", customer_id)
    .eq("app_id", APP_ID)
    // 🔧 Mejor ordenar por start_date/updated_at que por created_at (hay reemplazos/cambios)
    .order("start_date", { ascending: false, nullsFirst: false })
    .order("updated_at", { ascending: false })
    .limit(25);

  if (error) throw error;

  const rows = (data ?? []).filter((r: any) => safeUpper(r?.status) !== "REPLACED");
  if (!rows.length) return null;

  rows.sort((a: any, b: any) => {
    const sa = scoreStatus(a.status);
    const sb = scoreStatus(b.status);
    if (sa !== sb) return sa - sb;

    // desempate: start_date desc, luego updated_at desc, luego created_at desc
    const da = String(a.start_date ?? "");
    const db = String(b.start_date ?? "");
    if (da && db && da !== db) return db.localeCompare(da);

    const ua = String(a.updated_at ?? "");
    const ub = String(b.updated_at ?? "");
    if (ua && ub && ua !== ub) return ub.localeCompare(ua);

    const ca = String(a.created_at ?? "");
    const cb = String(b.created_at ?? "");
    return cb.localeCompare(ca);
  });

  return rows[0] as any;
}

async function getPlan(plan_id?: string | null) {
  if (!plan_id) return null;
  const { data, error } = await admin
    .from("plans")
    .select("id,name,code,max_queries_per_month")
    .eq("id", plan_id)
    .eq("app_id", APP_ID)
    .maybeSingle();
  if (error) throw error;
  return data as any;
}

async function fallbackNextBillingFromStripe(sub: any): Promise<string | null> {
  if (!stripe) return null;
  const stripeSubId = sub?.stripe_subscription_id ?? sub?.provider_subscription_id ?? null;
  if (!stripeSubId) return null;

  try {
    const s = await stripe.subscriptions.retrieve(String(stripeSubId));
    const end = (s as any)?.current_period_end as number | undefined;
    return end ? new Date(end * 1000).toISOString().slice(0, 10) : null;
  } catch {
    return null;
  }
}

export default Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") return json(origin, 405, { ok: false, error: "method_not_allowed" });

  try {
    // 1) JWT obligatorio
    const user = await requireJwtUser(req);

    // 2) session token obligatorio
    const sessionToken = readSessionToken(req);
    if (!sessionToken) return json(origin, 401, { ok: false, error: "missing_session_token" });

    const customerId = await requireEvalSession(sessionToken);

    // 3) org membership
    await requireOrgMember(customerId, user.id);

    const monthStart = monthStartISO();

    // 4) Best subscription + plan
    const sub = await getBestSubscription(customerId);
    const plan = sub?.plan_id ? await getPlan(sub.plan_id) : null;

    let planCard: {
      name: string;
      code: string;
      status: string;
      billingFrequency: string | null;
      nextBilling: string | null;
      limit: number | null;
    } | null = null;

    if (sub && plan) {
      let nextBilling: string | null = sub?.next_billing_date ?? null;

      // 🔧 fallback Stripe si falta fecha (sin exigir ACTIVE; en estados intermedios Stripe la tiene)
      if (!nextBilling) {
        nextBilling = await fallbackNextBillingFromStripe(sub);
      }

      const limitRaw = plan?.max_queries_per_month;
      const limit = limitRaw == null ? null : Number(limitRaw);

      planCard = {
        name: plan?.name ?? "Plan activo",
        code: plan?.code ?? "—",
        status: sub?.status ?? "UNKNOWN",
        billingFrequency: sub?.billing_frequency ?? null,
        nextBilling,
        limit: Number.isFinite(limit) ? limit : null,
      };
    } else if (sub && !plan) {
      // si no hay plan por plan_id, al menos devolvemos status y frecuencia para UI
      let nextBilling: string | null = sub?.next_billing_date ?? null;
      if (!nextBilling) {
        nextBilling = await fallbackNextBillingFromStripe(sub);
      }

      planCard = {
        name: "Plan activo",
        code: "—",
        status: sub?.status ?? "UNKNOWN",
        billingFrequency: sub?.billing_frequency ?? null,
        nextBilling,
        limit: null,
      };
    } else {
      planCard = null;
    }

    // 5) queryCount
    const { count: queryCount } = await admin
      .from("debacu_eval_audit_log")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", customerId)
      .eq("event_type", "CHECK_SIGNALS")
      .gte("created_at", monthStart);

    // 6) createdThisMonth
    const { count: createdThisMonth } = await admin
      .from("debacu_evaluations")
      .select("id", { count: "exact", head: true })
      .eq("creator_customer_id", customerId)
      .gte("created_at", monthStart);

    // 7) activity
    const { data: audits } = await admin
      .from("debacu_eval_audit_log")
      .select("id, created_at, action, event_type, entity, meta, search_value_masked")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(12);

    const activity = (audits ?? []).map((r: any) => {
      let avg: number | null = null;
      const meta = r?.meta;
      if (meta) {
        try {
          const m = typeof meta === "string" ? JSON.parse(meta) : meta;
          if (m?.avg_stars != null && !Number.isNaN(Number(m.avg_stars))) avg = Number(m.avg_stars);
        } catch {
          // ignore
        }
      }

      return {
        id: r.id,
        date: new Date(r.created_at).toLocaleString(),
        type: prettyEvent(r.event_type, r.action),
        label: prettyDetail(r.entity),
        contact: r.search_value_masked ?? "-",
        rating: avg,
      };
    });

    return json(origin, 200, {
      ok: true,
      data: {
        customerId,
        monthStart,
        planCard,
        queryCount: queryCount ?? 0,
        createdThisMonth: createdThisMonth ?? 0,
        activity,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const code =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg.startsWith("SESSION_")
        ? 401
        : msg.startsWith("FORBIDDEN")
        ? 403
        : 500;

    console.error("client_dashboard error:", e);
    return json(origin, code, { ok: false, error: "request_failed", detail: msg });
  }
});
