// supabase/functions/customer_audit_export_generate/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

/** ======================================================
 * CONFIG
 * ====================================================== */
const APP_CODE = "DEBACU_EVAL";
const STORAGE_BUCKET = "customer-exports";

/** ======================================================
 * INPUT
 * ====================================================== */
type ReqBody = {
  org_id?: string | null; // ✅ multi-org recomendado

  export_type: "PDF" | "CSV";
  export_scope: string;

  period_from: string; // yyyy-mm-dd
  period_to: string; // yyyy-mm-dd
  filters?: unknown;
  storage_bucket?: string; // ignorado
};

function assertDate(s: string, name: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`invalid_${name}`);
}

function normalizeFilters(v: unknown): Record<string, unknown> {
  if (!v) return {};
  if (typeof v === "object") return v as Record<string, unknown>;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      // ignore
    }
  }
  return {};
}

function safeScope(scope: string) {
  return String(scope ?? "").trim();
}

/** ======================================================
 * MULTI-ORG + ENTITLEMENTS
 * ====================================================== */
async function resolveOrgIdForUserOrThrow(
  admin: ReturnType<typeof createClient>,
  userId: string,
  requestedOrgId?: string | null
): Promise<{ org_id: string; role: string | null }> {
  // 1) org_id explícito: validar membership
  if (requestedOrgId) {
    // si existe status, usamos ACTIVE; si no, fallback
    try {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id, role")
        .eq("org_id", requestedOrgId)
        .eq("user_id", userId)
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (error) throw error;
      if (!data?.org_id) throw new Error("FORBIDDEN_NOT_MEMBER");
      return { org_id: String(data.org_id), role: (data.role ?? null) as string | null };
    } catch {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id, role")
        .eq("org_id", requestedOrgId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw new Error(`MEMBERSHIP_LOOKUP_FAILED:${error.message}`);
      if (!data?.org_id) throw new Error("FORBIDDEN_NOT_MEMBER");
      return { org_id: String(data.org_id), role: (data.role ?? null) as string | null };
    }
  }

  // 2) fallback determinista: primera membership (ideal ACTIVE)
  try {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, role, created_at")
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data?.org_id) throw new Error("FORBIDDEN_NO_ORG");
    return { org_id: String(data.org_id), role: (data.role ?? null) as string | null };
  } catch {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, role, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`MEMBERSHIP_LOOKUP_FAILED:${error.message}`);
    if (!data?.org_id) throw new Error("FORBIDDEN_NO_ORG");
    return { org_id: String(data.org_id), role: (data.role ?? null) as string | null };
  }
}

type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  subscription_status: string | null;
  plan_code: string | null;
  max_users: number | null;
  seats_used: number | null;
};

async function loadEntitlementsOrThrow(admin: ReturnType<typeof createClient>, orgId: string) {
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, subscription_status, plan_code, max_users, seats_used")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`ENTITLEMENTS_FAILED:${error.message}`);
  if (!data?.org_id) throw new Error("FORBIDDEN_NO_ENTITLEMENTS");
  return data as EntitlementsRow;
}

function assertOrgActiveOrThrow(ent: EntitlementsRow) {
  if (ent.subscription_status !== "ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
  if (!ent.customer_id) throw new Error("FORBIDDEN_NO_CUSTOMER");
}

/** ======================================================
 * ERROR MAPPING
 * ====================================================== */
function mapError(e: unknown): { status: number; detail: string } {
  const msg = String((e as any)?.message ?? e ?? "request_failed");

  if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") return { status: 401, detail: "UNAUTHENTICATED" };
  if (msg === "PLAN_NOT_ACTIVE") return { status: 402, detail: "PLAN_NOT_ACTIVE" };

  if (
    msg.startsWith("FORBIDDEN") ||
    msg.startsWith("MEMBERSHIP_LOOKUP_FAILED") ||
    msg.startsWith("ENTITLEMENTS_FAILED")
  ) {
    return { status: 403, detail: msg.startsWith("FORBIDDEN") ? msg : "FORBIDDEN" };
  }

  if (
    msg.startsWith("missing_") ||
    msg.startsWith("invalid_") ||
    msg === "invalid_json" ||
    msg === "invalid_export_type" ||
    msg === "invalid_export_scope"
  ) {
    return { status: 400, detail: msg };
  }

  return { status: 500, detail: "INTERNAL" };
}

/** ======================================================
 * MAIN
 * ====================================================== */
export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "method_not_allowed", detail: "method_not_allowed" });
  }

  const admin = supabaseServiceClient(); // ✅ service role

  try {
    const user = await requireUser(req);

    const body = (await req.json().catch(() => null)) as ReqBody | null;
    if (!body) throw new Error("invalid_json");

    const export_type = String(body.export_type ?? "").toUpperCase();
    const export_scope = safeScope(body.export_scope);

    if (export_type !== "PDF" && export_type !== "CSV") throw new Error("invalid_export_type");
    if (!export_scope) throw new Error("invalid_export_scope");

    const period_from = String(body.period_from ?? "").trim();
    const period_to = String(body.period_to ?? "").trim();

    assertDate(period_from, "period_from");
    assertDate(period_to, "period_to");
    if (period_from > period_to) throw new Error("invalid_period_range");

    const filters = normalizeFilters(body.filters);

    // ✅ multi-org: resolver org + entitlements
    const { org_id, role } = await resolveOrgIdForUserOrThrow(
      admin,
      user.id,
      body.org_id ? String(body.org_id) : null
    );

    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertOrgActiveOrThrow(ent);

    // ✅ no confiar en FE
    const storage_bucket = STORAGE_BUCKET;

    /**
     * Creamos una solicitud PENDING en la tabla definitiva.
     * Nota: si tu schema NO tiene algunos campos, quítalos del insert.
     */
    const insertRow: Record<string, unknown> = {
      // Identidad + tenancy
      org_id,
      customer_id: ent.customer_id, // si existe columna; si no, borrar
      app_code: APP_CODE, // si existe columna; si no, borrar

      // Quien lo pidió
      requested_by_user_id: user.id, // si existe; si no, usar generated_by_user_id
      requested_by_role: role,
      requested_by_email: user.email ?? null,

      // Qué se pide
      export_type,
      export_scope,
      period_from,
      period_to,
      filters,

      // Estado pipeline
      status: "PENDING",

      // Storage reservado
      storage_bucket,
      storage_path: "",
      meta: {
        app_code: APP_CODE,
        org_id,
        customer_id: ent.customer_id,
        requested_by_role: role,
      },
    };

    // Si tu tabla es customer_audit_exports y NO la quieres tocar todavía,
    // cambia aquí el nombre. Mi recomendación: unificar con debacu_eval_audit_exports.
    const { data: created, error: insErr } = await admin
      .from("debacu_eval_audit_exports")
      .insert(insertRow as any)
      .select("id, created_at, status")
      .maybeSingle();

    if (insErr || !created?.id) throw new Error("CREATE_FAILED");

    return json(req, 200, {
      ok: true,
      export_id: created.id,
      status: created.status ?? "PENDING",
      created_at: created.created_at ?? null,
    });
  } catch (e) {
    const mapped = mapError(e);
    return json(req, mapped.status, { ok: false, error: "request_failed", detail: mapped.detail });
  }
});
