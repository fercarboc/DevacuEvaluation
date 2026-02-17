// supabase/functions/client_audit_view/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_ID = "DEBACU_EVAL";

/**
 * Ajusta si tu schema usa otra columna/valor.
 * Lo correcto es tener estado y validar ACTIVE.
 */
const MEMBERSHIP_STATUS_COLUMN = "status";
const MEMBERSHIP_ACTIVE_VALUE = "ACTIVE";

type ReqBody = {
  org_id?: string; // recomendado: UI siempre manda org_id
  source_audit_id?: string | null;
};

function supabaseServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

async function resolveOrgMemberOrThrow(
  admin: ReturnType<typeof supabaseServiceClient>,
  userId: string,
  requestedOrgId?: string | null,
) {
  // Si viene org_id: validar membresía ACTIVE del usuario
  if (requestedOrgId) {
    const orgId = String(requestedOrgId).trim();
    if (!isUuid(orgId)) throw new Error("invalid_org_id");

    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, role")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq(MEMBERSHIP_STATUS_COLUMN, MEMBERSHIP_ACTIVE_VALUE)
      .maybeSingle();

    if (error) throw new Error(`membership_lookup_failed:${error.message}`);
    if (!data?.org_id) throw new Error("FORBIDDEN");

    return { org_id: String(data.org_id), role: (data.role ?? null) as string | null };
  }

  // Fallback determinista: primera membership ACTIVE
  const { data, error } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, role, created_at")
    .eq("user_id", userId)
    .eq(MEMBERSHIP_STATUS_COLUMN, MEMBERSHIP_ACTIVE_VALUE)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`membership_lookup_failed:${error.message}`);
  if (!data?.org_id) throw new Error("FORBIDDEN");

  return { org_id: String(data.org_id), role: (data.role ?? null) as string | null };
}

type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  subscription_status: string | null; // ACTIVE o null (hoy)
};

async function loadEntitlementsOrThrow(
  admin: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
) {
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, subscription_status")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`entitlements_failed:${error.message}`);
  if (!data?.customer_id) throw new Error("FORBIDDEN");

  return data as EntitlementsRow;
}

function assertPlanActiveOrThrow(ent: EntitlementsRow) {
  // Si quieres permitir AUDIT_VIEW sin plan ACTIVE, aquí es donde se cambia.
  if (ent.subscription_status !== "ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
}

export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  const admin = supabaseServiceClient();

  try {
    const user = await requireUser(req);

    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const source_audit_id = String(body?.source_audit_id ?? "").trim();
    if (!source_audit_id) return json(req, 400, { ok: false, error: "missing_source_audit_id" });
    if (!isUuid(source_audit_id)) return json(req, 400, { ok: false, error: "invalid_source_audit_id" });

    const { org_id, role } = await resolveOrgMemberOrThrow(
      admin,
      user.id,
      body?.org_id ?? null,
    );

    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertPlanActiveOrThrow(ent);

    const customer_id = String(ent.customer_id);

    // Insert + select para devolver created_at real (tu regla)
    const { data: inserted, error: insErr } = await admin
      .from("debacu_eval_audit_log")
      .insert({
        actor_user_id: user.id,
        action: "AUDIT_VIEW",
        entity: "AUDIT_LOG",
        entity_id: source_audit_id,
        // ✅ NO meter email aquí (PII). Role sí.
        meta: { viewer_role: role ?? null },
        customer_id,
        app_id: APP_ID,
        event_type: "AUDIT_VIEW",
        evaluation_id: null,
        search_kind: null,
        search_value_masked: null,
        search_value_hash: null,
        result_count: null,
      })
      .select("id, created_at")
      .maybeSingle();

    if (insErr) throw new Error(`audit_insert_failed:${insErr.message}`);
    if (!inserted?.id) throw new Error("audit_insert_failed:missing_row");

    return json(req, 200, {
      ok: true,
      data: {
        viewed: true,
        source_audit_id,
        audit_id: inserted.id,
        created_at: inserted.created_at,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, { ok: false, error: "UNAUTHENTICATED" });
    }

    if (msg === "PLAN_NOT_ACTIVE") {
      return json(req, 402, { ok: false, error: "PLAN_NOT_ACTIVE" });
    }

    if (msg === "FORBIDDEN" || msg.startsWith("forbidden_")) {
      return json(req, 403, { ok: false, error: "FORBIDDEN" });
    }

    if (msg.startsWith("missing_") || msg.startsWith("invalid_")) {
      return json(req, 400, { ok: false, error: msg });
    }

    console.error("client_audit_view error:", msg);
    return json(req, 500, { ok: false, error: "request_failed", detail: "internal_error" });
  }
});
