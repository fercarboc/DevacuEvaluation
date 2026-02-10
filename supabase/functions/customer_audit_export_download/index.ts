import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

const APP_ID = "DEBACU_EVAL";
const APP_CODE = "DEBACU_EVAL";

function readSessionToken(req: Request) {
  return (req.headers.get("x-session-token") ?? "").trim();
}

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

type ReqBody = { export_id: string };

export default Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(origin, 405, { ok: false, error: "method_not_allowed" });

  try {
    const user = await requireJwtUser(req);

    const sessionToken = readSessionToken(req);
    if (!sessionToken) return json(origin, 401, { ok: false, error: "missing_session_token" });

    const customer_id = await requireEvalSession(sessionToken);
    const { org_id } = await requireOrgMember(customer_id, user.id);

    const body = (await req.json()) as ReqBody;
    const export_id = String(body?.export_id ?? "");
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

    // Si quieres auditar descargas, aquí insertas en customer_audit_export_downloads (si existe)

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
        : msg.startsWith("SESSION_")
        ? 401
        : msg.startsWith("FORBIDDEN")
        ? 403
        : msg.startsWith("BAD_") || msg === "NOT_FOUND"
        ? 400
        : 500;

    console.error("customer_audit_export_download error:", e);
    return json(origin, code, { ok: false, error: "request_failed", detail: msg });
  }
});
