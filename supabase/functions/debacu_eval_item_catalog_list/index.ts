import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/* ======================================================
 * ENV + CONST
 * ====================================================== */
const APP_ID = "DEBACU_EVAL";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

/* ======================================================
 * CORS + RESP
 * ====================================================== */
function corsHeaders(origin: string | null) {
  const o = origin ?? "";
  const allowOrigin = ALLOWED_ORIGINS.has(o) ? o : "https://debacu.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

/* ======================================================
 * Utils
 * ====================================================== */
function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`MISSING_ENV:${name}`);
  return v;
}

function normCode(x: unknown) {
  return String(x ?? "").trim().toUpperCase();
}

function logLine(payload: Record<string, unknown>) {
  console.log(JSON.stringify(payload));
}

/* ======================================================
 * Auth (JWT-only)
 * ====================================================== */
function userClient(req: Request, supabaseUrl: string, anonKey: string) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

async function requireJwtUser(req: Request, supabaseUrl: string, anonKey: string) {
  const sbUser = userClient(req, supabaseUrl, anonKey);
  const { data, error } = await sbUser.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

function adminClient(supabaseUrl: string, serviceRole: string) {
  return createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Resuelve tenant context:
 * - org_members: user_id -> org_id
 * - entitlements view (si existe): org_id -> customer_id
 * - fallback: organizations: org_id -> customer_id
 */
async function requireOrgMemberAndCustomerId(
  admin: ReturnType<typeof createClient>,
  userId: string,
) {
  const { data: mem, error: memErr } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, role")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memErr) throw new Error(`ORG_MEMBER_LOOKUP_FAILED:${memErr.message}`);
  if (!mem?.org_id) throw new Error("NO_ORG_MEMBERSHIP");

  const org_id = String(mem.org_id);

  // 1) intentar entitlements view
  const { data: ent, error: entErr } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id")
    .eq("org_id", org_id)
    .maybeSingle();

  if (!entErr && ent?.customer_id) {
    return {
      org_id,
      org_role: mem.role ?? null,
      customer_id: String(ent.customer_id),
      app_id: APP_ID,
    };
  }

  // 2) fallback: organizations
  const { data: org, error: orgErr } = await admin
    .from("debacu_eval_organizations")
    .select("id, customer_id")
    .eq("id", org_id)
    .maybeSingle();

  if (orgErr) throw new Error(`ORG_LOOKUP_FAILED:${orgErr.message}`);
  if (!org?.customer_id) throw new Error("ORG_WITHOUT_CUSTOMER");

  return {
    org_id,
    org_role: mem.role ?? null,
    customer_id: String(org.customer_id),
    app_id: APP_ID,
  };
}

/* ======================================================
 * Types
 * ====================================================== */
type GlobalItem = {
  item_code: string;
  title: string | null;
  category: string | null;
  unit_price: number | null;
  currency: string | null;
  description: string | null;
  is_active: boolean;
  updated_at: string | null;
};

type HotelItem = {
  item_code: string;
  title: string | null;
  category: string | null;
  unit_price: number | null;
  currency: string | null;
  description: string | null;
  is_active: boolean | null; // allow null
  updated_at: string | null;
};

/* ======================================================
 * Handler
 * ====================================================== */
export default Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const FN = "debacu_eval_item_catalog_list";

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json(origin, 405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const ANON_KEY = mustEnv("SUPABASE_ANON_KEY");
    const SERVICE_ROLE = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    // 1) JWT obligatorio
    const user = await requireJwtUser(req, SUPABASE_URL, ANON_KEY);

    // 2) tenant context (org_id + customer_id)
    const admin = adminClient(SUPABASE_URL, SERVICE_ROLE);
    const ctx = await requireOrgMemberAndCustomerId(admin, user.id);

    logLine({
      fn: FN,
      stage: "start",
      user_id: user.id,
      org_id: ctx.org_id,
      customer_id: ctx.customer_id,
      app_id: ctx.app_id,
    });

    // 3) Global activos
    const { data: globalItems, error: e1 } = await admin
      .from("debacu_item_catalog")
      .select("item_code,title,category,unit_price,currency,description,is_active,updated_at")
      .eq("is_active", true);

    if (e1) {
      logLine({ fn: FN, stage: "db_global_failed", error: e1.message });
      return json(origin, 500, { ok: false, error: "db_global_items_failed", detail: e1.message });
    }

    // 4) Hotel items (todos, incluidos desactivados)
    const { data: hotelItems, error: e2 } = await admin
      .from("debacu_hotel_item_catalog")
      .select("item_code,title,category,unit_price,currency,description,is_active,updated_at")
      .eq("customer_id", ctx.customer_id);

    if (e2) {
      logLine({ fn: FN, stage: "db_hotel_failed", error: e2.message });
      return json(origin, 500, { ok: false, error: "db_hotel_items_failed", detail: e2.message });
    }

    const globals = (globalItems ?? []) as GlobalItem[];
    const hotels = (hotelItems ?? []) as HotelItem[];

    const gMap = new Map<string, GlobalItem>();
    for (const g of globals) {
      const code = normCode(g.item_code);
      if (!code) continue;
      gMap.set(code, { ...g, item_code: code });
    }

    const hMap = new Map<string, HotelItem>();
    for (const h of hotels) {
      const code = normCode(h.item_code);
      if (!code) continue;
      hMap.set(code, { ...h, item_code: code });
    }

    // 5) Merge effective
    const out: any[] = [];

    // a) todo lo global (override si existe)
    for (const [code, g] of gMap.entries()) {
      const h = hMap.get(code) ?? null;

      // si hotel lo desactiva -> fuera
      const effectiveActive = h ? (h.is_active ?? true) : true;
      if (!effectiveActive) continue;

      out.push({
        item_code: code,
        title: h?.title ?? g.title,
        category: h?.category ?? g.category,
        unit_price: h?.unit_price ?? g.unit_price,
        currency: h?.currency ?? g.currency,
        description: h?.description ?? g.description,
        is_active: true,
        source: h ? "OVERRIDE" : "GLOBAL",
      });
    }

    // b) custom (hotel items que no existen en global)
    for (const [code, h] of hMap.entries()) {
      if (gMap.has(code)) continue;

      const active = h.is_active ?? true;
      if (!active) continue;

      out.push({
        item_code: code,
        title: h.title ?? code,
        category: h.category ?? "CUSTOM",
        unit_price: h.unit_price ?? null,
        currency: h.currency ?? "EUR",
        description: h.description ?? null,
        is_active: true,
        source: "CUSTOM",
      });
    }

    out.sort((a, b) => String(a.item_code).localeCompare(String(b.item_code)));

    logLine({
      fn: FN,
      stage: "ok",
      user_id: user.id,
      org_id: ctx.org_id,
      customer_id: ctx.customer_id,
      app_id: ctx.app_id,
      status: 200,
      rows: out.length,
    });

    return json(origin, 200, {
      ok: true,
      org_id: ctx.org_id,
      customerId: ctx.customer_id,
      app_id: ctx.app_id,
      items: out,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    const status =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg.startsWith("MISSING_ENV:")
        ? 500
        : msg === "NO_ORG_MEMBERSHIP"
        ? 403
        : msg.startsWith("ORG_")
        ? 500
        : 500;

    logLine({ fn: "debacu_eval_item_catalog_list", stage: "error", status, detail: msg });

    return json(origin, status, { ok: false, error: "request_failed", detail: msg });
  }
});
