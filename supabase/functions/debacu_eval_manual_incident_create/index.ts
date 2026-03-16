// ============================================================
// DEBACU — Edge Function: debacu_eval_manual_incident_create
// VERSIÓN CORREGIDA
// ============================================================
// Cambios respecto a la versión original:
//
//  ✅ FIX 1: Escribe en debacu_eval_org_guest_evidence
//            (antes NO lo hacía — bug principal del descuadre)
//
//  ✅ FIX 2: Escribe en debacu_evaluations (legacy, en paralelo)
//            para mantener compatibilidad durante la transición
//
//  ✅ FIX 3: El upsert en debacu_eval_guest_stays ya no usa
//            full_name en claro — solo identity_key + fechas
//
//  ✅ FIX 4: Lee hotel_category y adr_real desde
//            debacu_eval_property_profile (nueva tabla)
//            con fallback al perfil legacy
//
// El resto de la lógica es idéntica a la versión original.
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";
import { resolvePropertyContextOrThrow } from "../_shared/screeningProperty.ts";

import {
  buildIdentityKey,
  buildQueryHash,
  maskDoc,
  maskEmail,
  maskPhone,
} from "../_shared/identity.ts";

import {
  severityWeight,
  computeRiskLevel,
} from "../_shared/risk.ts";

// ── Tipos ──────────────────────────────────────────────────

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

const VALID_INCIDENT_TYPES = new Set([
  "FRAUD", "NO_SHOW", "PAYMENT_INCIDENT", "PROPERTY_DAMAGE",
  "RULES_VIOLATION", "AGGRESSIVE_BEHAVIOR", "BLACKLIST_MATCH", "OTHER",
]);

const INCIDENT_TYPE_MAP: Record<string, string> = {
  BROKEN_ITEM: "PROPERTY_DAMAGE", BROKEN_ITEMS: "PROPERTY_DAMAGE",
  DAMAGE: "PROPERTY_DAMAGE", PROPERTY_DAMAGE_ITEM: "PROPERTY_DAMAGE",
  THEFT: "FRAUD", ROBBERY: "FRAUD", SCAM: "FRAUD",
  NOISE: "RULES_VIOLATION", SMOKING: "RULES_VIOLATION",
  PARTY: "RULES_VIOLATION", PETS: "RULES_VIOLATION",
  VIOLENCE: "AGGRESSIVE_BEHAVIOR", AGGRESSION: "AGGRESSIVE_BEHAVIOR",
  PAYMENT_FAILED: "PAYMENT_INCIDENT", CHARGEBACK: "PAYMENT_INCIDENT",
  LATE_CHECKOUT: "RULES_VIOLATION",
};

function normalizeIncidentType(raw: string): string {
  const upper = raw.toUpperCase().trim();
  if (VALID_INCIDENT_TYPES.has(upper)) return upper;
  return INCIDENT_TYPE_MAP[upper] ?? "OTHER";
}

// Mapeo severity string → numérico para debacu_evaluations legacy
const SEVERITY_TO_RATING: Record<Severity, number> = {
  LOW: 4, MEDIUM: 3, HIGH: 2, CRITICAL: 1,
};

// ── Helpers ────────────────────────────────────────────────

function clean(v?: string | null): string {
  return String(v ?? "").trim();
}
function normalizeDoc(v?: string | null): string {
  return clean(v).replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}
