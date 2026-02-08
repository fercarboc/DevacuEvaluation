// supabase/functions/debacu_eval_account_bundle/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function readSessionToken(req: Request) {
  // soporta varios nombres por si cambiaste en frontend
  return (
    safeStr(req.headers.get("x-session-token")) ||
    safeStr(req.headers.get("x-debacu-session-token")) ||
    safeStr(req.headers.get("x-debacu-eval-session-token"))
  );
}

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

async function readJson(req: Request) {
  const t = await req.text();
  if (!t) return {};
  try {
    return JSON.parse(t);
  } catch {
    return {};
  }
}

/** ======================================================
 *  Clients
 *  ====================================================== */
function userClient(req: Request, supabaseUrl: string, anonKey: string) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

function adminClient(supabaseUrl: string, serviceKey: string) {
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** ======================================================
 *  AuthN + Session token validation
 *  ====================================================== */
async function requireJwtUser(req: Request, sbUser: ReturnType<typeof createClient>) {
  const { data, error } = await sbUser.auth.getUser();
  if (error || !data?.user) {
    throw new Error("UNAUTHENTICATED");
  }
  return data.user;
}

async function requireEvalSession(params: {
  admin: ReturnType<typeof createClient>;
  token: string;
  customer_id: string;
  app_code: string;
}) {
  const { admin, token, customer_id, app_code } = params;

  const now = new Date().toISOString();

  const { data, error } = await admin
    .from("debacu_eval_sessions")
    .select("token, customer_id, app_code, expires_at, revoked_at")
    .eq("token", token)
    .eq("customer_id", customer_id)
    .eq("app_code", app_code)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) throw new Error(`SESSION_CHECK_FAILED: ${error.message}`);
  if (!data) throw new Error("SESSION_INVALID");
  if (data.expires_at && String(data.expires_at) <= now) throw new Error("SESSION_EXPIRED");
}

/** ======================================================
 *  AuthZ: membership (organizations + org_members)
 *  ====================================================== */
