// supabase/functions/debacu_eval_revenue_events_manage/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";
import { json, preflight } from "../_shared/cors.ts";

type Action = "CREATE" | "UPDATE" | "DELETE";
type PricingOperation = "INCREASE" | "DECREASE" | "SET";
type PricingAdjustmentType = "PERCENT" | "FIXED";
type ImpactLevel = "LOW" | "MEDIUM" | "HIGH";

type ReqBody = {
  action?: Action;
  // CREATE / UPDATE
  id?: string | null;
  org_id?: string | null;
  property_id?: string | null;
  name?: string | null;
  event_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  color?: string | null;
  priority?: number | null;
  impact_level?: ImpactLevel | null;
  note?: string | null;
  is_active?: boolean | null;
  pricing_operation?: PricingOperation | null;
  pricing_adjustment_type?: PricingAdjustmentType | null;
  pricing_adjustment_value?: number | null;
};

const SELECT_FIELDS = `
  id, org_id, property_id, name, event_type,
  start_date, end_date, color, priority, impact_level,
  note, is_active, pricing_operation, pricing_adjustment_type,
  pricing_adjustment_value
`;

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function cleanText(v?: string | null) {
  const s = String(v ?? "").trim();
  return s.length ? s : null;
}

async function resolveOrgMembership(
  sb: ReturnType<typeof supabaseServiceClient>,
  userId: string,
  orgId: string,
) {
  const { data, error } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, role, status")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (error || !data?.org_id) throw new Error("FORBIDDEN");
  return data;
}

async function assertRevenuePlanOrThrow(
  sb: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
) {
  const { data, error } = await sb
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, subscription_status, plan_code")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`entitlements_failed:${error.message}`);
  if (!data?.customer_id) throw new Error("PLAN_NOT_ELIGIBLE");

  const st = (data.subscription_status ?? "").toUpperCase();
  if (st !== "ACTIVE" && st !== "TRIAL_ACTIVE") throw new Error("PLAN_NOT_ACTIVE");

  const plan = (data.plan_code ?? "").toUpperCase();
  if (plan !== "MEDIUM" && plan !== "PREMIUM") throw new Error("PLAN_NOT_ELIGIBLE");
}

