// supabase/functions/debacu_eval_manual_incident_create/index.ts
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

type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

type IncidentType =
  | "FRAUD"
  | "NO_SHOW"
  | "PAYMENT_INCIDENT"
  | "PROPERTY_DAMAGE"
  | "RULES_VIOLATION"
  | "AGGRESSIVE_BEHAVIOR"
  | "BLACKLIST_MATCH"
  | "OTHER"
  | string;

type ReqBody = {
  property_id?: string;
  org_id?: string;
  identity?: {
    document?: string | null;
    email?: string | null;
    phone?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    country?: string | null;
  };
  incident?: {
    incident_type?: IncidentType;
    description?: string;
    incident_date?: string;
    economic_impact?: number | null;
    severity?: Severity;
  };
};

type GuestIndexRow = {
  identity_key: string;
  stays_count: number | null;
  incidents_count: number | null;
  total_net_loss: number | null;
  first_seen_date: string | null;
  last_seen_date: string | null;
  last_incident_date: string | null;
  risk_band: string | null;
  doc_key: string | null;
  email_key: string | null;
  phone_key: string | null;
  updated_at: string | null;
};

type RiskStateRow = {
  identity_key: string;
  risk_level: string | null;
  risk_score: number | null;
  incidents_total: number | null;
  incidents_high: number | null;
  incidents_critical: number | null;
  distinct_orgs_count: number | null;
  distinct_properties_count: number | null;
  last_incident_at: string | null;
};

type ManualIncidentAggRow = {
  org_id: string | null;
  property_id: string | null;
  severity: Severity | null;
  incident_date: string | null;
  economic_impact: number | null;
};

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
  const x = clean(v);
  return x ? x : null;
}

function normalizeCountry(v?: string | null): string | null {
  const x = clean(v).toUpperCase();
  return x ? x : null;
}

function isISODate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function minDate(a?: string | null, b?: string | null): string | null {
  const av = clean(a);
  const bv = clean(b);
  if (!av && !bv) return null;
  if (!av) return bv;
  if (!bv) return av;
  return av <= bv ? av : bv;
}

function maxDate(a?: string | null, b?: string | null): string | null {
  const av = clean(a);
  const bv = clean(b);
  if (!av && !bv) return null;
  if (!av) return bv;
  if (!bv) return av;
  return av >= bv ? av : bv;
}

function ensureSeverity(v: string): Severity {
  const x = clean(v).toUpperCase();
  if (x === "LOW" || x === "MEDIUM" || x === "HIGH" || x === "CRITICAL") {
    return x;
  }
  throw new Error("INVALID_SEVERITY");
}

function computeGuestRiskBand(
  incidentsCount: number,
  totalNetLoss: number,
): "LOW" | "MEDIUM" | "HIGH" {
  if (incidentsCount <= 0) return "LOW";
  if (incidentsCount === 1 && totalNetLoss < 200) return "MEDIUM";
  return "HIGH";
}

function riskLevelOrDefault(v?: string | null): string {
  const x = clean(v).toUpperCase();
  return x || "LOW";
}

