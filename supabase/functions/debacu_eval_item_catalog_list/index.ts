// supabase/functions/debacu_eval_item_catalog_list/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

const APP_ID = "DEBACU_EVAL";

type Body = {
  org_id?: string | null;
  app_id?: string | null;
  appId?: string | null;
};

type GlobalItem = {
  item_code: string;
  title: string | null;
  category: string | null;
  unit_price: number | null;
  currency: string | null;
  description: string | null;
  is_active: boolean;
  updated_at: string | null;
};

type HotelItem = {
  item_code: string;
  title: string | null;
  category: string | null;
  unit_price: number | null;
  currency: string | null;
  description: string | null;
  is_active: boolean | null;
  updated_at: string | null;
};

function err(code: string, detail?: string) {
  return { ok: false, error: "request_failed", detail: detail ? `${code}:${detail}` : code };
}
function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}
function normCode(x: unknown) {
  return String(x ?? "").trim().toUpperCase();
}

/** ======================================================
 * Multi-org helpers
 * ====================================================== */
async function resolveOrgId(
  supabase: ReturnType<typeof supabaseServiceClient>,
  authUserId: string,
  orgIdFromBody: string | null | undefined,
): Promise<string | null> {
  const orgId = safeStr(orgIdFromBody);
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

  const { data: rows, error } = await supabase
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .eq("auth_user_id", authUserId) // ⚠️ si tu columna real es user_id, cambia aquí
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) return null;
  return rows?.[0]?.org_id ? String(rows[0].org_id) : null;
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

/** ======================================================
 * Handler
 * ====================================================== */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, err("method_not_allowed"));

  try {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return json(req, 400, err("invalid_json"));

    const appId = safeStr(body.app_id ?? body.appId) || APP_ID;

    const supabase = supabaseServiceClient();

    // ✅ multi-org
    const orgId = await resolveOrgId(supabase, user.id, body.org_id);
    if (!orgId) return json(req, 403, err("FORBIDDEN", "NO_ACTIVE_MEMBERSHIP"));

    const customerId = await resolveCustomerId(supabase, orgId);
    if (!customerId) return json(req, 403, err("FORBIDDEN", "NO_CUSTOMER_FOR_ORG"));

    // 1) Global activos
    const { data: globalItems, error: e1 } = await supabase
      .from("debacu_item_catalog")
      .select("item_code,title,category,unit_price,currency,description,is_active,updated_at")
      .eq("is_active", true);

    if (e1) return json(req, 500, err("db_read_failed"));

    // 2) Hotel items (todos, incluidos desactivados)
    const { data: hotelItems, error: e2 } = await supabase
      .from("debacu_hotel_item_catalog")
      .select("item_code,title,category,unit_price,currency,description,is_active,updated_at")
      .eq("customer_id", customerId);

    if (e2) return json(req, 500, err("db_read_failed"));

    const globals = (globalItems ?? []) as GlobalItem[];
    const hotels = (hotelItems ?? []) as HotelItem[];

    const gMap = new Map<string, GlobalItem>();
    for (const g of globals) {
      const code = normCode(g.item_code);
      if (!code) continue;
      gMap.set(code, { ...g, item_code: code });
    }

    const hMap = new Map<string, HotelItem>();
    for (const h of hotels) {
      const code = normCode(h.item_code);
      if (!code) continue;
      hMap.set(code, { ...h, item_code: code });
    }

    const out: any[] = [];

    // a) todo lo global (override si existe)
    for (const [code, g] of gMap.entries()) {
      const h = hMap.get(code) ?? null;

      const effectiveActive = h ? (h.is_active ?? true) : true;
      if (!effectiveActive) continue;

      out.push({
        item_code: code,
        title: h?.title ?? g.title,
        category: h?.category ?? g.category,
        unit_price: h?.unit_price ?? g.unit_price,
        currency: h?.currency ?? g.currency,
        description: h?.description ?? g.description,
        is_active: true,
        source: h ? "OVERRIDE" : "GLOBAL",
      });
    }

    // b) custom (hotel items que no existen en global)
    for (const [code, h] of hMap.entries()) {
      if (gMap.has(code)) continue;

      const active = h.is_active ?? true;
      if (!active) continue;

      out.push({
        item_code: code,
        title: h.title ?? code,
        category: h.category ?? "CUSTOM",
        unit_price: h.unit_price ?? null,
        currency: h.currency ?? "EUR",
        description: h.description ?? null,
        is_active: true,
        source: "CUSTOM",
      });
    }

    out.sort((a, b) => String(a.item_code).localeCompare(String(b.item_code)));

    return json(req, 200, {
      ok: true,
      appId,
      meta: { org_id: orgId, customer_id: customerId, app_id: APP_ID },
      items: out,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "");
    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, err("UNAUTHENTICATED"));
    }
    return json(req, 500, err("internal_error"));
  }
});
