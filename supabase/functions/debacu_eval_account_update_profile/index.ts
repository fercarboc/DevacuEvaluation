// supabase/functions/debacu_eval_account_update_profile/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

const APP_ID = "DEBACU_EVAL";

/* ======================================================
 * Types
 * ====================================================== */
type ReqBody = {
  org_id?: string; // ✅ recomendado SIEMPRE
  patch: {
    name?: string | null;
    nif?: string | null;
    address?: string | null;
    postal_code?: string | null;
    city?: string | null;
    province?: string | null;
    country?: string | null;
    phone?: string | null;
    email?: string | null;

    // extras opcionales
    commercial_name?: string | null;
    legal_name?: string | null;
    billing_email?: string | null;
    billing_phone?: string | null;
    contact_person?: string | null;
    contact_role?: string | null;
  };
};

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

/** ======================================================
 * build update patch (NO pisa con null si no viene)
 * - undefined => no tocar columna
 * - null => borrar columna
 * ====================================================== */
function buildCustomerUpdate(patch: ReqBody["patch"]) {
  const u: Record<string, any> = {};

  const setIfDefined = (key: string, value: any) => {
    if (value !== undefined) u[key] = value;
  };

  // UI manda "name" como nombre comercial: guardo ambos
  if (patch.name !== undefined) {
    setIfDefined("name", patch.name);
    setIfDefined("commercial_name", patch.name);
  }

  setIfDefined("nif", patch.nif);
  setIfDefined("address", patch.address);
  setIfDefined("postal_code", patch.postal_code);
  setIfDefined("city", patch.city);
  setIfDefined("province", patch.province);

  if (patch.country !== undefined) {
    const c = typeof patch.country === "string" ? patch.country.trim() : patch.country;
    setIfDefined("country", typeof c === "string" ? c.toUpperCase() : c);
  }

  setIfDefined("phone", patch.phone);
  setIfDefined("email", patch.email);

  // Extras
  setIfDefined("commercial_name", patch.commercial_name);
  setIfDefined("legal_name", patch.legal_name);
  setIfDefined("billing_email", patch.billing_email);
  setIfDefined("billing_phone", patch.billing_phone);
  setIfDefined("contact_person", patch.contact_person);
  setIfDefined("contact_role", patch.contact_role);

  return u;
}

/* ======================================================
 * Tenant helpers
 * ====================================================== */
async function resolveOrgForUser(params: {
  admin: ReturnType<typeof supabaseServiceClient>;
  user_id: string;
  org_id?: string | null;
}) {
  const { admin, user_id } = params;
  const requestedOrgId = safeStr(params.org_id) || null;

  // ✅ Ajusta si tu tabla no tiene status. En Debacu normalmente sí.
  let q = admin
    .from("debacu_eval_org_members")
    .select("org_id, role, created_at")
    .eq("user_id", user_id)
    .eq("status", "ACTIVE");

  if (requestedOrgId) q = q.eq("org_id", requestedOrgId);

  const { data, error } = await q.order("created_at", { ascending: true }).limit(1);

  if (error) throw new Error("DB_MEMBERSHIP_FAILED");
  const mem = (data ?? [])[0];

  if (!mem?.org_id) {
    throw new Error(requestedOrgId ? "FORBIDDEN_ORG_NOT_ALLOWED" : "FORBIDDEN_NO_ACTIVE_ORG");
  }

  return { org_id: String(mem.org_id), role: mem.role ?? null };
}

async function resolveCustomerId(params: {
  admin: ReturnType<typeof supabaseServiceClient>;
  org_id: string;
}) {
  const { admin, org_id } = params;

  // 1) entitlements view (si existe)
  try {
    const { data: ent, error: entErr } = await admin
      .from("debacu_eval_org_entitlements_v")
      .select("customer_id")
      .eq("org_id", org_id)
      .maybeSingle();

    if (!entErr && ent?.customer_id) return String(ent.customer_id);
  } catch {
    // ignore
  }

  // 2) fallback organizations
  const { data: org, error: orgErr } = await admin
    .from("debacu_eval_organizations")
    .select("customer_id")
    .eq("id", org_id)
    .maybeSingle();

  if (orgErr) throw new Error("DB_ORG_LOOKUP_FAILED");
  if (!org?.customer_id) throw new Error("FORBIDDEN_NO_CUSTOMER");
  return String(org.customer_id);
}

/* ======================================================
 * Handler
 * ====================================================== */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "request_failed", detail: "METHOD_NOT_ALLOWED" });
  }

  // ✅ JWT-only
  let userId = "";
  try {
    const user = await requireUser(req);
    userId = user.id;
  } catch {
    return json(req, 401, { ok: false, error: "request_failed", detail: "UNAUTHENTICATED" });
  }

  const body = await readJsonSafe<ReqBody>(req);
  if (!body) {
    return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_json" });
  }

  if (!body.patch || typeof body.patch !== "object") {
    return json(req, 400, { ok: false, error: "request_failed", detail: "missing_patch" });
  }

  const update = buildCustomerUpdate(body.patch);
  if (Object.keys(update).length === 0) {
    return json(req, 400, { ok: false, error: "request_failed", detail: "patch_empty" });
  }

  const admin = supabaseServiceClient();

  try {
    // ✅ resolver customer_id por org_id (no confiar en customer_id del cliente)
    const { org_id } = await resolveOrgForUser({
      admin,
      user_id: userId,
      org_id: safeStr(body.org_id) || null,
    });

    const customer_id = await resolveCustomerId({ admin, org_id });

    // (Opcional pero recomendable) blindaje por app
    const { data: cust, error: custErr } = await admin
      .from("customers")
      .select("id, app_id")
      .eq("id", customer_id)
      .maybeSingle();

    if (custErr) {
      return json(req, 500, { ok: false, error: "request_failed", detail: "DB_CUSTOMER_READ_FAILED" });
    }
    if (!cust?.id) {
      return json(req, 404, { ok: false, error: "request_failed", detail: "CUSTOMER_NOT_FOUND" });
    }
    if (cust.app_id && String(cust.app_id) !== APP_ID) {
      return json(req, 403, { ok: false, error: "request_failed", detail: "FORBIDDEN" });
    }

    // ✅ update customers
    const { error: updErr } = await admin.from("customers").update(update).eq("id", customer_id);
    if (updErr) {
      return json(req, 500, { ok: false, error: "request_failed", detail: "DB_UPDATE_FAILED" });
    }

    return json(req, 200, { ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "INTERNAL_ERROR";

    if (msg === "FORBIDDEN_ORG_NOT_ALLOWED" || msg === "FORBIDDEN_NO_ACTIVE_ORG" || msg === "FORBIDDEN_NO_CUSTOMER") {
      return json(req, 403, { ok: false, error: "request_failed", detail: "FORBIDDEN" });
    }

    if (msg === "DB_MEMBERSHIP_FAILED" || msg === "DB_ORG_LOOKUP_FAILED") {
      return json(req, 500, { ok: false, error: "request_failed", detail: "DB_ERROR" });
    }

    return json(req, 500, { ok: false, error: "request_failed", detail: "INTERNAL_ERROR" });
  }
});
