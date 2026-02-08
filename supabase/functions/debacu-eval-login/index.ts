// supabase/functions/debacu-eval-login/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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

function errorTyped(
  origin: string | null,
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return json(origin, status, {
    error: message,
    error_obj: { code, message, ...extra },
  });
}

/** ======================================================
 *  Helpers
 *  ====================================================== */
function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function nowISO() {
  return new Date().toISOString();
}

function addDaysISO(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function randomTokenHex(bytesLen = 32) {
  const bytes = new Uint8Array(bytesLen);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeLowerEmail(v: any) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

function toYMD(v: any): string | null {
  if (!v) return null;
  const s = String(v);
  // si viene como "2026-02-05T..." recortamos
  return s.length >= 10 ? s.slice(0, 10) : null;
}

function todayYMD(): string {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  try {
    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const SERVICE_ROLE = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));
    const username = String(body?.username ?? "").trim();
    const password = String(body?.password ?? "").trim();
    const app_code = String(body?.appCode ?? body?.app_code ?? "DEBACU_EVAL").trim();

    if (!username || !password) {
      return errorTyped(origin, 400, "MISSING_CREDENTIALS", "Faltan credenciales");
    }

    /** ------------------------------------------------------
     *  1) customer por username/password (snake_case)
     *  ------------------------------------------------------ */
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select(
        [
          "id",
          "name",
          "email",
          "is_active",
          "service_username",
          "service_password",
          "start_date",
          "sector_id",
        ].join(","),
      )
      .eq("service_username", username)
      .eq("service_password", password)
      .maybeSingle();

    if (customerError) {
      console.error("customers error:", customerError);
      return errorTyped(origin, 500, "DB_CUSTOMERS", "Error DB customers", {
        detail: customerError.message,
      });
    }

    if (!customer) return errorTyped(origin, 401, "BAD_CREDENTIALS", "Usuario o contraseña incorrectos");
    if (customer.is_active === false) return errorTyped(origin, 403, "CUSTOMER_INACTIVE", "Cliente inactivo");

    const sector_id = String(customer.sector_id ?? "").trim();
    const is_admin = sector_id === "ADMIN";

    const email = safeLowerEmail(customer.email);
    if (!email) {
      return errorTyped(origin, 409, "MISSING_EMAIL", "Cliente sin email. Registre un email para activar acceso.");
    }

    const customer_id = customer.id;
/** ------------------------------------------------------
 *  2) subscription para esta app
 *     - Primero: buscamos una ACTIVA/TRIAL_ACTIVE
 *     - Si no hay: buscamos la última para reportar status
 *  ------------------------------------------------------ */
let sub: any = null;

if (!is_admin) {
  // 2.1) Intentar coger la suscripción válida (ACTIVE/TRIAL_ACTIVE)
  const { data: activeSubs, error: activeErr } = await supabase
    .from("subscriptions")
    .select("id, plan_id, status, start_date, end_date, next_billing_date, billing_frequency, created_at, updated_at")
    .eq("customer_id", customer_id)
    .eq("app_id", app_code)
    .in("status", ["ACTIVE", "TRIAL_ACTIVE"])
    .order("start_date", { ascending: false })
    .order("updated_at", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);

  if (activeErr) {
    console.error("subscriptions(active) error:", activeErr);
    return errorTyped(origin, 500, "DB_SUBSCRIPTIONS", "Error DB subscriptions", {
      detail: activeErr.message,
    });
  }

  if (activeSubs && activeSubs.length > 0) {
    sub = activeSubs[0];
  } else {
    // 2.2) No hay activa: buscamos la última “cualquiera” para poder diferenciar NO_SUBSCRIPTION vs EXPIRED/etc
    const { data: lastSubs, error: lastErr } = await supabase
      .from("subscriptions")
      .select("id, plan_id, status, start_date, end_date, next_billing_date, billing_frequency, created_at, updated_at")
      .eq("customer_id", customer_id)
      .eq("app_id", app_code)
      .order("start_date", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    if (lastErr) {
      console.error("subscriptions(last) error:", lastErr);
      return errorTyped(origin, 500, "DB_SUBSCRIPTIONS", "Error DB subscriptions", {
        detail: lastErr.message,
      });
    }

    sub = (lastSubs && lastSubs.length > 0) ? lastSubs[0] : null;

    if (!sub) {
      return errorTyped(
        origin,
        403,
        "NO_SUBSCRIPTION",
        "No tienes una suscripción para esta aplicación.",
        { app_code },
      );
    }

    const status = String(sub.status ?? "").toUpperCase();
    return errorTyped(
      origin,
      403,
      "SUBSCRIPTION_NOT_ACTIVE",
      "No tienes una suscripción activa para esta aplicación.",
      { status, app_code },
    );
  }

  // 2.3) Si es TRIAL_ACTIVE, valida fechas (si está caducada => EXPIRED)
  const status = String(sub.status ?? "").toUpperCase();
  const endYMD = toYMD(sub.end_date);
  const today = todayYMD();

  if (status === "TRIAL_ACTIVE" && endYMD && endYMD < today) {
    return errorTyped(
      origin,
      403,
      "SUBSCRIPTION_NOT_ACTIVE",
      "No tienes una suscripción activa para esta aplicación.",
      { status: "EXPIRED", app_code },
    );
  }
}

    /** ------------------------------------------------------
     *  3) plan (si admin, forzamos)
     *  ------------------------------------------------------ */
    let planType = is_admin ? "ADMIN" : "UNKNOWN";
    let monthlyFee = 0;
    let planCode: string | null = null;

    if (!is_admin && sub?.plan_id) {
      const { data: plan, error: planError } = await supabase
        .from("plans")
        .select("id, name, code, price_monthly")
        .eq("id", sub.plan_id)
        .maybeSingle();

      if (planError) {
        console.error("plans error:", planError);
      } else if (plan) {
        planCode = String(plan.code ?? "").toUpperCase();
        if (planCode === "FREE") planType = "FREE";
        else if (planCode.includes("BASIC")) planType = "BASIC";
        else if (planCode.includes("MEDIUM")) planType = "MEDIUM";
        else if (planCode.includes("PREMIUM")) planType = "PREMIUM";
        else planType = planCode || "UNKNOWN";

        monthlyFee = Number(plan.price_monthly ?? 0);
      }
    }

    /** ------------------------------------------------------
     *  4) asegurar usuario en Auth (best-effort)
     *  ------------------------------------------------------ */
    const { data: list, error: listError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listError) {
      console.error("auth.listUsers error:", listError);
      return errorTyped(origin, 500, "AUTH_LIST_USERS", "Error listando usuarios Auth", {
        detail: listError.message,
      });
    }

    const existing = (list?.users ?? []).find(
      (u) => String(u.email ?? "").trim().toLowerCase() === email,
    );

    if (!existing) {
      const { error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createError) {
        console.error("auth.createUser error:", createError);
        return errorTyped(origin, 500, "AUTH_CREATE_USER", "Error creando usuario Auth", {
          detail: createError.message,
        });
      }
    }

    /** ------------------------------------------------------
     *  4.5) sesión propia para Edge (debacu_eval_sessions)
     *  ------------------------------------------------------ */
    const session_token = randomTokenHex(32);
    const expires_at = addDaysISO(7);

    const { error: revokeErr } = await supabase
      .from("debacu_eval_sessions")
      .update({ revoked_at: nowISO() })
      .eq("customer_id", customer_id)
      .eq("app_code", app_code)
      .is("revoked_at", null);

    if (revokeErr) {
      console.error("sessions revoke error:", revokeErr);
      return errorTyped(origin, 500, "SESSIONS_REVOKE", "Error revocando sesiones", {
        detail: revokeErr.message,
      });
    }

    const { error: sessErr } = await supabase
      .from("debacu_eval_sessions")
      .insert({
        token: session_token,
        app_code,
        customer_id,
        customer_name: customer.name ?? username,
        expires_at,
        revoked_at: null,
        created_at: nowISO(), // elimina si tu tabla no tiene created_at
      });

    if (sessErr) {
      console.error("sessions insert error:", sessErr);
      return errorTyped(origin, 500, "SESSIONS_INSERT", "Error creando sesión", {
        detail: sessErr.message,
      });
    }

    /** ------------------------------------------------------
     *  5) respuesta OK
     *  ------------------------------------------------------ */
    const user_payload = {
      id: customer_id,
      customerId: customer_id,
      username: customer.service_username ?? username,
      fullName: customer.name ?? "Cliente",
      email,
      plan: planType,
      planCode,
      planStartDate: customer.start_date ?? (sub?.start_date ?? ""),
      monthlyFee,
      isAdmin: is_admin,
      subscriptionStatus: sub?.status ?? (is_admin ? "ADMIN" : null),
      billingFrequency: sub?.billing_frequency ?? null,
      subscriptionId: sub?.id ?? null,
    };

    return json(origin, 200, {
      ok: true,
      authEmail: email,
      session_token,
      user: user_payload,
    });
  } catch (error) {
    console.error("FATAL login error:", error);
    return errorTyped(origin, 500, "LOGIN_FATAL", "Error creando sesión", {
      detail: String((error as any)?.message ?? error),
    });
  }
});
