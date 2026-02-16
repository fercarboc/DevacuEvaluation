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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

function errMsg(e: unknown) {
  if (e instanceof Error) return e.message;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}

function userClient(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: auth } },
  });
}

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function requireJwtUser(req: Request) {
  const sb = userClient(req);
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

async function resolveOrgMemberOrThrow(admin: ReturnType<typeof adminClient>, userId: string) {
  const { data, error } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`ORG_MEMBERSHIP_FAILED:${error.message}`);
  if (!data?.org_id) throw new Error("NO_ORG_MEMBERSHIP");

  return { org_id: String(data.org_id), role: (data.role ?? null) as string | null };
}

type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  subscription_status: string | null; // ACTIVE o null
};

async function loadEntitlementsOrThrow(admin: ReturnType<typeof adminClient>, orgId: string) {
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, subscription_status")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`ENTITLEMENTS_FAILED:${error.message}`);
  if (!data) throw new Error("FORBIDDEN_NO_ENTITLEMENTS");
  if (!data.customer_id) throw new Error("ORG_MISSING_CUSTOMER_ID");
  return data as EntitlementsRow;
}

// Decide aquí tu política real:
// - si quieres permitir AUDIT_VIEW aun sin ACTIVE, comenta este guard.
function assertOrgActiveOrThrow(ent: EntitlementsRow) {
  if (ent.subscription_status !== "ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
}

type ReqBody = { source_audit_id: string | null };

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });

  try {
    if (req.method !== "POST") return json(origin, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });

    const admin = adminClient();

    // 1) JWT user (desde ANON client)
    const user = await requireJwtUser(req);
    const user_id = user.id;
    const user_email = user.email ?? null;

    // 2) input
    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const source_audit_id = (body?.source_audit_id ?? null) as string | null;
    if (!source_audit_id) return json(origin, 400, { ok: false, error: "MISSING_SOURCE_AUDIT_ID" });

    // 3) org membership (admin)
    const { org_id, role } = await resolveOrgMemberOrThrow(admin, user_id);

    // 4) customer_id desde entitlements (admin)
    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertOrgActiveOrThrow(ent);
    const customer_id_text = String(ent.customer_id);

    // 5) audit insert (admin)
    const { error: insErr } = await admin.from("debacu_eval_audit_log").insert({
      actor_user_id: user_id,
      action: "AUDIT_VIEW",
      entity: "AUDIT_LOG",
      entity_id: source_audit_id,
      meta: { viewer_role: role, viewer_email: user_email },
      customer_id: customer_id_text,
      app_id: APP_ID,
      event_type: "AUDIT_VIEW",
      evaluation_id: null,
      search_kind: null,
      search_value_masked: null,
      search_value_hash: null,
      result_count: null,
    });

    if (insErr) return json(origin, 500, { ok: false, error: `AUDIT_INSERT_FAILED:${errMsg(insErr)}` });

    return json(origin, 200, { ok: true, data: { viewed: true, source_audit_id } });
  } catch (e) {
    const msg = errMsg(e);
    const code =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg === "NO_ORG_MEMBERSHIP"
        ? 403
        : msg === "PLAN_NOT_ACTIVE"
        ? 402
        : 500;

    return json(origin, code, { ok: false, error: msg });
  }
});
