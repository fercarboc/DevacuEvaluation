// supabase/functions/admin_list_plans/index.ts
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

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SRV_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

function getBearer(req: Request) {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function parseAllowedEmails(csv: string | null) {
  const raw = (csv ?? "").trim();
  if (!raw) return ["admin@debacu.com"];
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function sbUser(token: string) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
}

function sbSrv() {
  return createClient(SUPABASE_URL, SRV_KEY, { auth: { persistSession: false } });
}

async function requireAdmin(req: Request) {
  const token = getBearer(req);
  if (!token) return { ok: false as const, status: 401, error: "missing_bearer" };

  const userClient = sbUser(token);
  const { data: u, error: uErr } = await userClient.auth.getUser();
  if (uErr || !u?.user) return { ok: false as const, status: 401, error: "invalid_token" };

  const allowed = parseAllowedEmails(Deno.env.get("ADMIN_EMAILS"));
  const email = (u.user.email ?? "").toLowerCase().trim();
  if (!allowed.includes(email)) return { ok: false as const, status: 403, error: "forbidden" };

  return { ok: true as const, user: u.user };
}

type Body = {
  app_id?: string | null;
  q?: string | null;
  limit?: number;
  offset?: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  const admin = await requireAdmin(req);
  if (!admin.ok) return json(req, admin.status, { ok: false, error: admin.error });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const appId = (body.app_id ?? "DEBACU_EVAL").toString();
    const q = (body.q ?? "").trim();
    const limit = Math.min(Math.max(Number(body.limit ?? 200), 1), 500);
    const offset = Math.max(Number(body.offset ?? 0), 0);

    const sb = sbSrv();

    let query = sb
      .from("plans")
      .select("*", { count: "exact" })
      .eq("app_id", appId)
      .order("name", { ascending: true })
      .range(offset, offset + limit - 1);

    if (q) {
      const qq = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
      query = query.or(`name.ilike.%${qq}%,code.ilike.%${qq}%`);
    }

    const { data, error, count } = await query;
    if (error) return json(req, 500, { ok: false, error: "db_error", detail: error.message });

    return json(req, 200, {
      ok: true,
      data: { rows: data ?? [], count: count ?? 0, limit, offset },
    });
  } catch (e: any) {
    return json(req, 500, { ok: false, error: "unexpected", detail: e?.message ?? String(e) });
  }
});
