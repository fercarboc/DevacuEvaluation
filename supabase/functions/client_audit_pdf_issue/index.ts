// supabase/functions/client_audit_pdf_issue/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const APP_ID = "DEBACU_EVAL";

/**
 * Ajusta si tu schema usa otra columna/valor.
 * Lo correcto es validar miembros ACTIVE.
 */
const MEMBERSHIP_STATUS_COLUMN = "status";
const MEMBERSHIP_ACTIVE_VALUE = "ACTIVE";

type ReqBody = {
  org_id?: string; // recomendado: UI siempre manda org_id
  source_audit_id?: string;
  template_version?: string; // "v1"
};

function supabaseServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v,
  );
}

/** ======================================================
 * ORG (multi-org) + entitlements
 * ====================================================== */
async function resolveOrgMemberOrThrow(
  admin: ReturnType<typeof supabaseServiceClient>,
  userId: string,
  requestedOrgId?: string | null,
) {
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
  // Si en el futuro permites TRIALING/GRACE, ajusta aquí.
  if (ent.subscription_status !== "ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
}

/** ======================================================
 * MAIN
 * ====================================================== */
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

    const templateVersion = String(body?.template_version ?? "v1").trim() || "v1";

    // 1) org + customer_id (JWT-only)
    const { org_id, role } = await resolveOrgMemberOrThrow(admin, user.id, body?.org_id ?? null);

    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertPlanActiveOrThrow(ent);

    const customer_id = String(ent.customer_id);

    // 2) lee el evento original (la consulta)
    const { data: source, error: srcErr } = await admin
      .from("debacu_eval_audit_log")
      .select(
        [
          "id",
          "created_at",
          "meta",
          "search_kind",
          "search_value_masked",
          "search_value_hash",
          "result_count",
          "customer_id",
          "app_id",
          "event_type",
        ].join(","),
      )
      .eq("id", source_audit_id)
      .eq("customer_id", customer_id)
      .eq("app_id", APP_ID)
      .maybeSingle();

    if (srcErr) throw new Error(`source_lookup_failed:${srcErr.message}`);
    if (!source) return json(req, 404, { ok: false, error: "source_not_found" });

    const meta = (source.meta ?? {}) as any;

    // 3) inserta evento de trazabilidad de emisión PDF
    const { data: created, error: insErr } = await admin
      .from("debacu_eval_audit_log")
      .insert({
        actor_user_id: user.id,
        action: "PDF_ISSUED",
        entity: "AUDIT_EXPORT",
        entity_id: source.id,
        meta: {
          scope: "FICHA_CONSULTA",
          template_version: templateVersion,
          source_event_type: source.event_type,
          source_created_at: source.created_at,
          // ⚠️ SOLO campos no-PII y necesarios para analítica
          risk: meta?.risk ?? null,
          avg_stars: typeof meta?.avg_stars === "number" ? meta.avg_stars : null,
          match_strength: meta?.match_strength ?? null,
          count_bucket: meta?.count_bucket ?? null,
          // útil para auditoría interna sin PII:
          viewer_role: role ?? null,
        },
        customer_id,
        app_id: APP_ID,
        event_type: "AUDIT_EXPORT",
        evaluation_id: null,
        search_kind: source.search_kind ?? null,
        search_value_masked: source.search_value_masked ?? null,
        search_value_hash: source.search_value_hash ?? null,
        result_count: source.result_count ?? null,
      })
      .select("id, created_at")
      .maybeSingle();

    if (insErr) throw new Error(`pdf_event_failed:${insErr.message}`);
    if (!created?.id) throw new Error("pdf_event_failed:missing_row");

    return json(req, 200, {
      ok: true,
      pdf_event_id: created.id,
      pdf_event_created_at: created.created_at,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    // 401
    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, { ok: false, error: "UNAUTHENTICATED" });
    }

    // 402
    if (msg === "PLAN_NOT_ACTIVE") {
      return json(req, 402, { ok: false, error: "PLAN_NOT_ACTIVE" });
    }

    // 403
    if (msg === "FORBIDDEN" || msg.startsWith("forbidden_")) {
      return json(req, 403, { ok: false, error: "FORBIDDEN" });
    }

    // 400
    if (msg.startsWith("missing_") || msg.startsWith("invalid_")) {
      return json(req, 400, { ok: false, error: msg });
    }

    // 500 limpio
    console.error("client_audit_pdf_issue error:", msg);
    return json(req, 500, { ok: false, error: "request_failed", detail: "internal_error" });
  }
});
