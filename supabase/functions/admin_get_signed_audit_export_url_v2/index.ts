// supabase/functions/admin_get_signed_audit_export_url_v2/index.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =======================
// CORS
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(req) },
  });
}

// =======================
// Env + clients
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

  // ✅ supabase-js v2: getUser() sin token
  const { data: userData, error: userErr } = await sbUser.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false as const, status: 401, error: "invalid_token" as const };
  }

  const email = (userData.user.email ?? "").toLowerCase().trim();
  const allowed = parseAllowedEmails(Deno.env.get("ADMIN_EMAILS"));
  const isAdmin = allowed.includes(email);

  if (!isAdmin) return { ok: false as const, status: 403, error: "forbidden" as const };

  return { ok: true as const, user: userData.user };
}

function getIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip") ?? null;
}

// =======================
// Main
// =======================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  const admin = await requireAdmin(req);
  if (!admin.ok) return json(req, admin.status, { ok: false, error: admin.error });

  try {
    const body = await req.json().catch(() => ({}));
    const exportId = String(body?.export_id ?? "").trim();
    const expiresIn = Number(body?.expires_in ?? 300);

    if (!exportId) return json(req, 400, { ok: false, error: "export_id_required" });
    if (!Number.isFinite(expiresIn) || expiresIn < 60 || expiresIn > 3600) {
      return json(req, 400, { ok: false, error: "expires_in_out_of_range" });
    }

    const sb = supabaseServiceClient();

    // ✅ Alineado con tu tabla de exports
    const { data: expRow, error: expErr } = await sb
      .from("debacu_eval_audit_exports")
      .select("id, storage_bucket, storage_path")
      .eq("id", exportId)
      .maybeSingle();

    if (expErr) return json(req, 500, { ok: false, error: "db_error", detail: expErr.message });
    if (!expRow?.storage_bucket || !expRow?.storage_path) {
      return json(req, 404, { ok: false, error: "export_not_found" });
    }

    const { data: signed, error: signErr } = await sb.storage
      .from(expRow.storage_bucket)
      .createSignedUrl(expRow.storage_path, expiresIn);

    if (signErr || !signed?.signedUrl) {
      return json(req, 500, { ok: false, error: "sign_failed", detail: signErr?.message ?? "no_signed_url" });
    }

    // Log download (si falla, no bloqueamos)
    const ip = getIp(req);
    const ua = req.headers.get("user-agent") ?? null;

    await sb
      .from("audit_export_downloads")
      .insert({
        export_id: exportId,
        downloaded_by_user_id: admin.user.id,
        downloaded_by_email: admin.user.email ?? null,
        ip,
        user_agent: ua,
      })
      .catch(() => null);

    return json(req, 200, {
      ok: true,
      data: { signed_url: signed.signedUrl, expires_in: expiresIn },
    });
  } catch (e: any) {
    return json(req, 500, { ok: false, error: "unexpected", detail: e?.message ?? String(e) });
  }
});
