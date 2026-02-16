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
 * ORG + ENTITLEMENTS (JWT-only)
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
  customer_id: string | null;
  subscription_status: string | null;
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

/** ======================================================
 * INPUT
 * ====================================================== */
type ReqBody = { audit_id: string };

export default Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const admin = adminClient();

  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(origin, 405, { ok: false, error: "method_not_allowed" });

  try {
    const user = await requireJwtUser(req);

    // ✅ JWT-only: org + customer_id por entitlements
    const org_id = await resolveOrgIdForUserOrThrow(admin, user.id);
    const ent = await loadEntitlementsOrThrow(admin, org_id);
    const customer_id = String(ent.customer_id);

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const audit_id = String(body?.audit_id ?? "").trim();
    if (!audit_id) throw new Error("BAD_AUDIT_ID");

    const { data: row, error } = await admin
      .from("debacu_eval_audit_log")
      .select(
        "id,created_at,actor_user_id,action,entity,entity_id,meta,customer_id,app_id,event_type,search_kind,search_value_masked,result_count",
      )
      .eq("id", audit_id)
      .eq("customer_id", customer_id)
      .eq("app_id", APP_ID)
      .maybeSingle();

    if (error) throw new Error(`DETAIL_FAILED:${error.message}`);
    if (!row) throw new Error("NOT_FOUND");

    const meta = (row.meta ?? {}) as any;
    const risk = (meta?.risk ?? "NO_CONCLUYENTE") as string;

    return json(origin, 200, {
      ok: true,
      item: {
        id: row.id,
        created_at: row.created_at,
        action: row.action,
        entity: row.entity,
        event_type: row.event_type,
        risk,
        avg_stars: typeof meta?.avg_stars === "number" ? meta.avg_stars : null,
        match_strength: meta?.match_strength ?? null,
        count_bucket: meta?.count_bucket ?? null,
        count_exact: meta?.count_exact ?? null,
        window: meta?.window ?? meta?.time_window ?? meta?.months_received ?? null,
        input_kind: meta?.input_kind ?? row.search_kind ?? null,
        search_value_masked: row.search_value_masked ?? null,
        result_count: row.result_count ?? null,
        meta, // asegúrate que meta no tenga PII
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const code =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg.startsWith("FORBIDDEN") || msg === "FORBIDDEN_NO_ORG" || msg === "FORBIDDEN_NO_ENTITLEMENTS"
        ? 403
        : msg === "NOT_FOUND"
        ? 404
        : msg.startsWith("BAD_")
        ? 400
        : 500;

    console.error("client_audit_history_detail error:", e);
    return json(origin, code, { ok: false, error: "request_failed", detail: msg });
  }
});
