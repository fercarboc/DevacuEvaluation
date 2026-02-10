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

type ReqBody = {
  source_audit_id: string;
  template_version?: string; // "v1"
};

export default Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(origin, 405, { ok: false, error: "method_not_allowed" });

  try {
    const user = await requireJwtUser(req);

    const sessionToken = readSessionToken(req);
    if (!sessionToken) return json(origin, 401, { ok: false, error: "missing_session_token" });

    const customer_id = await requireEvalSession(sessionToken);

    const body = (await req.json()) as ReqBody;
    if (!body?.source_audit_id) throw new Error("BAD_SOURCE_ID");

    // 1) lee el evento original (la consulta)
    const { data: source, error: srcErr } = await admin
      .from("debacu_eval_audit_log")
      .select("id,created_at,meta,search_kind,search_value_masked,search_value_hash,result_count,customer_id,app_id,event_type")
      .eq("id", body.source_audit_id)
      .eq("customer_id", customer_id)
      .eq("app_id", APP_ID)
      .maybeSingle();

    if (srcErr) throw new Error(`SOURCE_LOOKUP_FAILED:${srcErr.message}`);
    if (!source) throw new Error("SOURCE_NOT_FOUND");

    const meta = (source.meta ?? {}) as any;

    // 2) inserta evento de trazabilidad de emisión PDF
    const templateVersion = (body.template_version ?? "v1").trim() || "v1";

    const { data: created, error: insErr } = await admin
      .from("debacu_eval_audit_log")
      .insert({
        actor_user_id: user.id,               // aquí SI queda trazado
        action: "PDF_ISSUED",
        entity: "AUDIT_EXPORT",
        entity_id: source.id,
        meta: {
          scope: "FICHA_CONSULTA",
          template_version: templateVersion,
          source_event_type: source.event_type,
          source_created_at: source.created_at,
          risk: meta?.risk ?? null,
          avg_stars: typeof meta?.avg_stars === "number" ? meta.avg_stars : null,
          match_strength: meta?.match_strength ?? null,
          count_bucket: meta?.count_bucket ?? null,
        },
        customer_id,
        app_id: APP_ID,
        event_type: "AUDIT_EXPORT",
        evaluation_id: null,
        search_kind: source.search_kind ?? null,
        search_value_masked: source.search_value_masked ?? null,
        search_value_hash: source.search_value_hash ?? null,
        result_count: source.result_count ?? null,
      })
      .select("id,created_at")
      .single();

    if (insErr || !created?.id) throw new Error(`PDF_EVENT_FAILED:${insErr?.message ?? "NO_ID"}`);

    return json(origin, 200, {
      ok: true,
      pdf_event_id: created.id,
      pdf_event_created_at: created.created_at,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const code =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg.startsWith("SESSION_")
        ? 401
        : msg.endsWith("_NOT_FOUND") || msg === "SOURCE_NOT_FOUND"
        ? 404
        : msg.startsWith("BAD_")
        ? 400
        : 500;

    console.error("client_audit_pdf_issue error:", e);
    return json(origin, code, { ok: false, error: "request_failed", detail: msg });
  }
});
