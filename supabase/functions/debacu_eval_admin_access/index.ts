// supabase/functions/debacu-eval-admin-access-requests/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** ======================================================
 *  ENV (no tirar en top-level para no romper OPTIONS)
 *  ====================================================== */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

// Brevo (solo si sendEmail=true)
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const BREVO_SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL") ?? "soporte@debacu.com";
const BREVO_SENDER_NAME = Deno.env.get("BREVO_SENDER_NAME") ?? "Debacu Evaluation360";

/** ======================================================
 *  CORS (whitelist + preflight 204)
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

function genTempPassword(length = 10) {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;

  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);

  const pick = (set: string, n: number) =>
    Array.from({ length: n }, (_, i) => set[arr[i] % set.length]).join("");

  const base =
    pick(upper, 1) +
    pick(lower, 1) +
    pick(digits, 1) +
    Array.from({ length: Math.max(0, length - 3) }, (_, i) => all[arr[i] % all.length]).join("");

  const chars = base.split("");
  for (let i = chars.length - 1; i > 0; i--) {
    const j = arr[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
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
 *  PDF acceptance attachment (Storage -> Brevo)
 *  ====================================================== */
const TERMS_BUCKET = "debacu_legal_acceptances";

function arrayBufferToBase64(ab: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(ab);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function getAcceptancePdfPathFromRequest(request: any): string | null {
  return (
    request?.accepted_terms_pdf_path ??
    request?.accepted_terms_pdf ??
    request?.acceptance_pdf_path ??
    null
  );
}

async function buildAcceptancePdfAttachment(request: any) {
  const pdfPath = getAcceptancePdfPathFromRequest(request);
  if (!pdfPath) return [];

  const { data: file, error } = await admin.storage.from(TERMS_BUCKET).download(pdfPath);
  if (error || !file) {
    throw new Error(`No se pudo descargar el PDF (${pdfPath}): ${error?.message ?? "no-file"}`);
  }

  const ab = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(ab);
  return [{ name: "justificante_aceptacion_condiciones.pdf", content: base64 }];
}

/** ======================================================
 *  Brevo email
 *  ====================================================== */
async function sendBrevoEmail(params: {
  to: string;
  company_name?: string | null;
  username: string;
  temp_password: string;
  attachments?: Array<{ name: string; content: string }>;
}) {
  if (!BREVO_API_KEY) throw new Error("BREVO_API_KEY not configured");

  const { to, company_name, username, temp_password, attachments } = params;

  const subject = "Acceso aprobado — Credenciales temporales";
  const htmlContent = `
  <div style="font-family:Arial,sans-serif;line-height:1.5">
    <h2>Acceso aprobado ✅</h2>
    <p>Hola${company_name ? `, <b>${company_name}</b>` : ""}:</p>
    <p>Estas son tus credenciales temporales:</p>
    <ul>
      <li><b>Usuario:</b> ${username}</li>
      <li><b>Contraseña temporal:</b> ${temp_password}</li>
    </ul>
    <p><i>Recomendación:</i> cambia la contraseña en el primer acceso.</p>
    <p>Adjuntamos el justificante de aceptación de condiciones.</p>
    <p>— Debacu Evaluation360</p>
  </div>
  `;

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "api-key": BREVO_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender: { email: BREVO_SENDER_EMAIL, name: BREVO_SENDER_NAME },
      to: [{ email: to }],
      subject,
      htmlContent,
      ...(attachments && attachments.length > 0 ? { attachment: attachments } : {}),
    }),
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) throw new Error(`Brevo error ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

/** ======================================================
 *  Auth helpers
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

async function ensureAuthUser(email: string, password: string, customer_id: string) {
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { customer_id, role: "customer" },
  });

  if (!createErr) return { mode: "CREATED", user_id: created.user?.id ?? null };

  const msg = (createErr.message || "").toLowerCase();
  const already =
    msg.includes("already") ||
    msg.includes("registered") ||
    msg.includes("exists") ||
    msg.includes("duplicate");

  if (!already) throw new Error(`Auth error: ${createErr.message}`);

  const user_id = await getAuthUserIdByEmail(email);
  if (!user_id) return { mode: "EXISTS_NO_ID", user_id: null };

  const { error: updErr } = await admin.auth.admin.updateUserById(user_id, {
    password,
    user_metadata: { customer_id, role: "customer" },
  });

  if (updErr) throw new Error(`Auth update error: ${updErr.message}`);
  return { mode: "UPDATED", user_id };
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
 *  Organization + Membership
 *  ====================================================== */
async function ensureOrganizationAndMembership(params: {
  customer_id: string;
  auth_user_id: string;
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
    auth_user_id,
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

  if (!org_id) {
    const now = new Date().toISOString();
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
      })
      .eq("id", org_id);

    if (orgUpdErr) throw new Error(`DB error (org update): ${orgUpdErr.message}`);
  }

  const { data: mExisting, error: mFindErr } = await admin
    .from("debacu_eval_org_members")
    .select("id, role")
    .eq("org_id", org_id)
    .eq("user_id", auth_user_id)
    .maybeSingle();

  if (mFindErr) throw new Error(`DB error (member find): ${mFindErr.message}`);

  if (!mExisting?.id) {
    const { error: mInsErr } = await admin.from("debacu_eval_org_members").insert({
      org_id,
      user_id: auth_user_id,
      role: "OWNER",
    });
    if (mInsErr) throw new Error(`DB error (member insert): ${mInsErr.message}`);
  } else if (String(mExisting.role || "").toUpperCase() !== "OWNER") {
    const { error: mUpdErr } = await admin
      .from("debacu_eval_org_members")
      .update({ role: "OWNER" })
      .eq("id", mExisting.id);

    if (mUpdErr) throw new Error(`DB error (member update): ${mUpdErr.message}`);
  }

  return { org_id };
}

/** ======================================================
 *  Subscriptions FREE_TRIAL helper (30 días)
 *  ====================================================== */
async function ensureFreeTrialSubscription(customer_id: string) {
  const app_id = "DEBACU_EVAL";

  // ✅ No crear si ya hay ACTIVE o TRIAL_ACTIVE
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
      const send_email = Boolean(body?.sendEmail ?? false);
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

      const service_username = email;
      const service_password = genTempPassword(10);

      const customer_id = await getOrCreateCustomerByEmail(email, company_name);

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
          app_id: "DEBACU_EVAL",
          service_username,
          service_password, // ⚠️ en prod: hash/encrypt. Para pruebas ok.
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

      const authRes = await ensureAuthUser(email, service_password, customer_id);
      const auth_user_id = authRes.user_id;
      if (!auth_user_id) return json(origin, 500, { error: "Auth error", detail: "No user_id resolved" });

      const orgRes = await ensureOrganizationAndMembership({
        customer_id,
        auth_user_id,
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

      const subRes = await ensureFreeTrialSubscription(customer_id);

      // Email opcional
      let email_sent = false;
      let email_detail: string | null = null;
      let last_email_status: string | null = null;
      let last_email_at: string | null = null;

      if (send_email) {
        try {
          const attachments = await buildAcceptancePdfAttachment(request);
          if (!attachments.length) throw new Error("No existe PDF de aceptación para adjuntar.");

          const brevoData = await sendBrevoEmail({
            to: email,
            company_name,
            username: service_username,
            temp_password: service_password,
            attachments,
          });

          email_sent = true;
          email_detail = brevoData?.messageId ? `SENT (${brevoData.messageId})` : "SENT";
          last_email_status = "SENT";
          last_email_at = now;
        } catch (e: any) {
          email_sent = false;
          email_detail = e?.message ?? String(e);
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
        subscription: { created: subRes.created, id: subRes.subscription?.id ?? null, status: subRes.subscription?.status ?? null },
        auth: { mode: authRes.mode, user_id: auth_user_id },
        credentials: { email, username: service_username, temp_password: service_password },
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

    /** RESEND */
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

      const company_name = (request.company_name ?? null) as string | null;
      const customer_id = request.customer_id ?? null;
      if (!customer_id) return json(origin, 400, { error: "Request has no customer_id (not approved?)" });

      const { data: cust } = await admin
        .from("customers")
        .select("service_username, service_password")
        .eq("id", customer_id)
        .maybeSingle();

      let username = (cust as any)?.service_username ?? email;
      let temp_password = (cust as any)?.service_password ?? null;

      if (!temp_password) {
        temp_password = genTempPassword(10);
        await admin
          .from("customers")
          .update({ service_password: temp_password, service_username: username, updated_at: new Date().toISOString() })
          .eq("id", customer_id);
      }

      try {
        const user_id = await getAuthUserIdByEmail(email);
        if (user_id) await admin.auth.admin.updateUserById(user_id, { password: temp_password });
      } catch {
        // no bloquea
      }

      const now = new Date().toISOString();
      let email_sent = false;
      let email_detail: string | null = null;
      let last_email_status: string | null = null;

      try {
        const attachments = await buildAcceptancePdfAttachment(request);
        const brevoData = await sendBrevoEmail({
          to: email,
          company_name,
          username,
          temp_password,
          attachments,
        });

        email_sent = true;
        email_detail = brevoData?.messageId ? `SENT (${brevoData.messageId})` : "SENT";
        last_email_status = "SENT";
      } catch (e: any) {
        email_sent = false;
        email_detail = e?.message ?? String(e);
        last_email_status = "FAILED";
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

      return json(origin, 200, {
        ok: true,
        customer_id,
        credentials: { email, username, temp_password },
        email_sent,
        email_detail,
      });
    }

    return json(origin, 400, { error: "Invalid action" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const code = msg === "UNAUTHENTICATED" ? 401 : msg === "FORBIDDEN" ? 403 : 500;
    return json(origin, code, { error: "Request failed", detail: msg });
  }
});
