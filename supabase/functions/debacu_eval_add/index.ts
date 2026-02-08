import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function cors(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-session-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(origin), "Content-Type": "application/json" },
  });
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function pickString(v: unknown) {
  return String(v ?? "").trim();
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function requireSession(token: string, app_code: string) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("debacu_eval_sessions")
    .select("*")
    .eq("token", token)
    .eq("app_code", app_code)
    .is("revoked_at", null)
    .gt("expires_at", now)
    .maybeSingle();

  if (error) return null;
  return data ?? null;
}

/**
 * Tablas esperadas (nombres que me pediste):
 * - debacu_incident_catalog (code pk, name, recovered_pct_default, etc.)
 * - debacu_item_catalog (code pk, name, unit_price_default, etc.)
 * - debacu_hotel_incident_pricing (customer_id, incident_code, override_recovered_pct?, etc.)
 * - debacu_hotel_item_pricing (customer_id, item_code, unit_price_override)
 * - debacu_hotel_profile (customer_id, hotel_category, adr_real, season_mult_high, season_mult_low, monthly_stays_estimated, ...)
 * - debacu_adr_reference_by_category (hotel_category, adr_reference)
 */

async function getHotelProfile(customer_id: string) {
  const { data, error } = await supabase
    .from("debacu_hotel_profile")
    .select("customer_id, hotel_category, adr_real, monthly_stays_estimated, season_mult_high, season_mult_low, updated_at")
    .eq("customer_id", customer_id)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

function ensureOnboarding(profile: any) {
  if (!profile) return "Falta perfil hotel (debacu_hotel_profile).";
  if (profile.hotel_category === null || profile.hotel_category === undefined) return "Falta categoría hotelera.";
  if (profile.monthly_stays_estimated === null || profile.monthly_stays_estimated === undefined) return "Falta estancias mensuales estimadas.";
  // season_mult_* pueden tener defaults en BD; si no, lo toleramos aquí
  return null;
}

async function getAdrReference(hotel_category: number) {
  const { data, error } = await supabase
    .from("debacu_adr_reference_by_category")
    .select("adr_reference")
    .eq("hotel_category", hotel_category)
    .maybeSingle();

  if (error) throw error;
  return data?.adr_reference ?? null;
}

async function getIncidentCatalog(incident_code: string) {
  const { data, error } = await supabase
    .from("debacu_incident_catalog")
    .select("code, recovered_pct_default, gross_min, gross_max, has_items")
    .eq("code", incident_code)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function getIncidentOverride(customer_id: string, incident_code: string) {
  const { data, error } = await supabase
    .from("debacu_hotel_incident_pricing")
    .select("customer_id, incident_code, recovered_pct_override, gross_min_override, gross_max_override")
    .eq("customer_id", customer_id)
    .eq("incident_code", incident_code)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function getItemPriceEffective(customer_id: string, item_code: string) {
  // override por hotel
  const { data: ovr, error: oErr } = await supabase
    .from("debacu_hotel_item_pricing")
    .select("unit_price_override")
    .eq("customer_id", customer_id)
    .eq("item_code", item_code)
    .maybeSingle();
  if (oErr) throw oErr;

  if (ovr?.unit_price_override !== null && ovr?.unit_price_override !== undefined) {
    return Number(ovr.unit_price_override);
  }

  // precio catálogo
  const { data: cat, error: cErr } = await supabase
    .from("debacu_item_catalog")
    .select("unit_price_default")
    .eq("code", item_code)
    .maybeSingle();
  if (cErr) throw cErr;

  const n = cat?.unit_price_default;
  return n === null || n === undefined ? null : Number(n);
}

function seasonMultiplier(season_applied: string | null, profile: any) {
  const high = toNum(profile?.season_mult_high) ?? 1;
  const low = toNum(profile?.season_mult_low) ?? 1;

  if (season_applied === "HIGH") return high;
  if (season_applied === "LOW") return low;
  return 1;
}

serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(origin) });
  if (req.method !== "POST") return json(origin, 405, { error: "Method not allowed" });

  try {
    const token = (req.headers.get("x-session-token") || "").trim();
    if (!token) return json(origin, 401, { error: "Missing token" });

    const body = await req.json().catch(() => null);
    if (!body) return json(origin, 400, { error: "Invalid JSON body" });

    const app_code = pickString(body.app_code ?? body.appCode);
    const accept_declaration = body.accept_declaration ?? body.acceptDeclaration;
    const input = body.input;

    if (!app_code || !input) return json(origin, 400, { error: "Missing app_code/input" });
    if (accept_declaration !== true) return json(origin, 400, { error: "Debes aceptar la declaración de veracidad." });

    const session = await requireSession(token, app_code);
    if (!session) return json(origin, 401, { error: "Invalid/expired session" });

    // --- onboarding obligatorio ---
    const profile = await getHotelProfile(session.customer_id);
    const missing = ensureOnboarding(profile);
    if (missing) return json(origin, 409, { error: "ONBOARDING_REQUIRED", details: missing });

    const document = pickString(input.document);
    const full_name = pickString(input.full_name ?? input.fullName);
    const rating = Number(input.rating ?? 0);

    if (!document || !full_name) return json(origin, 400, { error: "document y full_name son obligatorios." });
    if (!(rating >= 1 && rating <= 5)) return json(origin, 400, { error: "rating debe ser 1..5" });

    const incident_type = pickString(input.incident_type ?? input.incidentType) || null;
    const season_applied = pickString(input.season_applied ?? input.seasonApplied) || null;
    const impact_items_raw = input.impact_items ?? input.impactItems ?? null;

    // snapshots
    const hotel_category = profile.hotel_category;
    const adr_reference = await getAdrReference(hotel_category);
    const adr_real_snapshot = toNum(profile.adr_real);

    // economía
    let economic_impact_gross: number | null = null;
    let economic_recovered: number | null = null;
    let economic_net_loss: number | null = null;

    const recovered_input = toNum(input.economic_recovered ?? input.economicRecovered);

    if (incident_type) {
      const cat = await getIncidentCatalog(incident_type);
      if (!cat) return json(origin, 400, { error: "INCIDENT_INVALID", details: `incident_type no existe: ${incident_type}` });

      const ovr = await getIncidentOverride(session.customer_id, incident_type);

      const mult = seasonMultiplier(season_applied, profile);

      // Calcular gross
      const impact_items = Array.isArray(impact_items_raw) ? impact_items_raw : [];
      let grossFromItems = 0;

      for (const it of impact_items) {
        const code = pickString(it?.code);
        const qty = Math.max(0, Number(it?.qty ?? 0));
        if (!code || !qty) continue;

        const unit = await getItemPriceEffective(session.customer_id, code);
        if (unit === null) continue;

        grossFromItems += qty * unit;
      }

      // Si no hay items, usamos rangos del catálogo/override (si existen) para asignar un gross mínimo
      // (Esto evita dejarlo null en incidencias que requieren economía)
      const grossMin = toNum(ovr?.gross_min_override) ?? toNum(cat.gross_min) ?? null;
      const grossMax = toNum(ovr?.gross_max_override) ?? toNum(cat.gross_max) ?? null;

      if (grossFromItems > 0) {
        economic_impact_gross = Math.round(grossFromItems * mult * 100) / 100;
      } else if (grossMin !== null) {
        // default conservador: mínimo * multiplicador de temporada
        economic_impact_gross = Math.round(grossMin * mult * 100) / 100;
      } else {
        // si no hay items ni rango, lo dejamos 0 (pero NO null)
        economic_impact_gross = 0;
      }

      // recovered
      if (recovered_input !== null) {
        economic_recovered = Math.round(Math.max(0, recovered_input) * 100) / 100;
      } else {
        const pct = toNum(ovr?.recovered_pct_override) ?? toNum(cat.recovered_pct_default) ?? 0;
        economic_recovered = Math.round((economic_impact_gross * pct / 100) * 100) / 100;
      }

      economic_net_loss = Math.round((economic_impact_gross - (economic_recovered ?? 0)) * 100) / 100;

      // clamp net_loss >= 0
      if (economic_net_loss < 0) economic_net_loss = 0;
    }

    const payload = {
      document,
      full_name,
      nationality: pickString(input.nationality) || null,
      phone: pickString(input.phone) || null,
      email: pickString(input.email).toLowerCase() || null,
      rating,
      comment: pickString(input.comment).slice(0, 240) || null,
      platform: pickString(input.platform) || "DEBACU_EVAL",
      evaluation_date: pickString(input.evaluation_date ?? input.evaluationDate) || todayISO(),

      // legacy + nuevo uuid
      creator_customer_id: session.customer_id ?? null,            // ojo: esto es text en tu tabla; si aquí guardas uuid como string, ok.
      creator_customer_name: session.customer_name ?? null,
      creator_customer_uuid: session.customer_id ?? null,          // si session.customer_id es uuid real en BD, esto está bien

      // snapshots
      hotel_category,
      adr_reference,
      adr_real_snapshot,
      season_applied,

      // incident
      incident_type,
      impact_items: incident_type ? (Array.isArray(impact_items_raw) ? impact_items_raw : null) : null,

      // economy
      economic_impact_gross,
      economic_recovered,
      economic_net_loss,
    };

    const { data, error } = await supabase
      .from("debacu_evaluations")
      .insert(payload)
      .select(
        "id, document, full_name, phone, email, nationality, rating, comment, platform, evaluation_date, " +
        "creator_customer_id, creator_customer_name, creator_customer_uuid, hotel_category, incident_type, " +
        "economic_impact_gross, economic_recovered, economic_net_loss, impact_items, season_applied, adr_reference, adr_real_snapshot, created_at"
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
