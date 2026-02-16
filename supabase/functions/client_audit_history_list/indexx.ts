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
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // ✅ JWT-only: fuera x-session-token
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

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireJwtUser(req: Request) {
  const sb = userClient(req);
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
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
  subscription_status: string | null; // en tu view: ACTIVE o null (hoy)
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
  // Ajusta aquí si tu view evoluciona a TRIAL_ACTIVE, GRACE, etc.
  if (ent.subscription_status !== "ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
  if (!ent.customer_id) throw new Error("NO_CUSTOMER_ON_ORG");
}

/** ======================================================
 * INPUT
 * ====================================================== */
type ReqBody = {
  page?: number;       // 1..n
  pageSize?: number;   // 5..100
  q?: string;          // search
  event_type?: string; // default CHECK_SIGNALS
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function safeStr(v: unknown) {
  return typeof v === "string" ? v : "";
}

/** ======================================================
 * MAIN
 * ====================================================== */
export default Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(origin, 405, { ok: false, error: "method_not_allowed" });

  try {
    const user = await requireJwtUser(req);
    const admin = adminClient();

    // ✅ JWT-only: org membership por user_id
    const { org_id, role: currentRole } = await resolveOrgIdForUserOrThrow(admin, user.id);

    // ✅ customer_id + plan gating desde entitlements
    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertOrgActiveOrThrow(ent);
    const customer_id = String(ent.customer_id);

    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const page = clamp(Number(body.page ?? 1) || 1, 1, 10_000);
    const pageSize = clamp(Number(body.pageSize ?? 10) || 10, 5, 100);
    const q = safeStr(body.q).trim();
    const eventType = safeStr(body.event_type).trim() || "CHECK_SIGNALS";

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = admin
      .from("debacu_eval_audit_log")
      .select(
        "id,created_at,actor_user_id,action,entity,entity_id,meta,customer_id,app_id,event_type,search_kind,search_value_masked,result_count",
        { count: "exact" }
      )
      .eq("customer_id", customer_id)
      .eq("app_id", APP_ID)
      .eq("event_type", eventType)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (q) {
      const like = `%${q}%`;
      query = query.or(`id.ilike.${like},search_value_masked.ilike.${like},action.ilike.${like}`);
    }

    const { data: rows, error, count } = await query;
    if (error) throw new Error(`LIST_FAILED:${error.message}`);

    const actorIds = Array.from(new Set((rows ?? []).map((r: any) => r.actor_user_id).filter(Boolean))) as string[];

    let roleByUserId: Record<string, string> = {};
    if (actorIds.length > 0) {
      const { data: mems, error: memErr } = await admin
        .from("debacu_eval_org_members")
        .select("user_id, role")
        .eq("org_id", org_id)
        .in("user_id", actorIds);

      if (memErr) throw new Error(`MEMBERS_LOOKUP_FAILED:${memErr.message}`);

      roleByUserId = Object.fromEntries(
        (mems ?? []).map((m: any) => [String(m.user_id), String(m.role ?? "—")])
      );
    }

    const items = (rows ?? []).map((r: any) => {
      const meta = (r.meta ?? {}) as any;
      const risk = (meta?.risk ?? "NO_CONCLUYENTE") as string;
      const avgStars = meta?.avg_stars ?? null;

      const typeLabel =
        r.action === "CHECK_SIGNALS" ? "Consulta" :
        r.action === "PDF_ISSUED" ? "Exportación PDF" :
        String(r.action ?? "Evento");

      const detailLabel =
        r.entity === "EVALUATION_SEARCH" ? "Consulta de registro" :
        String(r.entity ?? "—");

      const userRole =
        r.actor_user_id ? (roleByUserId[String(r.actor_user_id)] ?? "—") : (currentRole ?? "—");

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

    return json(origin, 200, {
      ok: true,
      page,
      pageSize,
      total: count ?? 0,
      items,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const code =
      msg === "UNAUTHENTICATED" ? 401 :
      msg.startsWith("FORBIDDEN") ? 403 :
      msg.startsWith("PLAN_NOT_ACTIVE") ? 402 :
      msg.startsWith("BAD_") || msg === "BAD_REQUEST" ? 400 :
      500;

    console.error("client_audit_history_list error:", e);
    return json(origin, code, { ok: false, error: "request_failed", detail: msg });
  }
});
