// supabase/functions/debacu-eval-admin-access-requests/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";

/** ======================================================
 *  Env
 * ====================================================== */
function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = mustEnv("SUPABASE_ANON_KEY");

// Base URL pública de tu frontend (fallback)
const SITE_URL_FALLBACK = Deno.env.get("SITE_URL") ?? "https://www.debacu.com";

const APP_ID = "DEBACU_EVAL";

/** ======================================================
 *  Small utils
 * ====================================================== */
function safeLowerEmail(v: any) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}
function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}
function safeUpper(v: any) {
  return typeof v === "string" ? v.trim().toUpperCase() : "";
}
const toDate = (d: Date) => d.toISOString().slice(0, 10);

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

function supabaseAnonClientNoAuth() {
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** ======================================================
 *  Redirect helpers (dinámicos: local/prod/vercel)
 * ====================================================== */
function normalizeBaseUrl(u: string) {
  return u.replace(/\/+$/, "");
}

function resolveSiteUrl(body: any) {
  const siteUrl = safeStr(body?.siteUrl || body?.site_url || "");
  if (siteUrl.startsWith("http://") || siteUrl.startsWith("https://")) return normalizeBaseUrl(siteUrl);
  return normalizeBaseUrl(SITE_URL_FALLBACK);
}

function forceCanonicalBase(base: string) {
  try {
    const u = new URL(base);
    // fuerza https en prod si quieres (opcional)
    // u.protocol = "https:";

    // fuerza www si viene sin
    if (u.hostname === "debacu.com") u.hostname = "www.debacu.com";
    return u.toString().replace(/\/+$/, "");
  } catch {
    return "https://www.debacu.com";
  }
}

const CANONICAL_SITE = "https://www.debacu.com";

function resolveActivateRedirect(body: any, org_id: string) {
  const baseRaw = resolveSiteUrl(body);
  const base = forceCanonicalBase(baseRaw);

  // Siempre construimos un URL limpio (ignoramos activateUrlRaw)
  const u = new URL(`${base}/auth/activate`);
  u.searchParams.set("org_id", org_id);
  u.hash = "";
  return u.toString();
}



function resolveRecoveryRedirect(body: any) {
  const base = resolveSiteUrl(body);
  return `${base}/auth/reset`;
}

/** ======================================================
 *  Auth: find user by email (admin list users)
 * ====================================================== */
async function getAuthUserIdByEmail(sbAdmin: ReturnType<typeof supabaseServiceClient>, email: string) {
  const e = safeLowerEmail(email);
  if (!e) return null;

  const perPage = 1000;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sbAdmin.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    const found = data.users.find((u) => safeLowerEmail(u.email) === e);
    if (found?.id) return found.id;
    if (data.users.length < perPage) break;
  }
  return null;
}

/**
 * ✅ ONBOARDING: SIEMPRE INVITE (NO recovery).
 * - Si el user ya existe, Supabase suele reenviar invitación igualmente.
 * - Si no lo hace en tu proyecto, esto al menos mantiene el "type=invite" estable.
 */
async function sendInviteOnly(params: {
  sbAdmin: ReturnType<typeof supabaseServiceClient>;
  email: string;
  customer_id: string;
  org_id: string;
  inviteRedirectTo: string;
}) {
  const { sbAdmin, email, customer_id, org_id, inviteRedirectTo } = params;

  const { data, error } = await sbAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: inviteRedirectTo,
    data: { customer_id, org_id, app: APP_ID },
  });

  if (error) throw new Error(`invite_failed:${error.message}`);
  return { mode: "INVITED" as const, user_id: data?.user?.id ?? null };
}

/** ======================================================
 *  Customers + Profile
 * ====================================================== */
async function getOrCreateCustomerByEmail(
  sbAdmin: ReturnType<typeof supabaseServiceClient>,
  email: string,
  company_name: string | null,
) {
  const { data: existing, error: findErr } = await sbAdmin
    .from("customers")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (findErr) throw new Error("db_customers_find_failed");
  if (existing?.id) return existing.id as string;

  const customer_id = crypto.randomUUID();

  const { error: insErr } = await sbAdmin.from("customers").insert({
    id: customer_id,
    name: company_name,
    email,
    is_active: true,
    app_id: APP_ID,
  });

  if (insErr) throw new Error("db_customers_insert_failed");
  return customer_id;
}

