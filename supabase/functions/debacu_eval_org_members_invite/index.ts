// supabase/functions/debacu_eval_org_members_invite/index.ts
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
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://debacu.com";

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
  if (error || !data?.user) return { user: null, error: "UNAUTHENTICATED" };
  return { user: data.user, error: null };
}

async function requirePrivilegedOrg(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("debacu_eval_org_members")
    .select("org_id, role, status")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (error) return { ok: false, error: error.message, org_id: null };
  if (!data) return { ok: false, error: "NO_ACTIVE_MEMBERSHIP", org_id: null };
  if (!["OWNER", "ADMIN"].includes(data.role))
    return { ok: false, error: "FORBIDDEN", org_id: null };

  return { ok: true, org_id: data.org_id };
}

function normalizeEmail(e: string) {
  return (e ?? "").trim().toLowerCase();
}

/* ======================================================
 * HANDLER
 * ====================================================== */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });

  const { user } = await requireUser(req);
  if (!user) return json(req, 401, { ok: false, error: "UNAUTHENTICATED" });

  const mem = await requirePrivilegedOrg(user.id);
  if (!mem.ok) return json(req, 403, { ok: false, error: mem.error });

  let payload: any = {};
  try { payload = await req.json(); } catch {}

  const email = normalizeEmail(payload.email);
  const role = (payload.role ?? "STAFF").toUpperCase();

  const firstName = (payload.firstName ?? "").trim();
  const lastName  = (payload.lastName ?? "").trim();
  const title     = (payload.title ?? "").trim();
  const phone     = (payload.phone ?? "").trim();

  if (!email || !email.includes("@"))
    return json(req, 400, { ok: false, error: "INVALID_EMAIL" });

  if (!["STAFF", "ADMIN"].includes(role))
    return json(req, 400, { ok: false, error: "INVALID_ROLE" });

  /* ======================================================
   * Entitlements check
   * ====================================================== */
  const { data: ent, error: entErr } = await supabaseAdmin
    .from("debacu_eval_org_entitlements_v")
    .select("subscription_status, seats_available")
    .eq("org_id", mem.org_id)
    .maybeSingle();

  if (entErr) return json(req, 500, { ok: false, error: entErr.message });

  if (!ent || ent.subscription_status !== "ACTIVE")
    return json(req, 402, { ok: false, error: "PLAN_NOT_ACTIVE" });

  if ((ent.seats_available ?? 0) <= 0)
    return json(req, 409, { ok: false, error: "SEATS_EXCEEDED" });

  /* ======================================================
   * Anti-duplicate
   * ====================================================== */
  const { data: existing } = await supabaseAdmin
    .from("debacu_eval_org_members")
    .select("id")
    .eq("org_id", mem.org_id)
    .eq("invited_email", email)
    .maybeSingle();

  if (existing)
    return json(req, 409, { ok: false, error: "ALREADY_MEMBER" });

  /* ======================================================
   * Invite via Supabase Auth
   * ====================================================== */
  const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: {
      app: "DEBACU_EVAL",
      org_id: mem.org_id,
      invited_by: user.id,
    },
  });

  if (inviteErr)
    return json(req, 400, { ok: false, error: inviteErr.message });

  /* ======================================================
   * Create membership
   * ====================================================== */
  const { data: member, error: insErr } = await supabaseAdmin
    .from("debacu_eval_org_members")
    .insert({
      org_id: mem.org_id,
      role,
      status: "INVITED",
      invited_email: email,
      user_id: null,
      created_by_user_id: user.id,
    })
    .select("id, created_at, org_id, role, status, invited_email")
    .single();

  if (insErr)
    return json(req, 500, { ok: false, error: insErr.message });

  /* ======================================================
   * Create profile (1:1)
   * ====================================================== */
  const { error: profileErr } = await supabaseAdmin
    .from("debacu_eval_org_member_profiles")
    .insert({
      member_id: member.id,
      org_id: mem.org_id,
      first_name: firstName || null,
      last_name: lastName || null,
      title: title || null,
      phone: phone || null,
    });

  if (profileErr) {
    // rollback membership si profile falla
    await supabaseAdmin
      .from("debacu_eval_org_members")
      .delete()
      .eq("id", member.id);

    return json(req, 500, { ok: false, error: profileErr.message });
  }

  return json(req, 200, {
    ok: true,
    data: { member }
  });
});
