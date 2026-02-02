// supabase/functions/admin_get_system_settings/index.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(req: Request, status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "content-type": "application/json; charset=utf-8" },
  });
}

function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function getBearer(req: Request) {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function parseAllowedEmails(csv: string | null) {
  const raw = (csv ?? "").trim();
  if (!raw) return ["admin@debacu.com"]; // fallback
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function requireAdminUser(req: Request) {
  const SUPABASE_URL = requireEnv("SUPABASE_URL");
  const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
  const ADMIN_EMAILS = Deno.env.get("ADMIN_EMAILS");

  const token = getBearer(req);
  if (!token) throw Object.assign(new Error("missing_bearer"), { status: 401 });

  const sbUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: u, error: uErr } = await sbUser.auth.getUser();
  if (uErr || !u?.user) throw Object.assign(new Error("invalid_token"), { status: 401 });

  const email = (u.user.email ?? "").toLowerCase();
  const allowed = parseAllowedEmails(ADMIN_EMAILS);
  const isAdmin = allowed.includes(email);

  if (!isAdmin) throw Object.assign(new Error("forbidden_admin_only"), { status: 403 });

  return { user_id: u.user.id, email: u.user.email ?? null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  try {
    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    // ✅ admin check igual que admin_whoami
    await requireAdminUser(req);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // leer singleton; si no existe, crearlo
    const { data: row, error } = await sb
      .from("debacu_eval_system_settings")
      .select("retention_days, abuse_threshold_percent, allow_new_access_requests, updated_at, updated_by")
      .eq("id", "singleton")
      .maybeSingle();

    if (error) throw error;

    if (row) return json(req, 200, { ok: true, data: row });

    const { data: created, error: upErr } = await sb
      .from("debacu_eval_system_settings")
      .upsert({ id: "singleton" }, { onConflict: "id" })
      .select("retention_days, abuse_threshold_percent, allow_new_access_requests, updated_at, updated_by")
      .single();

    if (upErr) throw upErr;

    return json(req, 200, { ok: true, data: created });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return json(req, status, { ok: false, error: "unexpected", detail: e?.message ?? String(e) });
  }
});