async function upsertDebacuEvalCustomerProfile(
  sbAdmin: ReturnType<typeof supabaseServiceClient>,
  input: {
    customer_id: string;
    legal_name?: string | null;
    property_type?: string | null;
    rooms_count?: number | null;
    website?: string | null;
    contact_name?: string | null;
    contact_role?: string | null;
    notes?: string | null;
  },
) {
  const payload = {
    customer_id: input.customer_id,
    legal_name: input.legal_name ?? null,
    property_type: input.property_type ?? null,
    rooms_count: typeof input.rooms_count === "number" ? input.rooms_count : null,
    website: input.website ?? null,
    contact_name: input.contact_name ?? null,
    contact_role: input.contact_role ?? null,
    notes: input.notes ?? null,
  };

  const { error } = await sbAdmin.from("debacu_eval_customer_profile").upsert(payload, {
    onConflict: "customer_id",
  });

  if (error) throw new Error("db_profile_upsert_failed");
}

/** ======================================================
 *  Organization
 * ====================================================== */
async function ensureOrganization(
  sbAdmin: ReturnType<typeof supabaseServiceClient>,
  params: {
    customer_id: string;
    org_name: string;
    legal_name?: string | null;
    cif?: string | null;
    address?: string | null;
    city?: string | null;
    country?: string | null;
    property_type?: string | null;
    rooms_count?: number | null;
    website?: string | null;
  },
) {
  const { customer_id, org_name, legal_name, cif, address, city, country, property_type, rooms_count, website } =
    params;

  const { data: orgExisting, error: orgFindErr } = await sbAdmin
    .from("debacu_eval_organizations")
    .select("id")
    .eq("customer_id", customer_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (orgFindErr) throw new Error("db_org_find_failed");

  let org_id = orgExisting?.id as string | undefined;

  if (!org_id) {
    const { data: inserted, error: orgInsErr } = await sbAdmin
      .from("debacu_eval_organizations")
      .insert({
        name: org_name,
        legal_name: legal_name ?? null,
        cif: cif ?? null,
        address: address ?? null,
        city: city ?? null,
        country: (country ?? "ESP").toUpperCase(),
        property_type: property_type ?? null,
        rooms_count: typeof rooms_count === "number" ? rooms_count : null,
        website: website ?? null,
        customer_id,
      })
      .select("id")
      .single();

    if (orgInsErr) throw new Error("db_org_insert_failed");
    org_id = inserted.id as string;
  } else {
    const { error: orgUpdErr } = await sbAdmin
      .from("debacu_eval_organizations")
      .update({
        name: org_name,
        legal_name: legal_name ?? null,
        cif: cif ?? null,
        address: address ?? null,
        city: city ?? null,
        country: (country ?? "ESP").toUpperCase(),
        property_type: property_type ?? null,
        rooms_count: typeof rooms_count === "number" ? rooms_count : null,
        website: website ?? null,
      })
      .eq("id", org_id);

    if (orgUpdErr) throw new Error("db_org_update_failed");
  }

  return { org_id: org_id as string };
}

/** ======================================================
 *  Membership: asegura OWNER INVITED (NO ACTIVE aquí)
 *  - ACTIVE debe ponerse en orgInviteFinalize (cuando el usuario ya tiene sesión)
 * ====================================================== */
async function ensureOwnerInvitedMembership(
  sbAdmin: ReturnType<typeof supabaseServiceClient>,
  params: {
    org_id: string;
    invited_email: string;
    auth_user_id: string | null;
    created_by_user_id: string | null;
  },
) {
  const org_id = safeStr(params.org_id);
  const invited_email = safeLowerEmail(params.invited_email);
  const auth_user_id = safeStr(params.auth_user_id ?? "");
  if (!org_id || !invited_email) throw new Error("missing_member_inputs");

  // Intento 1: si ya hay por email en org, lo normalizo a OWNER+INVITED
  const { data: byEmail, error: byEmailErr } = await sbAdmin
    .from("debacu_eval_org_members")
    .select("id, role, status, invited_email, auth_user_id, user_id")
    .eq("org_id", org_id)
    .ilike("invited_email", invited_email)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (byEmailErr) throw new Error("db_member_find_by_email_failed");

  if (byEmail?.id) {
    const { error: updErr } = await sbAdmin
      .from("debacu_eval_org_members")
      .update({
        role: "OWNER",
        status: "INVITED",
        invited_email,
        // si sabemos el auth_user_id, lo guardamos; si no, no pisamos a null
        ...(auth_user_id ? { auth_user_id, user_id: auth_user_id } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", byEmail.id);

    if (updErr) throw new Error("db_member_update_failed");
    return { member_id: byEmail.id as string, mode: "UPDATED_BY_EMAIL" as const };
  }

  // Insert canonical INVITED
  const insPayload: any = {
    org_id,
    role: "OWNER",
    status: "INVITED",
    invited_email,
    created_by_user_id: params.created_by_user_id,
    updated_at: new Date().toISOString(),
  };
  if (auth_user_id) {
    insPayload.auth_user_id = auth_user_id;
    insPayload.user_id = auth_user_id;
  }

  const { data: inserted, error: insErr } = await sbAdmin
    .from("debacu_eval_org_members")
    .insert(insPayload)
    .select("id")
    .single();

  if (insErr) throw new Error("db_member_insert_failed");
  return { member_id: inserted.id as string, mode: "CREATED_INVITED" as const };
}

/** ======================================================
 *  Subscriptions FREE_TRIAL helper (30 días)
 * ====================================================== */
async function ensureFreeTrialSubscription(sbAdmin: ReturnType<typeof supabaseServiceClient>, customer_id: string) {
  const { data: existing, error: existErr } = await sbAdmin
    .from("subscriptions")
    .select("id, status")
    .eq("customer_id", customer_id)
    .eq("app_id", APP_ID)
    .in("status", ["ACTIVE", "TRIAL_ACTIVE"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (existErr) throw new Error("db_subscriptions_check_failed");
  if (existing && existing.length > 0) return { created: false, subscription: existing[0] };

  const { data: plan, error: planErr } = await sbAdmin
    .from("plans")
    .select("id, code")
    .eq("app_id", APP_ID)
    .eq("code", "FREE")
    .single();

  if (planErr || !plan) throw new Error("plan_free_not_found");

  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 30);

  const { data: inserted, error: insErr } = await sbAdmin
    .from("subscriptions")
    .insert({
      customer_id,
      app_id: APP_ID,
      plan_id: plan.id as string,
      billing_frequency: "FREE_TRIAL",
      start_date: toDate(today),
      end_date: toDate(end),
      next_billing_date: toDate(end),
      status: "TRIAL_ACTIVE",
      provider: "manual",
    })
    .select("*")
    .single();

  if (insErr) throw new Error("db_subscriptions_insert_failed");
  return { created: true, subscription: inserted };
}

/** ======================================================
 *  Errors
 * ====================================================== */
function errResp(req: Request, status: number, detail: string) {
  return json(req, status, { ok: false, error: "request_failed", detail });
}

/** ======================================================
 *  Handler
 * ====================================================== */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);

  try {
    const adminUser = await requireAdmin(req);
    const sbAdmin = supabaseServiceClient();
    const body = await readJson(req);

    let action = body?.action as string | undefined;
    if (!action && (body?.status || body?.limit)) action = "LIST";

    /** LIST */
    if (action === "LIST") {
      const status = (body?.status ?? "PENDING") as "PENDING" | "APPROVED" | "REJECTED" | "ALL";
      const limit = Number(body?.limit ?? 100);

      let q = sbAdmin
        .from("debacu_eval_access_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (status !== "ALL") q = q.eq("status", status);

      const { data, error } = await q;
      if (error) return errResp(req, 500, "db_list_failed");
      return json(req, 200, { ok: true, data });
    }

    /** APPROVE */
    if (action === "APPROVE") {
      const request_id = body?.requestId as string;
      const decision_notes = safeStr(body?.decisionNotes ?? "");
      const reviewed_by = body?.reviewed_by ?? body?.reviewedBy ?? adminUser.user.id ?? null;

      // ✅ respeta sendEmail (por defecto true)
      const sendEmail = body?.sendEmail !== false;

      if (!request_id) return errResp(req, 400, "missing_requestId");

      const { data: request, error: requestError } = await sbAdmin
        .from("debacu_eval_access_requests")
        .select("*")
        .eq("id", request_id)
        .single();

      if (requestError || !request) return errResp(req, 404, "request_not_found");
      if (!request.accepted_terms) return errResp(req, 400, "invalid_accepted_terms");

      const email = safeLowerEmail(request.email);
      if (!email) return errResp(req, 400, "missing_request_email");

      const company_name = (request.company_name ?? null) as string | null;
      const legal_name = (request.legal_name ?? null) as string | null;
      const cif = safeStr(request.cif);
      const address = (request.address ?? null) as string | null;
      const city = (request.city ?? null) as string | null;
      const country = safeUpper(request.country || "ESP") || "ESP";
      const property_type = (request.property_type ?? null) as string | null;
      const rooms_count = (request.rooms_count ?? null) as number | null;
      const website = (request.website ?? null) as string | null;
      const contact_name = (request.contact_name ?? null) as string | null;
      const contact_role = (request.contact_role ?? null) as string | null;
      const phone = (request.phone ?? null) as string | null;
      const notes = (request.notes ?? null) as string | null;

      const customer_id = await getOrCreateCustomerByEmail(sbAdmin, email, company_name);

      const { error: custUpdErr } = await sbAdmin
        .from("customers")
        .update({
          name: company_name,
          nif: cif || null,
          address,
          city,
          country,
          phone,
          email,
          is_active: true,
          app_id: APP_ID,
          service_username: email,
        })
        .eq("id", customer_id);

      if (custUpdErr) return errResp(req, 500, "db_customers_update_failed");

      await upsertDebacuEvalCustomerProfile(sbAdmin, {
        customer_id,
        legal_name,
        property_type,
        rooms_count,
        website,
        contact_name,
        contact_role,
        notes,
      });

      const orgRes = await ensureOrganization(sbAdmin, {
        customer_id,
        org_name: company_name || `Org ${email}`,
        legal_name,
        cif: cif || null,
        address,
        city,
        country,
        property_type,
        rooms_count,
        website,
      });

      const subRes = await ensureFreeTrialSubscription(sbAdmin, customer_id);

      // redirect dinámico con org_id
      const inviteRedirectTo = resolveActivateRedirect(body, orgRes.org_id);

console.log("ACTIVATE_REDIRECT_DEBUG", {
  org_id: orgRes.org_id,
  inviteRedirectTo,
});

      const recoveryRedirectTo = resolveRecoveryRedirect(body); // (no usado en onboarding, lo dejamos por compat)

      let email_sent = false;
      let email_detail: string | null = null;
      let last_email_status: string | null = null;
      const last_email_at: string | null = sendEmail ? new Date().toISOString() : null;

      let resolved_auth_user_id: string | null = null;

      if (sendEmail) {
        try {
          const r = await sendInviteOnly({
            sbAdmin,
            email,
            customer_id,
            org_id: orgRes.org_id,
            inviteRedirectTo,
          });
          email_sent = true;
          email_detail = `${r.mode}${r.user_id ? ` (${r.user_id})` : ""}`;
          last_email_status = "SENT";
          resolved_auth_user_id = r.user_id ?? (await getAuthUserIdByEmail(sbAdmin, email));
        } catch (e: any) {
          email_sent = false;
          email_detail = e?.message ? String(e.message) : "email_send_failed";
          last_email_status = "FAILED";
          resolved_auth_user_id = await getAuthUserIdByEmail(sbAdmin, email);
        }
      } else {
        resolved_auth_user_id = await getAuthUserIdByEmail(sbAdmin, email);
      }

      // ✅ membership debe quedar INVITED, no ACTIVE
      await ensureOwnerInvitedMembership(sbAdmin, {
        org_id: orgRes.org_id,
        invited_email: email,
        auth_user_id: resolved_auth_user_id,
        created_by_user_id: reviewed_by,
      });

      // ✅ update request (no pisa last_email_* si sendEmail=false)
      const updatePayload: any = {
        status: "APPROVED",
        decision_notes: decision_notes || null,
        reviewed_by,
        reviewed_at: new Date().toISOString(),
        customer_id,
        org_id: orgRes.org_id,
      };

      if (sendEmail) {
        updatePayload.last_email_status = last_email_status;
        updatePayload.last_email_at = last_email_at;
        updatePayload.last_email_detail = email_detail;
      }

      const { error: updateError } = await sbAdmin
        .from("debacu_eval_access_requests")
        .update(updatePayload)
        .eq("id", request_id);

      if (updateError) return errResp(req, 500, "db_request_update_failed");

      return json(req, 200, {
        ok: true,
        customer_id,
        org_id: orgRes.org_id,
        subscription: {
          created: subRes.created,
          id: subRes.subscription?.id ?? null,
          status: subRes.subscription?.status ?? null,
        },
        send_email: sendEmail,
        email_sent,
        email_detail,
        invite_redirect_to: inviteRedirectTo,
        recovery_redirect_to: recoveryRedirectTo,
      });
    }

    /** REJECT */
    if (action === "REJECT") {
      const request_id = body?.requestId as string;
      const decision_notes = safeStr(body?.decisionNotes ?? "");
      const reviewed_by = body?.reviewed_by ?? body?.reviewedBy ?? adminUser.user.id ?? null;

      if (!request_id) return errResp(req, 400, "missing_requestId");

      const { error } = await sbAdmin
        .from("debacu_eval_access_requests")
        .update({
          status: "REJECTED",
          decision_notes: decision_notes || null,
          reviewed_by,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", request_id);

      if (error) return errResp(req, 500, "db_reject_failed");
      return json(req, 200, { ok: true });
    }

    /** RESEND */
    if (action === "RESEND") {
      const request_id = body?.requestId as string;
      const reviewed_by = body?.reviewed_by ?? body?.reviewedBy ?? adminUser.user.id ?? null;

      // ✅ respeta sendEmail (por defecto true)
      const sendEmail = body?.sendEmail !== false;

      if (!request_id) return errResp(req, 400, "missing_requestId");

      const { data: request, error: requestError } = await sbAdmin
        .from("debacu_eval_access_requests")
        .select("*")
        .eq("id", request_id)
        .single();

      if (requestError || !request) return errResp(req, 404, "request_not_found");

      const email = safeLowerEmail(request.email);
      if (!email) return errResp(req, 400, "missing_request_email");

      const customer_id = request.customer_id ?? null;
      if (!customer_id) return errResp(req, 400, "missing_customer_id");

      // asegurar org_id en request
      let org_id = request.org_id ?? null;
      if (!org_id) {
        const { data: org, error: orgErr } = await sbAdmin
          .from("debacu_eval_organizations")
          .select("id")
          .eq("customer_id", customer_id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (orgErr || !org?.id) return errResp(req, 500, "org_not_found_for_customer");

        org_id = org.id;
        await sbAdmin.from("debacu_eval_access_requests").update({ org_id }).eq("id", request_id);
      }

      const inviteRedirectTo = resolveActivateRedirect(body, org_id);

      console.log("ACTIVATE_REDIRECT_DEBUG", {
  org_id,
  inviteRedirectTo,
});
      const recoveryRedirectTo = resolveRecoveryRedirect(body); // (no usado en onboarding, lo dejamos por compat)

      let email_sent = false;
      let email_detail: string | null = null;
      let last_email_status: string | null = null;
      let resolved_auth_user_id: string | null = null;

      if (sendEmail) {
        try {
          const r = await sendInviteOnly({
            sbAdmin,
            email,
            customer_id,
            org_id,
            inviteRedirectTo,
          });
          email_sent = true;
          email_detail = `${r.mode}${r.user_id ? ` (${r.user_id})` : ""}`;
          last_email_status = "SENT";
          resolved_auth_user_id = r.user_id ?? (await getAuthUserIdByEmail(sbAdmin, email));
        } catch (e: any) {
          email_sent = false;
          email_detail = e?.message ? String(e.message) : "email_send_failed";
          last_email_status = "FAILED";
          resolved_auth_user_id = await getAuthUserIdByEmail(sbAdmin, email);
        }
      } else {
        resolved_auth_user_id = await getAuthUserIdByEmail(sbAdmin, email);
      }

      // ✅ membership INVITED (no ACTIVE)
      await ensureOwnerInvitedMembership(sbAdmin, {
        org_id,
        invited_email: email,
        auth_user_id: resolved_auth_user_id,
        created_by_user_id: reviewed_by,
      });

      const upd: any = {
        reviewed_by,
        reviewed_at: new Date().toISOString(),
      };

      if (sendEmail) {
        upd.last_email_status = last_email_status;
        upd.last_email_at = new Date().toISOString();
        upd.last_email_detail = email_detail;
      }

      await sbAdmin.from("debacu_eval_access_requests").update(upd).eq("id", request_id);

      return json(req, 200, {
        ok: true,
        customer_id,
        org_id,
        send_email: sendEmail,
        email_sent,
        email_detail,
        invite_redirect_to: inviteRedirectTo,
        recovery_redirect_to: recoveryRedirectTo,
      });
    }

    return errResp(req, 400, "invalid_action");
  } catch (e: any) {
    const msg = e?.message ?? String(e);

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") return errResp(req, 401, "UNAUTHORIZED");
    if (msg === "FORBIDDEN") return errResp(req, 403, "FORBIDDEN");
    if (String(msg).startsWith("missing_") || String(msg).startsWith("invalid_")) return errResp(req, 400, msg);

    return errResp(req, 500, "internal_error");
  }
});