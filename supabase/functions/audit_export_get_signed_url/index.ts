// supabase/functions/audit_export_get_signed_url/index.ts
// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  // 👇 MUY IMPORTANTE: incluir content-type
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function respond(status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function getIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip") ?? null;
}

function isAdminEmail(email: string | null | undefined, allowedCsv?: string | null) {
  if (!email) return false;
  const list = (allowedCsv ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (list.length === 0) return false;
  return list.includes(email.toLowerCase());
}

serve(async (req) => {
  // ✅ Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return respond(405, { error: "Method not allowed" });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const ADMIN_EMAILS = Deno.env.get("ADMIN_EMAILS") ?? "";

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return respond(401, { error: "Missing Authorization header" });

    // Cliente "user" para validar JWT
    const supaUser = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userErr } = await supaUser.auth.getUser();
    if (userErr || !userData?.user) return respond(401, { error: "Invalid token" });

    const user = userData.user;
    const userEmail = user.email ?? null;

    // ✅ Solo admins (allowlist por env)
    if (!isAdminEmail(userEmail, ADMIN_EMAILS)) {
      return respond(403, { error: "Not authorized" });
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return respond(400, { error: "Invalid JSON body" });
    }

    const exportId = body?.export_id as string | undefined;
    const expiresIn = Number(body?.expires_in ?? 300);

    if (!exportId) return respond(400, { error: "export_id is required" });
    if (!Number.isFinite(expiresIn) || expiresIn < 60 || expiresIn > 3600) {
      return respond(400, { error: "expires_in must be between 60 and 3600 seconds" });
    }

    // Service role: Storage + insert log (bypassa RLS)
    const supaSrv = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1) Leer audit_exports (bucket + storage_path)
    const { data: expRow, error: expErr } = await supaSrv
      .from("audit_exports")
      .select("id,bucket,storage_path")
      .eq("id", exportId)
      .maybeSingle();

    if (expErr) return respond(500, { error: expErr.message });
    if (!expRow?.bucket || !expRow?.storage_path) {
      return respond(404, { error: "Export not found" });
    }

    // 2) Firmar URL
    const { data: signed, error: signErr } = await supaSrv.storage
      .from(expRow.bucket)
      .createSignedUrl(expRow.storage_path, expiresIn);

    if (signErr || !signed?.signedUrl) {
      return respond(500, { error: signErr?.message ?? "Failed to sign URL" });
    }

    // 3) Log audit_export_downloads
    const ip = getIp(req);
    const ua = req.headers.get("user-agent");

    const { error: insErr } = await supaSrv.from("audit_export_downloads").insert({
      export_id: exportId,
      downloaded_by_user_id: user.id,
      downloaded_by_email: userEmail,
      ip,
      user_agent: ua,
    });

    if (insErr) {
      return respond(200, {
        signed_url: signed.signedUrl,
        expires_in: expiresIn,
        warning: "Signed URL generated but failed to log download",
        log_error: insErr.message,
      });
    }

    return respond(200, { signed_url: signed.signedUrl, expires_in: expiresIn });
  } catch (e) {
    return respond(500, { error: String((e as any)?.message ?? e) });
  }
});
