// supabase/functions/admin_audit_exports_downloads/index.ts
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

type Body = { export_id: string; limit?: number; offset?: number };

async function isAdmin(sb: any, userId: string, email: string) {
  const { data } = await sb
    .from("debacu_eval_admin_users")
    .select("active")
    .eq("user_id", userId)
    .maybeSingle();
  if (data?.active === true) return true;
  return email === "admin@debacu.com";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) return json({ ok: false, error: "Missing Bearer token" }, 401);

    const sbUser = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: userData, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "Invalid auth" }, 401);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const email = (userData.user.email || "").toLowerCase();
    if (!(await isAdmin(sb, userData.user.id, email))) return json({ ok: false, error: "Forbidden" }, 403);

    const body = (await req.json()) as Body;
    if (!body?.export_id) return json({ ok: false, error: "export_id required" }, 400);

    const limit = Math.min(Math.max(Number(body.limit ?? 200), 1), 500);
    const offset = Math.max(Number(body.offset ?? 0), 0);

    const { data, error } = await sb
      .from("debacu_eval_audit_export_downloads")
      .select("id, export_id, created_at, downloaded_by, downloaded_by_email, ip, user_agent")
      .eq("export_id", body.export_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return json({ ok: false, error: error.message }, 400);

    const rows = (data ?? []).map((r: any) => ({
      id: r.id,
      export_id: r.export_id,
      downloaded_at: r.created_at,
      downloaded_by_user_id: r.downloaded_by ?? null,
      downloaded_by_email: r.downloaded_by_email ?? null,
      ip: r.ip ?? null,
      user_agent: r.user_agent ?? null,
    }));

    return json({ ok: true, data: rows });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Unexpected error" }, 500);
  }
});
