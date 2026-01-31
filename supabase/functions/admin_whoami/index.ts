// supabase/functions/admin_whoami/index.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(req: Request, status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  try {
    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
    const ADMIN_EMAILS = Deno.env.get("ADMIN_EMAILS");

    const token = getBearer(req);
    if (!token) return json(req, 401, { ok: false, error: "missing_bearer" });

    // Cliente user: validar JWT
    const sbUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false },
    });

    const { data: u, error: uErr } = await sbUser.auth.getUser();
    if (uErr || !u?.user) return json(req, 401, { ok: false, error: "invalid_token" });

    const email = (u.user.email ?? "").toLowerCase();
    const allowed = parseAllowedEmails(ADMIN_EMAILS);

    const is_admin = allowed.includes(email);

    return json(req, 200, {
      ok: true,
      data: {
        is_admin,
        user_id: u.user.id,
        email: u.user.email ?? null,
      },
    });
  } catch (e: any) {
    return json(req, 500, { ok: false, error: "unexpected", detail: e?.message ?? String(e) });
  }
});
