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
   ENV + helpers
======================= */
function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

function getBearer(req: Request) {
  const h =
    req.headers.get("authorization") ??
    req.headers.get("Authorization") ??
    "";
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
  const { data: userData, error: userErr } = await sbUser.auth.getUser(); // v2: sin pasar token aquí
  if (userErr || !userData?.user) {
    return { ok: false as const, status: 401, error: "invalid_token" as const };
  }

  const allowed = parseAllowedEmails(Deno.env.get("ADMIN_EMAILS"));
  const email = (userData.user.email ?? "").toLowerCase().trim();
  const isAdmin = allowed.includes(email);

  if (!isAdmin) return { ok: false as const, status: 403, error: "forbidden" as const };

  return { ok: true as const, user: userData.user };
}

function cleanStr(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function cleanInt(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function getIp(req: Request) {
  // Cloudflare / proxies / local fallback
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
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
  if (!admin.ok) return json(req, admin.status, { ok: false, error: admin.error });

  try {
    const body = await req.json().catch(() => ({}));

    // Admite export_id o id (por si el front manda "id")
    const export_id = cleanStr(body?.export_id) ?? cleanStr(body?.id);
    if (!export_id) return json(req, 400, { ok: false, error: "missing_export_id" });

    // seconds
    const expires_in = Math.min(Math.max(cleanInt(body?.expires_in, 600), 60), 60 * 60);

    const sb = supabaseServiceClient();

    // 1) Obtener bucket/path del export
    // AJUSTA AQUÍ si tu tabla real se llama distinto:
    const { data: exp, error: expErr } = await sb
      .from("audit_exports")
      .select("id, storage_bucket, storage_path")
      .eq("id", export_id)
      .maybeSingle();

    if (expErr) {
      return json(req, 500, { ok: false, error: "db_error", detail: expErr.message });
    }
    if (!exp?.storage_bucket || !exp?.storage_path) {
      return json(req, 404, { ok: false, error: "export_not_found" });
    }

    // 2) Crear signed URL
    const { data: signed, error: signErr } = await sb
      .storage
      .from(exp.storage_bucket)
      .createSignedUrl(exp.storage_path, expires_in);

    if (signErr || !signed?.signedUrl) {
      return json(req, 500, { ok: false, error: "signed_url_error", detail: signErr?.message ?? "no_signed_url" });
    }

    const signedUrl = signed.signedUrl;

    // 3) Registrar descarga (NO usar .catch aquí)
    const ip = getIp(req);
    const user_agent = req.headers.get("user-agent") ?? null;

    const { error: insErr } = await sb
      .from("debacu_eval_audit_export_downloads")
      .insert({
        export_id,
        downloaded_by: admin.user.id,
        downloaded_by_email: admin.user.email ?? null,
        ip,
        user_agent,
      });

    if (insErr) {
      // No rompas el signed URL si falla el log, pero sí devuélvelo para depurar
      // (si prefieres “estricto”, cambia a return 500)
      return json(req, 200, {
        ok: true,
        signed_url: signedUrl,
        signedUrl,
        warn: "download_log_failed",
        warn_detail: insErr.message,
      });
    }

    return json(req, 200, { ok: true, signed_url: signedUrl, signedUrl });
  } catch (e: any) {
    return json(req, 500, { ok: false, error: "unexpected", detail: e?.message ?? String(e) });
  }
});
