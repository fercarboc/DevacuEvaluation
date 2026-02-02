// supabase/functions/admin_list_config_changes_saas/index.ts
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

  if (!allowed.includes(email)) throw Object.assign(new Error("forbidden_admin_only"), { status: 403 });

  return { user_id: u.user.id, email: u.user.email ?? null };
}

function clampInt(v: any, def: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const i = Math.trunc(n);
  return Math.max(min, Math.min(max, i));
}

function isYmd(s: any) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  try {
    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    await requireAdminUser(req);

    const payload = await req.json().catch(() => ({}));

    const q = typeof payload?.q === "string" ? payload.q.trim().toLowerCase() : "";
    const from = isYmd(payload?.from) ? payload.from : "";
    const to = isYmd(payload?.to) ? payload.to : "";

    const limit = clampInt(payload?.limit, 25, 1, 100);
    const offset = clampInt(payload?.offset, 0, 0, 100000);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    let query = sb
      .from("debacu_eval_settings_audit_log")
      .select(
        "id, created_at, actor_user_id, actor_email, action, diff, ip, user_agent, settings_before, settings_after",
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (q) {
      query = query.or(`actor_email.ilike.%${q}%,action.ilike.%${q}%`);
    }

    if (from) {
      query = query.gte("created_at", `${from}T00:00:00.000Z`);
    }

    if (to) {
      const d = new Date(`${to}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      query = query.lt("created_at", d.toISOString());
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) throw error;

    return json(req, 200, {
      ok: true,
      data: {
        rows: data ?? [],
        total: count ?? 0,
        limit,
        offset,
      },
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return json(req, status, { ok: false, error: "unexpected", detail: e?.message ?? String(e) });
  }
});
