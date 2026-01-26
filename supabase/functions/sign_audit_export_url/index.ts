// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(res: any, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

type Body = { export_id: string; expires_seconds?: number };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) return json({ error: "Missing Bearer token" }, 401);

    // ✅ Cliente para validar usuario usando el JWT
    const sbUser = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: userData, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Invalid auth" }, 401);

    const userId = userData.user.id;
    const email = (userData.user.email || "").toLowerCase();
    if (email !== "admin@debacu.com") return json({ error: "Forbidden" }, 403);

    const body = (await req.json()) as Body;
    if (!body.export_id) return json({ error: "export_id required" }, 400);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: exp, error: expErr } = await sb
      .from("debacu_eval_audit_exports")
      .select("id, storage_bucket, storage_path")
      .eq("id", body.export_id)
      .maybeSingle();

    if (expErr) return json({ error: expErr.message }, 400);
    if (!exp) return json({ error: "Export not found" }, 404);

    const expires = Math.min(Math.max(body.expires_seconds ?? 600, 60), 3600);

    // ✅ LOG de descarga (trazabilidad real)
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null;

    const userAgent = req.headers.get("user-agent") ?? null;

    const { error: logErr } = await sb
      .from("debacu_eval_audit_export_downloads")
      .insert({
        export_id: exp.id,
        downloaded_by: userId,
        ip,
        user_agent: userAgent,
      });

    if (logErr) return json({ error: `Download log failed: ${logErr.message}` }, 400);

    // ✅ Signed URL
    const { data: signed, error: signErr } = await sb.storage
      .from(exp.storage_bucket)
      .createSignedUrl(exp.storage_path, expires);

    if (signErr) return json({ error: signErr.message }, 400);

    return json({ signed_url: signed?.signedUrl, expires_seconds: expires });
  } catch (e: any) {
    return json({ error: e?.message || "Unexpected error" }, 500);
  }
});
