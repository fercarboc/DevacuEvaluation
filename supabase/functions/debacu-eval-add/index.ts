// supabase/functions/debacu-eval-add/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

const APP_ID = "DEBACU_EVAL";

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`MISSING_ENV:${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

// ✅ mismo pepper que import_csv (para identity_key HMAC)
const GLOBAL_PEPPER = mustEnv("DEBACU_GLOBAL_PEPPER");

function sbService() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function logLine(payload: Record<string, unknown>) {
  console.log(JSON.stringify(payload));
}

type ErrDetail =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "missing_org_id"
  | "invalid_json_body"
  | "missing_input"
  | "must_accept_declaration"
  | "ONBOARDING_REQUIRED"
  | "missing_required_fields"
  | "NO_IDENTIFIER"
  | "INCIDENT_INVALID"
  | "insert_failed"
  | "request_failed"
  | "METHOD_NOT_ALLOWED";

function err(req: Request, status: number, detail: ErrDetail) {
  return json(req, status, { ok: false, error: "request_failed", detail });
}

/* ======================================================
 * Helpers
 * ====================================================== */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function str(v: unknown) {
  return String(v ?? "").trim();
}
function upper(v: unknown) {
  const t = str(v);
  return t ? t.toUpperCase() : "";
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
 * Normalizaciones BASE (⚠️ NO usar para insertar *_norm, son GENERATED)
 * ====================================================== */
function normalizeDocumentBase(v?: string | null) {
  const t = str(v);
  if (!t) return null;
  // debe ser compatible con generation_expression:
  // upper(regexp_replace(trim(document), '[\s-]+', '', 'g'))
  const out = t.trim().replace(/[\s-]+/g, "").toUpperCase();
  return out || null;
}

function normalizeEmailBase(v?: string | null) {
  const t = str(v).trim().toLowerCase();
  if (!t || !t.includes("@")) return null;
  return t;
}

function normalizePhoneDigitsBase(v?: string | null) {
  const t = str(v);
  if (!t) return null;
  const digits = t.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits;
}

/* ======================================================
 * HMAC identity_key (NO es GENERATED en tu DB, así que se inserta)
 * Jerarquía: DOC > EMAIL > PHONE
 * ====================================================== */
async function generateIdentityKey(identifier: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(GLOBAL_PEPPER),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(identifier));

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function computeIdentityFromInput(input: any) {
  const document_norm = normalizeDocumentBase(input?.document);
  const email_norm = normalizeEmailBase(input?.email);
  const phone_digits = normalizePhoneDigitsBase(input?.phone);

  if (!document_norm && !email_norm && !phone_digits) {
    return {
      document_norm,
      email_norm,
      phone_digits,
      identity_key: null as string | null,
      raw_identifier: null as string | null,
    };
  }

  const raw_identifier =
    document_norm
      ? `DOC:${document_norm}`
      : email_norm
      ? `EMAIL:${email_norm}`
      : `PHONE:${phone_digits}`;

  const identity_key = await generateIdentityKey(raw_identifier);

  return { document_norm, email_norm, phone_digits, identity_key, raw_identifier };
}

/* ======================================================
 * AuthZ tenant (STRICT: org_id requerido)
 * - membership lookup soporta user_id OR auth_user_id
 * ====================================================== */
async function requireOrgContext(
  admin: ReturnType<typeof sbService>,
  user_id: string,
  org_id: string,
) {
  const uid = String(user_id);

  const { data: mem, error: memErr } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, role, status")
    .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
    .eq("org_id", org_id)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (memErr || !mem?.org_id) return null;

  // primero intentamos entitlements view
  let customer_id: string | null = null;

  const { data: ent, error: entErr } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("customer_id")
    .eq("org_id", org_id)
    .maybeSingle();

  if (!entErr && ent?.customer_id) customer_id = String(ent.customer_id);

  // fallback: organizations.customer_id
  if (!customer_id) {
    const { data: org, error: orgErr } = await admin
      .from("debacu_eval_organizations")
      .select("customer_id")
      .eq("id", org_id)
      .maybeSingle();

    if (orgErr || !org?.customer_id) return null;
    customer_id = String(org.customer_id);
  }

  return { org_id, role: mem.role ?? null, customer_id, app_id: APP_ID };
}

/* ======================================================
 * Data fetchers
 * ====================================================== */
async function getHotelProfile(admin: ReturnType<typeof sbService>, customer_id: string) {
  const { data, error } = await admin
    .from("debacu_eval_hotel_profile")
    .select("customer_id, hotel_category, adr_real, season_mult_high, season_mult_low, profile_completed")
    .eq("customer_id", customer_id)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

async function getAdrReference(admin: ReturnType<typeof sbService>, hotel_category: number) {
  const { data, error } = await admin
    .from("debacu_adr_reference_by_category")
    .select("adr_reference")
    .eq("hotel_category", hotel_category)
    .maybeSingle();

  if (error) throw error;
  return num(data?.adr_reference);
}

async function getIncidentCatalog(admin: ReturnType<typeof sbService>, incident_type: string) {
  const { data, error } = await admin
    .from("debacu_incident_catalog")
    .select("incident_type, is_active, severity, default_gross_min, default_gross_max, default_recovery_pct, title, description, suggested_actions")
    .eq("incident_type", incident_type)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (data.is_active === false) return null;
  return data;
}

async function getIncidentOverride(admin: ReturnType<typeof sbService>, customer_id: string, incident_type: string) {
  const { data, error } = await admin
    .from("debacu_hotel_incident_overrides")
    .select("incident_type, is_active, severity_override, default_gross_min_override, default_gross_max_override, default_recovery_pct_override, title_override, description_override, suggested_actions_override")
    .eq("customer_id", customer_id)
    .eq("incident_type", incident_type)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (data.is_active === false) return null;
  return data;
}

async function getHotelItemUnitPrice(admin: ReturnType<typeof sbService>, customer_id: string, item_code: string) {
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
Deno.serve(async (req) => {
  const FN = "debacu-eval-add";

  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return err(req, 405, "METHOD_NOT_ALLOWED");

  try {
    const user = await requireUser(req);
    if (!user?.id) return err(req, 401, "UNAUTHENTICATED");

    const body = await req.json().catch(() => null);
    if (!body) return err(req, 400, "invalid_json_body");

    const org_id = str(body.org_id ?? body.orgId);
    if (!org_id) return err(req, 400, "missing_org_id");

    const accept_declaration = body.accept_declaration ?? body.acceptDeclaration ?? true;
    const input = body.input;
    if (!input) return err(req, 400, "missing_input");
    if (accept_declaration !== true) return err(req, 400, "must_accept_declaration");

    const admin = sbService();

    const ctx = await requireOrgContext(admin, user.id, org_id);
    if (!ctx) return err(req, 403, "FORBIDDEN");

    logLine({
      fn: FN,
      stage: "start",
      user_id: user.id,
      org_id: ctx.org_id,
      customer_id: ctx.customer_id,
      app_id: ctx.app_id,
      role: ctx.role,
    });

    const profile = await getHotelProfile(admin, ctx.customer_id);
    const hotelCategoryOk = profile?.hotel_category !== null && profile?.hotel_category !== undefined;
    const profileCompletedOk = profile?.profile_completed === true;
    if (!profile || !hotelCategoryOk || !profileCompletedOk) {
      return err(req, 409, "ONBOARDING_REQUIRED");
    }

    // mínimos
    const document_raw = str(input.document);
    const full_name = upper(input.full_name ?? input.fullName);
    const rating = clampInt(input.rating, 1, 5);

    if (!document_raw || !full_name) return err(req, 400, "missing_required_fields");

    // ✅ identidad HMAC (requisito: DOC/EMAIL/PHONE)
    // OJO: document_norm/email_norm/phone_digits SON GENERATED en DB -> NO insertarlos
    const ident = await computeIdentityFromInput(input);
    if (!ident.identity_key) return err(req, 400, "NO_IDENTIFIER");

    const incident_type = str(input.incident_type ?? input.incidentType) || null;
    const season_applied = str(input.season_applied ?? input.seasonApplied) || null;

    const impact_items_raw = input.impact_items ?? input.impactItems ?? null;
    const impact_items = Array.isArray(impact_items_raw) ? impact_items_raw : [];

    const hotel_category = Number(profile.hotel_category);
    const adr_reference = await getAdrReference(admin, hotel_category);
    const adr_real_snapshot = num(profile.adr_real);

    // economía
    let economic_impact_gross: number | null = null;
    let economic_recovered: number | null = null;
    let economic_net_loss: number | null = null;

    if (incident_type) {
      const cat = await getIncidentCatalog(admin, incident_type);
      if (!cat) return err(req, 400, "INCIDENT_INVALID");

      const ovr = await getIncidentOverride(admin, ctx.customer_id, incident_type);
      const mult = seasonMultiplier(season_applied, profile);

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

      const gross_min = num(ovr?.default_gross_min_override) ?? num(cat.default_gross_min) ?? 0;

      economic_impact_gross =
        gross_items > 0
          ? Math.round(gross_items * mult * 100) / 100
          : Math.round(gross_min * mult * 100) / 100;

      const recovered_input = num(input.economic_recovered ?? input.economicRecovered);
      if (recovered_input !== null) {
        economic_recovered = Math.round(Math.max(0, recovered_input) * 100) / 100;
      } else {
        const pct = num(ovr?.default_recovery_pct_override) ?? num(cat.default_recovery_pct) ?? 0;
        economic_recovered = Math.round((economic_impact_gross * pct / 100) * 100) / 100;
      }

      economic_net_loss = Math.round((economic_impact_gross - (economic_recovered ?? 0)) * 100) / 100;
      if (economic_net_loss < 0) economic_net_loss = 0;
    }

    // creator_* (audit)
    const creator_customer_uuid = user.id; // auth.users.id
    const creator_customer_id = str(input.creator_customer_id ?? input.creatorCustomerId) || ctx.customer_id;
    const creator_customer_name = str(input.creator_customer_name ?? input.creatorCustomerName) || null;

    // BASE FIELDS (no *_norm)
    const email = normalizeEmailBase(input.email) ?? null;
    const phone = str(input.phone) || null;

    // INSERT payload compatible con GENERATED columns
    const payload: Record<string, unknown> = {
      // base identifiers
      document: document_raw.toUpperCase(),
      email,
      phone,

      // HMAC identity
      identity_key: ident.identity_key,

      // person
      full_name,
      nationality: upper(input.nationality) || null,

      // evaluation
      rating,
      comment: str(input.comment).slice(0, 240) || null,
      platform: str(input.platform) || APP_ID,
      evaluation_date: str(input.evaluation_date ?? input.evaluationDate) || todayISO(),

      // tenant ownership
      customer_id: ctx.customer_id,

      // creator (audit)
      creator_customer_uuid,
      creator_customer_id,
      creator_customer_name,

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
        "id, document, document_norm, email, email_norm, phone, phone_digits, identity_key, " +
          "full_name, nationality, rating, comment, platform, evaluation_date, " +
          "customer_id, creator_customer_uuid, creator_customer_id, creator_customer_name, " +
          "hotel_category, incident_type, economic_impact_gross, economic_recovered, economic_net_loss, " +
          "impact_items, season_applied, adr_reference, adr_real_snapshot, created_at",
      )
      .single();

    if (error) {
      logLine({
        fn: FN,
        stage: "insert_err",
        code: (error as any)?.code ?? null,
        msg: error.message ?? null,
        details: (error as any)?.details ?? null,
        hint: (error as any)?.hint ?? null,
      });
      return err(req, 500, "insert_failed");
    }

    logLine({
      fn: FN,
      stage: "ok",
      user_id: user.id,
      org_id: ctx.org_id,
      customer_id: ctx.customer_id,
      evaluation_id: data?.id ?? null,
    });

    return json(req, 200, { ok: true, row: data });
  } catch (e) {
    console.error("debacu-eval-add error:", e);
    return err(req, 500, "request_failed");
  }
});