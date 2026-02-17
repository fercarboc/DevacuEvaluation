// supabase/functions/debacu-eval-admin-access-requests/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireAdmin, supabaseServiceClient } from "../_shared/auth.ts";

const APP_ID = "DEBACU_EVAL";

/* ======================================================
 * Utils
 * ====================================================== */
async function readJsonSafe<T>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}
function safeLowerEmail(v: any) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}
function safeUpper(v: any) {
  return typeof v === "string" ? v.trim().toUpperCase() : "";
}

const toDate = (d: Date) => d.toISOString().slice(0, 10);

function resolveSiteUrl(body: any) {
  const raw = typeof body?.siteUrl === "string" ? body.siteUrl.trim() : "";
  const fromBody = raw && raw.startsWith("http") ? raw : "";
  const fromEnv = (Deno.env.get("PUBLIC_SITE_URL") ?? "").trim();
  const fallback = "http://localhost:3000";
  return (fromBody || fromEnv || fallback).replace(/\/$/, "");
}

function logLine(payload: Record<string, unknown>) {
  console.log(JSON.stringify(payload));
}

/* ======================================================
 * DB helpers (service role)
 * ====================================================== */
async function getOrCreateCustomerByEmail(admin: ReturnType<typeof supabaseServiceClient>, email: string, company_name: string | null) {
  // ⚠️ Si tu tabla customers es multi-app real, filtrar por app_id evita colisiones.
  const { data: existing, error: findErr } = await admin
    .from("customers")
    .select("id")
    .eq("email", email)
    .eq("app_id", APP_ID)
    .maybeSingle();

  if (findErr) throw new Error("DB_CUSTOMERS_FIND_FAILED");
  if (existing?.id) return String(existing.id);

  const customer_id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: insErr } = await admin.from("customers").insert({
    id: customer_id,
    name: company_name,
    email,
    is_active: true,
    app_id: APP_ID,
    created_at: now,
    updated_at: now,
  });

  if (insErr) throw new Error("DB_CUSTOMERS_INSERT_FAILED");
  return customer_id;
}

async function upsertDebacuEvalCustomerProfile(
  admin: ReturnType<typeof supabaseServiceClient>,
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

  if (error) throw new Error("DB_PROFILE_UPSERT_FAILED");
}

