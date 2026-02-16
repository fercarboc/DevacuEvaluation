// supabase/functions/debacu_eval_org_members_update/index.ts
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
    // ✅ FIX: permitir header custom que manda callEvalFn
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
 * SUPABASE CLIENTS
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
 * AUTH HELPERS
 * ====================================================== */
async function requireUser(req: Request) {
  const sb = supabaseAuthed(req);
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) return { user: null, error: error?.message ?? "UNAUTHENTICATED" };
  return { user: data.user, error: null };
}

type Membership = {
  org_id: string;
  role: "OWNER" | "ADMIN" | "STAFF";
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
};

async function requirePrivilegedOrg(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("debacu_eval_org_members")
    .select("org_id, role, status")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .maybeSingle<Membership>();

  if (error) return { ok: false, error: error.message, org_id: null as string | null, role: null as any };
  if (!data) return { ok: false, error: "NO_ACTIVE_MEMBERSHIP", org_id: null, role: null };
  if (data.role !== "OWNER" && data.role !== "ADMIN")
    return { ok: false, error: "FORBIDDEN", org_id: null, role: null };

  return { ok: true, error: null as string | null, org_id: data.org_id as string, role: data.role };
}

/* ======================================================
 * HANDLER
 * ====================================================== */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });

  const { user, error: authErr } = await requireUser(req);
  if (!user) return json(req, 401, { ok: false, error: authErr });

  const mem = await requirePrivilegedOrg(user.id);
  if (!mem.ok) return json(req, 403, { ok: false, error: mem.error });

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const action = String(payload.action ?? "").toUpperCase();
  const memberId = payload.member_id as string | undefined;

  if (!memberId) return json(req, 400, { ok: false, error: "MEMBER_ID_REQUIRED" });

  const allowed = new Set(["SUSPEND", "REACTIVATE", "REMOVE", "RESEND_INVITE"]);
  if (!allowed.has(action)) return json(req, 400, { ok: false, error: "INVALID_ACTION" });

  // Cargar el miembro objetivo y asegurar misma org
  const { data: target, error: tgtErr } = await supabaseAdmin
    .from("debacu_eval_org_members")
    .select("id, org_id, user_id, role, status, invited_email")
    .eq("id", memberId)
    .maybeSingle();

  if (tgtErr) return json(req, 500, { ok: false, error: tgtErr.message });
  if (!target) return json(req, 404, { ok: false, error: "MEMBER_NOT_FOUND" });
  if (target.org_id !== mem.org_id) return json(req, 403, { ok: false, error: "FORBIDDEN" });

  // Política: no permitir tocar OWNER (evitar quedarte sin control)
  if (target.role === "OWNER") {
    return json(req, 400, { ok: false, error: "OWNER_IMMUTABLE" });
  }

  if (action === "REMOVE") {
    const { error: delErr } = await supabaseAdmin
      .from("debacu_eval_org_members")
      .delete()
      .eq("id", memberId);

    if (delErr) return json(req, 500, { ok: false, error: delErr.message });
    return json(req, 200, { ok: true });
  }

  if (action === "SUSPEND") {
    if (target.status !== "ACTIVE") return json(req, 400, { ok: false, error: "ONLY_ACTIVE_CAN_SUSPEND" });

    const { error: upErr } = await supabaseAdmin
      .from("debacu_eval_org_members")
      .update({ status: "SUSPENDED", updated_at: new Date().toISOString() })
      .eq("id", memberId);

    if (upErr) return json(req, 500, { ok: false, error: upErr.message });
    return json(req, 200, { ok: true });
  }

  if (action === "REACTIVATE") {
    if (target.status !== "SUSPENDED") return json(req, 400, { ok: false, error: "ONLY_SUSPENDED_CAN_REACTIVATE" });

    const { data: ent, error: entErr } = await supabaseAdmin
      .from("debacu_eval_org_entitlements_v")
      .select("subscription_status, seats_available")
      .eq("org_id", mem.org_id)
      .maybeSingle();

    if (entErr) return json(req, 500, { ok: false, error: entErr.message });
    if (!ent || String(ent.subscription_status ?? "").toUpperCase() !== "ACTIVE")
      return json(req, 402, { ok: false, error: "PLAN_NOT_ACTIVE" });
    if ((ent.seats_available ?? 0) <= 0) return json(req, 409, { ok: false, error: "SEATS_EXCEEDED" });

    const { error: upErr } = await supabaseAdmin
      .from("debacu_eval_org_members")
      .update({ status: "ACTIVE", updated_at: new Date().toISOString() })
      .eq("id", memberId);

    if (upErr) return json(req, 500, { ok: false, error: upErr.message });
    return json(req, 200, { ok: true });
  }

  if (action === "RESEND_INVITE") {
    if (target.status !== "INVITED" || !target.invited_email) {
      return json(req, 400, { ok: false, error: "ONLY_INVITED_CAN_RESEND" });
    }

    const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(target.invited_email);
    if (inviteErr) return json(req, 400, { ok: false, error: inviteErr.message });

    return json(req, 200, { ok: true });
  }

  return json(req, 500, { ok: false, error: "UNHANDLED" });
});
