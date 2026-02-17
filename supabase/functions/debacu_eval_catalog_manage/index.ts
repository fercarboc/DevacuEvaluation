// supabase/functions/debacu_eval_catalog_manage/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/* ======================================================
 * CORS (JWT-only)
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
    Vary: "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

/* ======================================================
 * ENV
 * ====================================================== */
function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

/* ======================================================
 * AUTH (JWT-only)
 * ====================================================== */
function getBearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? "";
}

function getServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${SERVICE_ROLE}` } },
  });
}

/**
 * requireJwtCustomer
 * - JWT válido
 * - org_members ACTIVE por auth_user_id
 * - org_id -> customer_id vía organizations
 */
async function requireJwtCustomer(supabase: ReturnType<typeof createClient>, jwt: string) {
  // 1) validar JWT (usuario logado)
  const { data: u, error: uErr } = await supabase.auth.getUser(jwt);
  if (uErr || !u?.user) throw new Error("Invalid Supabase JWT");

  const authUserId = u.user.id;

  // 2) membership ACTIVE por usuario
  const { data: mem, error: mErr } = await supabase
    .from("debacu_eval_org_members")
    .select("org_id, role, status, user_id, auth_user_id")
    .eq("auth_user_id", authUserId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (mErr) throw new Error(mErr.message);
  if (!mem?.org_id) throw new Error("User has no ACTIVE org membership");

  const orgId = String(mem.org_id);

  // 3) resolver customer_id desde organizations
  const { data: org, error: oErr } = await supabase
    .from("debacu_eval_organizations")
    .select("id, customer_id")
    .eq("id", orgId)
    .maybeSingle();

  if (oErr) throw new Error(oErr.message);
  if (!org?.customer_id) throw new Error("Organization has no customer_id");

  const customerId = String(org.customer_id);

  return { authUserId, orgId, customerId, role: mem.role as string };
}

/* ======================================================
 * TYPES
 * ====================================================== */
type ManageAction =
  | "ITEM_OVERRIDE_UPSERT"
  | "ITEM_CUSTOM_UPSERT"
  | "ITEM_CUSTOM_DISABLE"
  | "INC_OVERRIDE_UPSERT"
  | "INC_CUSTOM_UPSERT"
  | "INC_CUSTOM_DISABLE";

/* ======================================================
 * HELPERS
 * ====================================================== */
function toUpperSnake(input: string) {
  const raw = (input ?? "").trim().toUpperCase();
  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized;
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

/* ======================================================
 * MAIN
 * ====================================================== */
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json(origin, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const jwt = getBearer(req);
    if (!jwt) return json(origin, 401, { ok: false, error: "Missing Authorization Bearer token" });

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const action: ManageAction | "" = body?.action ?? "";
    const payload: any = body?.payload ?? {};

    if (!action) return json(origin, 400, { ok: false, error: "Missing action" });

    const supabase = getServiceClient();

    // ✅ tenant real: customerId (no orgId)
    const { customerId } = await requireJwtCustomer(supabase, jwt);

    /** ======================================================
     *  ACTIONS
     * ====================================================== */
    if (action === "ITEM_OVERRIDE_UPSERT") {
      const item_code = toUpperSnake(payload?.item_code ?? "");
      if (!item_code) return json(origin, 400, { ok: false, error: "Missing item_code" });

      const is_active = asBool(payload?.is_active, true);
      const unit_price = asNumOrNull(payload?.unit_price);

      const { data: g, error: gErr } = await supabase
        .from("debacu_item_catalog")
        .select("item_code,title,category,currency,description")
        .eq("item_code", item_code)
        .maybeSingle();

      if (gErr) return json(origin, 500, { ok: false, error: gErr.message });
      if (!g) return json(origin, 400, { ok: false, error: `Global item_code not found: ${item_code}` });

      const upsertRow = {
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

      const { error: uErr } = await supabase
        .from("debacu_hotel_item_catalog")
        .upsert(upsertRow, { onConflict: "customer_id,item_code" });

      if (uErr) return json(origin, 500, { ok: false, error: uErr.message });

      return json(origin, 200, { ok: true, action, customerId, item_code });
    }

    if (action === "ITEM_CUSTOM_UPSERT") {
      const item_code = toUpperSnake(payload?.item_code ?? "");
      const title = clampText(payload?.title ?? "", 120);
      if (!item_code) return json(origin, 400, { ok: false, error: "Missing item_code" });
      if (!title) return json(origin, 400, { ok: false, error: "Missing title" });

      const unit_price = asNumOrNull(payload?.unit_price);
      if (unit_price === null) {
        return json(origin, 400, { ok: false, error: "Missing/invalid unit_price" });
      }

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

      const { error: uErr } = await supabase
        .from("debacu_hotel_item_catalog")
        .upsert(row, { onConflict: "customer_id,item_code" });

      if (uErr) return json(origin, 500, { ok: false, error: uErr.message });

      return json(origin, 200, { ok: true, action, customerId, item_code });
    }

    if (action === "ITEM_CUSTOM_DISABLE") {
      const item_code = toUpperSnake(payload?.item_code ?? "");
      if (!item_code) return json(origin, 400, { ok: false, error: "Missing item_code" });

      const { error: uErr } = await supabase
        .from("debacu_hotel_item_catalog")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("customer_id", customerId)
        .eq("item_code", item_code);

      if (uErr) return json(origin, 500, { ok: false, error: uErr.message });

      return json(origin, 200, { ok: true, action, customerId, item_code });
    }

    if (action === "INC_OVERRIDE_UPSERT") {
      const incident_type = toUpperSnake(payload?.incident_type ?? "");
      if (!incident_type) return json(origin, 400, { ok: false, error: "Missing incident_type" });

      const { data: g, error: gErr } = await supabase
        .from("debacu_incident_catalog")
        .select("incident_type")
        .eq("incident_type", incident_type)
        .maybeSingle();

      if (gErr) return json(origin, 500, { ok: false, error: gErr.message });
      if (!g) return json(origin, 400, { ok: false, error: `Global incident_type not found: ${incident_type}` });

      const row = {
        customer_id: customerId,
        incident_type,
        is_active: asBool(payload?.is_active, true),

        title_override: payload?.title_override ? clampText(payload.title_override, 120) : null,
        description_override: payload?.description_override
          ? clampText(payload.description_override, 300)
          : null,
        severity_override: clampInt(payload?.severity_override, 1, 5),

        default_gross_min_override: asNumOrNull(payload?.default_gross_min_override),
        default_gross_max_override: asNumOrNull(payload?.default_gross_max_override),
        default_recovery_pct_override: clampInt(payload?.default_recovery_pct_override, 0, 100),

        suggested_actions_override: payload?.suggested_actions_override
          ? clampText(payload.suggested_actions_override, 240)
          : null,

        updated_at: new Date().toISOString(),
      };

      const { error: uErr } = await supabase
        .from("debacu_hotel_incident_overrides")
        .upsert(row, { onConflict: "customer_id,incident_type" });

      if (uErr) return json(origin, 500, { ok: false, error: uErr.message });

      return json(origin, 200, { ok: true, action, customerId, incident_type });
    }

    if (action === "INC_CUSTOM_UPSERT") {
      const incident_type = toUpperSnake(payload?.incident_type ?? "");
      const title = clampText(payload?.title ?? "", 120);
      if (!incident_type) return json(origin, 400, { ok: false, error: "Missing incident_type" });
      if (!title) return json(origin, 400, { ok: false, error: "Missing title" });

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

      const { error: uErr } = await supabase
        .from("debacu_hotel_incident_custom")
        .upsert(row, { onConflict: "customer_id,incident_type" });

      if (uErr) return json(origin, 500, { ok: false, error: uErr.message });

      return json(origin, 200, { ok: true, action, customerId, incident_type });
    }

    if (action === "INC_CUSTOM_DISABLE") {
      const incident_type = toUpperSnake(payload?.incident_type ?? "");
      if (!incident_type) return json(origin, 400, { ok: false, error: "Missing incident_type" });

      const { error: uErr } = await supabase
        .from("debacu_hotel_incident_custom")
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq("customer_id", customerId)
        .eq("incident_type", incident_type);

      if (uErr) return json(origin, 500, { ok: false, error: uErr.message });

      return json(origin, 200, { ok: true, action, customerId, incident_type });
    }

    return json(origin, 400, { ok: false, error: `Unknown action: ${action}` });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const isClient =
      msg.includes("Missing") ||
      msg.includes("Invalid") ||
      msg.includes("expired") ||
      msg.includes("revoked") ||
      msg.includes("not found") ||
      msg.includes("no ACTIVE org");

    return json(origin, isClient ? 400 : 500, { ok: false, error: msg });
  }
});
