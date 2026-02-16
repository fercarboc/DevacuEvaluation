// supabase/functions/debacu_eval_org_members_list/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/* ======================================================
 * ENV
 * ====================================================== */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

/* ======================================================
 * CORS
 * ====================================================== */
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin)
    ? origin
    : "https://debacu.com";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": [
      "authorization",
      "x-client-info",
      "apikey",
      "content-type",
      "x-session-token",
    ].join(", "),
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

/* ======================================================
 * CLIENTS
 * ====================================================== */
const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function supabaseAuthed(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
}

/* ======================================================
 * AUTH
 * ====================================================== */
async function requireUser(req: Request) {
  const sb = supabaseAuthed(req);
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) return { user: null };
  return { user: data.user };
}

async function requirePrivilegedOrg(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("debacu_eval_org_members")
    .select("org_id, role, status")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (error || !data) return { ok: false, org_id: null };

  if (!["OWNER", "ADMIN"].includes(data.role))
    return { ok: false, org_id: null };

  return { ok: true, org_id: data.org_id };
}

/* ======================================================
 * HANDLER
 * ====================================================== */
Deno.serve(async (req) => {

  if (req.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders(req) });

  if (req.method !== "POST")
    return json(req, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });

  const { user } = await requireUser(req);
  if (!user)
    return json(req, 401, { ok: false, error: "UNAUTHENTICATED" });

  const mem = await requirePrivilegedOrg(user.id);
  if (!mem.ok)
    return json(req, 403, { ok: false, error: "FORBIDDEN" });

  /* ======================================================
   * Members + Profiles (LEFT JOIN)
   * ====================================================== */
  const { data: members, error } = await supabaseAdmin
    .from("debacu_eval_org_members")
    .select(`
      id,
      created_at,
      org_id,
      user_id,
      role,
      status,
      invited_email,
      created_by_user_id,
      updated_at,
      profile:debacu_eval_org_member_profiles (
        first_name,
        last_name,
        title,
        phone
      )
    `)
    .eq("org_id", mem.org_id)
    .order("created_at", { ascending: true });

  if (error)
    return json(req, 500, { ok: false, error: error.message });

  /* ======================================================
   * Entitlements (seats + plan)
   * ====================================================== */
  const { data: ent } = await supabaseAdmin
    .from("debacu_eval_org_entitlements_v")
    .select(`
      org_id,
      customer_id,
      plan_code,
      subscription_status,
      max_users,
      extra_seats,
      seats_total,
      seats_used,
      seats_available
    `)
    .eq("org_id", mem.org_id)
    .maybeSingle();

  return json(req, 200, {
    ok: true,
    data: {
      members: members ?? [],
      entitlements: ent ?? null,
    },
  });
});
