// supabase/functions/debacu-eval-login/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(200, { ok: true });

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
      return json(400, { error: "Faltan credenciales" });
    }

    // 1) customer por username/password (snake_case)
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("id, name, email, is_active, service_username, service_password, start_date, sector_id")
      .eq("service_username", username)
      .eq("service_password", password)
      .maybeSingle();

    if (customerError) {
      console.error("customers error:", customerError);
      return json(500, { error: "Error DB customers", detail: customerError.message });
    }

    if (!customer) return json(401, { error: "Usuario o contraseña incorrectos" });
    if (customer.is_active === false) return json(403, { error: "Cliente inactivo" });

    const sector_id = String(customer.sector_id ?? "").trim();
    const is_admin = sector_id === "ADMIN";

    const email = String(customer.email ?? "").trim().toLowerCase();
    if (!email) {
      return json(409, { error: "Cliente sin email. Registre un email para activar acceso." });
    }

    const customer_id = customer.id;

    // 2) subscription activa para esta app (solo si NO es admin)
    let sub: any = null;

    if (!is_admin) {
      const { data: subData, error: subError } = await supabase
        .from("subscriptions")
        .select("id, plan_id, status, start_date, next_billing_date")
        .eq("customer_id", customer_id)
        .eq("app_id", app_code)
        .eq("status", "ACTIVE")
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subError) {
        console.error("subscriptions error:", subError);
        return json(500, { error: "Error DB subscriptions", detail: subError.message });
      }

      sub = subData;

      if (!sub) {
        return json(403, { error: "Su plan no incluye acceso a esta aplicación" });
      }
    }

    // 3) plan (si admin, forzamos)
    let planType = is_admin ? "ADMIN" : "BASIC";
    let monthlyFee = 0;

    if (!is_admin && sub?.plan_id) {
      const { data: plan, error: planError } = await supabase
        .from("plans")
        .select("id, name, code, price_monthly")
        .eq("id", sub.plan_id)
        .maybeSingle();

      if (planError) {
        console.error("plans error:", planError);
      } else if (plan) {
        const code = String(plan.code ?? "").toUpperCase();
        if (code.includes("BASIC")) planType = "BASIC";
        else if (code.includes("PRO")) planType = "PROFESSIONAL";
        else if (code.includes("ENTER")) planType = "ENTERPRISE";
        monthlyFee = Number(plan.price_monthly ?? 0);
      }
    }

    // 4) Asegurar usuario en Supabase Auth (best-effort, sin romper si ya existe)
    const { data: list, error: listError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    if (listError) {
      console.error("auth.listUsers error:", listError);
      return json(500, { error: "Error listando usuarios Auth", detail: listError.message });
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
        return json(500, { error: "Error creando usuario Auth", detail: createError.message });
      }
    }

    // 4.5) Crear/renovar sesión propia para Edge Functions (debacu_eval_sessions)
    // ⚠️ TODO en snake_case y SIN customer_email (porque NO existe en tu tabla)
    const session_token = randomTokenHex(32);
    const expires_at = addDaysISO(7); // 7 días (ajusta si quieres)

    // Revocar sesiones previas activas (opcional pero recomendable)
    const { error: revokeErr } = await supabase
      .from("debacu_eval_sessions")
      .update({ revoked_at: nowISO() })
      .eq("customer_id", customer_id)
      .eq("app_code", app_code)
      .is("revoked_at", null);

    if (revokeErr) {
      console.error("sessions revoke error:", revokeErr);
      return json(500, { error: "Error revocando sesiones", detail: revokeErr.message });
    }

    // Insert nueva sesión (ajusta columnas EXACTAS a tu tabla)
    const { error: sessErr } = await supabase
      .from("debacu_eval_sessions")
      .insert({
        token: session_token,
        app_code,
        customer_id,
        customer_name: customer.name ?? username, // ✅ NO uses customer_email
        expires_at,
        revoked_at: null,
      });

    if (sessErr) {
      console.error("sessions insert error:", sessErr);
      return json(500, { error: "Error creando sesión", detail: sessErr.message });
    }

    // 5) Respuesta para frontend (✅ devolvemos session_token)
    const user_payload = {
      id: customer_id,
      customerId: customer_id, // (UI) si luego quieres, puedes migrarlo a snake_case también
      username: customer.service_username ?? username,
      fullName: customer.name ?? "Cliente",
      email,
      plan: planType,
      planStartDate: customer.start_date ?? (sub?.start_date ?? ""),
      monthlyFee,
      isAdmin: is_admin,
    };

    return json(200, {
      ok: true,
      authEmail: email,
      session_token, // ✅ IMPORTANTE para x-session-token en las Edge Functions
      user: user_payload,
    });
  } catch (error) {
    console.error("FATAL login error:", error);
    return json(500, {
      error: "Error creando sesión",
      detail: String((error as any)?.message ?? error),
    });
  }
});
