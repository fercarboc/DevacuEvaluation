import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";
import { resolvePropertyContextOrThrow } from "../_shared/screeningProperty.ts";
import {
  buildIdentityKey,
  normalizeManualQuery,
  buildQueryHash,
} from "../_shared/identity.ts";

type QueryType = "DOCUMENT" | "EMAIL" | "PHONE" | "FULL_NAME";

type ReqBody = {
  property_id?: string;
  criteria?: {
    type?: QueryType;
    value?: string;
  };
};

type ManualIncidentRow = {
  id: string;
  identity_key: string | null;
  incident_type: string | null;
  severity: string | null;
  status: string | null;
  source: string | null;
  incident_date: string | null;
  description: string | null;
  economic_impact: number | null;
  input_document_masked: string | null;
  input_email_masked: string | null;
  input_phone_masked: string | null;
  input_first_name: string | null;
  input_last_name: string | null;
  input_country: string | null;
  created_by: string | null;
  created_at: string | null;
};

function clean(v?: string | null): string {
  return String(v ?? "").trim();
}

function deriveMineRiskLevel(records: Array<{ severity?: string | null }>): string {
  if (!records.length) return "NONE";

  const severities = records.map((r) => clean(r.severity).toUpperCase());

  if (severities.some((s) => s === "CRITICAL")) return "HIGH";
  if (severities.some((s) => s === "HIGH")) return "HIGH";
  if (severities.some((s) => s === "MEDIUM")) return "MEDIUM";
  return "LOW";
}

async function buildPrimaryIdentityKey(
  type: string,
  normalizedValue: string,
): Promise<string | null> {
  if (!normalizedValue) return null;

  if (type === "DOCUMENT") {
    const built = await buildIdentityKey({ document: normalizedValue });
    return built?.identity_key ?? null;
  }

  if (type === "EMAIL") {
    const built = await buildIdentityKey({ email: normalizedValue });
    return built?.identity_key ?? null;
  }

  if (type === "PHONE") {
    const built = await buildIdentityKey({ phone: normalizedValue });
    return built?.identity_key ?? null;
  }

  return null;
}

