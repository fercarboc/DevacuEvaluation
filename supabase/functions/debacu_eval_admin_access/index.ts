import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** ======================================================
 *  ENV
 *  ====================================================== */
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Brevo (Sendinblue) - SIEMPRE por secrets
const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY") ?? "";
const BREVO_SENDER_EMAIL = Deno.env.get("BREVO_SENDER_EMAIL") ?? "soporte@debacu.com";
const BREVO_SENDER_NAME = Deno.env.get("BREVO_SENDER_NAME") ?? "Debacu Evaluation360";

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

/** ======================================================
 *  CORS
 *  ====================================================== */
function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(status: number, origin: string | null, body: unknown) {
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
 *  HELPERS
 *  ====================================================== */
function safeLowerEmail(v: any) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}
function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
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

  // shuffle
  const chars = base.split("");
  for (let i = chars.length - 1; i > 0; i--) {
    const j = arr[i] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

const toDate = (d: Date) => d.toISOString().slice(0, 10); // YYYY-MM-DD

/** ======================================================
 *  Brevo email
 *  ====================================================== */
async function sendBrevoEmail(params: {
  to: string;
  company_name?: string | null;
  username: string;
  temp_password: string;
}) {
  if (!BREVO_API_KEY) throw new Error("BREVO_API_KEY not configured");

  const { to, company_name, username, temp_password } = params;

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
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    const found = data.users.find((u) => safeLowerEmail(u.email) === e);
    if (found?.id) return found.id;
    if (data.users.length < perPage) break;
  }
  return null;
}

async function ensureAuthUser(email: string, password: string, customer_id: string) {
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
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

  const { error: updErr } = await supabase.auth.admin.updateUserById(user_id, {
    password,
    user_metadata: { customer_id, role: "customer" },
  });

  if (updErr) throw new Error(`Auth update error: ${updErr.message}`);
  return { mode: "UPDATED", user_id };
}

/** ======================================================
 *  Customers + Profile helpers
 *  ====================================================== */
async function getOrCreateCustomerByEmail(email: string, company_name: string | null) {
  const { data: existing, error: findErr } = await supabase
    .from("customers")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (findErr) throw new Error(`DB error (customers find): ${findErr.message}`);
  if (existing?.id) return existing.id as string;

  const customer_id = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: insErr } = await supabase.from("customers").insert({
    id: customer_id,
    name: company_name,
    email,
    is_active: true,
    created_at: now,
    updated_at: now,
  });

  if (insErr) throw new Error(`DB error (customers insert): ${insErr.message}`);
  return customer_id;
}

/**
 * Upsert profile extendido en debacu_eval_customer_profile
 * (customer_id PK)
 */
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

  const { error } = await supabase
    .from("debacu_eval_customer_profile")
    .upsert(payload, { onConflict: "customer_id" });

  if (error) throw new Error(`DB error (profile upsert): ${error.message}`);
}

/** ======================================================
 *  Subscriptions FREE_TRIAL helper
 *  ====================================================== */
