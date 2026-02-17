import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function userClient(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: auth } },
  });
}

function safeLowerEmail(v: any) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  try {
    // 1) user actual (JWT)
    const sbUser = userClient(req);
    const { data: u, error: uErr } = await sbUser.auth.getUser();
    if (uErr || !u?.user) return json(origin, 401, { error: "UNAUTHENTICATED" });

    const email = safeLowerEmail(u.user.email);
    if (!email) return json(origin, 400, { error: "USER_NO_EMAIL" });

    // 2) buscar solicitud aprobada (service role)
    const { data: reqRow, error: reqErr } = await admin
      .from("debacu_eval_access_requests")
      .select("id, status, customer_id, org_id, reviewed_at")
      .eq("email", email)
      .eq("status", "APPROVED")
      .order("reviewed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (reqErr) return json(origin, 500, { error: "REQ_QUERY_FAILED", detail: reqErr.message });
    if (!reqRow?.customer_id) return json(origin, 404, { error: "APPROVED_REQUEST_NOT_FOUND" });

    const customerId = reqRow.customer_id as string;
    let orgId = (reqRow.org_id as string | null) ?? null;

    // 3) fallback org_id si falta
    if (!orgId) {
      const { data: orgRow, error: orgErr } = await admin
        .from("debacu_eval_organizations")
        .select("id")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (orgErr) return json(origin, 500, { error: "ORG_QUERY_FAILED", detail: orgErr.message });
      if (!orgRow?.id) return json(origin, 404, { error: "ORG_NOT_FOUND_FOR_CUSTOMER" });
      orgId = orgRow.id as string;

      // opcional: backfill org_id en access_requests para futuro
      await admin.from("debacu_eval_access_requests").update({ org_id: orgId }).eq("id", reqRow.id);
    }

    // 4) membership (service role)
    const userId = u.user.id;

    const { data: mExisting, error: mErr } = await admin
      .from("debacu_eval_org_members")
      .select("id, role")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();

    if (mErr) return json(origin, 500, { error: "MEMBER_QUERY_FAILED", detail: mErr.message });

    if (!mExisting?.id) {
      // intenta sin status; si falla por NOT NULL, reintenta con status
      const ins1 = await admin.from("debacu_eval_org_members").insert({ org_id: orgId, user_id: userId, role: "OWNER" });
      if (ins1.error) {
        const msg = (ins1.error.message || "").toLowerCase();
        if (msg.includes("status") && (msg.includes("not null") || msg.includes("null value"))) {
          const ins2 = await admin
            .from("debacu_eval_org_members")
            .insert({ org_id: orgId, user_id: userId, role: "OWNER", status: "ACTIVE" } as any);
          if (ins2.error) return json(origin, 500, { error: "MEMBER_INSERT_FAILED", detail: ins2.error.message });
        } else {
          return json(origin, 500, { error: "MEMBER_INSERT_FAILED", detail: ins1.error.message });
        }
      }
    } else if (String(mExisting.role || "").toUpperCase() !== "OWNER") {
      const upd = await admin.from("debacu_eval_org_members").update({ role: "OWNER" }).eq("id", mExisting.id);
      if (upd.error) return json(origin, 500, { error: "MEMBER_UPDATE_FAILED", detail: upd.error.message });
    }

    return json(origin, 200, { ok: true, org_id: orgId, customer_id: customerId });
  } catch (e: any) {
    return json(origin, 500, { error: "FAILED", detail: e?.message ?? String(e) });
  }
});
