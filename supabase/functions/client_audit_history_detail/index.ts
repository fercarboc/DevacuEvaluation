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

type ReqBody = { audit_id: string };

export default Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(origin, 405, { ok: false, error: "method_not_allowed" });

  try {
    await requireJwtUser(req);

    const sessionToken = readSessionToken(req);
    if (!sessionToken) return json(origin, 401, { ok: false, error: "missing_session_token" });

    const customer_id = await requireEvalSession(sessionToken);

    const body = (await req.json()) as ReqBody;
    if (!body?.audit_id) throw new Error("BAD_AUDIT_ID");

    const { data: row, error } = await admin
      .from("debacu_eval_audit_log")
      .select(
        "id,created_at,actor_user_id,action,entity,entity_id,meta,customer_id,app_id,event_type,search_kind,search_value_masked,result_count"
      )
      .eq("id", body.audit_id)
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
        meta, // si quieres pintar más cosas (SIN PII)
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const code =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg.startsWith("SESSION_")
        ? 401
        : msg === "NOT_FOUND"
        ? 404
        : msg.startsWith("BAD_")
        ? 400
        : 500;

    console.error("client_audit_history_detail error:", e);
    return json(origin, code, { ok: false, error: "request_failed", detail: msg });
  }
});
