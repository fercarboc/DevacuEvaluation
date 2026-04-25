// supabase/functions/debacu-eval-admin-access-requests/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json, preflight } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";

/* ======================================================
 * Env
 * ====================================================== */
function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`MISSING_ENV:${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

/**
 * URL base de tu front (producción).
 * Ej: https://www.debacu.com
 * Si no está, intentamos inferir del Origin.
 */
const APP_PUBLIC_URL = Deno.env.get("DEBACU_APP_URL") || Deno.env.get("SITE_URL") || "";

// Ajusta si tu tabla se llama diferente
const ACCESS_REQUESTS_TABLE = "debacu_eval_access_requests";
const APP_ID = "DEBACU_EVAL";

/* ======================================================
 * Helpers
 * ====================================================== */
function safeUpper(v: any) {
  return String(v ?? "").toUpperCase().trim();
}
function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}
function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}
function pickString(body: any, snake: string, camel?: string) {
  const v = body?.[snake] ?? (camel ? body?.[camel] : undefined);
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function pickBool(body: any, snake: string, camel?: string) {
  const v = body?.[snake] ?? (camel ? body?.[camel] : undefined);
  return Boolean(v);
}
function pickLimit(body: any, def = 100) {
  const n = Number(body?.limit ?? def);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), 500);
}
function nowIso() {
  return new Date().toISOString();
}
function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDaysISO(isoDate: string, days: number) {
  const [y, m, dd] = isoDate.split("-").map((x) => Number(x));
  const dt = new Date(Date.UTC(y, (m - 1), dd, 0, 0, 0));
  dt.setUTCDate(dt.getUTCDate() + days);
  return toISODate(dt);
}
function normEmail(email: string) {
  return safeStr(email).toLowerCase();
}

function sbService() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function err(req: Request, status: number, detail: string, extra?: Record<string, unknown>) {
  return json(req, status, { ok: false, error: "request_failed", detail, ...(extra ?? {}) });
}

function inferAppUrl(req: Request) {
  if (APP_PUBLIC_URL && APP_PUBLIC_URL.startsWith("http")) return APP_PUBLIC_URL;

  const origin = req.headers.get("origin") || "";
  if (origin.startsWith("http")) return origin;

  const xfHost = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const xfProto = req.headers.get("x-forwarded-proto") || "https";
  if (xfHost) return `${xfProto}://${xfHost}`;

  return ""; // último recurso
}

function buildInviteRedirect(req: Request, orgId: string, requestId: string) {
  const base = inferAppUrl(req);
  const path = `/auth/activate?org_id=${encodeURIComponent(orgId)}&req=${encodeURIComponent(requestId)}`;
  return base ? `${base}${path}` : path;
}

/* ======================================================
 * Extract fields from request row (tolerante a esquemas)
 * ====================================================== */