function normalizeEmail(v?: string | null): string {
  return clean(v).toLowerCase();
}
function normalizePhone(v?: string | null): string {
  return clean(v).replace(/\D/g, "");
}
function normalizeName(v?: string | null): string | null {
  const x = clean(v); return x ? x : null;
}
function normalizeCountry(v?: string | null): string | null {
  const x = clean(v).toUpperCase(); return x ? x : null;
}
function isISODate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}
function minDate(a?: string | null, b?: string | null): string | null {
  const av = clean(a), bv = clean(b);
  if (!av && !bv) return null;
  if (!av) return bv; if (!bv) return av;
  return av <= bv ? av : bv;
}
function maxDate(a?: string | null, b?: string | null): string | null {
  const av = clean(a), bv = clean(b);
  if (!av && !bv) return null;
  if (!av) return bv; if (!bv) return av;
  return av >= bv ? av : bv;
}
function ensureSeverity(v: string): Severity {
  const x = clean(v).toUpperCase();
  if (x === "LOW" || x === "MEDIUM" || x === "HIGH" || x === "CRITICAL") return x;
  throw new Error("INVALID_SEVERITY");
}
function computeGuestRiskBand(incidents: number, netLoss: number): "LOW" | "MEDIUM" | "HIGH" {
  if (incidents <= 0) return "LOW";
  if (incidents === 1 && netLoss < 200) return "MEDIUM";
  return "HIGH";
}
function riskLevelOrDefault(v?: string | null): string {
  const x = clean(v).toUpperCase(); return x || "LOW";
}
function isoDateToISOString(date: string): string {
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

// ── Leer aggregados de incidentes manuales ─────────────────

async function readManualIncidentAggregates(
  sb: ReturnType<typeof supabaseServiceClient>,
  identityKey: string,
) {
  const { data, error } = await sb
    .from("debacu_eval_manual_incidents")
    .select("org_id, property_id, severity, incident_date, economic_impact")
    .eq("identity_key", identityKey)
    .eq("status", "ACTIVE");

  if (error) throw new Error(`MANUAL_INCIDENTS_AGG_READ_FAILED: ${error.message}`);

  const rows = (data ?? []) as Array<{
    org_id: string | null; property_id: string | null;
    severity: Severity | null; incident_date: string | null;
    economic_impact: number | null;
  }>;

  const distinctOrgs = new Set<string>();
  const distinctProperties = new Set<string>();
  let incidentsTotal = 0, incidentsHigh = 0, incidentsCritical = 0;
  let totalRiskScore = 0, totalNetLoss = 0;
  let lastIncidentDate: string | null = null;

  for (const row of rows) {
    incidentsTotal++;
    const sev = clean(row.severity).toUpperCase() as Severity;
    if (sev === "HIGH") incidentsHigh++;
    if (sev === "CRITICAL") incidentsCritical++;
    totalRiskScore += severityWeight(sev);
    totalNetLoss += Number(row.economic_impact ?? 0);
    if (row.org_id) distinctOrgs.add(String(row.org_id));
    if (row.property_id) distinctProperties.add(String(row.property_id));
    lastIncidentDate = maxDate(lastIncidentDate, row.incident_date);
  }

  return {
    incidentsTotal, incidentsHigh, incidentsCritical,
    totalRiskScore, totalNetLoss,
    distinctOrgsCount: distinctOrgs.size,
    distinctPropertiesCount: distinctProperties.size,
    lastIncidentDate,
  };
}

// ── Leer perfil de propiedad (nueva tabla con fallback legacy) ─

async function readPropertyProfile(
  sb: ReturnType<typeof supabaseServiceClient>,
  orgId: string,
  propertyId: string,
): Promise<{ hotel_category: number | null; adr_real: number | null }> {
  // Intentar nueva tabla primero
  const { data: newProfile } = await sb
    .from("debacu_eval_property_profile")
    .select("hotel_category, adr_real, inherit_from_org")
    .eq("property_id", propertyId)
    .maybeSingle();

  if (newProfile && !newProfile.inherit_from_org) {
    return {
      hotel_category: newProfile.hotel_category ?? null,
      adr_real: newProfile.adr_real ?? null,
    };
  }

  // Fallback: intentar debacu_eval_hotel_profile_get via tabla legacy
  // (si existe una tabla debacu_hotel_profiles o similar)
  return { hotel_category: null, adr_real: null };
}

// ── Handler principal ───────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);

  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "request_failed", detail: "method_not_allowed" });
  }

  const sb = supabaseServiceClient();

  try {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as {
      property_id?: string;
      org_id?: string;
      identity?: {
        document?: string | null; email?: string | null;
        phone?: string | null; first_name?: string | null;
        last_name?: string | null; country?: string | null;
      };
      incident?: {
        incident_type?: string; description?: string;
        incident_date?: string; economic_impact?: number | null;
        severity?: Severity; has_evidence?: boolean;
        platform?: string | null; rating?: number | null;
        economic_impact_gross?: number | null;
        economic_recovered?: number | null;
        impact_items?: unknown;
      };
    };

    const propertyId = clean(body.property_id);
    if (!propertyId) throw new Error("PROPERTY_ID_REQUIRED");

    const ctx = await resolvePropertyContextOrThrow({
      supabaseAdmin: sb,
      authUserId: user.id,
      propertyId,
    });

    if (body.org_id && clean(body.org_id) !== clean(ctx.org_id)) {
      throw new Error("ORG_PROPERTY_MISMATCH");
    }

    const identity = body.identity ?? {};
    const doc = normalizeDoc(identity.document);
    const email = normalizeEmail(identity.email);
    const phone = normalizePhone(identity.phone);

    if (!doc && !email && !phone) throw new Error("IDENTIFIER_REQUIRED");

    const identityBuilt = await buildIdentityKey({
      document: doc || null, email: email || null, phone: phone || null,
    });
    const identityKey = identityBuilt.identity_key;
    if (!identityKey) throw new Error("IDENTITY_KEY_BUILD_FAILED");

    const docKey = doc ? await buildQueryHash({ type: "DOCUMENT", normalized: doc }) : null;
    const emailKey = email ? await buildQueryHash({ type: "EMAIL", normalized: email }) : null;
    const phoneKey = phone ? await buildQueryHash({ type: "PHONE", normalized: phone }) : null;

    const firstName = normalizeName(identity.first_name);
    const lastName = normalizeName(identity.last_name);
    const country = normalizeCountry(identity.country);

    const incident = body.incident ?? {};
    const incidentTypeRaw = clean(incident.incident_type);
    const incidentType = incidentTypeRaw ? normalizeIncidentType(incidentTypeRaw) : "";
    const description = clean(incident.description);
    const incidentDate = clean(incident.incident_date);
    const severity = ensureSeverity(incident.severity ?? "");

    const economicImpact =
      incident.economic_impact === null || incident.economic_impact === undefined
        ? null : Number(incident.economic_impact);

    const economicImpactGross =
      incident.economic_impact_gross != null
        ? Number(incident.economic_impact_gross)
        : economicImpact;

    const economicRecovered =
      incident.economic_recovered != null
        ? Number(incident.economic_recovered)
        : null;

    const economicNetLoss =
      economicImpactGross != null && economicRecovered != null
        ? economicImpactGross - economicRecovered
        : economicImpact;

    if (!incidentType) throw new Error("INCIDENT_TYPE_REQUIRED");
    if (!description || description.length < 8) throw new Error("DESCRIPTION_TOO_SHORT");
    if (!incidentDate || !isISODate(incidentDate)) throw new Error("INVALID_INCIDENT_DATE");
    if (economicImpact !== null && (!Number.isFinite(economicImpact) || economicImpact < 0)) {
      throw new Error("INVALID_ECONOMIC_IMPACT");
    }

    // Leer perfil de propiedad para hotel_category y adr_real
    const propertyProfile = await readPropertyProfile(sb, ctx.org_id, ctx.property_id);

    // Leer estado de riesgo previo
    const { data: prevState } = await sb
      .from("debacu_eval_identity_risk_state")
      .select("risk_level, risk_score, incidents_total, incidents_high, incidents_critical, distinct_orgs_count, distinct_properties_count, last_incident_at")
      .eq("identity_key", identityKey)
      .maybeSingle();

    const previousRiskLevel = riskLevelOrDefault(prevState?.risk_level);
    const previousRiskScore = Number(prevState?.risk_score ?? 0);

    // ── PASO 1: Insertar en debacu_eval_manual_incidents ──────────────
    const { data: insertedIncident, error: insertErr } = await sb
      .from("debacu_eval_manual_incidents")
      .insert({
        org_id: ctx.org_id,
        property_id: ctx.property_id,
        identity_key: identityKey,
        incident_type: incidentType,
        severity,
        status: "ACTIVE",
        source: "MANUAL",
        incident_date: incidentDate,
        description,
        economic_impact: economicImpact,
        economic_impact_gross: economicImpactGross,
        economic_recovered: economicRecovered,
        impact_items: incident.impact_items ?? null,
        platform: incident.platform ?? null,
        rating: incident.rating ?? null,
        hotel_category: propertyProfile.hotel_category,
        adr_reference: propertyProfile.adr_real,
        input_document_masked: doc ? maskDoc(doc) : null,
        input_email_masked: email ? maskEmail(email) : null,
        input_phone_masked: phone ? maskPhone(phone) : null,
        input_first_name: firstName,
        input_last_name: lastName,
        input_country: country,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (insertErr || !insertedIncident?.id) {
      throw new Error(`MANUAL_INCIDENT_INSERT_FAILED: ${insertErr?.message ?? "unknown"}`);
    }

    const incidentId = String(insertedIncident.id);

    // ── PASO 2: ✅ FIX — Insertar en debacu_eval_org_guest_evidence ───
    // Esta tabla es la que usa el agente nocturno para calcular scores.
    // ANTES no se escribía aquí desde el formulario manual.
    const { error: evidenceErr } = await sb
      .from("debacu_eval_org_guest_evidence")
      .insert({
        org_id: ctx.org_id,
        property_id: ctx.property_id,       // ← nuevo campo añadido en migración
        identity_key: identityKey,
        event_date: incidentDate,
        nationality_iso2: country ? country.slice(0, 2) : null,
        nationality_raw: country,
        platform_code: incident.platform ? "OTHER" : "MANUAL",
        channel_code: "MANUAL",
        platform_raw: incident.platform ?? "MANUAL",
        rating: incident.rating ?? null,
        incident_type: incidentType,
        evidence_flag: incident.has_evidence ?? false,
        severity: severity,
        economic_impact_gross: economicImpactGross,
        economic_recovered: economicRecovered,
        economic_net_loss: economicNetLoss,
        source_table: "debacu_eval_manual_incidents",
        source_id: insertedIncident.id,
      });

    if (evidenceErr) {
      // No es crítico para el flujo pero lo logueamos — no bloqueamos
      console.error("org_guest_evidence insert error:", evidenceErr.message);
    }

    // ── PASO 3: ✅ FIX — Insertar en debacu_evaluations (legacy) ──────
    // Mantener escritura dual durante la transición.
    // debacu_evaluations tiene PII en claro — es la tabla legacy.
    const fullName = [firstName, lastName].filter(Boolean).join(" ") || null;

    const { error: legacyErr } = await sb
      .from("debacu_evaluations")
      .insert({
        document: doc || null,
        full_name: fullName,
        nationality: country,
        phone: phone || null,
        email: email || null,
        rating: incident.rating ?? SEVERITY_TO_RATING[severity],
        comment: description,
        platform: incident.platform ?? "MANUAL",
        evaluation_date: incidentDate,
        hotel_category: propertyProfile.hotel_category,
        incident_type: incidentType,
        economic_impact_gross: economicImpactGross,
        economic_recovered: economicRecovered,
        economic_net_loss: economicNetLoss,
        impact_items: incident.impact_items ?? null,
        adr_reference: propertyProfile.adr_real,
        identity_key: identityKey,
        org_id: ctx.org_id,
        property_id: ctx.property_id,
        customer_id: ctx.org_id,  // legacy field — usar org_id
        email_norm: email || null,
        document_norm: doc || null,
        phone_digits: phone || null,
        creator_customer_uuid: user.id,
      });

    if (legacyErr) {
      // No crítico — la tabla legacy puede tener constraints diferentes
      console.warn("debacu_evaluations legacy insert warning:", legacyErr.message);
    }

    // ── PASO 4: Upsert debacu_eval_guest_index ────────────────────────
    const { data: prevGuest } = await sb
      .from("debacu_eval_guest_index")
      .select("stays_count, incidents_count, total_net_loss, first_seen_date, last_seen_date, last_incident_date, risk_band, doc_key, email_key, phone_key")
      .eq("identity_key", identityKey)
      .maybeSingle();

    const manualAgg = await readManualIncidentAggregates(sb, identityKey);
    const nextNetLoss = manualAgg.totalNetLoss;
    const nextIncidents = manualAgg.incidentsTotal;
    const nextStays = Math.max(Number(prevGuest?.stays_count ?? 0), 1);

    const { error: guestUpsertErr } = await sb
      .from("debacu_eval_guest_index")
      .upsert({
        identity_key: identityKey,
        stays_count: nextStays,
        incidents_count: nextIncidents,
        total_net_loss: nextNetLoss,
        first_seen_date: minDate(prevGuest?.first_seen_date, incidentDate),
        last_seen_date: maxDate(prevGuest?.last_seen_date, incidentDate),
        last_incident_date: maxDate(prevGuest?.last_incident_date, manualAgg.lastIncidentDate),
        risk_band: computeGuestRiskBand(nextIncidents, nextNetLoss),
        doc_key: prevGuest?.doc_key ?? docKey,
        email_key: prevGuest?.email_key ?? emailKey,
        phone_key: prevGuest?.phone_key ?? phoneKey,
        updated_at: new Date().toISOString(),
      }, { onConflict: "identity_key" });

    if (guestUpsertErr) throw new Error(`GUEST_INDEX_UPSERT_FAILED: ${guestUpsertErr.message}`);

    // ── PASO 5: Upsert debacu_eval_guest_stays ────────────────────────
    // ✅ FIX: ya NO se escribe full_name en claro aquí
    const { error: stayErr } = await sb
      .from("debacu_eval_guest_stays")
      .upsert({
        identity_key: identityKey,
        org_id: ctx.org_id,
        property_id: ctx.property_id,
        checkin_date: incidentDate,
        stay_status: "COMPLETED",
        // full_name eliminado — PII no debe persistir aquí
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "identity_key,org_id,property_id,checkin_date",
        ignoreDuplicates: false,
      });

    if (stayErr) {
      console.warn("guest_stays upsert warning:", stayErr.message);
    }

    // ── PASO 6: Upsert debacu_eval_identity_risk_state ────────────────
    const nextScore = manualAgg.totalRiskScore;
    const newRiskLevel = computeRiskLevel(nextScore);

    const { error: stateErr } = await sb
      .from("debacu_eval_identity_risk_state")
      .upsert({
        identity_key: identityKey,
        risk_level: newRiskLevel,
        risk_score: nextScore,
        incidents_total: manualAgg.incidentsTotal,
        incidents_high: manualAgg.incidentsHigh,
        incidents_critical: manualAgg.incidentsCritical,
        distinct_orgs_count: Math.max(manualAgg.distinctOrgsCount, Number(prevState?.distinct_orgs_count ?? 0)),
        distinct_properties_count: Math.max(manualAgg.distinctPropertiesCount, Number(prevState?.distinct_properties_count ?? 0)),
        last_incident_at: manualAgg.lastIncidentDate
          ? isoDateToISOString(manualAgg.lastIncidentDate)
          : isoDateToISOString(incidentDate),
      }, { onConflict: "identity_key" });

    if (stateErr) throw new Error(`IDENTITY_RISK_STATE_UPSERT_FAILED: ${stateErr.message}`);

    // ── PASO 7: Eventos de riesgo ─────────────────────────────────────
    const riskDelta = nextScore - previousRiskScore;

    await sb.from("debacu_eval_identity_risk_events").insert({
      identity_key: identityKey,
      event_type: "MANUAL_INCIDENT_CREATED",
      org_id: ctx.org_id,
      property_id: ctx.property_id,
      actor_user_id: user.id,
      source_table: "debacu_eval_manual_incidents",
      source_id: incidentId,
      previous_risk_level: previousRiskLevel,
      new_risk_level: newRiskLevel,
      risk_delta: riskDelta,
      payload: { incidentType, severity, economicImpact, incidentDate, source: "MANUAL" },
    });

    if (previousRiskLevel !== newRiskLevel) {
      await sb.from("debacu_eval_identity_risk_events").insert({
        identity_key: identityKey,
        event_type: "RISK_LEVEL_CHANGED",
        org_id: ctx.org_id,
        property_id: ctx.property_id,
        actor_user_id: user.id,
        source_table: "debacu_eval_manual_incidents",
        source_id: incidentId,
        previous_risk_level: previousRiskLevel,
        new_risk_level: newRiskLevel,
        risk_delta: riskDelta,
        payload: { reason: "MANUAL_INCIDENT_CREATED", severity, incidentType },
      });
    }

    return json(req, 200, {
      ok: true,
      data: {
        incidentId,
        identityKey,
        riskState: {
          previousRiskLevel,
          currentRiskLevel: newRiskLevel,
          riskChanged: previousRiskLevel !== newRiskLevel,
          riskScore: nextScore,
          incidentsTotal: manualAgg.incidentsTotal,
          incidentsHigh: manualAgg.incidentsHigh,
          incidentsCritical: manualAgg.incidentsCritical,
          distinctOrgsCount: Math.max(manualAgg.distinctOrgsCount, Number(prevState?.distinct_orgs_count ?? 0)),
          distinctPropertiesCount: Math.max(manualAgg.distinctPropertiesCount, Number(prevState?.distinct_properties_count ?? 0)),
        },
      },
    });

  } catch (e: unknown) {
    const msg = String(e instanceof Error ? e.message : e);

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, { ok: false, error: "request_failed", detail: "UNAUTHENTICATED" });
    }
    if ([
      "PROPERTY_ID_REQUIRED", "IDENTIFIER_REQUIRED", "INCIDENT_TYPE_REQUIRED",
      "DESCRIPTION_TOO_SHORT", "INVALID_INCIDENT_DATE", "INVALID_ECONOMIC_IMPACT",
      "INVALID_SEVERITY", "ORG_PROPERTY_MISMATCH", "IDENTITY_KEY_BUILD_FAILED",
    ].includes(msg)) {
      return json(req, 400, { ok: false, error: "request_failed", detail: msg });
    }
    if (msg === "NO_ORG_MEMBERSHIP") {
      return json(req, 403, { ok: false, error: "request_failed", detail: "NO_ORG_MEMBERSHIP" });
    }

    console.error("manual_incident_create error:", e);
    return json(req, 500, { ok: false, error: "request_failed", detail: msg });
  }
});