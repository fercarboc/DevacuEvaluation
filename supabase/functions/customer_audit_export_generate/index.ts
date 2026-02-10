// supabase/functions/customer_audit_export_generate/index.ts
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
    Vary: "Origin",
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

type ReqBody = {
  export_type: "PDF" | "CSV";
  export_scope: string;
  period_from: string; // yyyy-mm-dd
  period_to: string; // yyyy-mm-dd
  filters?: any;
  storage_bucket?: string; // opcional: si el FE lo manda, lo aceptamos pero no confiamos a ciegas
};

function assertDate(s: string, name: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`BAD_${name.toUpperCase()}`);
}

function normalizeFilters(v: unknown): Record<string, unknown> {
  // ✅ NUNCA null: la columna filters es NOT NULL (y debe ser jsonb)
  if (!v) return {};
  if (typeof v === "object") return v as Record<string, unknown>;
  // si viene string JSON, intentamos parsear
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      // ignore
    }
  }
  return {};
}

function safeScope(scope: string) {
  // Si quieres, limita a scopes permitidos:
  // return allowed.has(scope) ? scope : null;
  // Por ahora, solo normalizamos.
  return String(scope).trim();
}

export default Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(origin, 405, { ok: false, error: "method_not_allowed" });

  try {
    const user = await requireJwtUser(req);

    const sessionToken = readSessionToken(req);
    if (!sessionToken) return json(origin, 401, { ok: false, error: "missing_session_token" });

    const customer_id = await requireEvalSession(sessionToken);
    const { org_id, role } = await requireOrgMember(customer_id, user.id);

    const body = (await req.json()) as ReqBody;

    if (!body?.export_type || !body?.export_scope) throw new Error("BAD_REQUEST");
    assertDate(body.period_from, "period_from");
    assertDate(body.period_to, "period_to");
    if (body.period_from > body.period_to) throw new Error("BAD_RANGE");

    const export_type = body.export_type;
    const export_scope = safeScope(body.export_scope);

    // ✅ FIX CLAVE: filters SIEMPRE {}
    const filters = normalizeFilters(body.filters);

    // storage_bucket: puedes aceptar el del FE, pero yo lo forzaría a uno permitido.
    const storage_bucket = "customer-exports";

    // 1) crea registro PENDING
    const { data: created, error: insErr } = await admin
      .from("customer_audit_exports")
      .insert({
        org_id,
        app_id: APP_ID,

        requested_by_user_id: user.id,
        requested_by_role: role,
        requested_by_email: user.email ?? null,

        export_type,
        export_scope,
        period_from: body.period_from,
        period_to: body.period_to,

        filters, // ✅ nunca null
        status: "PENDING",

        storage_bucket,
        storage_path: "", // se rellena al generar el fichero real
      })
      .select("id")
      .single();

    if (insErr || !created?.id) throw new Error(`CREATE_FAILED:${insErr?.message ?? "NO_ID"}`);

    const export_id = created.id as string;

    // 2) aquí iría tu pipeline real de generación (CSV/PDF + upload a Storage + update COMPLETED)
    //    Por ahora devolvemos PENDING.
    return json(origin, 200, { ok: true, export_id, status: "PENDING" });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const code =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg.startsWith("SESSION_")
        ? 401
        : msg.startsWith("FORBIDDEN")
        ? 403
        : msg.startsWith("BAD_") || msg === "BAD_REQUEST"
        ? 400
        : 500;

    console.error("customer_audit_export_generate error:", e);
    return json(origin, code, { ok: false, error: "request_failed", detail: msg });
  }
});
