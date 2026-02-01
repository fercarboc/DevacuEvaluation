// supabase/functions/admin_rollback_abuse_settings/index.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =======================
// CORS (simple y seguro)
// =======================
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(req) },
  });
}

// =======================
// Env + helpers
// =======================
function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

function getBearer(req: Request) {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function parseAllowedEmails(csv: string | null) {
  const raw = (csv ?? "").trim();
  if (!raw) return ["admin@debacu.com"];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function supabaseUserClient(token: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
}

function supabaseServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function requireAdmin(req: Request) {
  const token = getBearer(req);
  if (!token) return { ok: false as const, status: 401, error: "missing_bearer" as const };

  const sbUser = supabaseUserClient(token);

  const { data: userData, error: userErr } = await sbUser.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false as const, status: 401, error: "invalid_token" as const };
  }

  const allowed = parseAllowedEmails(Deno.env.get("ADMIN_EMAILS"));
  const email = (userData.user.email ?? "").toLowerCase().trim();
  const isAdmin = allowed.includes(email);

  if (!isAdmin) return { ok: false as const, status: 403, error: "forbidden" as const };

  return { ok: true as const, user: userData.user };
}

// Campos permitidos para rollback (lo demás se ignora)
const ALLOWED_FIELDS = new Set([
  "ack_warning_minutes",
  "ack_critical_minutes",
  "resolve_warning_minutes",
  "resolve_critical_minutes",
]);

function pickRollbackPayload(oldValues: any) {
  const src = (oldValues && typeof oldValues === "object") ? oldValues : {};
  const out: Record<string, any> = {};
  for (const k of Object.keys(src)) {
    if (ALLOWED_FIELDS.has(k)) out[k] = src[k];
  }
  return out;
}

// =======================
// Main
// =======================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  const admin = await requireAdmin(req);
  if (!admin.ok) return json(req, admin.status, { ok: false, error: admin.error });

  try {
    const body = await req.json().catch(() => ({}));
    const auditId = body?.audit_id ? String(body.audit_id) : "";

    if (!auditId) return json(req, 400, { ok: false, error: "missing_audit_id" });

    const sb = supabaseServiceClient();

    // 1) Leer log
    const { data: logRow, error: logErr } = await sb
      .from("settings_audit_log")
      .select("id, table_name, record_id, action, old_values, new_values, changed_at")
      .eq("id", auditId)
      .maybeSingle();

    if (logErr) return json(req, 500, { ok: false, error: "db_error", detail: logErr.message });
    if (!logRow) return json(req, 404, { ok: false, error: "audit_not_found" });

    if (logRow.table_name !== "abuse_settings" || logRow.action !== "UPDATE") {
      return json(req, 400, { ok: false, error: "invalid_audit_row" });
    }

    const settingsId = logRow.record_id;
    if (!settingsId) return json(req, 400, { ok: false, error: "missing_record_id" });

    // 2) Construir payload de rollback (solo campos permitidos)
    const payload = pickRollbackPayload(logRow.old_values);

    if (Object.keys(payload).length === 0) {
      return json(req, 400, { ok: false, error: "nothing_to_rollback" });
    }

    // 3) Aplicar rollback y firmar
    const updatePayload = {
      ...payload,
      updated_by: admin.user.id,
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error: upErr } = await sb
      .from("abuse_settings")
      .update(updatePayload)
      .eq("id", settingsId)
      .select("*")
      .maybeSingle();

    if (upErr) return json(req, 500, { ok: false, error: "db_error", detail: upErr.message });

    return json(req, 200, {
      ok: true,
      rolled_back_to_audit_id: auditId,
      abuse_settings_id: settingsId,
      updated,
    });
  } catch (e: any) {
    return json(req, 500, { ok: false, error: "unexpected", detail: e?.message ?? String(e) });
  }
});
