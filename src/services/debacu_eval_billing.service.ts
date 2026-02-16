// src/services/debacu_eval_billing.service.ts
import { supabase } from "@/services/supabaseClient";
import { EvalApiError } from "@/services/evalApi";

const APP_CODE = "DEBACU_EVAL";

export type PlanCode = "BASIC" | "MEDIUM" | "PREMIUM";
export type BillingFrequency = "MONTHLY" | "YEARLY";

type CheckoutOkShape1 = { url: string };
type CheckoutOkShape2 = { ok: true; data: { url: string } };
type CheckoutErrShape = { ok: false; error_obj?: any };

function extractUrl(payload: any): string | null {
  if (!payload) return null;
  if (typeof payload.url === "string" && payload.url) return payload.url;
  if (payload.ok === true && typeof payload.data?.url === "string" && payload.data.url) return payload.data.url;
  return null;
}

export async function createCheckoutForPlan(input: {
  plan_code: PlanCode;
  billing_frequency?: BillingFrequency; // opcional
}) {
  // 1) JWT real
  const { data: s, error: sErr } = await supabase.auth.getSession();
  if (sErr) {
    throw new EvalApiError("No se pudo leer la sesión.", {
      status: 401,
      error_obj: { code: "SESSION_ERROR", message: sErr.message },
    });
  }

  const accessToken = s.session?.access_token;
  if (!accessToken) {
    throw new EvalApiError("No hay sesión activa. Inicia sesión y vuelve a intentarlo.", {
      status: 401,
      error_obj: { code: "UNAUTHENTICATED" },
    });
  }

  // 2) Invocar Edge Function (JWT-only)
  const { data, error } = await supabase.functions.invoke("debacu-eval-subscription-checkout-create", {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: {
      app_code: APP_CODE,
      plan_code: input.plan_code,
      billing_frequency: input.billing_frequency ?? "MONTHLY",
    },
  });

  // Fallo hard (invocación / red / 5xx)
  if (error) {
    throw new EvalApiError(error.message || "Checkout error", {
      status: 500,
      error_obj: { code: "FN_INVOKE_ERROR", message: error.message },
    });
  }

  // 3) Si la función devuelve paywall/errores en JSON (ok:false)
  if ((data as CheckoutErrShape)?.ok === false) {
    const eo = (data as CheckoutErrShape).error_obj ?? { code: "CHECKOUT_FAILED" };
    throw new EvalApiError(eo?.message ?? "Checkout error", {
      status: 400,
      error_obj: eo,
    });
  }

  // 4) Compatibilidad: {url} o {ok:true,data:{url}}
  const url = extractUrl(data as CheckoutOkShape1 | CheckoutOkShape2);
  if (!url) {
    throw new EvalApiError("Checkout sin URL (respuesta inválida).", {
      status: 500,
      error_obj: { code: "INVALID_CHECKOUT_RESPONSE", raw: data },
    });
  }

  return { url };
}