function buildFullNameTokens(value: string) {
  const parts = clean(value)
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { first: "", last: "" };
  }

  if (parts.length === 1) {
    return { first: parts[0], last: "" };
  }

  return {
    first: parts[0],
    last: parts.slice(1).join(" "),
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

    const criteria = body.criteria ?? {};
    const type = clean(criteria.type).toUpperCase() as QueryType;
    const value = clean(criteria.value);

    if (!type) throw new Error("QUERY_TYPE_REQUIRED");
    if (!value) throw new Error("QUERY_VALUE_REQUIRED");

    const ctx = await resolvePropertyContextOrThrow({
      supabaseAdmin: sb,
      authUserId: user.id,
      propertyId,
    });

    const normalized = normalizeManualQuery({
      type,
      value,
    });

    const queryHash = await buildQueryHash({
      type,
      normalized: normalized.normalized,
    });

    let primaryIdentityKey: string | null = null;
    let rows: ManualIncidentRow[] = [];

    if (type === "FULL_NAME") {
      const { first, last } = buildFullNameTokens(value);

      let query = sb
        .from("debacu_eval_manual_incidents")
        .select(`
          id,
          identity_key,
          incident_type,
          severity,
          status,
          source,
          incident_date,
          description,
          economic_impact,
          input_document_masked,
          input_email_masked,
          input_phone_masked,
          input_first_name,
          input_last_name,
          input_country,
          created_by,
          created_at
        `)
        .eq("property_id", ctx.property_id)
        .eq("status", "ACTIVE")
        .order("incident_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);

      if (first) {
        query = query.ilike("input_first_name", `%${first}%`);
      }
      if (last) {
        query = query.ilike("input_last_name", `%${last}%`);
      }

      const { data, error } = await query;

      if (error) {
        console.error("manual_incidents full_name lookup error:", error.message);
        throw new Error("MANUAL_INCIDENTS_LOOKUP_FAILED");
      }

      rows = (data ?? []) as ManualIncidentRow[];
      primaryIdentityKey = rows[0]?.identity_key ?? null;
    } else {
      primaryIdentityKey = await buildPrimaryIdentityKey(type, normalized.normalized);

      if (!primaryIdentityKey) {
        rows = [];
      } else {
        const { data, error } = await sb
          .from("debacu_eval_manual_incidents")
          .select(`
            id,
            identity_key,
            incident_type,
            severity,
            status,
            source,
            incident_date,
            description,
            economic_impact,
            input_document_masked,
            input_email_masked,
            input_phone_masked,
            input_first_name,
            input_last_name,
            input_country,
            created_by,
            created_at
          `)
          .eq("property_id", ctx.property_id)
          .eq("status", "ACTIVE")
          .eq("identity_key", primaryIdentityKey)
          .order("incident_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) {
          console.error("manual_incidents identity lookup error:", error.message);
          throw new Error("MANUAL_INCIDENTS_LOOKUP_FAILED");
        }

        rows = (data ?? []) as ManualIncidentRow[];
      }
    }

    const records = rows.map((r) => ({
      id: r.id,
      identityKey: r.identity_key,
      fullName: `${r.input_first_name ?? ""} ${r.input_last_name ?? ""}`.trim() || null,
      fullNameMasked:
        `${r.input_first_name ? String(r.input_first_name).slice(0, 2) + "****" : ""} ${
          r.input_last_name ? String(r.input_last_name).slice(0, 2) + "****" : ""
        }`.trim() || null,
      maskedDocument: r.input_document_masked,
      maskedEmail: r.input_email_masked,
      maskedPhone: r.input_phone_masked,
      incidentType: r.incident_type,
      severity: r.severity,
      status: r.status,
      source: r.source,
      incidentDate: r.incident_date,
      description: r.description,
      economicImpact: r.economic_impact,
      country: r.input_country,
      createdBy: r.created_by,
      createdAt: r.created_at,
      lastIncidentAt: r.incident_date ?? r.created_at ?? null,
    }));

    const mineRiskLevel = deriveMineRiskLevel(records);

    const mineSummary = {
      totalMatches: records.length,
      riskLevel: mineRiskLevel,
      records,
    };

    const { data: insertedCheck, error: insertErr } = await sb
      .from("debacu_eval_manual_checks")
      .insert({
        org_id: ctx.org_id,
        property_id: ctx.property_id,
        performed_by_user_id: user.id,
        check_mode: "MINE",
        query_type: type,
        query_value_masked: normalized.masked,
        query_value_hash: queryHash,
        normalized_query: {
          type,
          normalized: normalized.normalized,
        },
        identity_key: primaryIdentityKey,
        identity_confidence: normalized.confidence,
        result_has_matches: records.length > 0,
        result_scope: "PROPERTY_OWNED",
        result_summary: {
          mineSummary,
        },
        previous_risk_level: "NONE",
        current_risk_level: mineRiskLevel,
        risk_changed: mineRiskLevel !== "NONE",
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("manual_checks insert error:", insertErr.message);
      throw new Error("MANUAL_CHECK_INSERT_FAILED");
    }

    if (primaryIdentityKey && insertedCheck?.id) {
      const { error: eventErr } = await sb
        .from("debacu_eval_identity_risk_events")
        .insert({
          identity_key: primaryIdentityKey,
          event_type: "MANUAL_CHECK",
          org_id: ctx.org_id,
          property_id: ctx.property_id,
          actor_user_id: user.id,
          source_table: "debacu_eval_manual_checks",
          source_id: insertedCheck.id,
          previous_risk_level: "NONE",
          new_risk_level: mineRiskLevel,
          risk_delta: 0,
          payload: {
            mode: "MINE",
            queryType: type,
            source: "debacu_eval_manual_incidents",
            matchedMineRecords: records.length,
          },
        });

      if (eventErr) {
        console.error("identity_risk_events insert warning:", eventErr.message);
      }
    }

    return json(req, 200, {
      ok: true,
      data: {
        checkId: insertedCheck.id,
        propertyId: ctx.property_id,
        orgId: ctx.org_id,
        mode: "MINE",
        criteria: {
          type,
          valueMasked: normalized.masked,
        },
        mineSummary,
        debug: {
          propertyId: ctx.property_id,
          primaryIdentityKey,
          recordsFound: records.length,
          normalizedValue: normalized.normalized,
        },
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "UNAUTHENTICATED") {
      return json(req, 401, {
        ok: false,
        error: "request_failed",
        detail: "UNAUTHENTICATED",
      });
    }

    if (
      msg === "PROPERTY_ID_REQUIRED" ||
      msg === "QUERY_TYPE_REQUIRED" ||
      msg === "QUERY_VALUE_REQUIRED"
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

    console.error("manual_check_mine error:", e);

    return json(req, 500, {
      ok: false,
      error: "request_failed",
      detail: msg || "internal_error",
    });
  }
});