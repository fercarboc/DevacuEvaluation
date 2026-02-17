// supabase/functions/client_audit_history_list/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const APP_ID = "DEBACU_EVAL";

/**
 * Ajusta si tu schema usa otra columna/valor para estado de miembro.
 * Si no tienes estado, quita estas líneas (pero lo ideal es tenerlo).
 */
const MEMBERSHIP_STATUS_COLUMN = "status";
const MEMBERSHIP_ACTIVE_VALUE = "ACTIVE";

type ReqBody = {
  org_id?: string;       // recomendado: UI siempre manda org_id
  page?: number;         // 1..n
  pageSize?: number;     // 5..100
  q?: string;            // search
  event_type?: string;   // default CHECK_SIGNALS
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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

/** ======================================================
 * ORG (multi-org)
 * ====================================================== */
async function resolveOrgAndRoleOrThrow(
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

  // Fallback determinista: primera membership ACTIVE (por created_at asc)
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
  subscription_status: string | null; // ACTIVE o null en tu view hoy
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
  if (!data) throw new Error("FORBIDDEN");
  if (!data.customer_id) throw new Error("FORBIDDEN");

  return data as EntitlementsRow;
}

function assertPlanActiveOrThrow(ent: EntitlementsRow) {
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

    const { org_id, role: currentRole } = await resolveOrgAndRoleOrThrow(
      admin,
      user.id,
      body?.org_id ?? null,
    );

    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertPlanActiveOrThrow(ent);

    const customer_id = String(ent.customer_id);

    const page = clamp(Number(body.page ?? 1) || 1, 1, 10_000);
    const pageSize = clamp(Number(body.pageSize ?? 10) || 10, 5, 100);
    const q = safeStr(body.q).trim();
    const eventType = safeStr(body.event_type).trim() || "CHECK_SIGNALS";

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = admin
      .from("debacu_eval_audit_log")
      .select(
        [
          "id",
          "created_at",
          "actor_user_id",
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
        { count: "exact" },
      )
      .eq("customer_id", customer_id)
      .eq("app_id", APP_ID)
      .eq("event_type", eventType)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (q) {
      const like = `%${q}%`;
      // Nota: .or() en PostgREST puede ser caro; mantenemos solo campos indexables si existen.
      query = query.or(`id.ilike.${like},search_value_masked.ilike.${like},action.ilike.${like}`);
    }

    const { data: rows, error, count } = await query;
    if (error) throw new Error(`list_failed:${error.message}`);

    const actorIds = Array.from(
      new Set((rows ?? []).map((r: any) => r.actor_user_id).filter(Boolean)),
    ) as string[];

    let roleByUserId: Record<string, string> = {};
    if (actorIds.length > 0) {
      const { data: mems, error: memErr } = await admin
        .from("debacu_eval_org_members")
        .select("user_id, role")
        .eq("org_id", org_id)
        .in("user_id", actorIds);

      if (memErr) throw new Error(`members_lookup_failed:${memErr.message}`);

      roleByUserId = Object.fromEntries(
        (mems ?? []).map((m: any) => [String(m.user_id), String(m.role ?? "—")]),
      );
    }

    const items = (rows ?? []).map((r: any) => {
      const meta = (r.meta ?? {}) as any;
      const risk = (meta?.risk ?? "NO_CONCLUYENTE") as string;
      const avgStars = meta?.avg_stars ?? null;

      const typeLabel =
        r.action === "CHECK_SIGNALS"
          ? "Consulta"
          : r.action === "PDF_ISSUED"
            ? "Exportación PDF"
            : String(r.action ?? "Evento");

      const detailLabel =
        r.entity === "EVALUATION_SEARCH"
          ? "Consulta de registro"
          : String(r.entity ?? "—");

      const userRole = r.actor_user_id
        ? roleByUserId[String(r.actor_user_id)] ?? "—"
        : currentRole ?? "—";

      return {
        id: r.id,
        created_at: r.created_at,
        type: typeLabel,
        label: detailLabel,
        risk,
        userRole,
        contact: r.search_value_masked ?? null,
        rating: typeof avgStars === "number" ? avgStars : null,
        matchStrength: meta?.match_strength ?? r.search_kind ?? null,
        resultCount: r.result_count ?? null,
      };
    });

    return json(req, 200, {
      ok: true,
      page,
      pageSize,
      total: count ?? 0,
      items,
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

    // 400 (validaciones)
    if (msg.startsWith("missing_") || msg.startsWith("invalid_")) {
      return json(req, 400, { ok: false, error: msg });
    }

    // 403
    if (msg === "FORBIDDEN" || msg.startsWith("forbidden_")) {
      return json(req, 403, { ok: false, error: "FORBIDDEN" });
    }

    // 500 limpio
    console.error("client_audit_history_list error:", msg);
    return json(req, 500, { ok: false, error: "request_failed", detail: "internal_error" });
  }
});
