import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** ======================================================
 *  ENV
 *  ====================================================== */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Base URL pública de tu frontend (prod)
const SITE_URL = Deno.env.get("SITE_URL") ?? "https://debacu.com";
const INVITE_REDIRECT_TO = `${SITE_URL}/auth/activate`;
const RECOVERY_REDIRECT_TO = `${SITE_URL}/auth/reset`;

/** ======================================================
 *  CORS
 *  ====================================================== */
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
    Vary: "Origin",
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

async function readBody(req: Request) {
  const t = await req.text();
  if (!t) return {};
  try {
    return JSON.parse(t);
  } catch {
    return {};
  }
}

/** ======================================================
 *  Clients
 *  ====================================================== */
function assertSupabaseReady(origin: string | null) {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ANON_KEY) {
    return json(origin, 500, {
      error: "Server misconfigured",
      detail: "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY",
    });
  }
  return null;
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

function userClient(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { Authorization: auth } },
  });
}

function anonClientNoAuth() {
  return createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
}

/** ======================================================
 *  Helpers
 *  ====================================================== */
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

/** ======================================================
 *  AUTHZ: require ADMIN (JWT real)
 *  ====================================================== */
async function requireAdmin(req: Request) {
  const sbUser = userClient(req);
  const { data, error } = await sbUser.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");

  const userId = data.user.id;

  const { data: adminRow, error: adminErr } = await admin
    .from("debacu_eval_admin_users")
    .select("user_id")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();

  if (adminErr) throw new Error("ADMIN_CHECK_FAILED");
  if (!adminRow) throw new Error("FORBIDDEN");

  return { user: data.user };
}

/** ======================================================
 *  Auth: find user by email (admin list users)
 *  ====================================================== */
async function getAuthUserIdByEmail(email: string): Promise<string | null> {
  const e = safeLowerEmail(email);
  if (!e) return null;

  const perPage = 1000;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    const found = data.users.find((u) => safeLowerEmail(u.email) === e);
    if (found?.id) return found.id;
    if (data.users.length < perPage) break;
  }
  return null;
}

/**
 * Envía email automático:
 * - si user NO existe: INVITE (Supabase manda email por SMTP)
 * - si user existe: RECOVERY (Supabase manda email por SMTP)
 *
 * Devuelve SIEMPRE (mode + user_id si lo pudo resolver).
 */
async function sendInviteOrRecovery(params: { email: string; customer_id: string; org_id: string }) {
  const { email, customer_id, org_id } = params;

  const existingUserId = await getAuthUserIdByEmail(email);

  if (!existingUserId) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: INVITE_REDIRECT_TO,
      data: { customer_id, org_id, app: "DEBACU_EVAL" },
    });
    if (error) throw new Error(`INVITE_FAILED: ${error.message}`);

    const newId = data?.user?.id ?? null;
    if (!newId) {
      // raro, pero mejor devolver null y que luego se resuelva por email
      return { mode: "INVITED" as const, user_id: null };
    }
    return { mode: "INVITED" as const, user_id: newId };
  }

  const sbAnon = anonClientNoAuth();
  const { error } = await sbAnon.auth.resetPasswordForEmail(email, {
    redirectTo: RECOVERY_REDIRECT_TO,
  });
  if (error) throw new Error(`RECOVERY_FAILED: ${error.message}`);

  return { mode: "RECOVERY_SENT" as const, user_id: existingUserId };
}

/** ======================================================
 *  Customers + Profile
 *  ====================================================== */
async function getOrCreateCustomerByEmail(email: string, company_name: string | null) {
  const { data: existing, error: findErr } = await admin
    .from("customers")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (findErr) throw new Error(`DB error (customers find): ${findErr.message}`);
  if (existing?.id) return existing.id as string;

  const customer_id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: insErr } = await admin.from("customers").insert({
    id: customer_id,
    name: company_name,
    email,
    is_active: true,
    app_id: "DEBACU_EVAL",
    created_at: now,
    updated_at: now,
  });

  if (insErr) throw new Error(`DB error (customers insert): ${insErr.message}`);
  return customer_id;
}

async function upsertDebacuEvalCustomerProfile(input: {
  customer_id: string;
  legal_name?: string | null;
  property_type?: string | null;
  rooms_count?: number | null;
  website?: string | null;
  contact_name?: string | null;
  contact_role?: string | null;
  notes?: string | null;
}) {
  const now = new Date().toISOString();
  const payload = {
    customer_id: input.customer_id,
    legal_name: input.legal_name ?? null,
    property_type: input.property_type ?? null,
    rooms_count: typeof input.rooms_count === "number" ? input.rooms_count : null,
    website: input.website ?? null,
    contact_name: input.contact_name ?? null,
    contact_role: input.contact_role ?? null,
    notes: input.notes ?? null,
    updated_at: now,
  };

  const { error } = await admin
    .from("debacu_eval_customer_profile")
    .upsert(payload, { onConflict: "customer_id" });

  if (error) throw new Error(`DB error (profile upsert): ${error.message}`);
}

