// src/services/subscriptionManage.ts
//
// ✅ Edge Function + patrón del proyecto:
//    - JWT REAL de Supabase (via callEvalFn)
//    - Sin tokens inventados
//    - Sin endpoint manual ".functions.supabase.co"
//
// ✅ Multi-org + retorno post-Stripe:
//    - org_id obligatorio (tu Edge Function lo exige)
//    - return_to para volver al perfil/hotel (evitar volver a /admin)
//
// Requiere: src/services/callEvalFn.ts

import { callEvalFn } from "@/services/callEvalFn";

export type PaidPlanCode = "BASIC" | "MEDIUM" | "PREMIUM";
export type PlanCode = "FREE" | PaidPlanCode;

export type BillingFrequency = "MONTHLY" | "YEARLY" | "FREE_TRIAL";

const DEFAULT_APP_ID = "DEBACU_EVAL";
const FN_NAME = "debacu_eval_subscription_manage";

/** Acciones soportadas por el backend */
export type SubscriptionManageAction = "CHANGE" | "SCHEDULE_DOWNGRADE" | "CANCEL_DOWNGRADE";

/** Params comunes */
type BaseParams = {
  customer_id: string;
  org_id: string; // ✅ requerido por tu Edge Function (requireOrgContext)
  app_id?: string;

  /** ✅ para forzar el return al hotel/perfil (y NO a /admin) */
  return_to?: string;

  billing_frequency?: Exclude<BillingFrequency, "FREE_TRIAL">;
};

/** ✅ Unión discriminada por action (tipado correcto) */
export type ManagePlanParams =
  | (BaseParams & {
      action: "CHANGE";
      target_plan_code: PaidPlanCode;
    })
  | (BaseParams & {
      action: "SCHEDULE_DOWNGRADE";
      target_plan_code: PaidPlanCode;
    })
  | (BaseParams & {
      action: "CANCEL_DOWNGRADE";
      // NO target_plan_code aquí
    });

/** Response al hacer CHANGE (upgrade) */
export interface ChangePlanResponse {
  checkout_url: string;
  pending_subscription_id?: string;
}

/** Response al hacer SCHEDULE_DOWNGRADE (next_cycle) */
export interface ScheduleDowngradeResponse {
  ok: true;
  scheduled: boolean;
  effective_date?: string | null;
  current_plan_code?: PaidPlanCode | null;
  target_plan_code?: PaidPlanCode | null;
}

/** Response al hacer CANCEL_DOWNGRADE */
export interface CancelDowngradeResponse {
  ok: true;
}

/** Union de responses */
export type ManagePlanResponse = ChangePlanResponse | ScheduleDowngradeResponse | CancelDowngradeResponse;

/** Errores tipados (opcional) */
export type PendingChangeError = Error & {
  code?: string;
  pending_subscription_id?: string;
  status?: number;
};

