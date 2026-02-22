// supabase/functions/debacu_eval_invite_finalize/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

const APP_ID = "DEBACU_EVAL";

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}
function safeLowerEmail(v: any) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

async function readJson(req: Request) {
  try {
    const t = await req.text();
    if (!t) return {};
    return JSON.parse(t);
  } catch {
    return {};
  }
}

function supabaseServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function errResp(req: Request, status: number, detail: string, extra?: any) {
  return json(req, status, { ok: false, error: "request_failed", detail, ...extra });
}

/** ======================================================
 *  Membership claim/activate (canonical)
 * ====================================================== */
async function ensureOwnerActiveMembership(params: {
  sb: ReturnType<typeof supabaseServiceClient>;
  org_id: string;
  user_id: string; // auth user id
  invited_email: string; // from auth.user.email
}) {
  const { sb } = params;
  const org_id = safeStr(params.org_id);
  const user_id = safeStr(params.user_id);
  const invited_email = safeLowerEmail(params.invited_email);

  if (!org_id || !user_id) throw new Error("missing_org_or_user");

  // 1) by auth_user_id (canonical)
  const { data: byAuth, error: byAuthErr } = await sb
    .from("debacu_eval_org_members")
    .select("id, role, status, invited_email, auth_user_id, user_id")
    .eq("org_id", org_id)
    .eq("auth_user_id", user_id)
    .maybeSingle();

  if (byAuthErr) throw new Error("db_member_find_by_auth_failed");

  if (byAuth?.id) {
    const needsUpdate =
      String(byAuth.role || "").toUpperCase() !== "OWNER" ||
      String(byAuth.status || "").toUpperCase() !== "ACTIVE" ||
      (invited_email && safeLowerEmail(byAuth.invited_email) !== invited_email) ||
      safeStr(byAuth.user_id) !== user_id;

    if (needsUpdate) {
      const { error: updErr } = await sb
        .from("debacu_eval_org_members")
        .update({
          role: "OWNER",
          status: "ACTIVE",
          invited_email: invited_email || null,
          auth_user_id: user_id,
          user_id,
          updated_at: new Date().toISOString(),
        })
        .eq("id", byAuth.id);

      if (updErr) throw new Error("db_member_update_failed");
    }

    return { member_id: byAuth.id as string, mode: "UPDATED_BY_AUTH" as const };
  }

  // 2) legacy row where user_id matches but auth_user_id null
  const { data: legacy, error: legacyErr } = await sb
    .from("debacu_eval_org_members")
    .select("id, role, status, invited_email, auth_user_id, user_id")
    .eq("org_id", org_id)
    .eq("user_id", user_id)
    .is("auth_user_id", null)
    .maybeSingle();

  if (legacyErr) throw new Error("db_member_find_legacy_failed");

  if (legacy?.id) {
    const { error: updErr } = await sb
      .from("debacu_eval_org_members")
      .update({
        auth_user_id: user_id,
        user_id,
        role: "OWNER",
        status: "ACTIVE",
        invited_email: invited_email || legacy.invited_email || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", legacy.id);

    if (updErr) throw new Error("db_member_legacy_canonize_failed");
    return { member_id: legacy.id as string, mode: "CANONIZED_LEGACY" as const };
  }

  // 3) claim by invited_email inside org (INVITED/PENDING/ACTIVE)
  if (invited_email) {
    const { data: byEmail, error: byEmailErr } = await sb
      .from("debacu_eval_org_members")
      .select("id, status, role, auth_user_id, user_id, invited_email")
      .eq("org_id", org_id)
      .ilike("invited_email", invited_email)
      .in("status", ["INVITED", "PENDING", "ACTIVE"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (byEmailErr) throw new Error("db_member_find_by_email_failed");

    if (byEmail?.id) {
      const { error: updErr } = await sb
        .from("debacu_eval_org_members")
        .update({
          auth_user_id: user_id,
          user_id,
          role: "OWNER",
          status: "ACTIVE",
          updated_at: new Date().toISOString(),
        })
        .eq("id", byEmail.id);

      if (updErr) throw new Error("db_member_claim_failed");
      return { member_id: byEmail.id as string, mode: "CLAIMED_BY_EMAIL" as const };
    }
  }

  // 4) create canonical row
  const { data: inserted, error: insErr } = await sb
    .from("debacu_eval_org_members")
    .insert({
      org_id,
      role: "OWNER",
      status: "ACTIVE",
      invited_email: invited_email || null,
      auth_user_id: user_id,
      user_id,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insErr) throw new Error("db_member_insert_failed");
  return { member_id: inserted.id as string, mode: "CREATED_CANONICAL" as const };
}

/** ======================================================
 *  Main
 * ====================================================== */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);

  try {
    // ✅ must be called with Authorization: Bearer <access_token>
    const authed = await requireUser(req);
    const sb = supabaseServiceClient();

    const body = await readJson(req);

    // org_id can come from:
    // - frontend body (recommended)
    // - query string param to your /auth/activate page, then passed to this function
    const org_id = safeStr(body?.org_id ?? body?.orgId ?? body?.org ?? "");
    if (!org_id) return errResp(req, 400, "missing_org_id");

    const auth_user_id = safeStr(authed.user?.id ?? "");
    if (!auth_user_id) return errResp(req, 401, "missing_auth_user");

    const email = safeLowerEmail(authed.user?.email ?? "");
    if (!email) return errResp(req, 400, "missing_user_email");

    // Optional: app id guard if you store it in metadata
    // (not required, but useful)
    // const appMeta = safeStr((authed.user as any)?.user_metadata?.app ?? "");
    // if (appMeta && appMeta !== APP_ID) return errResp(req, 403, "wrong_app");

    // 1) Check org exists
    const { data: org, error: orgErr } = await sb
      .from("debacu_eval_organizations")
      .select("id, customer_id")
      .eq("id", org_id)
      .maybeSingle();

    if (orgErr) return errResp(req, 500, "db_org_find_failed");
    if (!org?.id) return errResp(req, 404, "org_not_found");

    // 2) Ensure member is ACTIVE OWNER (claim by auth_user_id or invited_email)
    const mem = await ensureOwnerActiveMembership({
      sb,
      org_id,
      user_id: auth_user_id,
      invited_email: email,
    });

    // 3) (Optional but recommended) ensure customer/auth_user_id link
    // If your customers table has auth_user_id column (you have it), update it.
    // If you don't want to touch customers here, you can remove this block.
    const { error: custUpdErr } = await sb
      .from("customers")
      .update({ auth_user_id: auth_user_id })
      .eq("id", org.customer_id)
      .eq("app_id", APP_ID);

    // ignore if column/constraint mismatch (but better to keep strict)
    if (custUpdErr) {
      // don’t hard fail onboarding for this; return warning
      return json(req, 200, {
        ok: true,
        org_id,
        member_id: mem.member_id,
        member_mode: mem.mode,
        warning: "customer_auth_link_not_updated",
      });
    }

    // 4) Done
    return json(req, 200, {
      ok: true,
      org_id,
      member_id: mem.member_id,
      member_mode: mem.mode,
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED")
      return errResp(req, 401, "UNAUTHORIZED");

    // Tu frontend está viendo NO_ORG_MEMBER... => lo devolvemos como 400/403 claro
    if (msg === "FORBIDDEN") return errResp(req, 403, "FORBIDDEN");

    if (String(msg).startsWith("missing_") || String(msg).startsWith("invalid_"))
      return errResp(req, 400, msg);

    return errResp(req, 500, "internal_error");
  }
});