/** ======================================================
 *  Organization
 *  ====================================================== */
async function ensureOrganization(params: {
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
}) {
  const {
    customer_id,
    org_name,
    legal_name,
    cif,
    address,
    city,
    country,
    property_type,
    rooms_count,
    website,
  } = params;

  const { data: orgExisting, error: orgFindErr } = await admin
    .from("debacu_eval_organizations")
    .select("id")
    .eq("customer_id", customer_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (orgFindErr) throw new Error(`DB error (org find): ${orgFindErr.message}`);

  let org_id = orgExisting?.id as string | undefined;
  const now = new Date().toISOString();

  if (!org_id) {
    const { data: inserted, error: orgInsErr } = await admin
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
        created_at: now,
      })
      .select("id")
      .single();

    if (orgInsErr) throw new Error(`DB error (org insert): ${orgInsErr.message}`);
    org_id = inserted.id as string;
  } else {
    const { error: orgUpdErr } = await admin
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
        updated_at: now,
      })
      .eq("id", org_id);

    if (orgUpdErr) throw new Error(`DB error (org update): ${orgUpdErr.message}`);
  }

  return { org_id: org_id as string };
}

/** ======================================================
 *  Membership (PATCH): asegura OWNER ACTIVE con auth_user_id
 *  - si ya existe por org+auth_user_id: ajusta role/status
 *  - si existe INVITED por invited_email: lo "reclama" y lo activa
 *  - si no existe: crea ACTIVE directamente
 *
 *  Esto elimina el NO_ORG_MEMBERSHIP en postlogin.
 *  ====================================================== */
async function ensureOwnerActiveMembership(params: {
  org_id: string;
  auth_user_id: string;
  invited_email: string;
  created_by_user_id: string | null;
}) {
  const org_id = params.org_id;
  const auth_user_id = params.auth_user_id;
  const invited_email = safeLowerEmail(params.invited_email);
  const now = new Date().toISOString();

  if (!org_id || !auth_user_id) throw new Error("Missing org_id/auth_user_id in ensureOwnerActiveMembership");

  // 1) ya existe por (org_id, auth_user_id)
  const { data: byUser, error: byUserErr } = await admin
    .from("debacu_eval_org_members")
    .select("id, role, status, invited_email, auth_user_id")
    .eq("org_id", org_id)
    .eq("auth_user_id", auth_user_id)
    .maybeSingle();

  if (byUserErr) throw new Error(`DB error (member find by auth_user_id): ${byUserErr.message}`);

  if (byUser?.id) {
    const needsUpdate =
      String(byUser.role || "").toUpperCase() !== "OWNER" ||
      String(byUser.status || "").toUpperCase() !== "ACTIVE" ||
      (invited_email && safeLowerEmail(byUser.invited_email) !== invited_email);

    if (needsUpdate) {
      const { error: updErr } = await admin
        .from("debacu_eval_org_members")
        .update({
          role: "OWNER",
          status: "ACTIVE",
          invited_email: invited_email || null,
          updated_at: now,
        })
        .eq("id", byUser.id);

      if (updErr) throw new Error(`DB error (member update by auth_user_id): ${updErr.message}`);
    }

    return { member_id: byUser.id as string, mode: "UPDATED_BY_USER" as const };
  }

  // 2) existe INVITED por email (huérfana) -> reclamar y activar
  if (invited_email) {
    const { data: byEmail, error: byEmailErr } = await admin
      .from("debacu_eval_org_members")
      .select("id, status, role, auth_user_id, invited_email")
      .eq("org_id", org_id)
      .eq("invited_email", invited_email)
      .in("status", ["INVITED", "PENDING", "ACTIVE"])
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (byEmailErr) throw new Error(`DB error (member find by invited_email): ${byEmailErr.message}`);

    if (byEmail?.id) {
      const { error: updErr } = await admin
        .from("debacu_eval_org_members")
        .update({
          auth_user_id,
          role: "OWNER",
          status: "ACTIVE",
          updated_at: now,
        })
        .eq("id", byEmail.id);

      if (updErr) throw new Error(`DB error (member claim by email): ${updErr.message}`);

      return { member_id: byEmail.id as string, mode: "CLAIMED_BY_EMAIL" as const };
    }
  }

  // 3) crear nueva
  const { data: inserted, error: insErr } = await admin
    .from("debacu_eval_org_members")
    .insert({
      org_id,
      role: "OWNER",
      status: "ACTIVE",
      invited_email: invited_email || null,
      auth_user_id,
      created_by_user_id: params.created_by_user_id,
      updated_at: now,
    })
    .select("id")
    .single();

  if (insErr) throw new Error(`DB error (member insert): ${insErr.message}`);
  return { member_id: inserted.id as string, mode: "CREATED" as const };
}

