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
  subscription_status: string | null;
};

async function loadEntitlementsOrThrow(admin: ReturnType<typeof adminClient>, orgId: string) {
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, subscription_status")
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
type ReqBody = { export_id: string };

export default Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const admin = adminClient();

  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(origin, 405, { ok: false, error: "method_not_allowed" });

  try {
    const user = await requireJwtUser(req);

    // ✅ JWT-only org
    const org_id = await resolveOrgIdForUserOrThrow(admin, user.id);

    // ✅ recomendación: descargar SOLO si plan ACTIVE
    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertOrgActiveOrThrow(ent);

    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const export_id = String(body?.export_id ?? "").trim();
    if (!export_id) throw new Error("BAD_EXPORT_ID");

    const { data: row, error: rowErr } = await admin
      .from("customer_audit_exports")
      .select("id, org_id, app_id, status, storage_bucket, storage_path")
      .eq("id", export_id)
      .eq("org_id", org_id)
      .eq("app_id", APP_ID)
      .maybeSingle();

    if (rowErr) throw new Error(`EXPORT_LOOKUP_FAILED:${rowErr.message}`);
    if (!row?.id) throw new Error("NOT_FOUND");
    if (row.status !== "READY") throw new Error("EXPORT_NOT_READY");
    if (!row.storage_bucket || !row.storage_path) throw new Error("EXPORT_NO_FILE");

    const { data: signed, error: signErr } = await admin.storage
      .from(String(row.storage_bucket))
      .createSignedUrl(String(row.storage_path), 60); // 60s

    if (signErr || !signed?.signedUrl) throw new Error(`SIGNED_URL_FAILED:${signErr?.message ?? "NO_URL"}`);

    return json(origin, 200, {
      ok: true,
      export_id,
      download_url: signed.signedUrl,
      expires_in: 60,
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
        : msg.startsWith("BAD_")
        ? 400
        : msg === "NOT_FOUND"
        ? 404
        : 500;

    console.error("customer_audit_export_download error:", e);
    return json(origin, code, { ok: false, error: "request_failed", detail: msg });
  }
});
