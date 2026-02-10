import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/** ======================================================
 *  CORS
 *  ====================================================== */
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
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-session-token",
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

/** ======================================================
 *  Utils
 *  ====================================================== */
function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function toNumOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toIntOrNull(v: any): number | null {
  const n = toNumOrNull(v);
  if (n === null) return null;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function toBoolOrNull(v: any): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return Boolean(v);
}

function isHHMM(v: any) {
  const s = safeStr(v);
  if (!s) return true; // permitimos null/vacío
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

/** ======================================================
 *  Auth + Clients
 *  ====================================================== */
function userClient(req: Request, supabaseUrl: string, anonKey: string) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

function adminClient(supabaseUrl: string, serviceKey: string) {
  return createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function requireJwtUser(sbUser: ReturnType<typeof createClient>) {
  const { data, error } = await sbUser.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

async function requireEvalSession(params: {
  admin: ReturnType<typeof createClient>;
  token: string;
  app_code?: string;
}) {
  const { admin, token, app_code } = params;
  const now = Date.now();

  const { data, error } = await admin
    .from("debacu_eval_sessions")
    .select("customer_id, app_code, revoked_at, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error) throw new Error(`SESSION_CHECK_FAILED:${error.message}`);
  if (!data) throw new Error("SESSION_INVALID");
  if (data.revoked_at) throw new Error("SESSION_REVOKED");

  if (app_code && String(data.app_code ?? "") !== String(app_code)) {
    throw new Error("SESSION_APP_MISMATCH");
  }

  if (data.expires_at) {
    const exp = new Date(String(data.expires_at)).getTime();
    if (!Number.isFinite(exp) || exp < now) throw new Error("SESSION_EXPIRED");
  }

  const customerId = String(data.customer_id ?? "");
  if (!customerId) throw new Error("SESSION_NO_CUSTOMER");

  return { customerId };
}

/** ======================================================
 *  Completeness / Audit
 *  ====================================================== */
type AuditState = { audit_ok: boolean; missing_fields: string[] };

function computeAudit(params: {
  country: string | null;
  province: string | null;
  city: string | null;

  property_type: string | null;
  hotel_category: number | null;
  currency: string | null;
  timezone: string | null;
  rooms_count: number | null;
}): AuditState {
  const miss: string[] = [];

  const country = safeStr(params.country) || null;
  const province = safeStr(params.province) || null;
  const city = safeStr(params.city) || null;

  const property_type = safeStr(params.property_type) || null;
  const hotel_category = params.hotel_category ?? null;
  const currency = safeStr(params.currency) || null;
  const timezone = safeStr(params.timezone) || null;
  const rooms_count = params.rooms_count ?? null;

  if (!property_type) miss.push("property_type");
  if (!country) miss.push("country");
  if (!province) miss.push("province");
  if (!city) miss.push("city");

  if (hotel_category === null || !Number.isFinite(Number(hotel_category))) miss.push("hotel_category");
  if (!currency) miss.push("currency");
  if (!timezone) miss.push("timezone");
  if (rooms_count === null || rooms_count <= 0) miss.push("rooms_count");

  return { audit_ok: miss.length === 0, missing_fields: miss };
}

/** ======================================================
 *  Handler
 *  ====================================================== */
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }

  if (req.method !== "POST") {
    return json(origin, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const ANON_KEY = mustEnv("SUPABASE_ANON_KEY");
    const SERVICE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("authorization") || "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
      return json(origin, 401, { ok: false, error: "Missing Authorization Bearer token" });
    }

    const sessionToken = safeStr(req.headers.get("x-session-token"));
    if (!sessionToken) {
      return json(origin, 401, { ok: false, error: "Missing x-session-token" });
    }

    const body = await req.json().catch(() => ({}));
    const appId = String(body?.app_id ?? body?.appId ?? "DEBACU_EVAL");

    const admin = adminClient(SUPABASE_URL, SERVICE_KEY);
    const sbUser = userClient(req, SUPABASE_URL, ANON_KEY);

    await requireJwtUser(sbUser);

    const { customerId } = await requireEvalSession({
      admin,
      token: sessionToken,
      app_code: appId,
    });

    // ========= Normaliza / valida =========
    const hotel_category = clamp(Number(body?.hotel_category ?? 3), 1, 5);

    const occupancy_target =
      body?.occupancy_target === null || body?.occupancy_target === undefined
        ? null
        : clamp(Number(body.occupancy_target), 0, 1);

    const cancellation_rate_target =
      body?.cancellation_rate_target === null || body?.cancellation_rate_target === undefined
        ? null
        : clamp(Number(body.cancellation_rate_target), 0, 1);

    const revpar_target = toNumOrNull(body?.revpar_target);

    const checkin_time = body?.checkin_time ?? null;
    const checkout_time = body?.checkout_time ?? null;

    if (!isHHMM(checkin_time)) throw new Error("VALIDATION_CHECKIN_TIME");
    if (!isHHMM(checkout_time)) throw new Error("VALIDATION_CHECKOUT_TIME");

    const rooms_count = toIntOrNull(body?.rooms_count);
    const max_occupancy = toIntOrNull(body?.max_occupancy);

    const nowIso = new Date().toISOString();

    // ========= UPSERT profile (incluye ubicación+contacto en la misma tabla) =========
    const rowBase: any = {
      customer_id: customerId,
      app_id: appId,

      // Identidad
      hotel_name: body?.hotel_name ?? null,
      property_type: body?.property_type ?? null,
      hotel_category,

      // Ubicación (YA NO customers)
      country: body?.country ?? null,
      province: body?.province ?? null,
      city: body?.city ?? null,
      address: body?.address ?? null,
      postal_code: body?.postal_code ?? null,

      // Contacto (YA NO customers)
      contact_email: body?.contact_email ?? null,
      contact_phone: body?.contact_phone ?? null,
      contact_person: body?.contact_person ?? null,
      contact_role: body?.contact_role ?? null,

      // Economía
      monthly_stays_estimated: toNumOrNull(body?.monthly_stays_estimated),
      adr_real: toNumOrNull(body?.adr_real),
      season_mult_high: toNumOrNull(body?.season_mult_high),
      season_mult_low: toNumOrNull(body?.season_mult_low),
      currency: body?.currency ?? "EUR",

      // Targets
      occupancy_target,
      cancellation_rate_target,
      revpar_target,

      // Operativa
      timezone: body?.timezone ?? null,
      checkin_time,
      checkout_time,
      rooms_count,
      max_occupancy,

      monthly_revenue_estimate: toNumOrNull(body?.monthly_revenue_estimate),

      // Flags
      has_restaurant: toBoolOrNull(body?.has_restaurant) ?? false,
      has_spa: toBoolOrNull(body?.has_spa) ?? false,
      has_parking: toBoolOrNull(body?.has_parking) ?? false,
      allows_pets: toBoolOrNull(body?.allows_pets) ?? false,

      updated_at: nowIso,
    };

    const { data: upserted, error: upErr } = await admin
      .from("debacu_eval_hotel_profile")
      .upsert(rowBase, { onConflict: "customer_id,app_id" })
      .select("*")
      .single();

    if (upErr) throw new Error(`DB_UPSERT:${upErr.message}`);

    // ========= audit =========
    const audit = computeAudit({
      country: upserted?.country ?? null,
      province: upserted?.province ?? null,
      city: upserted?.city ?? null,

      property_type: upserted?.property_type ?? null,
      hotel_category: upserted?.hotel_category ?? null,
      currency: upserted?.currency ?? null,
      timezone: upserted?.timezone ?? null,
      rooms_count: upserted?.rooms_count ?? null,
    });

    // ========= flags =========
    const prevCompleted = Boolean(upserted?.profile_completed);
    const nextCompleted = audit.audit_ok;

    let nextCompletedAt: string | null = upserted?.profile_completed_at ?? null;
    if (nextCompleted && !prevCompleted) nextCompletedAt = nowIso;
    if (!nextCompleted) nextCompletedAt = null;

    if (
      prevCompleted !== nextCompleted ||
      String(upserted?.profile_completed_at ?? "") !== String(nextCompletedAt ?? "")
    ) {
      const { data: patched, error: patchErr } = await admin
        .from("debacu_eval_hotel_profile")
        .update({
          profile_completed: nextCompleted,
          profile_completed_at: nextCompletedAt,
          updated_at: nowIso,
        })
        .eq("customer_id", customerId)
        .eq("app_id", appId)
        .select("*")
        .single();

      if (patchErr) throw new Error(`DB_PROFILE_FLAGS_UPDATE:${patchErr.message}`);

      return json(origin, 200, {
        ok: true,
        profile: patched,
        audit_ok: audit.audit_ok,
        missing_fields: audit.missing_fields,
      });
    }

    return json(origin, 200, {
      ok: true,
      profile: upserted,
      audit_ok: audit.audit_ok,
      missing_fields: audit.missing_fields,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    const status =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg.startsWith("SESSION_")
        ? 401
        : msg.startsWith("VALIDATION_")
        ? 400
        : msg.startsWith("DB_")
        ? 500
        : 500;

    return json(origin, status, { ok: false, error: "Request failed", detail: msg });
  }
});
