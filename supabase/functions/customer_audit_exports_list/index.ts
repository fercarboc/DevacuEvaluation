import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const APP_ID = "DEBACU_EVAL";

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
    // ✅ JWT-only
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

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

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** ======================================================
 * ORG + (opcional) ENTITLEMENTS
 * ====================================================== */
async function resolveOrgIdForUserOrThrow(admin: ReturnType<typeof adminClient>, userId: string) {
  const { data, error } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`MEMBERSHIP_LOOKUP_FAILED:${error.message}`);
  if (!data?.org_id) throw new Error("FORBIDDEN_NO_ORG");
  return String(data.org_id);
}

type EntitlementsRow = {
  org_id: string;
  subscription_status: string | null; // hoy: ACTIVE o null
  plan_code: string | null;
};

async function loadEntitlementsOrThrow(admin: ReturnType<typeof adminClient>, orgId: string) {
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, subscription_status, plan_code")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`ENTITLEMENTS_FAILED:${error.message}`);
  if (!data) throw new Error("FORBIDDEN_NO_ENTITLEMENTS");
  return data as EntitlementsRow;
}

function assertOrgActiveOrThrow(ent: EntitlementsRow) {
  if (ent.subscription_status !== "ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
}

/** ======================================================
 * INPUT
 * ====================================================== */
type ReqBody = {
  limit?: number; // default 25
  offset?: number; // default 0
  status?: "ALL" | "PENDING" | "READY" | "FAILED" | "EXPIRED";
  export_type?: "ALL" | "PDF" | "CSV";
  from?: string; // yyyy-mm-dd
  to?: string; // yyyy-mm-dd
};

export default Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const admin = adminClient();

  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(origin, 405, { ok: false, error: "method_not_allowed" });

  try {
    const user = await requireJwtUser(req);

    // ✅ JWT-only: org por user.id
    const org_id = await resolveOrgIdForUserOrThrow(admin, user.id);

    // ✅ opcional pero recomendable: no listamos si plan no está activo
    // (si quieres permitir ver histórico aunque esté EXPIRED, quita esta línea)
    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertOrgActiveOrThrow(ent);

    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const limit = Math.min(Math.max(Number(body.limit ?? 25), 1), 100);
    const offset = Math.max(Number(body.offset ?? 0), 0);

    let q = admin
      .from("customer_audit_exports")
      .select("*", { count: "exact" })
      .eq("org_id", org_id)
      .eq("app_id", APP_ID)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (body.status && body.status !== "ALL") q = q.eq("status", body.status);
    if (body.export_type && body.export_type !== "ALL") q = q.eq("export_type", body.export_type);

    if (body.from) q = q.gte("period_from", body.from);
    if (body.to) q = q.lte("period_to", body.to);

    const { data: rows, error, count } = await q;
    if (error) throw new Error(`LIST_FAILED:${error.message}`);

    return json(origin, 200, {
      ok: true,
      org_id,
      app_id: APP_ID,
      exports: rows ?? [],
      total: count ?? 0,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const code =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg.startsWith("FORBIDDEN")
        ? 403
        : msg.startsWith("PLAN_NOT_ACTIVE")
        ? 402
        : 500;

    console.error("customer_audit_exports_list error:", e);
    return json(origin, code, { ok: false, error: "request_failed", detail: msg });
  }
});