async function ensureFreeSubscriptionDebacuEval(customer_id: string) {
  const app_id = "DEBACU_EVAL";

  const { data: existing, error: existErr } = await supabase
    .from("subscriptions")
    .select("id, status, start_date, end_date, plan_id, billing_frequency")
    .eq("customer_id", customer_id)
    .eq("app_id", app_id)
    .in("status", ["ACTIVE"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (existErr) throw new Error(`DB error (subscriptions check): ${existErr.message}`);
  if (existing && existing.length > 0) return { created: false, subscription: existing[0] };

  const { data: plan, error: planErr } = await supabase
    .from("plans")
    .select("id, app_id, code")
    .eq("app_id", app_id)
    .eq("code", "FREE")
    .single();

  if (planErr || !plan) throw new Error(`Plan FREE not found for ${app_id}: ${planErr?.message ?? "no-plan"}`);

  const today = new Date();
  const end = new Date(today);
  end.setMonth(end.getMonth() + 3);
  const now = new Date().toISOString();

  const payload = {
    customer_id,
    app_id,
    plan_id: plan.id as string,
    billing_frequency: "FREE_TRIAL",
    start_date: toDate(today),
    end_date: toDate(end),
    next_billing_date: toDate(end),
    status: "ACTIVE",
    provider: "manual",
    created_at: now,
    updated_at: now,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("subscriptions")
    .insert(payload)
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

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });

  try {
    const body = await readBody(req);
    let action = body?.action as string | undefined;

    // compat: si no viene action pero viene status/limit => LIST
    if (!action && (body?.status || body?.limit)) action = "LIST";

    /** ======================================================
     *  LIST
     *  ====================================================== */
    if (action === "LIST") {
      const status = (body?.status ?? "PENDING") as "PENDING" | "APPROVED" | "REJECTED" | "ALL";
      const limit = Number(body?.limit ?? 100);

      let q = supabase
        .from("debacu_eval_access_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (status && status !== "ALL") q = q.eq("status", status);

      const { data, error } = await q;
      if (error) return json(500, origin, { error: "DB error (list)", detail: error.message });

      return json(200, origin, { data });
    }

    /** ======================================================
     *  APPROVE
     *  ====================================================== */
    if (action === "APPROVE") {
      const request_id = body?.requestId as string;
      const decision_notes = safeStr(body?.decisionNotes ?? "");
      const send_email = Boolean(body?.sendEmail ?? false);

      if (!request_id) return json(400, origin, { error: "Missing requestId" });

      // 1) cargar request
      const { data: request, error: requestError } = await supabase
        .from("debacu_eval_access_requests")
        .select("*")
        .eq("id", request_id)
        .single();

      if (requestError || !request) {
        return json(404, origin, { error: "Request not found", detail: requestError?.message });
      }

      const email = safeLowerEmail(request.email);
      if (!email) return json(400, origin, { error: "Request has no email" });

      // Campos del request (los del formulario)
      const company_name = (request.company_name ?? null) as string | null;
      const legal_name = (request.legal_name ?? null) as string | null;
      const cif = safeStr(request.cif); // lo guardamos en customers.nif
      const address = (request.address ?? null) as string | null;
      const city = (request.city ?? null) as string | null;
      const country = ((request.country ?? "ESP") as string).toUpperCase();
      const property_type = (request.property_type ?? null) as string | null;
      const rooms_count = (request.rooms_count ?? null) as number | null;
      const website = (request.website ?? null) as string | null;
      const contact_name = (request.contact_name ?? null) as string | null;
      const contact_role = (request.contact_role ?? null) as string | null;
      const phone = (request.phone ?? null) as string | null;
      const notes = (request.notes ?? null) as string | null;

      // 2) generar credenciales
      const service_username = email;
      const service_password = genTempPassword(10);

      // 3) customer: reusar por email
      const customer_id = await getOrCreateCustomerByEmail(email, company_name);

      // 4) actualizar customers con TODOS los datos base que sí tienes en tabla
      const now = new Date().toISOString();
      const { error: custUpdErr } = await supabase
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
          service_username,
          service_password,
          updated_at: now,
        })
        .eq("id", customer_id);

      if (custUpdErr) {
        return json(500, origin, { error: "DB error (customers update)", detail: custUpdErr.message });
      }

      // 4.5) upsert perfil extendido Debacu Eval
      try {
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
      } catch (e: any) {
        return json(500, origin, { error: "DB error (profile upsert)", detail: e?.message ?? String(e) });
      }

      // 5) Auth: crear o resetear
      let auth_mode: string | null = null;
      let auth_user_id: string | null = null;

      try {
        const r = await ensureAuthUser(email, service_password, customer_id);
        auth_mode = r.mode;
        auth_user_id = r.user_id;
      } catch (e: any) {
        return json(500, origin, { error: "Auth error", detail: e?.message ?? String(e) });
      }

      // reviewed_by opcional (ojo: tu front envía reviewedBy, pero aquí esperamos reviewed_by)
      // acepto ambas por compat
      const reviewed_by = body?.reviewed_by ?? body?.reviewedBy ?? null;

      // 6) update request
      // Si NO tienes last_email_* columnas, elimina esas 3 líneas.
      let email_sent = false;
      let email_detail: string | null = null;
      let last_email_status: string | null = null;
      let last_email_at: string | null = null;

      // 7) crear suscripción FREE_TRIAL
      let subscription_created = false;
      let subscription_id: string | null = null;

      try {
        const r = await ensureFreeSubscriptionDebacuEval(customer_id);
        subscription_created = r.created;
        subscription_id = r.subscription?.id ?? null;
      } catch (e: any) {
        return json(500, origin, { error: "Subscription error", detail: e?.message ?? String(e) });
      }

      // 8) enviar email (opcional)
      if (send_email) {
        try {
          const brevoData = await sendBrevoEmail({
            to: email,
            company_name,
            username: service_username,
            temp_password: service_password,
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

      const { error: updateError } = await supabase
        .from("debacu_eval_access_requests")
        .update({
          status: "APPROVED",
          decision_notes: decision_notes || null,
          reviewed_by,
          reviewed_at: now,
          customer_id,

          // si NO existen estas columnas en la tabla, quítalas
          last_email_status,
          last_email_at,
          last_email_detail: email_detail,
        })
        .eq("id", request_id);

      if (updateError) {
        return json(500, origin, { error: "DB error (update request)", detail: updateError.message });
      }

      return json(200, origin, {
        ok: true,
        customer_id,
        subscription: { app_id: "DEBACU_EVAL", created: subscription_created, id: subscription_id },
        auth: { mode: auth_mode, user_id: auth_user_id },
        credentials: { email, username: service_username, temp_password: service_password },
        email_sent,
        email_detail,
      });
    }

    /** ======================================================
     *  REJECT
     *  ====================================================== */
    if (action === "REJECT") {
      const request_id = body?.requestId as string;
      const decision_notes = safeStr(body?.decisionNotes ?? "");

      if (!request_id) return json(400, origin, { error: "Missing requestId" });

      const now = new Date().toISOString();
      const reviewed_by = body?.reviewed_by ?? body?.reviewedBy ?? null;

      const { error } = await supabase
        .from("debacu_eval_access_requests")
        .update({
          status: "REJECTED",
          decision_notes: decision_notes || null,
          reviewed_by,
          reviewed_at: now,
        })
        .eq("id", request_id);

      if (error) return json(500, origin, { error: "DB error (reject)", detail: error.message });

      return json(200, origin, { ok: true });
    }

    /** ======================================================
     *  RESEND
     *  ====================================================== */
    if (action === "RESEND") {
      const request_id = body?.requestId as string;
      if (!request_id) return json(400, origin, { error: "Missing requestId" });

      const { data: request, error: requestError } = await supabase
        .from("debacu_eval_access_requests")
        .select("*")
        .eq("id", request_id)
        .single();

      if (requestError || !request) {
        return json(404, origin, { error: "Request not found", detail: requestError?.message });
      }

      const email = safeLowerEmail(request.email);
      if (!email) return json(400, origin, { error: "Request has no email" });

      const company_name = (request.company_name ?? null) as string | null;
      const customer_id = request.customer_id ?? null;

      let username = email;
      let temp_password: string | null = null;

      if (customer_id) {
        const { data: cust, error: custErr } = await supabase
          .from("customers")
          .select("service_username, service_password")
          .eq("id", customer_id)
          .maybeSingle();

        if (!custErr && cust) {
          username = (cust as any).service_username ?? email;
          temp_password = (cust as any).service_password ?? null;
        }
      }

      // Si no hay password guardada, genera nueva y guarda
      if (!temp_password) {
        temp_password = genTempPassword(10);
        if (customer_id) {
          await supabase
            .from("customers")
            .update({ service_password: temp_password, updated_at: new Date().toISOString() })
            .eq("id", customer_id);
        }
      }

      // Resetea password del Auth user (si existe)
      if (customer_id && temp_password) {
        try {
          const user_id = await getAuthUserIdByEmail(email);
          if (user_id) await supabase.auth.admin.updateUserById(user_id, { password: temp_password });
        } catch {
          // no bloqueamos resend por esto
        }
      }

      // Enviar email
      const now = new Date().toISOString();
      let email_sent = false;
      let email_detail: string | null = null;
      let last_email_status: string | null = null;

      try {
        const brevoData = await sendBrevoEmail({
          to: email,
          company_name,
          username,
          temp_password: temp_password!,
        });
        email_sent = true;
        email_detail = brevoData?.messageId ? `SENT (${brevoData.messageId})` : "SENT";
        last_email_status = "SENT";
      } catch (e: any) {
        email_sent = false;
        email_detail = e?.message ?? String(e);
        last_email_status = "FAILED";
      }

      // si no tienes estas columnas, quita este update
      await supabase
        .from("debacu_eval_access_requests")
        .update({
          last_email_status,
          last_email_at: now,
          last_email_detail: email_detail,
          reviewed_by: body?.reviewed_by ?? body?.reviewedBy ?? null,
          reviewed_at: now,
        })
        .eq("id", request_id);

      return json(200, origin, {
        ok: true,
        customer_id,
        credentials: { email, username, temp_password },
        email_sent,
        email_detail,
      });
    }

    return json(400, origin, { error: "Invalid action" });
  } catch (err) {
    return json(500, req.headers.get("origin"), {
      error: "Unhandled error",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
});
