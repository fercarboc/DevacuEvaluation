// supabase/functions/customer_audit_export_generate/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const APP_ID = "DEBACU_EVAL";

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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // ✅ JWT-only
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

function userClient(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

async function requireJwtUser(req: Request) {
  const sb = userClient(req);
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** ======================================================
 * ORG + ENTITLEMENTS (JWT-only)
 * ====================================================== */
async function resolveOrgIdForUserOrThrow(admin: ReturnType<typeof adminClient>, userId: string) {
  const { data, error } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`MEMBERSHIP_LOOKUP_FAILED:${error.message}`);
  if (!data?.org_id) throw new Error("FORBIDDEN_NO_ORG");

  return { org_id: String(data.org_id), role: (data.role ?? null) as string | null };
}

type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  subscription_status: string | null; // hoy: ACTIVE o null
  plan_code: string | null;
  max_users: number | null;
  seats_used: number;
};

async function loadEntitlementsOrThrow(admin: ReturnType<typeof adminClient>, orgId: string) {
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, subscription_status, plan_code, max_users, seats_used")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`ENTITLEMENTS_FAILED:${error.message}`);
  if (!data) throw new Error("FORBIDDEN_NO_ENTITLEMENTS");
  return data as EntitlementsRow;
}

function assertOrgActiveOrThrow(ent: EntitlementsRow) {
  if (ent.subscription_status !== "ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
  if (!ent.customer_id) throw new Error("NO_CUSTOMER_ON_ORG");
}

/** ======================================================
 * Types + utils
 * ====================================================== */
type ReqBody = {
  export_type: "PDF" | "CSV";
  export_scope: string;
  period_from: string; // yyyy-mm-dd
  period_to: string; // yyyy-mm-dd
  filters?: any;
  storage_bucket?: string; // lo ignoramos (no confiar)
};

function assertDate(s: string, name: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`BAD_${name.toUpperCase()}`);
}

function normalizeFilters(v: unknown): Record<string, unknown> {
  if (!v) return {};
  if (typeof v === "object") return v as Record<string, unknown>;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      // ignore
    }
  }
  return {};
}

function safeScope(scope: string) {
  return String(scope).trim();
}

export default Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const admin = adminClient();

  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(origin, 405, { ok: false, error: "method_not_allowed" });

  try {
    // 1) JWT user
    const user = await requireJwtUser(req);

    // 2) org + entitlements (JWT-only)
    const { org_id, role } = await resolveOrgIdForUserOrThrow(admin, user.id);
    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertOrgActiveOrThrow(ent);

    // (ahora mismo no lo usas aquí, pero lo dejo por coherencia)
    const customer_id = String(ent.customer_id);

    // 3) body
    const body = (await req.json().catch(() => ({}))) as ReqBody;

    if (!body?.export_type || !body?.export_scope) throw new Error("BAD_REQUEST");
    assertDate(body.period_from, "period_from");
    assertDate(body.period_to, "period_to");
    if (body.period_from > body.period_to) throw new Error("BAD_RANGE");

    const export_type = body.export_type;
    const export_scope = safeScope(body.export_scope);

    // ✅ filters SIEMPRE {}
    const filters = normalizeFilters(body.filters);

    // ✅ no confiar en FE; bucket fijo permitido
    const storage_bucket = "customer-exports";

    // 4) crea registro PENDING
    const { data: created, error: insErr } = await admin
      .from("customer_audit_exports")
      .insert({
        org_id,
        app_id: APP_ID,

        requested_by_user_id: user.id,
        requested_by_role: role,
        requested_by_email: user.email ?? null,

        export_type,
        export_scope,
        period_from: body.period_from,
        period_to: body.period_to,

        filters,
        status: "PENDING",

        storage_bucket,
        storage_path: "",

        // opcional: si tienes columna customer_id en la tabla, es buena idea rellenarla:
        // customer_id,
      })
      .select("id")
      .single();

    if (insErr || !created?.id) throw new Error(`CREATE_FAILED:${insErr?.message ?? "NO_ID"}`);

    const export_id = created.id as string;

    // Aquí irá tu pipeline real (generate + upload + update READY/FAILED).
    return json(origin, 200, { ok: true, export_id, status: "PENDING" });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const code =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg.startsWith("FORBIDDEN")
        ? 403
        : msg.startsWith("PLAN_NOT_ACTIVE")
        ? 402
        : msg.startsWith("BAD_") || msg === "BAD_REQUEST"
        ? 400
        : 500;

    console.error("customer_audit_export_generate error:", e);
    return json(origin, code, { ok: false, error: "request_failed", detail: msg });
  }
});