function getReqField(row: any, ...keys: string[]) {
  for (const k of keys) {
    const v = row?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

function mapCustomerInsert(row: any) {
  const email = normEmail(String(row.email || ""));
  const name =
    getReqField(row, "customer_name", "hotel_name", "company_name", "name", "commercial_name") ?? email;

  const nif = getReqField(row, "nif", "cif") ?? null;
  const address = getReqField(row, "address") ?? null;
  const city = getReqField(row, "city") ?? null;
  const country = getReqField(row, "country") ?? "ESP";
  const phone = getReqField(row, "phone") ?? null;

  return {
    name,
    nif,
    address,
    city,
    country,
    phone,
    email,
    app_id: APP_ID,
    is_active: true,
    updated_at: nowIso(),
  } as any;
}

function mapOrgInsert(row: any, customer_id: string) {
  const name =
    getReqField(row, "org_name", "hotel_name", "company_name", "name") ??
    `Hotel ${normEmail(String(row.email || ""))}`;

  const legal_name = getReqField(row, "legal_name") ?? null;
  const cif = getReqField(row, "cif", "nif") ?? null;
  const address = getReqField(row, "address") ?? null;
  const city = getReqField(row, "city") ?? null;
  const country = getReqField(row, "country") ?? "ESP";
  const website = getReqField(row, "website") ?? null;

  const property_type = safeUpper(getReqField(row, "property_type") ?? "HOTEL");
  const rooms_count = Number(getReqField(row, "rooms_count") ?? 0) || null;

  return {
    name,
    legal_name,
    cif,
    address,
    city,
    country,
    website,
    property_type,
    rooms_count,
    customer_id,
    created_at: nowIso(),
  } as any;
}

/* ======================================================
 * DB primitives
 * ====================================================== */
async function getAccessRequest(sb: ReturnType<typeof sbService>, requestId: string) {
  const { data, error } = await sb
    .from(ACCESS_REQUESTS_TABLE)
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("not_found");
  return data as any;
}

async function findCustomerByEmail(sb: ReturnType<typeof sbService>, email: string) {
  const { data, error } = await sb
    .from("customers")
    .select("*")
    .eq("app_id", APP_ID)
    .ilike("email", email)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as any | null;
}

async function ensureCustomer(sb: ReturnType<typeof sbService>, row: any, auth_user_id?: string | null) {
  const existingId = row.customer_id ? String(row.customer_id) : null;
  if (existingId && isUuid(existingId)) {
    const { data, error } = await sb.from("customers").select("*").eq("id", existingId).maybeSingle();
    if (error) throw error;
    if (data) return data as any;
  }

  const email = normEmail(String(row.email || ""));
  const found = await findCustomerByEmail(sb, email);
  if (found) {
    if (auth_user_id && !found.auth_user_id) {
      const { error } = await sb
        .from("customers")
        .update({ auth_user_id, updated_at: nowIso() } as any)
        .eq("id", found.id);
      if (error) throw error;
      return { ...found, auth_user_id };
    }
    return found;
  }

  const payload = mapCustomerInsert(row);
  if (auth_user_id) payload.auth_user_id = auth_user_id;

  const { data: created, error: insErr } = await sb.from("customers").insert(payload).select("*").maybeSingle();
  if (insErr) throw insErr;
  if (!created) throw new Error("customer_create_failed");
  return created as any;
}

async function ensureOrg(sb: ReturnType<typeof sbService>, row: any, customer_id: string) {
  const existingId = row.org_id ? String(row.org_id) : null;
  if (existingId && isUuid(existingId)) {
    const { data, error } = await sb.from("debacu_eval_organizations").select("*").eq("id", existingId).maybeSingle();
    if (error) throw error;
    if (data) return data as any;
  }

  const { data: found, error: fErr } = await sb
    .from("debacu_eval_organizations")
    .select("*")
    .eq("customer_id", customer_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fErr) throw fErr;
  if (found) return found as any;

  const payload = mapOrgInsert(row, customer_id);
  const { data: created, error: insErr } = await sb
    .from("debacu_eval_organizations")
    .insert(payload)
    .select("*")
    .maybeSingle();

  if (insErr) throw insErr;
  if (!created) throw new Error("org_create_failed");
  return created as any;
}

async function ensureOrgMemberOwnerInvited(
  sb: ReturnType<typeof sbService>,
  params: {
    org_id: string;
    invited_email: string;
    admin_user_id: string;
    auth_user_id?: string | null;
  },
) {
  const { org_id, invited_email, admin_user_id, auth_user_id } = params;
  const email = normEmail(invited_email);

  let q = sb
    .from("debacu_eval_org_members")
    .select("*")
    .eq("org_id", org_id)
    .order("created_at", { ascending: false })
    .limit(1);

  if (auth_user_id) q = q.or(`auth_user_id.eq.${auth_user_id},user_id.eq.${auth_user_id},invited_email.ilike.${email}`);
  else q = q.ilike("invited_email", email);

  const { data: existing, error: exErr } = await q.maybeSingle();
  if (exErr) throw exErr;

  const patch: any = {
    role: "OWNER",
    status: "INVITED",
    invited_email: email,
    created_by_user_id: admin_user_id,
    updated_at: nowIso(),
  };

  if (auth_user_id) {
    patch.user_id = auth_user_id;
    patch.auth_user_id = auth_user_id;
  }

  if (existing?.id) {
    const { data: upd, error } = await sb
      .from("debacu_eval_org_members")
      .update(patch)
      .eq("id", existing.id)
      .select("*")
      .maybeSingle();
    if (error) throw error;
    return upd ?? existing;
  }

  const insertPayload: any = { org_id, ...patch, created_at: nowIso() };

  const { data: created, error: insErr } = await sb
    .from("debacu_eval_org_members")
    .insert(insertPayload)
    .select("*")
    .maybeSingle();

  if (insErr) throw insErr;
  if (!created) throw new Error("org_member_create_failed");
  return created as any;
}

/**
 * OJO: tu tabla debacu_eval_access_requests NO tiene updated_at (según tu dump).
 */
async function updateAccessRequest(sb: ReturnType<typeof sbService>, requestId: string, patch: Record<string, any>) {
  const { data, error } = await sb
    .from(ACCESS_REQUESTS_TABLE)
    .update({ ...patch } as any)
    .eq("id", requestId)
    .select("*")
    .maybeSingle();

  if (error) throw error;
  return data as any;
}

/* ======================================================
 * Subscriptions: asegurar FREE_TRIAL al aprobar
 * ====================================================== */
async function getPlanByCode(sb: ReturnType<typeof sbService>, planCode: string) {
  const { data, error } = await sb
    .from("plans")
    .select("id, code, app_id")
    .eq("app_id", APP_ID)
    .eq("code", planCode)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error(`plan_not_found:${planCode}`);
  return data as { id: string; code: string; app_id: string };
}

async function findActiveLikeSubscription(sb: ReturnType<typeof sbService>, customerId: string) {
  const today = toISODate(new Date());

  const { data, error } = await sb
    .from("subscriptions")
    .select("*")
    .eq("app_id", APP_ID)
    .eq("customer_id", customerId)
    .in("status", ["ACTIVE", "TRIAL_ACTIVE"])
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) throw error;
  const rows = (data ?? []) as any[];

  const valid = rows.find((s) => {
    const end = typeof s?.end_date === "string" ? s.end_date : null;
    return !end || end >= today;
  });

  return valid ?? null;
}

async function ensureFreeTrialSubscription(sb: ReturnType<typeof sbService>, customerId: string) {
  const existing = await findActiveLikeSubscription(sb, customerId);
  if (existing) return { created: false, subscription: existing };

  const plan = await getPlanByCode(sb, "FREE");

  const start = toISODate(new Date());
  const end = addDaysISO(start, 30);

  const payload: any = {
    customer_id: customerId,
    app_id: APP_ID,
    plan_id: plan.id,
    billing_frequency: "FREE_TRIAL",
    start_date: start,
    end_date: end,
    next_billing_date: end,
    status: "TRIAL_ACTIVE",
    provider: "manual",
    extra_seats: 0,
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  const { data: created, error: insErr } = await sb
    .from("subscriptions")
    .insert(payload)
    .select("*")
    .maybeSingle();

  if (insErr) throw insErr;
  if (!created) throw new Error("subscription_create_failed");

  return { created: true, subscription: created };
}

/* ======================================================
 * Import Profiles: asegurar perfil CSV por org al aprobar
 * ====================================================== */
const DEFAULT_IMPORT_PROFILE_NAME = "CSV_STANDARD_TEST";
const DEFAULT_IMPORT_SOURCE_TYPE = "FUTURE_BOOKINGS";

// mapping estándar que ya usas en el CSV de test
const DEFAULT_IMPORT_MAPPING = {
  email: "email",
  phone: "phone",
  country: "country",
  document: "document_number",
  full_name: "full_name",
  checkin_date: "checkin_date",
  checkout_date: "checkout_date",
};

async function ensureDefaultImportProfileForOrg(sb: ReturnType<typeof sbService>, orgId: string) {
  // si ya existe un perfil para ese org (por nombre), no creamos otro
  const { data: found, error: fErr } = await sb
    .from("import_profiles")
    .select("*")
    .eq("org_id", orgId)
    .eq("name", DEFAULT_IMPORT_PROFILE_NAME)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fErr) throw fErr;
  if (found?.id) return { created: false, import_profile: found };

  const payload: any = {
    org_id: orgId,
    name: DEFAULT_IMPORT_PROFILE_NAME,
    source_type: DEFAULT_IMPORT_SOURCE_TYPE, // FUTURE_BOOKINGS
    delimiter: ",",
    date_format: "YYYY-MM-DD",
    decimal_separator: ".",
    encoding: "UTF-8",
    identity_strategy: "DOCUMENT_STRONG",
    mapping: DEFAULT_IMPORT_MAPPING,
    disabled_fields: [],
    created_at: nowIso(),
    updated_at: nowIso(),
  };

  const { data: created, error: insErr } = await sb
    .from("import_profiles")
    .insert(payload)
    .select("*")
    .maybeSingle();

  if (insErr) throw insErr;
  if (!created) throw new Error("import_profile_create_failed");

  return { created: true, import_profile: created };
}

/* ======================================================
 * Email send helper (INVITE o RECOVERY)
 * ====================================================== */
async function sendAuthEmailWithRedirect(
  sb: ReturnType<typeof sbService>,
  email: string,
  redirectTo: string,
  extraData?: Record<string, any>,
) {
  const { data: inviteData, error: inviteErr } = await sb.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: extraData ?? {},
  });

  if (!inviteErr) {
    return {
      ok: true,
      action: "INVITE" as const,
      auth_user_id: inviteData?.user?.id ?? null,
      detail: inviteData?.user?.id ? `INVITE (${inviteData.user.id})` : "INVITE (ok)",
    };
  }

  const msg = String(inviteErr?.message ?? "").toLowerCase();
  const looksLikeExists = msg.includes("already") || msg.includes("registered") || msg.includes("exists");

  if (!looksLikeExists) {
    return { ok: false, action: "ERROR" as const, auth_user_id: null, detail: String(inviteErr.message ?? inviteErr) };
  }

  const { error: recErr } = await sb.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });
  if (recErr) {
    return { ok: false, action: "ERROR" as const, auth_user_id: null, detail: String(recErr.message ?? recErr) };
  }

  return { ok: true, action: "RECOVERY" as const, auth_user_id: null, detail: "RECOVERY (ok)" };
}