/** ======================================================
 *  Subscriptions FREE_TRIAL helper (30 días)
 *  ====================================================== */
async function ensureFreeTrialSubscription(customer_id: string) {
  const app_id = "DEBACU_EVAL";

  const { data: existing, error: existErr } = await admin
    .from("subscriptions")
    .select("id, status")
    .eq("customer_id", customer_id)
    .eq("app_id", app_id)
    .in("status", ["ACTIVE", "TRIAL_ACTIVE"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (existErr) throw new Error(`DB error (subscriptions check): ${existErr.message}`);
  if (existing && existing.length > 0) return { created: false, subscription: existing[0] };

  const { data: plan, error: planErr } = await admin
    .from("plans")
    .select("id, code")
    .eq("app_id", app_id)
    .eq("code", "FREE")
    .single();

  if (planErr || !plan) throw new Error(`Plan FREE not found: ${planErr?.message ?? "no-plan"}`);

  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 30);
  const now = new Date().toISOString();

  const { data: inserted, error: insErr } = await admin
    .from("subscriptions")
    .insert({
      customer_id,
      app_id,
      plan_id: plan.id as string,
      billing_frequency: "FREE_TRIAL",
      start_date: toDate(today),
      end_date: toDate(end),
      next_billing_date: toDate(end),
      status: "TRIAL_ACTIVE",
      provider: "manual",
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (insErr) throw new Error(`DB error (subscriptions insert): ${insErr.message}`);
  return { created: true, subscription: inserted };
}

/** ======================================================
 *  HANDLER
 *  ====================================================== */
serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  const miscfg = assertSupabaseReady(origin);
  if (miscfg) return miscfg;

  try {
    await requireAdmin(req);

    const body = await readBody(req);
    let action = body?.action as string | undefined;
    if (!action && (body?.status || body?.limit)) action = "LIST";

    /** LIST */
    if (action === "LIST") {
      const status = (body?.status ?? "PENDING") as "PENDING" | "APPROVED" | "REJECTED" | "ALL";
      const limit = Number(body?.limit ?? 100);

      let q = admin
        .from("debacu_eval_access_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (status !== "ALL") q = q.eq("status", status);

      const { data, error } = await q;
      if (error) return json(origin, 500, { error: "DB error (list)", detail: error.message });
      return json(origin, 200, { data });
    }

    /** APPROVE */
    if (action === "APPROVE") {
      const request_id = body?.requestId as string;
      const decision_notes = safeStr(body?.decisionNotes ?? "");
      const reviewed_by = body?.reviewed_by ?? body?.reviewedBy ?? null;

      if (!request_id) return json(origin, 400, { error: "Missing requestId" });

      const { data: request, error: requestError } = await admin
        .from("debacu_eval_access_requests")
        .select("*")
        .eq("id", request_id)
        .single();

      if (requestError || !request) {
        return json(origin, 404, { error: "Request not found", detail: requestError?.message });
      }

      if (!request.accepted_terms) {
        return json(origin, 400, { error: "No se puede aprobar: accepted_terms=false" });
      }

      const email = safeLowerEmail(request.email);
      if (!email) return json(origin, 400, { error: "Request has no email" });

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

      const customer_id = await getOrCreateCustomerByEmail(email, company_name);
      const now = new Date().toISOString();

      // customers: SIN password temporal
      const { error: custUpdErr } = await admin
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
          app_id: "DEBACU_EVAL",
          service_username: email, // opcional, alias
          updated_at: now,
        })
        .eq("id", customer_id);

      if (custUpdErr) {
        return json(origin, 500, { error: "DB error (customers update)", detail: custUpdErr.message });
      }

      await upsertDebacuEvalCustomerProfile({
        customer_id,
        legal_name,
        property_type,
        rooms_count,
        website,
        contact_name,
        contact_role,
        notes,
      });

      // org
      const orgRes = await ensureOrganization({
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

      // trial
      const subRes = await ensureFreeTrialSubscription(customer_id);

      // email Supabase SMTP: invite o recovery
      let email_sent = false;
      let email_detail: string | null = null;
      let last_email_status: string | null = null;
      let last_email_at: string | null = null;

      // ⚠️ IMPORTANTE: aunque el email falle, intentamos igualmente asegurar membership si podemos resolver user_id.
      // (Si invite/recovery no devuelve user_id, luego lo resolveremos por email)
      let resolved_auth_user_id: string | null = null;

      try {
        const r = await sendInviteOrRecovery({ email, customer_id, org_id: orgRes.org_id });
        email_sent = true;
        email_detail = `${r.mode}${r.user_id ? ` (${r.user_id})` : ""}`;
        last_email_status = "SENT";
        last_email_at = now;

        resolved_auth_user_id = r.user_id;
      } catch (e: any) {
        email_sent = false;
        email_detail = e?.message ?? String(e);
        last_email_status = "FAILED";
        last_email_at = now;

        // aun así, intentamos resolver user_id por email para no romper postlogin
        resolved_auth_user_id = await getAuthUserIdByEmail(email);
      }

      if (resolved_auth_user_id) {
        await ensureOwnerActiveMembership({
          org_id: orgRes.org_id,
          auth_user_id: resolved_auth_user_id,
          invited_email: email,
          created_by_user_id: reviewed_by,
        });
      }

      const { error: updateError } = await admin
        .from("debacu_eval_access_requests")
        .update({
          status: "APPROVED",
          decision_notes: decision_notes || null,
          reviewed_by,
          reviewed_at: now,
          customer_id,
          last_email_status,
          last_email_at,
          last_email_detail: email_detail,
        })
        .eq("id", request_id);

      if (updateError) {
        return json(origin, 500, { error: "DB error (update request)", detail: updateError.message });
      }

      return json(origin, 200, {
        ok: true,
        customer_id,
        org_id: orgRes.org_id,
        subscription: {
          created: subRes.created,
          id: subRes.subscription?.id ?? null,
          status: subRes.subscription?.status ?? null,
        },
        email_sent,
        email_detail,
      });
    }

    /** REJECT */
    if (action === "REJECT") {
      const request_id = body?.requestId as string;
      const decision_notes = safeStr(body?.decisionNotes ?? "");
      const reviewed_by = body?.reviewed_by ?? body?.reviewedBy ?? null;

      if (!request_id) return json(origin, 400, { error: "Missing requestId" });

      const now = new Date().toISOString();
      const { error } = await admin
        .from("debacu_eval_access_requests")
        .update({
          status: "REJECTED",
          decision_notes: decision_notes || null,
          reviewed_by,
          reviewed_at: now,
        })
        .eq("id", request_id);

      if (error) return json(origin, 500, { error: "DB error (reject)", detail: error.message });
      return json(origin, 200, { ok: true });
    }

    /** RESEND: reenvía link invite/recovery */
    if (action === "RESEND") {
      const request_id = body?.requestId as string;
      const reviewed_by = body?.reviewed_by ?? body?.reviewedBy ?? null;

      if (!request_id) return json(origin, 400, { error: "Missing requestId" });

      const { data: request, error: requestError } = await admin
        .from("debacu_eval_access_requests")
        .select("*")
        .eq("id", request_id)
        .single();

      if (requestError || !request) {
        return json(origin, 404, { error: "Request not found", detail: requestError?.message });
      }

      const email = safeLowerEmail(request.email);
      if (!email) return json(origin, 400, { error: "Request has no email" });

      const customer_id = request.customer_id ?? null;
      if (!customer_id) return json(origin, 400, { error: "Request has no customer_id (not approved?)" });

      // org_id por customer_id
      const { data: org, error: orgErr } = await admin
        .from("debacu_eval_organizations")
        .select("id")
        .eq("customer_id", customer_id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (orgErr || !org?.id) {
        return json(origin, 500, { error: "Org not found for customer", detail: orgErr?.message });
      }

      const now = new Date().toISOString();
      let email_sent = false;
      let email_detail: string | null = null;
      let last_email_status: string | null = null;

      let resolved_auth_user_id: string | null = null;

      try {
        const r = await sendInviteOrRecovery({ email, customer_id, org_id: org.id });
        email_sent = true;
        email_detail = `${r.mode}${r.user_id ? ` (${r.user_id})` : ""}`;
        last_email_status = "SENT";
        resolved_auth_user_id = r.user_id;
      } catch (e: any) {
        email_sent = false;
        email_detail = e?.message ?? String(e);
        last_email_status = "FAILED";
        resolved_auth_user_id = await getAuthUserIdByEmail(email);
      }

      if (resolved_auth_user_id) {
        await ensureOwnerActiveMembership({
          org_id: org.id,
          auth_user_id: resolved_auth_user_id,
          invited_email: email,
          created_by_user_id: reviewed_by,
        });
      }

      await admin
        .from("debacu_eval_access_requests")
        .update({
          last_email_status,
          last_email_at: now,
          last_email_detail: email_detail,
          reviewed_by,
          reviewed_at: now,
        })
        .eq("id", request_id);

      return json(origin, 200, { ok: true, customer_id, org_id: org.id, email_sent, email_detail });
    }

    return json(origin, 400, { error: "Invalid action" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = msg === "UNAUTHENTICATED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return json(origin, code, { error: "Request failed", detail: msg });
  }
});
