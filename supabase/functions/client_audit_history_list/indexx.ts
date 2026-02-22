// supabase/functions/client_audit_history_list/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";
import { getOrgEntitlementsOrThrow, assertOrgEnabledOrThrow } from "../_shared/plans.ts";

const APP_ID = "DEBACU_EVAL";

/**
 * Si tu tabla org_members usa status (ACTIVE/INVITED/...), mantenlo.
 * Si no, ajusta MEMBERSHIP_*.
 */
const MEMBERSHIP_STATUS_COLUMN = "status";
const MEMBERSHIP_ACTIVE_VALUE = "ACTIVE";

type ReqBody = {
  org_id?: string; // recomendado: UI siempre manda org_id
  page?: number; // 1..n
  pageSize?: number; // 5..100
  q?: string; // search
  event_type?: string; // default CHECK_SIGNALS
};

type OrgResolvedBy = "requested" | "first_active" | "first_any";

type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  subscription_status: string | null; // ACTIVE | TRIAL_ACTIVE | ...
  plan_code: string | null;
  max_users: number | null;
  seats_used: number | null;
};

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

/** ======================================================
 * ORG (multi-org) - FIX STAFF: user_id OR auth_user_id
 * ====================================================== */
async function resolveOrgAndRoleOrThrow(
  admin: SupabaseClient,
  userId: string,
  requestedOrgId?: string | null,
): Promise<{ org_id: string; role: string | null; resolvedBy: OrgResolvedBy }> {
  const uid = String(userId);

  if (requestedOrgId) {
    const orgId = String(requestedOrgId).trim();
    if (!isUuid(orgId)) throw new Error("invalid_org_id");

    // Primero intentamos ACTIVE (ideal)
    try {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id, role")
        .eq("org_id", orgId)
        .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
        .eq(MEMBERSHIP_STATUS_COLUMN, MEMBERSHIP_ACTIVE_VALUE)
        .maybeSingle();

      if (error) throw error;
      if (!data?.org_id) throw new Error("FORBIDDEN");

      return { org_id: String(data.org_id), role: (data.role ?? null) as string | null, resolvedBy: "requested" };
    } catch {
      // Fallback: si por lo que sea no hay status, permitimos membership existente
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id, role")
        .eq("org_id", orgId)
        .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
        .maybeSingle();

      if (error || !data?.org_id) throw new Error("FORBIDDEN");
      return { org_id: String(data.org_id), role: (data.role ?? null) as string | null, resolvedBy: "requested" };
    }
  }

  // Fallback determinista: primera membership ACTIVE (created_at asc)
  try {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, role, created_at")
      .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
      .eq(MEMBERSHIP_STATUS_COLUMN, MEMBERSHIP_ACTIVE_VALUE)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data?.org_id) throw new Error("FORBIDDEN");

    return { org_id: String(data.org_id), role: (data.role ?? null) as string | null, resolvedBy: "first_active" };
  } catch {
    // Fallback: primera membership (sin status)
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, role, created_at")
      .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data?.org_id) throw new Error("FORBIDDEN");
    return { org_id: String(data.org_id), role: (data.role ?? null) as string | null, resolvedBy: "first_any" };
  }
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

    const { org_id, role: currentRole, resolvedBy: org_id_resolved_by } = await resolveOrgAndRoleOrThrow(
      admin as unknown as SupabaseClient,
      user.id,
      body?.org_id ?? null,
    );

    // ✅ Entitlements unificados + TRIAL_ACTIVE permitido
    const ent = (await getOrgEntitlementsOrThrow(admin as any, org_id)) as unknown as EntitlementsRow;
    assertOrgEnabledOrThrow(ent as any); // ACTIVE o TRIAL_ACTIVE
    const customer_id = String(ent.customer_id);
    if (!customer_id) throw new Error("FORBIDDEN");

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
      // Nota: .or() en PostgREST puede ser caro. Si hay índices, mejor.
      query = query.or(`id.ilike.${like},search_value_masked.ilike.${like},action.ilike.${like}`);
    }

    const { data: rows, error, count } = await query;
    if (error) throw new Error(`list_failed:${error.message}`);

    // Roles de los actores (si tienes actor_user_id histórico)
    const actorIds = Array.from(new Set((rows ?? []).map((r: any) => r.actor_user_id).filter(Boolean))) as string[];

    let roleByUserId: Record<string, string> = {};
    if (actorIds.length > 0) {
      // FIX STAFF: user_id OR auth_user_id
      const { data: mems1, error: memErr1 } = await admin
        .from("debacu_eval_org_members")
        .select("user_id, role")
        .eq("org_id", org_id)
        .in("user_id", actorIds);

      if (memErr1) throw new Error(`members_lookup_failed:${memErr1.message}`);

      const map1 = Object.fromEntries((mems1 ?? []).map((m: any) => [String(m.user_id), String(m.role ?? "—")]));
      roleByUserId = { ...map1 };

      const missing = actorIds.filter((id) => !roleByUserId[id]);
      if (missing.length > 0) {
        const { data: mems2, error: memErr2 } = await admin
          .from("debacu_eval_org_members")
          .select("auth_user_id, role")
          .eq("org_id", org_id)
          .in("auth_user_id", missing);

        if (memErr2) throw new Error(`members_lookup_failed:${memErr2.message}`);

        for (const m of mems2 ?? []) {
          const k = String((m as any).auth_user_id ?? "");
          if (k) roleByUserId[k] = String((m as any).role ?? "—");
        }
      }
    }

    const items = (rows ?? []).map((r: any) => {
      const meta = (r.meta ?? {}) as any;
      const risk = String(meta?.risk ?? "NO_CONCLUYENTE");
      const avgStars = meta?.avg_stars ?? null;

      const typeLabel =
        r.action === "CHECK_SIGNALS"
          ? "Consulta"
          : r.action === "PDF_ISSUED"
            ? "Exportación PDF"
            : String(r.action ?? "Evento");

      const detailLabel = r.entity === "EVALUATION_SEARCH" ? "Consulta de registro" : String(r.entity ?? "—");

      const userRole = r.actor_user_id ? roleByUserId[String(r.actor_user_id)] ?? "—" : currentRole ?? "—";

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
      meta: {
        org_id,
        org_id_resolved_by,
        customer_id,
        plan_code: ent.plan_code ?? null,
        subscription_status: ent.subscription_status ?? null,
      },
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
    if (msg === "invalid_org_id") {
      return json(req, 400, { ok: false, error: "invalid_org_id" });
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