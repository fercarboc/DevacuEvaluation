// supabase/functions/admin_list_export_downloads/index.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* =======================
   CORS
======================= */
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
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(req),
    },
  });
}

/* =======================
   ENV
======================= */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/* =======================
   HELPERS
======================= */
function getBearer(req: Request) {
  const h =
    req.headers.get("authorization") ??
    req.headers.get("Authorization") ??
    "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
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

function parseAllowedEmails(csv: string | null) {
  const raw = (csv ?? "").trim();
  if (!raw) return ["admin@debacu.com"];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function requireAdmin(req: Request) {
  const token = getBearer(req);
  if (!token) {
    return { ok: false as const, status: 401, error: "missing_bearer" };
  }

  const sbUser = supabaseUserClient(token);
  const { data: userData, error } = await sbUser.auth.getUser();

  if (error || !userData?.user) {
    return { ok: false as const, status: 401, error: "invalid_token" };
  }

  const allowed = parseAllowedEmails(Deno.env.get("ADMIN_EMAILS"));
  const email = (userData.user.email ?? "").toLowerCase().trim();

  if (!allowed.includes(email)) {
    return { ok: false as const, status: 403, error: "forbidden" };
  }

  return { ok: true as const, user: userData.user };
}

function cleanInt(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/* =======================
   MAIN
======================= */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "method_not_allowed" });
  }

  const admin = await requireAdmin(req);
  if (!admin.ok) {
    return json(req, admin.status, { ok: false, error: admin.error });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const export_id = String(body?.export_id ?? "").trim();
    if (!export_id) {
      return json(req, 400, { ok: false, error: "missing_export_id" });
    }

    const limit = Math.min(
      Math.max(cleanInt(body?.limit, 200), 1),
      500
    );
    const offset = Math.max(cleanInt(body?.offset, 0), 0);

    const sb = supabaseServiceClient();

    const { data, error, count } = await sb
      .from("debacu_eval_audit_export_downloads")
      .select(
        `
        id,
        created_at,
        export_id,
        downloaded_by,
        downloaded_by_email,
        ip,
        user_agent
      `,
        { count: "exact" }
      )
      .eq("export_id", export_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return json(req, 500, {
        ok: false,
        error: "db_error",
        detail: error.message,
      });
    }

    return json(req, 200, {
      ok: true,
      data: data ?? [],
      meta: {
        export_id,
        limit,
        offset,
        count: count ?? (data ?? []).length,
      },
    });
  } catch (e: any) {
    return json(req, 500, {
      ok: false,
      error: "unexpected",
      detail: e?.message ?? String(e),
    });
  }
});
