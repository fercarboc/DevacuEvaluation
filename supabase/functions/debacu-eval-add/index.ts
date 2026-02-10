// supabase/functions/debacu-eval-add/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/* ======================================================
 * ENV
 * ====================================================== */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_APP_CODE = "DEBACU_EVAL";

/* ======================================================
 * CORS (whitelist + preflight 204)
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

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/* ======================================================
 * Helpers
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
 * Session (UUID real)
 * ====================================================== */
async function requireSession(token: string, app_code: string) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("debacu_eval_sessions")
    .select("customer_id, customer_name, app_code, expires_at, revoked_at")
    .eq("token", token)
    .eq("app_code", app_code)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .maybeSingle();

  if (error || !data || !data.customer_id) return null;
  return data;
}

/* ======================================================
 * Data fetchers (alineados a tu BD REAL)
 * ====================================================== */
async function getHotelProfile(customer_id: string) {
  const { data, error } = await supabase
    .from("debacu_hotel_profile")
    .select("customer_id, hotel_category, adr_real, season_mult_high, season_mult_low")
    .eq("customer_id", customer_id)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function getAdrReference(hotel_category: number) {
  const { data, error } = await supabase
    .from("debacu_adr_reference_by_category")
    .select("adr_reference")
    .eq("hotel_category", hotel_category)
    .maybeSingle();

  if (error) throw error;
  return num(data?.adr_reference);
}

// ✅ Tu tabla REAL: debacu_incident_catalog (NO tiene "code"; usa incident_type)
async function getIncidentCatalog(incident_type: string) {
  const { data, error } = await supabase
    .from("debacu_incident_catalog")
    .select(
      "incident_type, is_active, severity, default_gross_min, default_gross_max, default_recovery_pct, title, description, suggested_actions"
    )
    .eq("incident_type", incident_type)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (data.is_active === false) return null;
  return data;
}

// ✅ Tu tabla REAL: debacu_hotel_incident_overrides
async function getIncidentOverride(customer_id: string, incident_type: string) {
  const { data, error } = await supabase
    .from("debacu_hotel_incident_overrides")
    .select(
      "incident_type, is_active, severity_override, default_gross_min_override, default_gross_max_override, default_recovery_pct_override, title_override, description_override, suggested_actions_override"
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
 * ✅ Fuente única de verdad: debacu_hotel_item_catalog
 * (No fallback a debacu_item_catalog, porque ya has materializado items por hotel)
 */
async function getHotelItemUnitPrice(customer_id: string, item_code: string) {
  const { data, error } = await supabase
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

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return json(origin, 405, { error: "Method not allowed" });
  }

  try {
    const token = str(req.headers.get("x-session-token"));
    if (!token) return json(origin, 401, { error: "Missing x-session-token" });

    const body = await req.json().catch(() => null);
    if (!body) return json(origin, 400, { error: "Invalid JSON body" });

    const app_code = str(body.app_code ?? body.appCode ?? DEFAULT_APP_CODE) || DEFAULT_APP_CODE;
    const accept_declaration = body.accept_declaration ?? body.acceptDeclaration ?? true;
    const input = body.input;

    if (!input) return json(origin, 400, { error: "Missing input" });
    if (accept_declaration !== true) {
      return json(origin, 400, { error: "Debes aceptar la declaración de veracidad." });
    }

    const session = await requireSession(token, app_code);
    if (!session) return json(origin, 401, { error: "Invalid or expired session" });

    // ✅ UUID REAL del hotel (propietario de los datos)
    const customer_uuid = session.customer_id as string;
    const customer_name = (session as any).customer_name ?? null;

    /* -------------------------
     * Perfil
     * ------------------------- */
    const profile = await getHotelProfile(customer_uuid);
    if (!profile || profile.hotel_category === null || profile.hotel_category === undefined) {
      return json(origin, 409, {
        error: "ONBOARDING_REQUIRED",
        details: "Perfil de hotel incompleto (falta hotel_category o profile).",
      });
    }

    /* -------------------------
     * Campos base
     * ------------------------- */
    const document = str(input.document);
    const full_name = str(input.full_name ?? input.fullName);
    const rating = clampInt(input.rating, 1, 5);

    if (!document || !full_name) {
      return json(origin, 400, { error: "document y full_name son obligatorios" });
    }

    const incident_type = str(input.incident_type ?? input.incidentType) || null;
    const season_applied = str(input.season_applied ?? input.seasonApplied) || null;

    // UI: items con { code, qty }. Aceptamos: code | item_code y qty | quantity
    const impact_items_raw = input.impact_items ?? input.impactItems ?? null;
    const impact_items = Array.isArray(impact_items_raw) ? impact_items_raw : [];

    /* -------------------------
     * Snapshots
     * ------------------------- */
    const hotel_category = Number(profile.hotel_category);
    const adr_reference = await getAdrReference(hotel_category);
    const adr_real_snapshot = num(profile.adr_real);

    /* -------------------------
     * Economía
     * ------------------------- */
    let economic_impact_gross: number | null = null;
    let economic_recovered: number | null = null;
    let economic_net_loss: number | null = null;

    if (incident_type) {
      const cat = await getIncidentCatalog(incident_type);
      if (!cat) {
        return json(origin, 400, { error: "INCIDENT_INVALID", details: incident_type });
      }

      const ovr = await getIncidentOverride(customer_uuid, incident_type);
      const mult = seasonMultiplier(season_applied, profile);

      // 1) gross desde items (si hay items)
      let gross_items = 0;

      for (const it of impact_items) {
        const code = str(it?.code ?? it?.item_code ?? it?.itemCode);
        const qtyRaw = it?.qty ?? it?.quantity ?? 1;
        const qty = Math.max(1, Math.trunc(Number(qtyRaw)));

        if (!code) continue;

        const unit = await getHotelItemUnitPrice(customer_uuid, code);
        if (unit === null) continue; // item no activo / no existe -> se ignora

        gross_items += unit * qty;
      }

      // 2) fallback: rango por defecto
      const gross_min =
        num(ovr?.default_gross_min_override) ?? num(cat.default_gross_min) ?? 0;

      economic_impact_gross =
        gross_items > 0
          ? Math.round(gross_items * mult * 100) / 100
          : Math.round(gross_min * mult * 100) / 100;

      // 3) recovered
      const recovered_input = num(input.economic_recovered ?? input.economicRecovered);
      if (recovered_input !== null) {
        economic_recovered = Math.round(Math.max(0, recovered_input) * 100) / 100;
      } else {
        const pct =
          num(ovr?.default_recovery_pct_override) ?? num(cat.default_recovery_pct) ?? 0;

        economic_recovered = Math.round((economic_impact_gross * pct / 100) * 100) / 100;
      }

      // 4) net loss
      economic_net_loss = Math.round(
        (economic_impact_gross - (economic_recovered ?? 0)) * 100
      ) / 100;
      if (economic_net_loss < 0) economic_net_loss = 0;
    }

    /* -------------------------
     * INSERT
     * ------------------------- */
    const payload: Record<string, unknown> = {
      document,
      full_name,
      nationality: str(input.nationality) || null,
      phone: str(input.phone) || null,
      email: str(input.email).toLowerCase() || null,
      rating,
      comment: str(input.comment).slice(0, 240) || null,
      platform: str(input.platform) || DEFAULT_APP_CODE,
      evaluation_date: str(input.evaluation_date ?? input.evaluationDate) || todayISO(),

      // ✅ CLAVE: tu tabla exige customer_id NOT NULL
      customer_id: customer_uuid,

      // ✅ autor/propietario (uuid-first)
      creator_customer_uuid: customer_uuid,

      // opcional: si existe columna creator_customer_name (si no existe, quítalo)
      ...(customer_name ? { creator_customer_name: customer_name } : {}),

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

    const { data, error } = await supabase
      .from("debacu_evaluations")
      .insert(payload)
      .select(
        "id, document, full_name, nationality, phone, email, rating, comment, platform, evaluation_date, " +
          "customer_id, creator_customer_uuid, hotel_category, incident_type, economic_impact_gross, economic_recovered, economic_net_loss, " +
          "impact_items, season_applied, adr_reference, adr_real_snapshot, created_at"
      )
      .single();

    if (error) {
      return json(origin, 500, {
        error: "Insert error",
        details: error.message,
        hint: (error as any).hint,
        code: (error as any).code,
      });
    }

    return json(origin, 200, { ok: true, row: data });
  } catch (e: any) {
    return json(origin, 500, {
      error: "Unexpected error",
      details: String(e?.message ?? e),
    });
  }
});