/** Helpers */
function pickPendingId(obj: any): string | undefined {
  const v =
    obj?.pending_subscription_id ??
    obj?.pendingSubscriptionId ??
    obj?.pending_subscription?.id ??
    obj?.pending?.id ??
    undefined;

  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function pickCode(obj: any): string | undefined {
  const v = obj?.code ?? obj?.error_code ?? obj?.errorCode ?? obj?.detail ?? undefined;
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function pickStatus(err: any): number | undefined {
  const s = err?.status ?? err?.statusCode ?? err?.response?.status ?? err?.cause?.status ?? undefined;
  return typeof s === "number" ? s : undefined;
}

function pickPayload(err: any): any {
  return err?.payload ?? err?.data ?? err?.response?.data ?? err?.cause?.payload ?? undefined;
}

function isLikelyPendingChange(err: any): boolean {
  const status = pickStatus(err);
  if (status === 409) return true;

  const payload = pickPayload(err);
  const code = pickCode(payload) ?? pickCode(err);
  if (code && String(code).toUpperCase().includes("PENDING")) return true;

  const msg = String(err?.message ?? "").toUpperCase();
  if (msg.includes("PENDING") || msg.includes("409")) return true;

  return false;
}

/**
 * API principal:
 * - action CHANGE -> devuelve checkout_url
 * - action SCHEDULE_DOWNGRADE -> devuelve ok/scheduled/effective_date...
 * - action CANCEL_DOWNGRADE -> devuelve ok
 *
 * IMPORTANTE:
 * - El backend debe devolver 409 cuando ya hay un PENDING_PAYMENT,
 *   con payload { error, detail/code, pending_subscription_id } (o pendingSubscriptionId)
 */
export async function managePlan(params: ManagePlanParams): Promise<ManagePlanResponse> {
  // Body limpio según action
  const body: any = {
    action: params.action,
    customer_id: params.customer_id,
    org_id: params.org_id, // ✅
    app_id: params.app_id ?? DEFAULT_APP_ID,
    return_to: params.return_to ?? undefined, // ✅ opcional
  };

  if (params.action === "CHANGE" || params.action === "SCHEDULE_DOWNGRADE") {
    body.target_plan_code = params.target_plan_code;
    body.billing_frequency = params.billing_frequency ?? "MONTHLY";
  }

  let payload: any;
  try {
    payload = await callEvalFn<any>(FN_NAME, body);
  } catch (e: any) {
    // Normaliza error -> si es pending-change, expone campos útiles a la UI
    const err = new Error(String(e?.message ?? "No se pudo completar la operación.")) as PendingChangeError;

    const status = pickStatus(e);
    if (typeof status === "number") err.status = status;

    const p = pickPayload(e);
    const code = pickCode(p) ?? pickCode(e);
    const pendingId = pickPendingId(p) ?? pickPendingId(e);

    if (isLikelyPendingChange(e)) {
      err.code = code ?? "PENDING_CHANGE";
      err.pending_subscription_id = pendingId;
    }

    throw err;
  }

  // ✅ CHANGE
  if (params.action === "CHANGE") {
    const checkout_url = payload?.checkout_url ?? payload?.checkoutUrl ?? null;
    const pending_subscription_id = pickPendingId(payload);

    if (!checkout_url) throw new Error("La respuesta del servidor no contiene checkout_url.");
    return { checkout_url, pending_subscription_id };
  }

  // ✅ CANCEL_DOWNGRADE
  if (params.action === "CANCEL_DOWNGRADE") {
    const ok = Boolean(payload?.ok);
    if (!ok) throw new Error(payload?.error ?? "No se pudo cancelar la bajada programada.");
    return { ok: true };
  }

  // ✅ SCHEDULE_DOWNGRADE
  const ok = Boolean(payload?.ok ?? true);
  const scheduled = Boolean(payload?.scheduled ?? true);

  if (!ok) throw new Error(payload?.error ?? "No se pudo programar la bajada de plan.");

  return {
    ok: true,
    scheduled,
    effective_date: payload?.effective_date ?? payload?.effectiveDate ?? null,
    current_plan_code: payload?.current_plan_code ?? payload?.currentPlanCode ?? null,
    target_plan_code:
      payload?.target_plan_code ??
      payload?.targetPlanCode ??
      // fallback al target del request
      ("target_plan_code" in params ? params.target_plan_code : null),
  };
}

/** Compat: upgrade (CHANGE) */
export interface ChangePlanParams {
  target_plan_code: PaidPlanCode;
  customer_id: string;
  org_id: string; // ✅
  billing_frequency?: Exclude<BillingFrequency, "FREE_TRIAL">;
  app_id?: string;
  return_to?: string; // ✅
}

export async function changePlan(params: ChangePlanParams): Promise<ChangePlanResponse> {
  const res = await managePlan({
    action: "CHANGE",
    target_plan_code: params.target_plan_code,
    billing_frequency: params.billing_frequency ?? "MONTHLY",
    customer_id: params.customer_id,
    org_id: params.org_id,
    app_id: params.app_id ?? DEFAULT_APP_ID,
    return_to: params.return_to,
  });

  return res as ChangePlanResponse;
}

/** Downgrade (next_cycle) */
export async function scheduleDowngrade(params: ChangePlanParams): Promise<ScheduleDowngradeResponse> {
  const res = await managePlan({
    action: "SCHEDULE_DOWNGRADE",
    target_plan_code: params.target_plan_code,
    billing_frequency: params.billing_frequency ?? "MONTHLY",
    customer_id: params.customer_id,
    org_id: params.org_id,
    app_id: params.app_id ?? DEFAULT_APP_ID,
    return_to: params.return_to,
  });

  return res as ScheduleDowngradeResponse;
}

/** Cancel downgrade */
export async function cancelDowngrade(params: {
  customer_id: string;
  org_id: string; // ✅
  app_id?: string;
  return_to?: string; // ✅
}): Promise<CancelDowngradeResponse> {
  const res = await managePlan({
    action: "CANCEL_DOWNGRADE",
    customer_id: params.customer_id,
    org_id: params.org_id,
    app_id: params.app_id ?? DEFAULT_APP_ID,
    return_to: params.return_to,
  });

  return res as CancelDowngradeResponse;
}