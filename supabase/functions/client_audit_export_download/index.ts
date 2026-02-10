// supabase/functions/client_audit_export_download/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_EXPIRES = 60 * 5;

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

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });

  try {
    if (req.method !== "POST") return json(origin, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    const { data: userData, error: userErr } = await sb.auth.getUser();
    if (userErr || !userData?.user) return json(origin, 401, { ok: false, error: "UNAUTHENTICATED" });
    const user_id = userData.user.id;
    const user_email = userData.user.email ?? null;

    const body = await req.json().catch(() => ({} as any));
    const export_id = (body?.export_id ?? null) as string | null;
    if (!export_id) return json(origin, 400, { ok: false, error: "MISSING_EXPORT_ID" });

    // Resolve org membership
    const { data: member, error: memErr } = await sb
      .from("debacu_eval_org_members")
      .select("org_id")
      .eq("user_id", user_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memErr) throw memErr;
    if (!member?.org_id) return json(origin, 403, { ok: false, error: "NO_ORG_MEMBERSHIP" });
    const org_id = member.org_id as string;

    // Load export
    const { data: exp, error: expErr } = await sb
      .from("customer_audit_exports")
      .select("id, org_id, status, storage_bucket, storage_path")
      .eq("id", export_id)
      .maybeSingle();

    if (expErr) throw expErr;
    if (!exp) return json(origin, 404, { ok: false, error: "EXPORT_NOT_FOUND" });
    if (exp.org_id !== org_id) return json(origin, 403, { ok: false, error: "FORBIDDEN" });
    if (exp.status !== "READY") return json(origin, 409, { ok: false, error: "EXPORT_NOT_READY" });

    const storage_bucket = exp.storage_bucket as string;
    const storage_path = exp.storage_path as string;

    const ip =
      req.headers.get("x-forwarded-for") ??
      req.headers.get("cf-connecting-ip") ??
      null;
    const ua = req.headers.get("user-agent") ?? null;

    // Insert download trace
    await sb.from("customer_audit_export_downloads").insert({
      export_id,
      org_id,
      downloaded_by_user_id: user_id,
      downloaded_by_email: user_email,
      ip_address: ip,
      user_agent: ua,
    });

    // Signed URL
    const { data: signed, error: signErr } = await sb.storage
      .from(storage_bucket)
      .createSignedUrl(storage_path, DEFAULT_EXPIRES);

    if (signErr) throw signErr;

    return json(origin, 200, {
      export_id,
      download_url: signed?.signedUrl ?? null,
      expires_in: DEFAULT_EXPIRES,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "UNKNOWN";
    return json(origin, 500, { ok: false, error: msg });
  }
});
