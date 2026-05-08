// supabase/functions/debacu_eval_hotel_item_catalog_upsert/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

type Body = {
  org_id?: string | null;

  item_code?: string | null;
  title?: string | null;
  category?: string | null;
  currency?: string | null;
  unit_price?: number | string | null;
  description?: string | null;
  is_active?: boolean | null;
};

function err(code: string) {
  return { ok: false, error: "request_failed", detail: code };
}

function clampText(v: unknown, max: number) {
  return String(v ?? "").trim().slice(0, max);
}
function normCode(v: unknown, max: number) {
  return clampText(v, max).toUpperCase();
}
function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).trim().replace(",", "."));
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

async function resolveOrgId(
  supabase: ReturnType<typeof supabaseServiceClient>,
  authUserId: string,
  orgIdFromBody: string | null | undefined,
): Promise<string | null> {
  const orgId = clampText(orgIdFromBody, 64);
  if (orgId) {
    const { data, error } = await supabase
      .from("debacu_eval_org_members")
      .select("org_id")
      .eq("org_id", orgId)
      .eq("auth_user_id", authUserId) // ⚠️ si tu columna real es user_id, cambia aquí
      .eq("status", "ACTIVE")
      .maybeSingle();
    if (error) return null;
    return data?.org_id ? String(data.org_id) : null;
  }

  const { data, error } = await supabase
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .eq("auth_user_id", authUserId) // ⚠️ si tu columna real es user_id, cambia aquí
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) return null;
  return data?.[0]?.org_id ? String(data[0].org_id) : null;
}

async function resolveCustomerId(
  supabase: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
): Promise<string | null> {
  try {
    const { data: ent, error: entErr } = await supabase
      .from("debacu_eval_org_entitlements_v")
      .select("customer_id")
      .eq("org_id", orgId)
      .maybeSingle();
    if (!entErr && ent?.customer_id) return String(ent.customer_id);
  } catch {
    // ignore
  }

  const { data: org, error: orgErr } = await supabase
    .from("debacu_eval_organizations")
    .select("customer_id")
    .eq("id", orgId)
    .maybeSingle();

  if (orgErr) return null;
  return org?.customer_id ? String(org.customer_id) : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, err("method_not_allowed"));

  try {
    const user = await requireUser(req);

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return json(req, 400, err("invalid_json"));

    const supabase = supabaseServiceClient();

    // ✅ tenant: org_id recomendado
    const orgId = await resolveOrgId(supabase, user.id, body.org_id);
    if (!orgId) return json(req, 403, err("FORBIDDEN_NO_ACTIVE_MEMBERSHIP"));

    const customerId = await resolveCustomerId(supabase, orgId);
    if (!customerId) return json(req, 403, err("FORBIDDEN_NO_CUSTOMER"));

    // ✅ payload + validaciones
    const item_code = normCode(body.item_code, 40);
    const title = clampText(body.title, 120);
    const category = clampText(body.category, 60);
    const currency = normCode(body.currency ?? "EUR", 3) || "EUR";
    const unit_price = toNumOrNull(body.unit_price);
    const description = body.description !== undefined && body.description !== null
      ? clampText(body.description, 400)
      : null;
    const is_active = toBoolOrNull(body.is_active) ?? true;

    if (!item_code) return json(req, 400, err("missing_item_code"));
    if (!title) return json(req, 400, err("missing_title"));
    if (!category) return json(req, 400, err("missing_category"));
    if (unit_price === null) return json(req, 400, err("invalid_unit_price"));
    if (unit_price < 0) return json(req, 400, err("invalid_unit_price"));

    const nowIso = new Date().toISOString();

    const { data: row, error } = await supabase
      .from("debacu_hotel_item_catalog")
      .upsert(
        [{
          customer_id: customerId,
          item_code,
          title,
          category,
          unit_price,
          currency,
          description,
          is_active,
          updated_at: nowIso,
        }],
        { onConflict: "customer_id,item_code" },
      )
      .select("customer_id,item_code,updated_at")
      .single();

    if (error) return json(req, 500, err("db_write_failed"));

    return json(req, 200, {
      ok: true,
      meta: { org_id: orgId, customer_id: customerId },
      item: row ?? { customer_id: customerId, item_code, updated_at: nowIso },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "");
    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, err("UNAUTHENTICATED"));
    }
    return json(req, 500, err("internal_error"));
  }
});
