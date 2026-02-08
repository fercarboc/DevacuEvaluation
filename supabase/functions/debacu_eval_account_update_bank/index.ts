// supabase/functions/debacu_eval_account_update_bank/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/** ======================================================
 *  CORS
 *  ====================================================== */
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
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-session-token",
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

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function readSessionToken(req: Request) {
  return (
    safeStr(req.headers.get("x-session-token")) ||
    safeStr(req.headers.get("x-debacu-session-token")) ||
    safeStr(req.headers.get("x-debacu-eval-session-token"))
  );
}

async function readJson(req: Request) {
  const t = await req.text();
  if (!t) return {};
  try {
    return JSON.parse(t);
  } catch {
    return {};
  }
}

/** ======================================================
 *  Types
 *  ====================================================== */
type ReqBody = {
  customer_id: string;
  app_id?: string;
  patch: {
    iban?: string | null;
    swift?: string | null;
    bank_name?: string | null;
    bank_address?: string | null;
  };
};

/** ======================================================
 *  Handler
 *  ====================================================== */
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  // Preflight SIEMPRE 204 con headers
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return json(origin, 405, { error: "Method not allowed" });
  }

  try {
    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const SERVICE_ROLE = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1) JWT obligatorio
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) return json(origin, 401, { error: "Missing Authorization" });

    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user?.id) return json(origin, 401, { error: "Invalid session" });
    const userId = userData.user.id;

    // 2) Body
    const body = (await readJson(req)) as Partial<ReqBody>;
    const customerId = safeStr(body?.customer_id);
    const appId = safeStr(body?.app_id) || "DEBACU_EVAL";

    if (!customerId) return json(origin, 400, { error: "customer_id required" });

    // 3) x-session-token obligatorio
    const sessionToken = readSessionToken(req);
    if (!sessionToken) return json(origin, 401, { error: "Missing x-session-token" });

    // 4) Validar sesión Debacu (token+customer+app y no revocada/expirada)
    const nowIso = new Date().toISOString();
    const { data: sess, error: sessErr } = await admin
      .from("debacu_eval_sessions")
      .select("token, customer_id, app_code, expires_at, revoked_at")
      .eq("token", sessionToken)
      .eq("customer_id", customerId)
      .eq("app_code", appId)
      .is("revoked_at", null)
      .maybeSingle();

    if (sessErr) return json(origin, 500, { error: "SESSION_CHECK_FAILED", detail: sessErr.message });
    if (!sess) return json(origin, 401, { error: "SESSION_INVALID" });
    if (sess.expires_at && String(sess.expires_at) <= nowIso) return json(origin, 401, { error: "SESSION_EXPIRED" });

    // 5) AuthZ membership
    // OJO: si tu tabla real es debacu_eval_org_members (no memberships), cambia el nombre aquí.
    const { data: membership, error: memErr } = await admin
      .from("debacu_eval_org_memberships")
      .select("id")
      .eq("customer_id", customerId)
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (memErr) return json(origin, 500, { error: "MEMBERSHIP_FAILED", detail: memErr.message });
    if (!membership?.id) return json(origin, 403, { error: "Not allowed" });

    // 6) Whitelist patch
    const patch = (body?.patch ?? {}) as ReqBody["patch"];
    const allowed = {
      iban: patch.iban ?? null,
      swift: patch.swift ?? null,
      bank_name: patch.bank_name ?? null,
      bank_address: patch.bank_address ?? null,
    };

    // 7) Update
    const { error: updErr } = await admin.from("customers").update(allowed).eq("id", customerId);
    if (updErr) return json(origin, 500, { error: "DB_UPDATE_FAILED", detail: updErr.message });

    return json(origin, 200, { ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json(origin, 500, { error: "Request failed", detail: msg });
  }
});