async function verifyPropertyBelongsToOrg(
  sb: ReturnType<typeof supabaseServiceClient>,
  propertyId: string,
  orgId: string,
) {
  const { data, error } = await sb
    .from("debacu_eval_properties")
    .select("id")
    .eq("id", propertyId)
    .eq("org_id", orgId)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data?.id) throw new Error("PROPERTY_NOT_FOUND");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" });

  // 1. Autenticación
  let authUser: any;
  try {
    authUser = await requireUser(req);
  } catch {
    return json(req, 401, { error: "UNAUTHORIZED" });
  }

  try {
    const body: ReqBody = await req.json();
    const action = String(body.action ?? "").toUpperCase() as Action;

    if (!["CREATE", "UPDATE", "DELETE"].includes(action)) {
      return json(req, 400, { ok: false, error: "invalid_action" });
    }

    const sb = supabaseServiceClient();

    // ─── DELETE ───────────────────────────────────────────────────────────
    if (action === "DELETE") {
      const id = cleanText(body.id);
      if (!id || !isUuid(id)) return json(req, 400, { ok: false, error: "id_required" });

      // Obtener el evento para verificar la org antes de borrar
      const { data: existing, error: fetchErr } = await sb
        .from("debacu_eval_revenue_events")
        .select("id, org_id")
        .eq("id", id)
        .maybeSingle();

      if (fetchErr || !existing?.id) return json(req, 404, { ok: false, error: "event_not_found" });

      await resolveOrgMembership(sb, authUser.id, existing.org_id);
      await assertRevenuePlanOrThrow(sb, existing.org_id);

      const { error } = await sb
        .from("debacu_eval_revenue_events")
        .update({ is_active: false })
        .eq("id", id);

      if (error) throw error;
      return json(req, 200, { ok: true });
    }

    // ─── CREATE / UPDATE ──────────────────────────────────────────────────
    const orgId = cleanText(body.org_id);
    if (!orgId || !isUuid(orgId)) return json(req, 400, { ok: false, error: "org_id_required" });

    await resolveOrgMembership(sb, authUser.id, orgId);
    await assertRevenuePlanOrThrow(sb, orgId);

    if (action === "CREATE") {
      const propertyId = cleanText(body.property_id);
      if (!propertyId || !isUuid(propertyId))
        return json(req, 400, { ok: false, error: "property_id_required" });

      await verifyPropertyBelongsToOrg(sb, propertyId, orgId);

      const name = cleanText(body.name);
      if (!name) return json(req, 400, { ok: false, error: "name_required" });
      if (!cleanText(body.event_type)) return json(req, 400, { ok: false, error: "event_type_required" });
      if (!cleanText(body.start_date)) return json(req, 400, { ok: false, error: "start_date_required" });
      if (!cleanText(body.end_date)) return json(req, 400, { ok: false, error: "end_date_required" });

      const { data, error } = await sb
        .from("debacu_eval_revenue_events")
        .insert({
          org_id: orgId,
          property_id: propertyId,
          name,
          event_type: body.event_type!,
          start_date: body.start_date!,
          end_date: body.end_date!,
          color: cleanText(body.color) ?? "#10B981",
          priority: body.priority ?? 200,
          impact_level: body.impact_level ?? "MEDIUM",
          note: cleanText(body.note),
          is_active: body.is_active ?? true,
          pricing_operation: body.pricing_operation ?? null,
          pricing_adjustment_type: body.pricing_adjustment_type ?? null,
          pricing_adjustment_value: body.pricing_adjustment_value ?? null,
        })
        .select(SELECT_FIELDS)
        .single();

      if (error) throw error;
      return json(req, 200, { ok: true, data });
    }

    // UPDATE
    const id = cleanText(body.id);
    if (!id || !isUuid(id)) return json(req, 400, { ok: false, error: "id_required" });

    // Verificar que el evento pertenece a la org antes de actualizar
    const { data: existing, error: fetchErr } = await sb
      .from("debacu_eval_revenue_events")
      .select("id, org_id")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !existing?.id) return json(req, 404, { ok: false, error: "event_not_found" });
    if (existing.org_id !== orgId) return json(req, 403, { ok: false, error: "FORBIDDEN" });

    const payload: Record<string, unknown> = {};
    if (body.name !== undefined) payload.name = cleanText(body.name);
    if (body.event_type !== undefined) payload.event_type = body.event_type;
    if (body.start_date !== undefined) payload.start_date = body.start_date;
    if (body.end_date !== undefined) payload.end_date = body.end_date;
    if (body.color !== undefined) payload.color = body.color;
    if (body.priority !== undefined) payload.priority = body.priority;
    if (body.impact_level !== undefined) payload.impact_level = body.impact_level;
    if (body.note !== undefined) payload.note = cleanText(body.note);
    if (body.is_active !== undefined) payload.is_active = body.is_active;
    if (body.pricing_operation !== undefined) payload.pricing_operation = body.pricing_operation;
    if (body.pricing_adjustment_type !== undefined) payload.pricing_adjustment_type = body.pricing_adjustment_type;
    if (body.pricing_adjustment_value !== undefined) payload.pricing_adjustment_value = body.pricing_adjustment_value;

    const { data, error } = await sb
      .from("debacu_eval_revenue_events")
      .update(payload)
      .eq("id", id)
      .select(SELECT_FIELDS)
      .single();

    if (error) throw error;
    return json(req, 200, { ok: true, data });

  } catch (err: any) {
    const msg = err?.message ?? "unknown_error";
    if (msg === "FORBIDDEN") return json(req, 403, { ok: false, error: "FORBIDDEN" });
    if (msg === "PLAN_NOT_ELIGIBLE") return json(req, 403, { ok: false, error: "PLAN_NOT_ELIGIBLE" });
    if (msg === "PLAN_NOT_ACTIVE") return json(req, 402, { ok: false, error: "PLAN_NOT_ACTIVE" });
    if (msg === "PROPERTY_NOT_FOUND") return json(req, 404, { ok: false, error: "PROPERTY_NOT_FOUND" });
    console.error("[debacu_eval_revenue_events_manage]", err);
    return json(req, 500, { ok: false, error: "internal_error" });
  }
});
