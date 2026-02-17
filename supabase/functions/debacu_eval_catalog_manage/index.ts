// supabase/functions/debacu_eval_catalog_manage/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const FN = "debacu_eval_catalog_manage";
const APP_ID = "DEBACU_EVAL";

/** ======================================================
 * CORS (shared-like, pero inline)
 * ====================================================== */
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function corsHeaders(origin: string | null) {
  const o = origin ?? "";
  const allowOrigin = ALLOWED_ORIGINS.has(o) ? o : "https://debacu.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

/** ======================================================
 * ENV
 * ====================================================== */
function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`MISSING_ENV:${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = mustEnv("SUPABASE_ANON_KEY");

/** ======================================================
 * Clients
 * ====================================================== */
function userClient(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** ======================================================
 * AuthN (JWT)
 * ====================================================== */
async function requireUser(req: Request) {
  const sbUser = userClient(req);
  const { data, error } = await sbUser.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

/** ======================================================
 * Tenant (Org -> Customer)
 * - Permite org_id opcional (recomendado que UI lo mande)
 * - Si no viene, usa la primera membership ACTIVE (determinista)
 * ====================================================== */
function safeStr(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

async function resolveOrgAndCustomer(params: {
  sb: ReturnType<typeof createClient>;
  user_id: string;
  org_id?: string | null;
}) {
  const { sb, user_id } = params;
  const org_id_in = safeStr(params.org_id ?? "");

  if (org_id_in) {
    const { data: mem, error: memErr } = await sb
      .from("debacu_eval_org_members")
      .select("org_id,status,role,created_at")
      .eq("user_id", user_id)
      .eq("org_id", org_id_in)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (memErr) throw new Error(`MEMBERSHIP_FAILED:${memErr.message}`);
    if (!mem?.org_id) throw new Error("FORBIDDEN_NO_MEMBERSHIP");

    const { data: org, error: orgErr } = await sb
      .from("debacu_eval_organizations")
      .select("id, customer_id")
      .eq("id", org_id_in)
      .maybeSingle();

    if (orgErr) throw new Error(`ORG_LOOKUP_FAILED:${orgErr.message}`);
    if (!org?.customer_id) throw new Error("FORBIDDEN_NO_CUSTOMER");

    return { org_id: org_id_in, customer_id: String(org.customer_id), role: String(mem.role ?? "STAFF") };
  }

  const { data: mem1, error: mem1Err } = await sb
    .from("debacu_eval_org_members")
    .select("org_id,status,role,created_at")
    .eq("user_id", user_id)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (mem1Err) throw new Error(`MEMBERSHIP_FAILED:${mem1Err.message}`);
  if (!mem1?.org_id) throw new Error("FORBIDDEN_NO_MEMBERSHIP");

  const org_id = String(mem1.org_id);

  const { data: org, error: orgErr } = await sb
    .from("debacu_eval_organizations")
    .select("id, customer_id")
    .eq("id", org_id)
    .maybeSingle();

  if (orgErr) throw new Error(`ORG_LOOKUP_FAILED:${orgErr.message}`);
  if (!org?.customer_id) throw new Error("FORBIDDEN_NO_CUSTOMER");

  return { org_id, customer_id: String(org.customer_id), role: String(mem1.role ?? "STAFF") };
}

/** ======================================================
 * Types
 * ====================================================== */
type ManageAction =
  | "ITEM_OVERRIDE_UPSERT"
  | "ITEM_CUSTOM_UPSERT"
  | "ITEM_CUSTOM_DISABLE"
  | "INC_OVERRIDE_UPSERT"
  | "INC_CUSTOM_UPSERT"
  | "INC_CUSTOM_DISABLE";

type Body = {
  action: ManageAction;
  payload?: any;
  org_id?: string; // recomendado
};

/** ======================================================
 * Helpers
 * ====================================================== */
function toUpperSnake(input: string) {
  const raw = (input ?? "").trim().toUpperCase();
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function asBool(v: any, fallback: boolean) {
  return typeof v === "boolean" ? v : fallback;
}

function asNumOrNull(v: any) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function clampText(s: any, max: number) {
  const t = String(s ?? "").trim();
  return t.length > max ? t.slice(0, max) : t;
}

function clampInt(v: any, min: number, max: number) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

/** ======================================================
 * MAIN
 * ====================================================== */
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(origin, 405, { ok: false, error: "method_not_allowed" });

  try {
    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const action = (body?.action ?? "") as ManageAction;
    const payload = body?.payload ?? {};
    const org_id = safeStr(body?.org_id);

    if (!action) return json(origin, 400, { ok: false, error: "missing_action" });

    // 1) AuthN: JWT real
    const user = await requireUser(req);

    // 2) Service role para leer/escribir tablas + tenant resolution
    const sb = serviceClient();

    // 3) Tenant -> customer_id
    const tenant = await resolveOrgAndCustomer({ sb, user_id: user.id, org_id: org_id || null });
    const customerId = tenant.customer_id;

    // ======================================================
    // ACTIONS
    // ======================================================

    // ----------------------
    // ITEMS: override global (hotel)
    // tabla destino: debacu_hotel_item_catalog
    // ----------------------
    if (action === "ITEM_OVERRIDE_UPSERT") {
      const item_code = toUpperSnake(payload?.item_code ?? "");
      if (!item_code) return json(origin, 400, { ok: false, error: "missing_item_code" });

      const is_active = asBool(payload?.is_active, true);
      const unit_price = asNumOrNull(payload?.unit_price);

      // leer base global
      const { data: g, error: gErr } = await sb
        .from("debacu_item_catalog")
        .select("item_code,title,category,currency,description")
        .eq("item_code", item_code)
        .maybeSingle();

      if (gErr) return json(origin, 500, { ok: false, error: "db_error", detail: gErr.message });
      if (!g) return json(origin, 400, { ok: false, error: `global_item_not_found:${item_code}` });

      const row = {
        customer_id: customerId,
        item_code,
        title: g.title ?? null,
        category: g.category ?? null,
        unit_price,
        currency: g.currency ?? "EUR",
        description: g.description ?? null,
        is_active,
        updated_at: new Date().toISOString(),
      };

      const { error: uErr } = await sb
        .from("debacu_hotel_item_catalog")
        .upsert(row, { onConflict: "customer_id,item_code" });

      if (uErr) return json(origin, 500, { ok: false, error: "db_error", detail: uErr.message });

      return json(origin, 200, { ok: true, action, customerId, item_code });
    }

    // ----------------------
    // ITEMS: custom hotel item (creado por hotel)
    // tabla destino: debacu_hotel_item_catalog
    // (sí: misma tabla, porque ahí conviven override y custom; la vista effective distingue por source)
    // ----------------------
    if (action === "ITEM_CUSTOM_UPSERT") {
      const item_code = toUpperSnake(payload?.item_code ?? "");
      const title = clampText(payload?.title ?? "", 120);

      if (!item_code) return json(origin, 400, { ok: false, error: "missing_item_code" });
      if (!title) return json(origin, 400, { ok: false, error: "missing_title" });

      const unit_price = asNumOrNull(payload?.unit_price);
      if (unit_price === null) return json(origin, 400, { ok: false, error: "missing_or_invalid_unit_price" });

      const row = {
        customer_id: customerId,
        item_code,
        title,
        category: payload?.category ? clampText(payload.category, 60) : null,
        unit_price,
        currency: (payload?.currency ? String(payload.currency) : "EUR").toUpperCase().slice(0, 3),
        description: payload?.description ? clampText(payload.description, 240) : null,
        is_active: asBool(payload?.is_active, true),
        updated_at: new Date().toISOString(),
      };

      const { error: uErr } = await sb
        .from("debacu_hotel_item_catalog")
        .upsert(row, { onConflict: "customer_id,item_code" });

      if (uErr) return json(origin, 500, { ok: false, error: "db_error", detail: uErr.message });

      return json(origin, 200, { ok: true, action, customerId, item_code });
    }

    if (action === "ITEM_CUSTOM_DISABLE") {
      const item_code = toUpperSnake(payload?.item_code ?? "");
      if (!item_code) return json(origin, 400, { ok: false, error: "missing_item_code" });

      const { error: uErr } = await sb
        .from("debacu_hotel_item_catalog")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("customer_id", customerId)
        .eq("item_code", item_code);

      if (uErr) return json(origin, 500, { ok: false, error: "db_error", detail: uErr.message });

      return json(origin, 200, { ok: true, action, customerId, item_code });
    }

    // ----------------------
    // INCIDENTS: override global (hotel)
    // tabla destino: debacu_hotel_incident_overrides
    // ----------------------
    if (action === "INC_OVERRIDE_UPSERT") {
      const incident_type = toUpperSnake(payload?.incident_type ?? "");
      if (!incident_type) return json(origin, 400, { ok: false, error: "missing_incident_type" });

      const { data: g, error: gErr } = await sb
        .from("debacu_incident_catalog")
        .select("incident_type")
        .eq("incident_type", incident_type)
        .maybeSingle();

      if (gErr) return json(origin, 500, { ok: false, error: "db_error", detail: gErr.message });
      if (!g) return json(origin, 400, { ok: false, error: `global_incident_not_found:${incident_type}` });

      const row = {
        customer_id: customerId,
        incident_type,
        is_active: asBool(payload?.is_active, true),

        title_override: payload?.title_override ? clampText(payload.title_override, 120) : null,
        description_override: payload?.description_override ? clampText(payload.description_override, 300) : null,
        severity_override: clampInt(payload?.severity_override, 1, 5),

        default_gross_min_override: asNumOrNull(payload?.default_gross_min_override),
        default_gross_max_override: asNumOrNull(payload?.default_gross_max_override),
        default_recovery_pct_override: clampInt(payload?.default_recovery_pct_override, 0, 100),

        suggested_actions_override: payload?.suggested_actions_override
          ? clampText(payload.suggested_actions_override, 240)
          : null,

        updated_at: new Date().toISOString(),
      };

      const { error: uErr } = await sb
        .from("debacu_hotel_incident_overrides")
        .upsert(row, { onConflict: "customer_id,incident_type" });

      if (uErr) return json(origin, 500, { ok: false, error: "db_error", detail: uErr.message });

      return json(origin, 200, { ok: true, action, customerId, incident_type });
    }

    // ----------------------
    // INCIDENTS: custom hotel incident
    // tabla destino: debacu_hotel_incident_custom
    // ----------------------
    if (action === "INC_CUSTOM_UPSERT") {
      const incident_type = toUpperSnake(payload?.incident_type ?? "");
      const title = clampText(payload?.title ?? "", 120);

      if (!incident_type) return json(origin, 400, { ok: false, error: "missing_incident_type" });
      if (!title) return json(origin, 400, { ok: false, error: "missing_title" });

      const sevRaw = payload?.severity;
      const sev =
        sevRaw === null || sevRaw === undefined || sevRaw === ""
          ? 2
          : Math.max(1, Math.min(5, Number(sevRaw)));

      const row = {
        customer_id: customerId,
        incident_type,
        title,
        description: payload?.description ? clampText(payload.description, 300) : null,
        severity: Number.isFinite(sev) ? sev : 2,
        default_gross_min: asNumOrNull(payload?.default_gross_min),
        default_gross_max: asNumOrNull(payload?.default_gross_max),
        default_recovery_pct: clampInt(payload?.default_recovery_pct, 0, 100),
        suggested_actions: payload?.suggested_actions ? clampText(payload.suggested_actions, 240) : null,
        is_active: asBool(payload?.is_active, true),
        updated_at: new Date().toISOString(),
      };

      const { error: uErr } = await sb
        .from("debacu_hotel_incident_custom")
        .upsert(row, { onConflict: "customer_id,incident_type" });

      if (uErr) return json(origin, 500, { ok: false, error: "db_error", detail: uErr.message });

      return json(origin, 200, { ok: true, action, customerId, incident_type });
    }

    if (action === "INC_CUSTOM_DISABLE") {
      const incident_type = toUpperSnake(payload?.incident_type ?? "");
      if (!incident_type) return json(origin, 400, { ok: false, error: "missing_incident_type" });

      const { error: uErr } = await sb
        .from("debacu_hotel_incident_custom")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("customer_id", customerId)
        .eq("incident_type", incident_type);

      if (uErr) return json(origin, 500, { ok: false, error: "db_error", detail: uErr.message });

      return json(origin, 200, { ok: true, action, customerId, incident_type });
    }

    return json(origin, 400, { ok: false, error: `unknown_action:${action}` });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    const status =
      msg === "UNAUTHENTICATED" ? 401 :
      msg.startsWith("FORBIDDEN") || msg.startsWith("MEMBERSHIP_FAILED") || msg.startsWith("ORG_LOOKUP_FAILED") ? 403 :
      msg.startsWith("MISSING_ENV:") ? 500 :
      500;

    return json(origin, status, { ok: false, error: "request_failed", detail: msg, fn: FN });
  }
});