function isoDateStartToISOString(date: string): string {
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

async function readManualIncidentAggregates(
  sb: ReturnType<typeof supabaseServiceClient>,
  identityKey: string,
) {
  const { data, error } = await sb
    .from("debacu_eval_manual_incidents")
    .select("org_id, property_id, severity, incident_date, economic_impact")
    .eq("identity_key", identityKey)
    .eq("status", "ACTIVE");

  if (error) {
    throw new Error(`MANUAL_INCIDENTS_AGG_READ_FAILED: ${error.message}`);
  }

  const rows = (data ?? []) as ManualIncidentAggRow[];

  const distinctOrgs = new Set<string>();
  const distinctProperties = new Set<string>();

  let incidentsTotal = 0;
  let incidentsHigh = 0;
  let incidentsCritical = 0;
  let totalRiskScore = 0;
  let totalNetLoss = 0;
  let lastIncidentDate: string | null = null;

  for (const row of rows) {
    incidentsTotal += 1;

    const sev = clean(row.severity).toUpperCase() as Severity;
    if (sev === "HIGH") incidentsHigh += 1;
    if (sev === "CRITICAL") incidentsCritical += 1;

    totalRiskScore += severityWeight(sev);
    totalNetLoss += Number(row.economic_impact ?? 0);

    if (row.org_id) distinctOrgs.add(String(row.org_id));
    if (row.property_id) distinctProperties.add(String(row.property_id));

    lastIncidentDate = maxDate(lastIncidentDate, row.incident_date);
  }

  return {
    incidentsTotal,
    incidentsHigh,
    incidentsCritical,
    totalRiskScore,
    totalNetLoss,
    distinctOrgsCount: distinctOrgs.size,
    distinctPropertiesCount: distinctProperties.size,
    lastIncidentDate,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);

  if (req.method !== "POST") {
    return json(req, 405, {
      ok: false,
      error: "request_failed",
      detail: "method_not_allowed",
    });
  }

  const sb = supabaseServiceClient();

  try {
    const user = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as ReqBody;

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

    if (!doc && !email && !phone) {
      throw new Error("IDENTIFIER_REQUIRED");
    }

    const identityBuilt = await buildIdentityKey({
      document: doc || null,
      email: email || null,
      phone: phone || null,
    });

    const identityKey = identityBuilt.identity_key;
    if (!identityKey) {
      throw new Error("IDENTITY_KEY_BUILD_FAILED");
    }

    const docKey = doc
      ? await buildQueryHash({ type: "DOCUMENT", normalized: doc })
      : null;

    const emailKey = email
      ? await buildQueryHash({ type: "EMAIL", normalized: email })
      : null;

    const phoneKey = phone
      ? await buildQueryHash({ type: "PHONE", normalized: phone })
      : null;

    const firstName = normalizeName(identity.first_name);
    const lastName = normalizeName(identity.last_name);
    const country = normalizeCountry(identity.country);

    const incident = body.incident ?? {};

    const incidentType = clean(incident.incident_type);
    const description = clean(incident.description);
    const incidentDate = clean(incident.incident_date);
    const severity = ensureSeverity(incident.severity ?? "");

    const economicImpact =
      incident.economic_impact === null || incident.economic_impact === undefined
        ? null
        : Number(incident.economic_impact);

    if (!incidentType) throw new Error("INCIDENT_TYPE_REQUIRED");
    if (!description || description.length < 8) {
      throw new Error("DESCRIPTION_TOO_SHORT");
    }
    if (!incidentDate || !isISODate(incidentDate)) {
      throw new Error("INVALID_INCIDENT_DATE");
    }
    if (
      economicImpact !== null &&
      (!Number.isFinite(economicImpact) || economicImpact < 0)
    ) {
      throw new Error("INVALID_ECONOMIC_IMPACT");
    }

    const { data: prevState, error: prevStateErr } = await sb
      .from("debacu_eval_identity_risk_state")
      .select(`
        identity_key,
        risk_level,
        risk_score,
        incidents_total,
        incidents_high,
        incidents_critical,
        distinct_orgs_count,
        distinct_properties_count,
        last_incident_at
      `)
      .eq("identity_key", identityKey)
      .maybeSingle();

    if (prevStateErr) {
      throw new Error(`IDENTITY_RISK_STATE_READ_FAILED: ${prevStateErr.message}`);
    }

    const prevRiskState = (prevState as RiskStateRow | null) ?? null;
    const previousRiskLevel = riskLevelOrDefault(prevRiskState?.risk_level);
    const previousRiskScore = Number(prevRiskState?.risk_score ?? 0);

    const incidentInsertPayload = {
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

      input_document_masked: doc ? maskDoc(doc) : null,
      input_email_masked: email ? maskEmail(email) : null,
      input_phone_masked: phone ? maskPhone(phone) : null,

      input_first_name: firstName,
      input_last_name: lastName,
      input_country: country,

      created_by: user.id,
    };

    const { data: insertedIncident, error: insertErr } = await sb
      .from("debacu_eval_manual_incidents")
      .insert(incidentInsertPayload)
      .select("id")
      .single();

    if (insertErr || !insertedIncident?.id) {
      throw new Error(
        `MANUAL_INCIDENT_INSERT_FAILED: ${insertErr?.message ?? "unknown_insert_error"}`,
      );
    }

    const incidentId = String(insertedIncident.id);

    const { data: prevGuest, error: prevGuestErr } = await sb
      .from("debacu_eval_guest_index")
      .select(`
        identity_key,
        stays_count,
        incidents_count,
        total_net_loss,
        first_seen_date,
        last_seen_date,
        last_incident_date,
        risk_band,
        doc_key,
        email_key,
        phone_key,
        updated_at
      `)
      .eq("identity_key", identityKey)
      .maybeSingle();

    if (prevGuestErr) {
      throw new Error(`GUEST_INDEX_READ_FAILED: ${prevGuestErr.message}`);
    }

    const prevGuestRow = (prevGuest as GuestIndexRow | null) ?? null;

    const manualAgg = await readManualIncidentAggregates(sb, identityKey);

    const nextGuestIncidents = manualAgg.incidentsTotal;
    const nextGuestStays = Math.max(Number(prevGuestRow?.stays_count ?? 0), 1);
    const nextGuestNetLoss = manualAgg.totalNetLoss;
    const nextGuestRiskBand = computeGuestRiskBand(
      nextGuestIncidents,
      nextGuestNetLoss,
    );

    const guestUpsertPayload = {
      identity_key: identityKey,
      stays_count: nextGuestStays,
      incidents_count: nextGuestIncidents,
      total_net_loss: nextGuestNetLoss,

      first_seen_date: minDate(prevGuestRow?.first_seen_date, incidentDate),
      last_seen_date: maxDate(prevGuestRow?.last_seen_date, incidentDate),
      last_incident_date: maxDate(
        prevGuestRow?.last_incident_date,
        manualAgg.lastIncidentDate,
      ),

      risk_band: nextGuestRiskBand,

      doc_key: prevGuestRow?.doc_key ?? docKey,
      email_key: prevGuestRow?.email_key ?? emailKey,
      phone_key: prevGuestRow?.phone_key ?? phoneKey,

      updated_at: new Date().toISOString(),
    };

    const { error: guestUpsertErr } = await sb
      .from("debacu_eval_guest_index")
      .upsert(guestUpsertPayload, { onConflict: "identity_key" });

    if (guestUpsertErr) {
      throw new Error(`GUEST_INDEX_UPSERT_FAILED: ${guestUpsertErr.message}`);
    }

    const nextScore = manualAgg.totalRiskScore;
    const newRiskLevel = computeRiskLevel(nextScore);

    const stateUpsertPayload = {
      identity_key: identityKey,

      risk_level: newRiskLevel,
      risk_score: nextScore,

      incidents_total: manualAgg.incidentsTotal,
      incidents_high: manualAgg.incidentsHigh,
      incidents_critical: manualAgg.incidentsCritical,

      distinct_orgs_count: Math.max(
        manualAgg.distinctOrgsCount,
        Number(prevRiskState?.distinct_orgs_count ?? 0),
      ),
      distinct_properties_count: Math.max(
        manualAgg.distinctPropertiesCount,
        Number(prevRiskState?.distinct_properties_count ?? 0),
      ),

      last_incident_at: manualAgg.lastIncidentDate
        ? isoDateStartToISOString(manualAgg.lastIncidentDate)
        : isoDateStartToISOString(incidentDate),
    };

    const { error: stateErr } = await sb
      .from("debacu_eval_identity_risk_state")
      .upsert(stateUpsertPayload, { onConflict: "identity_key" });

    if (stateErr) {
      throw new Error(`IDENTITY_RISK_STATE_UPSERT_FAILED: ${stateErr.message}`);
    }

    const riskDelta = nextScore - previousRiskScore;

    const { error: eventErr1 } = await sb
      .from("debacu_eval_identity_risk_events")
      .insert({
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
        payload: {
          incidentType,
          severity,
          economicImpact,
          incidentDate,
          source: "MANUAL",
        },
      });

    if (eventErr1) {
      console.error("identity_risk_events insert warning:", eventErr1.message);
    }

    if (previousRiskLevel !== newRiskLevel) {
      const { error: eventErr2 } = await sb
        .from("debacu_eval_identity_risk_events")
        .insert({
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
          payload: {
            reason: "MANUAL_INCIDENT_CREATED",
            severity,
            incidentType,
          },
        });

      if (eventErr2) {
        console.error("risk_level_changed insert warning:", eventErr2.message);
      }
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
          distinctOrgsCount: Math.max(
            manualAgg.distinctOrgsCount,
            Number(prevRiskState?.distinct_orgs_count ?? 0),
          ),
          distinctPropertiesCount: Math.max(
            manualAgg.distinctPropertiesCount,
            Number(prevRiskState?.distinct_properties_count ?? 0),
          ),
        },
      },
    });
  } catch (e: unknown) {
    const msg = String(e instanceof Error ? e.message : e);

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, {
        ok: false,
        error: "request_failed",
        detail: "UNAUTHENTICATED",
      });
    }

    if (
      msg === "PROPERTY_ID_REQUIRED" ||
      msg === "IDENTIFIER_REQUIRED" ||
      msg === "INCIDENT_TYPE_REQUIRED" ||
      msg === "DESCRIPTION_TOO_SHORT" ||
      msg === "INVALID_INCIDENT_DATE" ||
      msg === "INVALID_ECONOMIC_IMPACT" ||
      msg === "INVALID_SEVERITY" ||
      msg === "ORG_PROPERTY_MISMATCH" ||
      msg === "IDENTITY_KEY_BUILD_FAILED"
    ) {
      return json(req, 400, {
        ok: false,
        error: "request_failed",
        detail: msg,
      });
    }

    if (msg === "NO_ORG_MEMBERSHIP") {
      return json(req, 403, {
        ok: false,
        error: "request_failed",
        detail: "NO_ORG_MEMBERSHIP",
      });
    }

    console.error("manual_incident_create error:", e);

    return json(req, 500, {
      ok: false,
      error: "request_failed",
      detail: msg,
    });
  }
});