/** Organization ONLY (sin membership) */
async function ensureOrganizationOnly(
  admin: ReturnType<typeof supabaseServiceClient>,
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
  const { customer_id } = params;

  const { data: orgExisting, error: orgFindErr } = await admin
    .from("debacu_eval_organizations")
    .select("id")
    .eq("customer_id", customer_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (orgFindErr) throw new Error("DB_ORG_FIND_FAILED");

  let org_id = orgExisting?.id ? String(orgExisting.id) : null;

  const now = new Date().toISOString();
  const patch = {
    name: params.org_name,
    legal_name: params.legal_name ?? null,
    cif: params.cif ?? null,
    address: params.address ?? null,
    city: params.city ?? null,
    country: safeUpper(params.country ?? "ESP") || "ESP",
    property_type: params.property_type ?? null,
    rooms_count: typeof params.rooms_count === "number" ? params.rooms_count : null,
    website: params.website ?? null,
  };

  if (!org_id) {
    const { data: inserted, error: orgInsErr } = await admin
      .from("debacu_eval_organizations")
      .insert({
        ...patch,
        customer_id,
        created_at: now,
      })
      .select("id")
      .single();

    if (orgInsErr) throw new Error("DB_ORG_INSERT_FAILED");
    org_id = String(inserted.id);
  } else {
    const { error: orgUpdErr } = await admin
      .from("debacu_eval_organizations")
      .update(patch)
      .eq("id", org_id);

    if (orgUpdErr) throw new Error("DB_ORG_UPDATE_FAILED");
  }

  return { org_id };
}

/** FREE_TRIAL helper (30 días) */
async function ensureFreeTrialSubscription(admin: ReturnType<typeof supabaseServiceClient>, customer_id: string) {
  const { data: existing, error: existErr } = await admin
    .from("subscriptions")
    .select("id, status")
    .eq("customer_id", customer_id)
    .eq("app_id", APP_ID)
    .in("status", ["ACTIVE", "TRIAL_ACTIVE"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (existErr) throw new Error("DB_SUBSCRIPTIONS_CHECK_FAILED");
  if (existing && existing.length > 0) return { created: false, subscription: existing[0] };

  const { data: plan, error: planErr } = await admin
    .from("plans")
    .select("id, code")
    .eq("app_id", APP_ID)
    .eq("code", "FREE")
    .single();

  if (planErr || !plan?.id) throw new Error("PLAN_FREE_NOT_FOUND");

  const today = new Date();
  const end = new Date(today);
  end.setDate(end.getDate() + 30);
  const now = new Date().toISOString();

  const { data: inserted, error: insErr } = await admin
    .from("subscriptions")
    .insert({
      customer_id,
      app_id: APP_ID,
      plan_id: String(plan.id),
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

  if (insErr) throw new Error("DB_SUBSCRIPTIONS_INSERT_FAILED");
  return { created: true, subscription: inserted };
}

/* ======================================================
 * Handler
 * ====================================================== */
type Action = "LIST" | "APPROVE" | "REJECT" | "RESEND";

Deno.serve(async (req) => {
  const FN = "debacu-eval-admin-access-requests";

  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "request_failed", detail: "METHOD_NOT_ALLOWED" });
  }

  // ✅ Admin JWT-only (sin allowlist en cada función)
  try {
    await requireAdmin(req);
  } catch {
    return json(req, 403, { ok: false, error: "request_failed", detail: "FORBIDDEN" });
  }

  const body = (await readJsonSafe<any>(req)) ?? {};
  let action: Action | null = (body?.action as Action) ?? null;
  if (!action && (body?.status || body?.limit)) action = "LIST";

  const admin = supabaseServiceClient();

  try {
    /** LIST */
    if (action === "LIST") {
      const status = (body?.status ?? "PENDING") as "PENDING" | "APPROVED" | "REJECTED" | "ALL";
      const limit = Math.min(Math.max(Number(body?.limit ?? 100), 1), 500);

      let q = admin
        .from("debacu_eval_access_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (status !== "ALL") q = q.eq("status", status);

      const { data, error } = await q;
      if (error) {
        return json(req, 500, { ok: false, error: "request_failed", detail: "DB_LIST_FAILED" });
      }

      return json(req, 200, { ok: true, data: data ?? [] });
    }

    /** APPROVE */
    if (action === "APPROVE") {
      const request_id = safeStr(body?.requestId);
      const decision_notes = safeStr(body?.decisionNotes ?? "");
      const send_email = Boolean(body?.sendEmail ?? false);
      const reviewed_by = body?.reviewed_by ?? body?.reviewedBy ?? null;

      if (!request_id) {
        return json(req, 400, { ok: false, error: "request_failed", detail: "missing_requestId" });
      }

      const { data: request, error: requestError } = await admin
        .from("debacu_eval_access_requests")
        .select("*")
        .eq("id", request_id)
        .single();

      if (requestError || !request) {
        return json(req, 404, { ok: false, error: "request_failed", detail: "REQUEST_NOT_FOUND" });
      }

      if (!request.accepted_terms) {
        return json(req, 400, { ok: false, error: "request_failed", detail: "terms_not_accepted" });
      }

      const email = safeLowerEmail(request.email);
      if (!email) {
        return json(req, 400, { ok: false, error: "request_failed", detail: "missing_email" });
      }

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

      // customer
      const customer_id = await getOrCreateCustomerByEmail(admin, email, company_name);

      // update customers (sin exponer errores DB)
      const now = new Date().toISOString();
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
          app_id: APP_ID,
          updated_at: now,
        })
        .eq("id", customer_id);

      if (custUpdErr) {
        return json(req, 500, { ok: false, error: "request_failed", detail: "DB_CUSTOMERS_UPDATE_FAILED" });
      }

      await upsertDebacuEvalCustomerProfile(admin, {
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
      const orgRes = await ensureOrganizationOnly(admin, {
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

      // subscription trial
      const subRes = await ensureFreeTrialSubscription(admin, customer_id);

      // invite email (opcional)
      let email_sent = false;
      let email_detail: string | null = null;
      let last_email_status: string | null = null;
      let last_email_at: string | null = null;

      if (send_email) {
        try {
          const siteUrl = resolveSiteUrl(body);
          const redirectTo = `${siteUrl}/auth/activate`;

          const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
          if (inviteErr) throw inviteErr;

          email_sent = true;
          email_detail = `SENT redirectTo=${redirectTo}`;
          last_email_status = "SENT";
          last_email_at = now;
        } catch (e: any) {
          email_sent = false;
          email_detail = (e?.message ?? String(e)).slice(0, 500);
          last_email_status = "FAILED";
          last_email_at = now;
        }
      }

      const { error: updateError } = await admin
        .from("debacu_eval_access_requests")
        .update({
          status: "APPROVED",
          decision_notes: decision_notes || null,
          reviewed_by,
          reviewed_at: now,
          customer_id,
          org_id: orgRes.org_id,
          last_email_status,
          last_email_at,
          last_email_detail: email_detail,
        })
        .eq("id", request_id);

      if (updateError) {
        return json(req, 500, { ok: false, error: "request_failed", detail: "DB_REQUEST_UPDATE_FAILED" });
      }

      logLine({ fn: FN, action: "APPROVE", request_id, customer_id, org_id: orgRes.org_id });

      return json(req, 200, {
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
      const request_id = safeStr(body?.requestId);
      const decision_notes = safeStr(body?.decisionNotes ?? "");
      const reviewed_by = body?.reviewed_by ?? body?.reviewedBy ?? null;

      if (!request_id) {
        return json(req, 400, { ok: false, error: "request_failed", detail: "missing_requestId" });
      }

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

      if (error) {
        return json(req, 500, { ok: false, error: "request_failed", detail: "DB_REQUEST_UPDATE_FAILED" });
      }

      logLine({ fn: FN, action: "REJECT", request_id });
      return json(req, 200, { ok: true });
    }

    /** RESEND */
    if (action === "RESEND") {
      const request_id = safeStr(body?.requestId);
      const reviewed_by = body?.reviewed_by ?? body?.reviewedBy ?? null;
      const send_email = Boolean(body?.sendEmail ?? true);

      if (!request_id) {
        return json(req, 400, { ok: false, error: "request_failed", detail: "missing_requestId" });
      }

      const { data: request, error: requestError } = await admin
        .from("debacu_eval_access_requests")
        .select("*")
        .eq("id", request_id)
        .single();

      if (requestError || !request) {
        return json(req, 404, { ok: false, error: "request_failed", detail: "REQUEST_NOT_FOUND" });
      }

      const email = safeLowerEmail(request.email);
      if (!email) {
        return json(req, 400, { ok: false, error: "request_failed", detail: "missing_email" });
      }

      const customer_id = request.customer_id ?? null;
      if (!customer_id) {
        return json(req, 400, { ok: false, error: "request_failed", detail: "missing_customer_id" });
      }

      const now = new Date().toISOString();
      let email_sent = false;
      let email_detail: string | null = null;
      let last_email_status: string | null = null;

      if (send_email) {
        try {
          const siteUrl = resolveSiteUrl(body);
          const redirectTo = `${siteUrl}/auth/activate`;

          const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
          if (inviteErr) throw inviteErr;

          email_sent = true;
          email_detail = `SENT redirectTo=${redirectTo}`;
          last_email_status = "SENT";
        } catch (e: any) {
          email_sent = false;
          email_detail = (e?.message ?? String(e)).slice(0, 500);
          last_email_status = "FAILED";
        }
      }

      const { error: updErr } = await admin
        .from("debacu_eval_access_requests")
        .update({
          last_email_status,
          last_email_at: now,
          last_email_detail: email_detail,
          reviewed_by,
          reviewed_at: now,
        })
        .eq("id", request_id);

      if (updErr) {
        return json(req, 500, { ok: false, error: "request_failed", detail: "DB_REQUEST_UPDATE_FAILED" });
      }

      logLine({ fn: FN, action: "RESEND", request_id, customer_id, email_sent, last_email_status });

      return json(req, 200, {
        ok: true,
        customer_id,
        email_sent,
        email_detail,
      });
    }

    return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_action" });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "INTERNAL_ERROR";

    // Mapeo conservador (sin filtrar detalles DB)
    if (msg === "UNAUTHENTICATED") {
      return json(req, 401, { ok: false, error: "request_failed", detail: "UNAUTHENTICATED" });
    }
    if (msg === "FORBIDDEN") {
      return json(req, 403, { ok: false, error: "request_failed", detail: "FORBIDDEN" });
    }

    return json(req, 500, { ok: false, error: "request_failed", detail: "INTERNAL_ERROR" });
  }
});
