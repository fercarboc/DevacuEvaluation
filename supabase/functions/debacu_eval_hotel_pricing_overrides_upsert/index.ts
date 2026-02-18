// supabase/functions/debacu_eval_hotel_pricing_overrides_upsert/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

/** ======================================================
 *  Types
 *  ====================================================== */
type UpsertBody = {
  org_id?: string | null; // ✅ multi-org

  // target (XOR)
  incident_type?: string | null;
  item_code?: string | null;

  // overrides
  unit_price_override?: number | null;
  gross_min_override?: number | null;
  gross_max_override?: number | null;
  recovery_pct_override?: number | null;

  notes?: string | null;
  is_active?: boolean | null;
};

function err(code: string, detail?: string) {
  return { ok: false, error: "request_failed", detail: detail ? `${code}:${detail}` : code };
}

/** ======================================================
 *  Helpers
 *  ====================================================== */
function clampText(v: unknown, max: number) {
  const s = String(v ?? "").trim();
  return s.length > max ? s.slice(0, max) : s;
}
function normCode(v: unknown, max: number) {
  return clampText(v, max).toUpperCase();
}
function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function toBoolOrNull(v: unknown): boolean | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return null;
}
function hasValue(v: unknown) {
  return v !== null && v !== undefined && String(v).trim() !== "";
}
function xor(a: unknown, b: unknown) {
  const aOk = hasValue(a);
  const bOk = hasValue(b);
  return (aOk && !bOk) || (!aOk && bOk);
}

async function readJson(req: Request) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

async function resolveOrgId(
  supabase: ReturnType<typeof supabaseServiceClient>,
  authUserId: string,
  orgIdFromBody: string | null | undefined,
): Promise<string | null> {
  const orgId = (orgIdFromBody ?? "").trim();
  if (orgId) {
    // validar membership ACTIVE
    const { data, error } = await supabase
      .from("debacu_eval_org_members")
      .select("org_id, status")
      .eq("org_id", orgId)
      .eq("auth_user_id", authUserId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (error) return null;
    return data?.org_id ?? null;
  }

  // fallback determinista: primera membership ACTIVE
  const { data: rows, error: memErr } = await supabase
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .eq("auth_user_id", authUserId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1);

  if (memErr) return null;
  return rows?.[0]?.org_id ?? null;
}

/** ======================================================
 *  Main
 *  ====================================================== */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, err("method_not_allowed"));

  try {
    // ✅ JWT-only
    const user = await requireUser(req);

    const body = (await readJson(req)) as UpsertBody | null;
    if (!body) return json(req, 400, err("invalid_json"));

    const supabase = supabaseServiceClient();

    // ✅ multi-org
    const orgId = await resolveOrgId(supabase, user.id, body.org_id);
    if (!orgId) return json(req, 403, err("FORBIDDEN", "NO_ACTIVE_MEMBERSHIP"));

    // target XOR
    const incident_type = hasValue(body.incident_type) ? normCode(body.incident_type, 60) : null;
    const item_code = hasValue(body.item_code) ? normCode(body.item_code, 60) : null;

    if (!xor(incident_type, item_code)) {
      return json(req, 400, err("invalid_target", "provide_exactly_one_of_incident_type_or_item_code"));
    }

    // numerics
    const unit_price_override = toNumOrNull(body.unit_price_override);
    const gross_min_override = toNumOrNull(body.gross_min_override);
    const gross_max_override = toNumOrNull(body.gross_max_override);
    const recovery_pct_override = toNumOrNull(body.recovery_pct_override);

    if (unit_price_override !== null && unit_price_override < 0) {
      return json(req, 400, err("invalid_unit_price_override", "must_be_gte_0"));
    }
    if (gross_min_override !== null && gross_min_override < 0) {
      return json(req, 400, err("invalid_gross_min_override", "must_be_gte_0"));
    }
    if (gross_max_override !== null && gross_max_override < 0) {
      return json(req, 400, err("invalid_gross_max_override", "must_be_gte_0"));
    }
    if (
      gross_min_override !== null &&
      gross_max_override !== null &&
      gross_min_override > gross_max_override
    ) {
      return json(req, 400, err("invalid_gross_range", "gross_min_gt_gross_max"));
    }
    if (recovery_pct_override !== null && (recovery_pct_override < 0 || recovery_pct_override > 100)) {
      return json(req, 400, err("invalid_recovery_pct_override", "must_be_0_100"));
    }

    const notes = body.notes !== undefined ? clampText(body.notes, 500) : null;
    const is_active = toBoolOrNull(body.is_active);
    const effectiveIsActive = is_active === null ? true : is_active;

    // ✅ write via service role (consistencia)
    // Tabla destino (la tuya): debacu_hotel_incident_pricing
    // customer_id == orgId (tu modelo usa customer_id como org)
    const row = {
      customer_id: orgId,
      incident_type,
      item_code,
      unit_price_override,
      gross_min_override,
      gross_max_override,
      recovery_pct_override,
      notes,
      is_active: effectiveIsActive,
      updated_at: new Date().toISOString(),
      updated_by: user.id, // si no existe esta columna, quítala
    };

    // onConflict depende del target
    const onConflict = incident_type ? "customer_id,incident_type" : "customer_id,item_code";

    const { data, error } = await supabase
      .from("debacu_hotel_incident_pricing")
      .upsert(row as any, { onConflict })
      .select("*")
      .single();

    if (error) {
      // No filtramos traces. Mapeo simple:
      // - FK inexistente / check / unique mismatch -> 400
      return json(req, 400, err("db_write_failed", error.message));
    }

    return json(req, 200, { ok: true, row: data });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "");

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, err("UNAUTHENTICATED"));
    }

    return json(req, 500, err("internal_error"));
  }
});
