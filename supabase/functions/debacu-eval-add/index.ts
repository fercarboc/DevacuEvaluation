import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/* ======================================================
 * CONST
 * ====================================================== */
const APP_ID = "DEBACU_EVAL";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

/* ======================================================
 * CORS + RESP
 * ====================================================== */
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
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`MISSING_ENV:${name}`);
  return v;
}

function logLine(payload: Record<string, unknown>) {
  console.log(JSON.stringify(payload));
}

/* ======================================================
 * Clients
 * ====================================================== */
function userClient(req: Request, supabaseUrl: string, anonKey: string) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

function adminClient(supabaseUrl: string, serviceRole: string) {
  return createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/* ======================================================
 * AuthN (JWT)
 * ====================================================== */
async function requireJwtUser(sbUser: ReturnType<typeof createClient>) {
  const { data, error } = await sbUser.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

/* ======================================================
 * AuthZ (tenant context)
 * ====================================================== */
async function requireOrgMemberAndCustomerId(admin: ReturnType<typeof createClient>, userId: string) {
  // 1) membership (coge el más reciente ACTIVE)
  const { data: mem, error: memErr } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, role, status, created_at")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (memErr) throw new Error(`MEMBERSHIP_FAILED:${memErr.message}`);
  if (!mem?.org_id) throw new Error("FORBIDDEN_NO_ORG");

  const org_id = String(mem.org_id);
  const role = mem.role ?? null;

  // 2) customer_id: entitlements view (si existe)
  let customer_id: string | null = null;
  try {
    const { data: ent, error: entErr } = await admin
      .from("debacu_eval_org_entitlements_v")
      .select("customer_id")
      .eq("org_id", org_id)
      .maybeSingle();

    if (entErr) {
      logLine({ fn: "debacu-eval-add", stage: "entitlements_err", org_id, detail: entErr.message });
    } else if (ent?.customer_id) {
      customer_id = String(ent.customer_id);
    }
  } catch {
    // ignore (view may not exist)
  }

  // 3) fallback organizations
  if (!customer_id) {
    const { data: org, error: orgErr } = await admin
      .from("debacu_eval_organizations")
      .select("customer_id")
      .eq("id", org_id)
      .maybeSingle();

    if (orgErr) throw new Error(`ORG_LOOKUP_FAILED:${orgErr.message}`);
    if (!org?.customer_id) throw new Error("FORBIDDEN_NO_CUSTOMER");
    customer_id = String(org.customer_id);
  }

  return { org_id, role, customer_id, app_id: APP_ID };
}

/* ======================================================
 * Helpers (tu lógica)
 * ====================================================== */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function str(v: unknown) {
  return String(v ?? "").trim();
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function clampInt(v: unknown, min: number, max: number) {
  const n = Math.trunc(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function seasonMultiplier(season: string | null, profile: any) {
  const high = num(profile?.season_mult_high) ?? 1;
  const low = num(profile?.season_mult_low) ?? 1;
  if (season === "HIGH") return high;
  if (season === "LOW") return low;
  return 1;
}

/* ======================================================
 * Data fetchers
 * ====================================================== */

/** ✅ TABLA CORRECTA: debacu_eval_hotel_profile */
async function getHotelProfile(admin: ReturnType<typeof createClient>, customer_id: string) {
  const { data, error } = await admin
    .from("debacu_eval_hotel_profile")
    .select("customer_id, hotel_category, adr_real, season_mult_high, season_mult_low, profile_completed")
    .eq("customer_id", customer_id)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function getAdrReference(admin: ReturnType<typeof createClient>, hotel_category: number) {
  const { data, error } = await admin
    .from("debacu_adr_reference_by_category")
    .select("adr_reference")
    .eq("hotel_category", hotel_category)
    .maybeSingle();

  if (error) throw error;
  return num(data?.adr_reference);
}

async function getIncidentCatalog(admin: ReturnType<typeof createClient>, incident_type: string) {
  const { data, error } = await admin
    .from("debacu_incident_catalog")
    .select(
      "incident_type, is_active, severity, default_gross_min, default_gross_max, default_recovery_pct, title, description, suggested_actions",
    )
    .eq("incident_type", incident_type)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (data.is_active === false) return null;
  return data;
}

async function getIncidentOverride(admin: ReturnType<typeof createClient>, customer_id: string, incident_type: string) {
  const { data, error } = await admin
    .from("debacu_hotel_incident_overrides")
    .select(
      "incident_type, is_active, severity_override, default_gross_min_override, default_gross_max_override, default_recovery_pct_override, title_override, description_override, suggested_actions_override",
    )
    .eq("customer_id", customer_id)
    .eq("incident_type", incident_type)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (data.is_active === false) return null;
  return data;
}

/**
 * Fuente de precio por hotel: debacu_hotel_item_catalog
 */
async function getHotelItemUnitPrice(admin: ReturnType<typeof createClient>, customer_id: string, item_code: string) {
  const { data, error } = await admin
    .from("debacu_hotel_item_catalog")
    .select("unit_price, is_active")
    .eq("customer_id", customer_id)
    .eq("item_code", item_code)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (data.is_active === false) return null;
  return num(data.unit_price);
}

/* ======================================================
 * MAIN
 * ====================================================== */
serve(async (req) => {
  const origin = req.headers.get("origin");
  const FN = "debacu-eval-add";

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json(origin, 405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
    const ANON_KEY = mustEnv("SUPABASE_ANON_KEY");

    const admin = adminClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const sbUser = userClient(req, SUPABASE_URL, ANON_KEY);

    // 1) JWT
    const user = await requireJwtUser(sbUser);

    // 2) tenant context
    const ctx = await requireOrgMemberAndCustomerId(admin, user.id);

    // 3) body
    const body = await req.json().catch(() => null);
    if (!body) return json(origin, 400, { ok: false, error: "invalid_json_body" });

    const accept_declaration = body.accept_declaration ?? body.acceptDeclaration ?? true;
    const input = body.input;

    if (!input) return json(origin, 400, { ok: false, error: "missing_input" });
    if (accept_declaration !== true) {
      return json(origin, 400, { ok: false, error: "must_accept_declaration" });
    }

    logLine({
      fn: FN,
      stage: "start",
      user_id: user.id,
      org_id: ctx.org_id,
      customer_id: ctx.customer_id,
      app_id: ctx.app_id,
    });

    // 4) perfil (✅ ahora mira debacu_eval_hotel_profile)
    const profile = await getHotelProfile(admin, ctx.customer_id);

    const hotelCategoryOk = profile?.hotel_category !== null && profile?.hotel_category !== undefined;
    const profileCompletedOk = profile?.profile_completed === true;

    if (!profile || !hotelCategoryOk || !profileCompletedOk) {
      return json(origin, 409, {
        ok: false,
        error: "ONBOARDING_REQUIRED",
        detail: "Perfil de hotel incompleto (falta hotel_category o profile_completed).",
        debug: {
          customer_id: ctx.customer_id,
          has_profile_row: !!profile,
          hotel_category: profile?.hotel_category ?? null,
          profile_completed: profile?.profile_completed ?? null,
        },
      });
    }

    // 5) campos base
    const document = str(input.document);
    const full_name = str(input.full_name ?? input.fullName);
    const rating = clampInt(input.rating, 1, 5);

    if (!document || !full_name) {
      return json(origin, 400, { ok: false, error: "missing_required_fields", detail: "document y full_name" });
    }

    const incident_type = str(input.incident_type ?? input.incidentType) || null;
    const season_applied = str(input.season_applied ?? input.seasonApplied) || null;

    const impact_items_raw = input.impact_items ?? input.impactItems ?? null;
    const impact_items = Array.isArray(impact_items_raw) ? impact_items_raw : [];

    // snapshots
    const hotel_category = Number(profile.hotel_category);
    const adr_reference = await getAdrReference(admin, hotel_category);
    const adr_real_snapshot = num(profile.adr_real);

    // economía
    let economic_impact_gross: number | null = null;
    let economic_recovered: number | null = null;
    let economic_net_loss: number | null = null;

    if (incident_type) {
      const cat = await getIncidentCatalog(admin, incident_type);
      if (!cat) {
        return json(origin, 400, { ok: false, error: "INCIDENT_INVALID", detail: incident_type });
      }

      const ovr = await getIncidentOverride(admin, ctx.customer_id, incident_type);
      const mult = seasonMultiplier(season_applied, profile);

      // 1) gross desde items
      let gross_items = 0;

      for (const it of impact_items) {
        const code = str(it?.code ?? it?.item_code ?? it?.itemCode);
        const qtyRaw = it?.qty ?? it?.quantity ?? 1;
        const qty = Math.max(1, Math.trunc(Number(qtyRaw)));

        if (!code) continue;

        const unit = await getHotelItemUnitPrice(admin, ctx.customer_id, code);
        if (unit === null) continue;

        gross_items += unit * qty;
      }

      // 2) fallback: gross_min
      const gross_min = num(ovr?.default_gross_min_override) ?? num(cat.default_gross_min) ?? 0;

      economic_impact_gross =
        gross_items > 0
          ? Math.round(gross_items * mult * 100) / 100
          : Math.round(gross_min * mult * 100) / 100;

      // 3) recovered
      const recovered_input = num(input.economic_recovered ?? input.economicRecovered);
      if (recovered_input !== null) {
        economic_recovered = Math.round(Math.max(0, recovered_input) * 100) / 100;
      } else {
        const pct = num(ovr?.default_recovery_pct_override) ?? num(cat.default_recovery_pct) ?? 0;
        economic_recovered = Math.round((economic_impact_gross * pct / 100) * 100) / 100;
      }

      // 4) net loss
      economic_net_loss = Math.round((economic_impact_gross - (economic_recovered ?? 0)) * 100) / 100;
      if (economic_net_loss < 0) economic_net_loss = 0;
    }

    // 6) INSERT
    const payload: Record<string, unknown> = {
      document,
      full_name,
      nationality: str(input.nationality) || null,
      phone: str(input.phone) || null,
      email: str(input.email).toLowerCase() || null,
      rating,
      comment: str(input.comment).slice(0, 240) || null,
      platform: str(input.platform) || APP_ID,
      evaluation_date: str(input.evaluation_date ?? input.evaluationDate) || todayISO(),

      // tenant ownership
      customer_id: ctx.customer_id,

      // snapshots
      hotel_category,
      adr_reference,
      adr_real_snapshot,
      season_applied,

      // incident
      incident_type,
      impact_items: incident_type ? (impact_items.length ? impact_items : null) : null,

      // economy
      economic_impact_gross,
      economic_recovered,
      economic_net_loss,
    };

    const { data, error } = await admin
      .from("debacu_evaluations")
      .insert(payload)
      .select(
        "id, document, full_name, nationality, phone, email, rating, comment, platform, evaluation_date," +
          "customer_id, hotel_category, incident_type, economic_impact_gross, economic_recovered, economic_net_loss," +
          "impact_items, season_applied, adr_reference, adr_real_snapshot, created_at",
      )
      .single();

    if (error) {
      logLine({ fn: FN, stage: "insert_err", detail: error.message, code: (error as any).code });
      return json(origin, 500, { ok: false, error: "insert_failed", detail: error.message });
    }

    logLine({
      fn: FN,
      stage: "ok",
      user_id: user.id,
      org_id: ctx.org_id,
      customer_id: ctx.customer_id,
      app_id: ctx.app_id,
      status: 200,
      evaluation_id: data?.id ?? null,
    });

    return json(origin, 200, { ok: true, row: data });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    const status =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg.startsWith("MISSING_ENV:")
        ? 500
        : msg.startsWith("MEMBERSHIP_FAILED") || msg.startsWith("ORG_") || msg.startsWith("FORBIDDEN")
        ? 403
        : 500;

    logLine({ fn: "debacu-eval-add", stage: "error", status, detail: msg });
    return json(origin, status, { ok: false, error: "request_failed", detail: msg });
  }
});
