// supabase/functions/client_audit_history_detail/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const APP_ID = "DEBACU_EVAL";

/**
 * Ajusta esto si tu tabla usa otra columna/valor.
 * Ej: membership_status / state / member_status, etc.
 */
const MEMBERSHIP_STATUS_COLUMN = "status";
const MEMBERSHIP_ACTIVE_VALUE = "ACTIVE";

type ReqBody = {
  audit_id?: string;
  org_id?: string; // recomendado: UI siempre manda org_id
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

function pickMetaSafe(meta: any) {
  // ✅ WHITELIST: solo devolvemos lo que de verdad usa la UI
  // (evita que un día metas PII en meta y se filtre al frontend)
  if (!meta || typeof meta !== "object") return {};

  const allow = [
    "risk",
    "avg_stars",
    "match_strength",
    "count_bucket",
    "count_exact",
    "window",
    "time_window",
    "months_received",
    "input_kind",
  ] as const;

  const out: Record<string, unknown> = {};
  for (const k of allow) {
    if (k in meta) out[k] = meta[k];
  }
  return out;
}

async function resolveOrgIdOrThrow(
  admin: ReturnType<typeof supabaseServiceClient>,
  userId: string,
  requestedOrgId?: string | null,
) {
  // Si viene org_id => validar membership ACTIVE
  if (requestedOrgId) {
    const orgId = String(requestedOrgId).trim();
    if (!isUuid(orgId)) throw new Error("invalid_org_id");

    const q = admin
      .from("debacu_eval_org_members")
      .select("org_id")
      .eq("user_id", userId)
      .eq("org_id", orgId)
      .eq(MEMBERSHIP_STATUS_COLUMN, MEMBERSHIP_ACTIVE_VALUE)
      .maybeSingle();

    const { data, error } = await q;
    if (error) throw new Error(`membership_lookup_failed:${error.message}`);
    if (!data?.org_id) throw new Error("FORBIDDEN");
    return orgId;
  }

  // Fallback determinista: primera membership ACTIVE
  const { data, error } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .eq("user_id", userId)
    .eq(MEMBERSHIP_STATUS_COLUMN, MEMBERSHIP_ACTIVE_VALUE)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`membership_lookup_failed:${error.message}`);
  if (!data?.org_id) throw new Error("FORBIDDEN");
  return String(data.org_id);
}

type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  subscription_status: string | null;
  plan_code: string | null;
  max_users: number | null;
  seats_used: number | null;
};

async function loadEntitlementsOrThrow(
  admin: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
) {
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, subscription_status, plan_code, max_users, seats_used")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`entitlements_failed:${error.message}`);
  if (!data?.customer_id) throw new Error("FORBIDDEN");
  return data as EntitlementsRow;
}

function assertPlanActiveOrThrow(ent: EntitlementsRow) {
  if (ent.subscription_status !== "ACTIVE") {
    throw new Error("PLAN_NOT_ACTIVE");
  }
}

export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  const admin = supabaseServiceClient();

  try {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const audit_id = String(body?.audit_id ?? "").trim();
    if (!audit_id) return json(req, 400, { ok: false, error: "missing_audit_id" });
    if (!isUuid(audit_id)) return json(req, 400, { ok: false, error: "invalid_audit_id" });

    const org_id = await resolveOrgIdOrThrow(admin, user.id, body?.org_id ?? null);
    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertPlanActiveOrThrow(ent);

    const customer_id = String(ent.customer_id);

    const { data: row, error } = await admin
      .from("debacu_eval_audit_log")
      .select(
        [
          "id",
          "created_at",
          "action",
          "entity",
          "entity_id",
          "meta",
          "customer_id",
          "app_id",
          "event_type",
          "search_kind",
          "search_value_masked",
          "result_count",
        ].join(","),
      )
      .eq("id", audit_id)
      .eq("customer_id", customer_id)
      .eq("app_id", APP_ID)
      .maybeSingle();

    if (error) throw new Error(`detail_failed:${error.message}`);
    if (!row) return json(req, 404, { ok: false, error: "not_found" });

    const metaRaw = (row.meta ?? {}) as any;
    const meta = pickMetaSafe(metaRaw);

    const risk = String((metaRaw?.risk ?? "NO_CONCLUYENTE") as string);

    return json(req, 200, {
      ok: true,
      item: {
        id: row.id,
        created_at: row.created_at,
        action: row.action,
        entity: row.entity,
        event_type: row.event_type,
        risk,
        avg_stars: typeof metaRaw?.avg_stars === "number" ? metaRaw.avg_stars : null,
        match_strength: metaRaw?.match_strength ?? null,
        count_bucket: metaRaw?.count_bucket ?? null,
        count_exact: metaRaw?.count_exact ?? null,
        window: metaRaw?.window ?? metaRaw?.time_window ?? metaRaw?.months_received ?? null,
        input_kind: metaRaw?.input_kind ?? row.search_kind ?? null,
        search_value_masked: row.search_value_masked ?? null,
        result_count: row.result_count ?? null,
        meta, // ✅ meta filtrado
      },
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

    // 400 (solo por nuestras validaciones semánticas)
    if (msg.startsWith("invalid_") || msg.startsWith("missing_")) {
      return json(req, 400, { ok: false, error: msg });
    }

    // resto: 500 limpio (sin stack)
    console.error("client_audit_history_detail error:", msg);
    return json(req, 500, { ok: false, error: "request_failed", detail: "internal_error" });
  }
});