/* ======================================================
 * Main
 * ====================================================== */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  const sb = sbService();

  try {
    const admin = await requireAdmin(req);
    if (!admin?.user_id) return err(req, 401, "UNAUTHENTICATED");

    const body = await req.json().catch(() => ({}));
    const action = safeUpper(body?.action);
    if (!action) return err(req, 400, "missing_action");

    /* ======================================================
     * LIST
     * ====================================================== */
    if (action === "LIST") {
      const status = safeUpper(body?.status ?? "PENDING"); // PENDING | APPROVED | REJECTED | ALL
      const limit = pickLimit(body, 100);

      let q = sb
        .from(ACCESS_REQUESTS_TABLE)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (status && status !== "ALL") q = q.eq("status", status);

      const { data, error } = await q;
      if (error) throw error;

      return json(req, 200, { ok: true, data: data ?? [] });
    }

    /* ======================================================
     * APPROVE / REJECT / RESEND
     * ====================================================== */
    const requestId = pickString(body, "requestId", "request_id");
    if (!requestId) return err(req, 400, "missing_requestId");

    const row = await getAccessRequest(sb, requestId);
    const email = normEmail(String(row.email || ""));
    if (!email) return err(req, 400, "request_missing_email");

    const decisionNotes = pickString(body, "decisionNotes", "decision_notes") ?? null;

    // REJECT
    if (action === "REJECT") {
      const updated = await updateAccessRequest(sb, requestId, {
        status: "REJECTED",
        decision_notes: decisionNotes,
        reviewed_by: admin.user_id,
        reviewed_at: nowIso(),
        last_email_status: "SKIPPED",
        last_email_at: nowIso(),
        last_email_detail: "Reject: no email sent",
      });

      return json(req, 200, { ok: true, request: updated });
    }

    if (action !== "APPROVE" && action !== "RESEND") return err(req, 400, "invalid_action");

    // 1) Customer
    const customer = await ensureCustomer(sb, row, null);

    // 1bis) Subscription FREE_TRIAL (evita PLAN_NOT_ACTIVE)
    const subRes = await ensureFreeTrialSubscription(sb, String(customer.id));

    // 2) Org
    const org = await ensureOrg(sb, row, String(customer.id));

    // ✅ 2bis) Import profile por defecto del org (evita selector vacío en CSV)
    const importRes = await ensureDefaultImportProfileForOrg(sb, String(org.id));

    // 3) Redirect
    const invite_redirect_to = buildInviteRedirect(req, String(org.id), requestId);

    // 3bis) Data para template (si lo usas)
    const invite_data = { org_id: String(org.id), req: String(requestId) };

    // 4) Email (INVITE o RECOVERY)
    const sendRes = await sendAuthEmailWithRedirect(sb, email, invite_redirect_to, invite_data);

    // 5) Org member (OWNER INVITED)
    let member: any = null;
    if (sendRes.ok && sendRes.auth_user_id) {
      if (!customer.auth_user_id) {
        await sb
          .from("customers")
          .update({ auth_user_id: sendRes.auth_user_id, updated_at: nowIso() } as any)
          .eq("id", customer.id);
      }
      member = await ensureOrgMemberOwnerInvited(sb, {
        org_id: String(org.id),
        invited_email: email,
        admin_user_id: admin.user_id,
        auth_user_id: sendRes.auth_user_id,
      });
    } else {
      member = await ensureOrgMemberOwnerInvited(sb, {
        org_id: String(org.id),
        invited_email: email,
        admin_user_id: admin.user_id,
        auth_user_id: null,
      });
    }

    // 6) Cerrar otras pendientes (opcional)
    const closeOtherPendings = pickBool(body, "closeOtherPendings", "close_other_pendings");
    if (closeOtherPendings) {
      await sb
        .from(ACCESS_REQUESTS_TABLE)
        .update({
          status: "SUPERSEDED",
          decision_notes: "Auto-superseded by another approval.",
          reviewed_by: admin.user_id,
          reviewed_at: nowIso(),
        } as any)
        .neq("id", requestId)
        .ilike("email", email)
        .eq("status", "PENDING");
    }

    // 7) Update access_request
    const newStatus =
      action === "APPROVE" ? "APPROVED" : safeUpper(row.status) === "APPROVED" ? "APPROVED" : "PENDING";

    const updated = await updateAccessRequest(sb, requestId, {
      status: newStatus,
      customer_id: customer.id,
      org_id: org.id,
      decision_notes: action === "APPROVE" ? decisionNotes : row.decision_notes ?? null,
      reviewed_by: action === "APPROVE" ? admin.user_id : row.reviewed_by ?? null,
      reviewed_at: action === "APPROVE" ? nowIso() : row.reviewed_at ?? null,
      last_email_status: sendRes.ok ? "SENT" : "FAILED",
      last_email_at: nowIso(),
      last_email_detail: sendRes.ok
        ? `${sendRes.action} | ${sendRes.detail} | redirect=${invite_redirect_to}`
        : sendRes.detail,
    });

    // 8) Response
    return json(req, 200, {
      ok: true,
      action,
      created_or_reused: {
        auth_user_id: sendRes.auth_user_id ?? null,
        customer_id: customer.id,
        org_id: org.id,
        org_member_id: member?.id ?? null,

        subscription_id: subRes?.subscription?.id ?? null,
        subscription_created: Boolean(subRes?.created),
        subscription_status: subRes?.subscription?.status ?? null,
        subscription_end_date: subRes?.subscription?.end_date ?? null,

        import_profile_id: importRes?.import_profile?.id ?? null,
        import_profile_created: Boolean(importRes?.created),
        import_profile_name: importRes?.import_profile?.name ?? null,
      },
      invite: {
        email,
        redirect_to: invite_redirect_to,
        sent: sendRes.ok,
        email_action: sendRes.ok ? sendRes.action : "ERROR",
        detail: sendRes.detail,
      },
      request: updated,
    });
  } catch (e: any) {
    console.error("debacu-eval-admin-access-requests error:", e);
    const msg = String(e?.message ?? e);

    if (msg.includes("MISSING_ENV:")) {
      return json(req, 500, { ok: false, error: "request_failed", detail: msg });
    }
    if (msg === "not_found") return err(req, 404, "not_found");

    return json(req, 500, { ok: false, error: "request_failed", detail: msg });
  }
});