async function requireOrgMember(params: {
  admin: ReturnType<typeof createClient>;
  customer_id: string;
  user_id: string;
}) {
  const { admin, customer_id, user_id } = params;

  // 1) org por customer_id
  const { data: org, error: orgErr } = await admin
    .from("debacu_eval_organizations")
    .select("id")
    .eq("customer_id", customer_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (orgErr) throw new Error(`ORG_LOOKUP_FAILED: ${orgErr.message}`);
  if (!org?.id) throw new Error("FORBIDDEN_NO_ORG");

  // 2) membership
  const { data: mem, error: memErr } = await admin
    .from("debacu_eval_org_members")
    .select("id, role")
    .eq("org_id", org.id)
    .eq("user_id", user_id)
    .maybeSingle();

  if (memErr) throw new Error(`MEMBERSHIP_FAILED: ${memErr.message}`);
  if (!mem?.id) throw new Error("FORBIDDEN");

  return { org_id: org.id, role: mem.role ?? null };
}

/** ======================================================
 *  Handler
 *  ====================================================== */
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  // Preflight SIEMPRE OK
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  try {
    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const SERVICE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = mustEnv("SUPABASE_ANON_KEY");

    const admin = adminClient(SUPABASE_URL, SERVICE_KEY);
    const sbUser = userClient(req, SUPABASE_URL, ANON_KEY);

    const user = await requireJwtUser(req, sbUser);

    const body = await readJson(req);
    const customer_id = safeStr(body?.customer_id ?? body?.customerId);
    const app_id = safeStr(body?.app_id ?? body?.appId ?? "DEBACU_EVAL");

    if (!customer_id) return json(origin, 400, { error: "Missing customer_id" });

    // x-session-token obligatorio
    const sessionToken = readSessionToken(req);
    if (!sessionToken) return json(origin, 401, { error: "Missing x-session-token" });

    // validar sesión edge propia
    await requireEvalSession({
      admin,
      token: sessionToken,
      customer_id,
      app_code: app_id,
    });

    // authz membership real
    const { org_id, role } = await requireOrgMember({
      admin,
      customer_id,
      user_id: user.id,
    });

    // customer
    const { data: customer, error: custErr } = await admin
      .from("customers")
      .select(
        "id, name, nif, address, city, province, country, phone, email, iban, swift, bank_name, bank_address, is_active, app_id, updated_at, created_at",
      )
      .eq("id", customer_id)
      .maybeSingle();

    if (custErr) return json(origin, 500, { error: "DB error (customers)", detail: custErr.message });
    if (!customer) return json(origin, 404, { error: "Customer not found" });

    // ✅ hotel_profile (ADR / categoría / auditoría)
    const { data: hotel_profile, error: hpErr } = await admin
      .from("debacu_hotel_profile")
      .select(
        [
          "customer_id",
          "hotel_category",
          "adr_real",
          "adr_reference",
          "adr_effective",
          "monthly_stays_estimated",
          "season_mult_high",
          "season_mult_low",
          "updated_at",
        ].join(","),
      )
      .eq("customer_id", customer_id)
      .maybeSingle();

    if (hpErr) {
      // no rompemos el bundle por esto: devolvemos null
      console.error("DB error (debacu_hotel_profile):", hpErr);
    }

    // subscription (elige la más reciente por start_date/created_at)
    const { data: subRow, error: subErr } = await admin
      .from("subscriptions")
      .select("*")
      .eq("customer_id", customer_id)
      .eq("app_id", app_id)
      .in("status", ["ACTIVE", "TRIAL_ACTIVE", "PENDING_PAYMENT", "PAST_DUE", "CANCELED"])
      .order("start_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (subErr) return json(origin, 500, { error: "DB error (subscriptions)", detail: subErr.message });

    // plan (del sub)
    let plan: any = null;
    if (subRow?.plan_id) {
      const { data: planRow, error: planErr } = await admin
        .from("plans")
        .select("id, app_id, code, name, price_monthly, price_yearly, max_queries_per_month")
        .eq("id", subRow.plan_id)
        .maybeSingle();

      if (planErr) return json(origin, 500, { error: "DB error (plan)", detail: planErr.message });
      plan = planRow ?? null;
    }

    // plans disponibles (columna derecha)
    const { data: plans, error: plansErr } = await admin
      .from("plans")
      .select("id, app_id, code, name, price_monthly, price_yearly, max_queries_per_month")
      .eq("app_id", app_id)
      .order("price_monthly", { ascending: true });

    if (plansErr) return json(origin, 500, { error: "DB error (plans)", detail: plansErr.message });

    // decide si devolver invoices
    const billingFreq = String(subRow?.billing_frequency ?? "").toUpperCase();
    const planCode = String(plan?.code ?? "").toUpperCase();

    const isFreeLike =
      planCode === "FREE" ||
      billingFreq === "FREE_TRIAL" ||
      Number(plan?.price_monthly ?? 0) === 0 ||
      Number(plan?.price_yearly ?? 0) === 0;

    const subStatus = String(subRow?.status ?? "").toUpperCase();

    let invoices: any[] = [];
    if (!isFreeLike && (subStatus === "ACTIVE" || subStatus === "PAST_DUE")) {
      const { data: inv, error: invErr } = await admin
        .from("debacu_eval_invoices")
        .select("*")
        .eq("customer_id", customer_id)
        .order("invoice_created_at", { ascending: false })
        .limit(50);

      if (invErr) return json(origin, 500, { error: "DB error (invoices)", detail: invErr.message });

      // si quieres SOLO pagadas:
      invoices = (inv ?? []).filter((r: any) => String(r.status ?? "").toLowerCase() === "paid");
    }

    // respuesta bundle
    return json(origin, 200, {
      ok: true,
      meta: {
        customer_id,
        app_id,
        org_id,
        member_role: role,
        server_date: toISODate(new Date()),
      },
      customer,
      hotel_profile: hotel_profile ?? null, // ✅ nuevo
      subscription: subRow ?? null,
      plan,
      plans: plans ?? [],
      invoices,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg === "SESSION_INVALID" || msg === "SESSION_EXPIRED"
        ? 401
        : msg.startsWith("FORBIDDEN")
        ? 403
        : 500;

    return json(origin, code, { error: "Request failed", detail: msg });
  }
});
