// supabase/functions/client_audit_export_download/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const APP_ID = "DEBACU_EVAL";
const APP_CODE = "DEBACU_EVAL";

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

/** ======================================================
 *  Clients
 * ====================================================== */
function userClient(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** ======================================================
 *  Auth helpers (mismo patrón “bueno”)
 * ====================================================== */
async function requireJwtUser(req: Request) {
  const sb = userClient(req);
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

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

  return { org_id: org.id as string, role: mem.role ?? null };
}

/** ======================================================
 *  Types
 * ====================================================== */
type ReqBody = {
  export_id?: string;
  expires_in_seconds?: number; // opcional, default 30min
};

export default Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(origin, 405, { ok: false, error: "method_not_allowed" });

  try {
    // 1) JWT user
    const user = await requireJwtUser(req);

    // 2) Eval session
    const sessionToken = readSessionToken(req);
    if (!sessionToken) return json(origin, 401, { ok: false, error: "missing_session_token" });

    const customer_id = await requireEvalSession(sessionToken);

    // 3) membership (y org_id)
    const { org_id } = await requireOrgMember(customer_id, user.id);

    // 4) input
    const body = (await req.json().catch(() => ({}))) as ReqBody;
    const export_id = String(body.export_id ?? "").trim();
    const expiresIn = Number(body.expires_in_seconds ?? 60 * 30);

    if (!export_id) return json(origin, 400, { ok: false, error: "missing_export_id" });
    if (!Number.isFinite(expiresIn) || expiresIn < 60 || expiresIn > 60 * 60 * 24) {
      return json(origin, 400, { ok: false, error: "invalid_expires_in" });
    }

    // 5) load export row (scoped por org + app)
    const { data: exp, error: expErr } = await admin
      .from("customer_audit_exports")
      .select(
        "id, org_id, app_id, export_type, export_scope, period_from, period_to, row_count, sha256, file_size_bytes, storage_bucket, storage_path, status, created_at"
      )
      .eq("id", export_id)
      .eq("org_id", org_id)
      .eq("app_id", APP_ID)
      .maybeSingle();

    if (expErr) throw new Error(`EXPORT_LOOKUP_FAILED:${expErr.message}`);
    if (!exp?.id) return json(origin, 404, { ok: false, error: "export_not_found" });

    if (exp.status !== "READY") {
      return json(origin, 409, { ok: false, error: "export_not_ready", status: exp.status });
    }

    const bucket = String(exp.storage_bucket ?? "").trim();
    const path = String(exp.storage_path ?? "").trim();
    if (!bucket || !path) throw new Error("EXPORT_MISSING_STORAGE_FIELDS");

    // 6) signed url (admin)
    const { data: signed, error: sErr } = await admin.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (sErr) throw new Error(`SIGNED_URL_FAILED:${sErr.message}`);

    // 7) (opcional) audit log “EXPORT_DOWNLOADED”
    await admin.from("debacu_eval_audit_log").insert({
      actor_user_id: user.id,
      action: "EXPORT_DOWNLOADED",
      entity: "AUDIT_EXPORT",
      entity_id: export_id,
      meta: {
        export_id,
        storage_bucket: bucket,
        storage_path: path,
        expires_in_seconds: expiresIn,
      },
      customer_id: String(customer_id),
      app_id: APP_ID,
      event_type: "AUDIT_EXPORT",
      evaluation_id: null,
      search_kind: null,
      search_value_masked: null,
      search_value_hash: null,
      result_count: null,
    });

    return json(origin, 200, {
      ok: true,
      export_id: exp.id,
      signed_url: signed?.signedUrl ?? null,
      expires_in_seconds: expiresIn,
      // metadata útil
      export_type: exp.export_type,
      export_scope: exp.export_scope,
      period_from: exp.period_from,
      period_to: exp.period_to,
      row_count: exp.row_count,
      sha256: exp.sha256,
      file_size_bytes: exp.file_size_bytes,
      storage_bucket: bucket,
      storage_path: path,
      created_at: exp.created_at,
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
        : msg.startsWith("missing_") || msg.startsWith("invalid_")
        ? 400
        : msg.startsWith("EXPORT_LOOKUP_FAILED") || msg.startsWith("SIGNED_URL_FAILED")
        ? 500
        : msg === "EXPORT_MISSING_STORAGE_FIELDS"
        ? 500
        : 500;

    console.error("client_audit_export_download error:", e);
    return json(origin, code, { ok: false, error: "request_failed", detail: msg });
  }
});
