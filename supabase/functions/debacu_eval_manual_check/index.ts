import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";
import { resolvePropertyContextOrThrow } from "../_shared/screeningProperty.ts";
import {
  buildIdentityKey,
  normalizeManualQuery,
  buildQueryHash,
} from "../_shared/identity.ts";

type Mode = "GLOBAL" | "MINE";
type QueryType = "DOCUMENT" | "EMAIL" | "PHONE" | "FULL_NAME";

type ReqBody = {
  property_id?: string;
  mode?: Mode;
  criteria?: {
    type?: QueryType;
    value?: string;
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

type ManualIncidentRow = {
  id: string;
  identity_key: string | null;
  incident_type: string | null;
  severity: string | null;
  incident_date: string | null;
  economic_impact: number | null;
  input_document_masked: string | null;
  input_email_masked: string | null;
  input_phone_masked: string | null;
  input_first_name: string | null;
  input_last_name: string | null;
  input_country: string | null;
  created_at: string | null;
};

function clean(v?: string | null): string {
  return String(v ?? "").trim();
}

function normalizeRiskLevel(v?: string | null): string {
  const s = clean(v).toUpperCase();
  if (s === "CRITICAL") return "HIGH";
  if (s === "HIGH" || s === "ALTO") return "HIGH";
  if (s === "MEDIUM" || s === "MEDIO") return "MEDIUM";
  if (s === "LOW" || s === "BAJO") return "LOW";
  if (s === "NONE" || s === "SIN_SEÑALES" || s === "SIN_SENALES") return "NONE";
  return "NONE";
}

function mapGuestRiskBandToLevel(riskBand?: string | null): string {
  const s = clean(riskBand).toUpperCase();
  if (s === "HIGH" || s === "ALTO") return "HIGH";
  if (s === "MEDIUM" || s === "MEDIO") return "MEDIUM";
  if (s === "LOW" || s === "BAJO") return "LOW";
  if (s === "NONE" || s === "SIN_SEÑALES" || s === "SIN_SENALES") return "NONE";
  return "NONE";
}

function estimateRiskScoreFromGuest(row: GuestIndexRow): number {
  const incidents = Number(row.incidents_count ?? 0);
  const stays = Number(row.stays_count ?? 0);
  const netLoss = Number(row.total_net_loss ?? 0);
  const riskBand = mapGuestRiskBandToLevel(row.risk_band);

  let score = 0;

  if (riskBand === "HIGH") score += 70;
  else if (riskBand === "MEDIUM") score += 45;
  else if (riskBand === "LOW") score += 20;

  if (incidents >= 10) score += 20;
  else if (incidents >= 5) score += 12;
  else if (incidents >= 2) score += 6;
  else if (incidents >= 1) score += 3;

  if (netLoss >= 1000) score += 10;
  else if (netLoss >= 300) score += 6;
  else if (netLoss > 0) score += 3;

  if (stays >= 10) score += 2;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function deriveMineRiskLevel(records: Array<{ severity?: string | null }>): string {
  if (!records.length) return "NONE";

  const severities = records.map((r) => clean(r.severity).toUpperCase());

  if (severities.some((s) => s === "CRITICAL")) return "HIGH";
  if (severities.some((s) => s === "HIGH")) return "HIGH";
  if (severities.some((s) => s === "MEDIUM")) return "MEDIUM";
  if (records.length >= 3) return "MEDIUM";

  return "LOW";
}

function resolveLookupColumn(type: string): "doc_key" | "email_key" | "phone_key" | null {
  if (type === "DOCUMENT") return "doc_key";
  if (type === "EMAIL") return "email_key";
  if (type === "PHONE") return "phone_key";
  return null;
}

async function buildLookupKeyFromDb(
  sb: ReturnType<typeof supabaseServiceClient>,
  type: string,
  normalized: string,
): Promise<string | null> {
  if (!normalized) return null;

  if (type === "DOCUMENT") {
    const { data, error } = await sb.rpc("debacu_doc_key", { p_doc: normalized });
    if (error) throw new Error(`DOC_KEY_RPC_FAILED:${error.message}`);
    return typeof data === "string" ? data : null;
  }

  if (type === "EMAIL") {
    const { data, error } = await sb.rpc("debacu_email_key", { p_email: normalized });
    if (error) throw new Error(`EMAIL_KEY_RPC_FAILED:${error.message}`);
    return typeof data === "string" ? data : null;
  }

  if (type === "PHONE") {
    const { data, error } = await sb.rpc("debacu_phone_key", { p_phone: normalized });
    if (error) throw new Error(`PHONE_KEY_RPC_FAILED:${error.message}`);
    return typeof data === "string" ? data : null;
  }

  return null;
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

  const first = parts[0] ?? "";
  const last = parts.slice(1).join(" ");

  return { first, last };
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
    const mode = clean(body.mode).toUpperCase() as Mode;

    if (!propertyId) throw new Error("PROPERTY_ID_REQUIRED");
    if (mode !== "GLOBAL" && mode !== "MINE") throw new Error("INVALID_MODE");

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
    let previousRiskLevel: string | null = null;
    let currentRiskLevel: string | null = null;

    let globalSummary: any = null;
    let mineSummary: any = null;

    const lookupColumn = resolveLookupColumn(type);

    let guestRows: GuestIndexRow[] = [];
    let lookupKey: string | null = null;

    if (lookupColumn) {
      lookupKey = await buildLookupKeyFromDb(sb, type, normalized.normalized);

      if (lookupKey) {
        const { data, error } = await sb
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
          .eq(lookupColumn, lookupKey)
          .order("incidents_count", { ascending: false })
          .order("total_net_loss", { ascending: false })
          .order("last_seen_date", { ascending: false });

        if (error) {
          console.error("guest_index lookup error:", error.message);
          throw new Error("GUEST_INDEX_LOOKUP_FAILED");
        }

        guestRows = (data ?? []) as GuestIndexRow[];
        primaryIdentityKey = guestRows[0]?.identity_key ?? null;
      }
    }

    if (!primaryIdentityKey && (type === "DOCUMENT" || type === "EMAIL" || type === "PHONE")) {
      primaryIdentityKey = await buildPrimaryIdentityKey(type, normalized.normalized);
    }

    if (mode === "GLOBAL") {
      if (type === "FULL_NAME") {
        globalSummary = {
          hasSignals: false,
          riskLevel: "NONE",
          riskScore: 0,
          incidentsTotal: 0,
          incidentsHigh: 0,
          incidentsCritical: 0,
          distinctOrgsCount: 0,
          distinctPropertiesCount: 0,
          lastIncidentAt: null,
          staysCount: 0,
          totalNetLoss: 0,
          profiles: [],
        };

        previousRiskLevel = "NONE";
        currentRiskLevel = "NONE";
      } else if (guestRows.length > 0) {
        const identityKeys = guestRows.map((r) => r.identity_key);

        let stateRows: RiskStateRow[] = [];

        const { data: states, error: stateErr } = await sb
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
          .in("identity_key", identityKeys);

        if (stateErr) {
          console.error("identity_risk_state lookup warning:", stateErr.message);
        } else {
          stateRows = (states ?? []) as RiskStateRow[];
        }

        const stateMap = new Map(stateRows.map((s) => [s.identity_key, s]));

        const profiles = guestRows.map((row) => {
          const state = stateMap.get(row.identity_key);
          const riskLevel = normalizeRiskLevel(
            state?.risk_level ?? mapGuestRiskBandToLevel(row.risk_band),
          );

          return {
            identityKey: row.identity_key,
            riskLevel,
            riskScore:
              typeof state?.risk_score === "number"
                ? state.risk_score
                : estimateRiskScoreFromGuest(row),
            incidentsTotal:
              typeof state?.incidents_total === "number"
                ? state.incidents_total
                : Number(row.incidents_count ?? 0),
            incidentsHigh:
              typeof state?.incidents_high === "number" ? state.incidents_high : 0,
            incidentsCritical:
              typeof state?.incidents_critical === "number" ? state.incidents_critical : 0,
            distinctOrgsCount:
              typeof state?.distinct_orgs_count === "number" ? state.distinct_orgs_count : 0,
            distinctPropertiesCount:
              typeof state?.distinct_properties_count === "number"
                ? state.distinct_properties_count
                : 0,
            lastIncidentAt: state?.last_incident_at ?? row.last_incident_date ?? null,
            staysCount: Number(row.stays_count ?? 0),
            totalNetLoss: Number(row.total_net_loss ?? 0),
            firstSeenDate: row.first_seen_date ?? null,
            lastSeenDate: row.last_seen_date ?? null,
          };
        });

        const sortedProfiles = profiles.sort((a, b) => {
          if (b.incidentsTotal !== a.incidentsTotal) return b.incidentsTotal - a.incidentsTotal;
          if (b.totalNetLoss !== a.totalNetLoss) return b.totalNetLoss - a.totalNetLoss;
          return String(b.lastSeenDate ?? "").localeCompare(String(a.lastSeenDate ?? ""));
        });

        const riskRank = (r: string) => {
          if (r === "HIGH") return 3;
          if (r === "MEDIUM") return 2;
          if (r === "LOW") return 1;
          return 0;
        };

        const maxRank = sortedProfiles.reduce(
          (acc, p) => Math.max(acc, riskRank(p.riskLevel)),
          0,
        );

        const globalRiskLevel =
          maxRank === 3 ? "HIGH" :
          maxRank === 2 ? "MEDIUM" :
          maxRank === 1 ? "LOW" : "NONE";

        previousRiskLevel = globalRiskLevel;
        currentRiskLevel = globalRiskLevel;

        globalSummary = {
          hasSignals: true,
          riskLevel: globalRiskLevel,
          riskScore: sortedProfiles[0]?.riskScore ?? 0,
          incidentsTotal: sortedProfiles.reduce((sum, p) => sum + p.incidentsTotal, 0),
          incidentsHigh: sortedProfiles.reduce((sum, p) => sum + p.incidentsHigh, 0),
          incidentsCritical: sortedProfiles.reduce((sum, p) => sum + p.incidentsCritical, 0),
          distinctOrgsCount: Math.max(...sortedProfiles.map((p) => p.distinctOrgsCount), 0),
          distinctPropertiesCount: Math.max(...sortedProfiles.map((p) => p.distinctPropertiesCount), 0),
          lastIncidentAt:
            sortedProfiles
              .map((p) => p.lastIncidentAt)
              .filter(Boolean)
              .sort()
              .at(-1) ?? null,
          staysCount: sortedProfiles.reduce((sum, p) => sum + p.staysCount, 0),
          totalNetLoss: sortedProfiles.reduce((sum, p) => sum + p.totalNetLoss, 0),
          profiles: sortedProfiles,
        };
      } else {
        globalSummary = {
          hasSignals: false,
          riskLevel: "NONE",
          riskScore: 0,
          incidentsTotal: 0,
          incidentsHigh: 0,
          incidentsCritical: 0,
          distinctOrgsCount: 0,
          distinctPropertiesCount: 0,
          lastIncidentAt: null,
          staysCount: 0,
          totalNetLoss: 0,
          profiles: [],
        };

        previousRiskLevel = "NONE";
        currentRiskLevel = "NONE";
      }
    }

    if (mode === "MINE") {
      if (type === "FULL_NAME") {
        const { first, last } = buildFullNameTokens(value);

        let query = sb
          .from("debacu_eval_manual_incidents")
          .select(`
            id,
            identity_key,
            incident_type,
            severity,
            incident_date,
            economic_impact,
            input_document_masked,
            input_email_masked,
            input_phone_masked,
            input_first_name,
            input_last_name,
            input_country,
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

        const { data: rows, error: mineErr } = await query;

        if (mineErr) {
          console.error("manual_incidents full_name lookup error:", mineErr.message);
          throw new Error("MANUAL_INCIDENTS_LOOKUP_FAILED");
        }

        const records = ((rows ?? []) as ManualIncidentRow[]).map((r) => ({
          identityKey: r.identity_key,
          fullName: `${r.input_first_name ?? ""} ${r.input_last_name ?? ""}`.trim(),
          fullNameMasked:
            `${r.input_first_name ? String(r.input_first_name).slice(0, 2) + "****" : ""} ${
              r.input_last_name ? String(r.input_last_name).slice(0, 2) + "****" : ""
            }`.trim() || null,
          maskedDocument: r.input_document_masked,
          maskedEmail: r.input_email_masked,
          maskedPhone: r.input_phone_masked,
          incidentType: r.incident_type,
          severity: r.severity,
          incidentDate: r.incident_date,
          economicImpact: r.economic_impact,
          country: r.input_country,
          lastIncidentAt: r.incident_date ?? r.created_at ?? null,
        }));

        const mineRisk = deriveMineRiskLevel(records);

        mineSummary = {
          totalMatches: records.length,
          riskLevel: mineRisk,
          records,
        };

        previousRiskLevel = previousRiskLevel ?? "NONE";
        currentRiskLevel = mineRisk;
      } else {
        if (!primaryIdentityKey) {
          mineSummary = {
            totalMatches: 0,
            riskLevel: "NONE",
            records: [],
          };

          previousRiskLevel = previousRiskLevel ?? "NONE";
          currentRiskLevel = "NONE";
        } else {
          const { data: rows, error: mineErr } = await sb
            .from("debacu_eval_manual_incidents")
            .select(`
              id,
              identity_key,
              incident_type,
              severity,
              incident_date,
              economic_impact,
              input_document_masked,
              input_email_masked,
              input_phone_masked,
              input_first_name,
              input_last_name,
              input_country,
              created_at
            `)
            .eq("property_id", ctx.property_id)
            .eq("status", "ACTIVE")
            .eq("identity_key", primaryIdentityKey)
            .order("incident_date", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(50);

          if (mineErr) {
            console.error("manual_incidents identity lookup error:", mineErr.message);
            throw new Error("MANUAL_INCIDENTS_LOOKUP_FAILED");
          }

          const records = ((rows ?? []) as ManualIncidentRow[]).map((r) => ({
            identityKey: r.identity_key,
            fullName: `${r.input_first_name ?? ""} ${r.input_last_name ?? ""}`.trim(),
            fullNameMasked:
              `${r.input_first_name ? String(r.input_first_name).slice(0, 2) + "****" : ""} ${
                r.input_last_name ? String(r.input_last_name).slice(0, 2) + "****" : ""
              }`.trim() || null,
            maskedDocument: r.input_document_masked,
            maskedEmail: r.input_email_masked,
            maskedPhone: r.input_phone_masked,
            incidentType: r.incident_type,
            severity: r.severity,
            incidentDate: r.incident_date,
            economicImpact: r.economic_impact,
            country: r.input_country,
            lastIncidentAt: r.incident_date ?? r.created_at ?? null,
          }));

          const mineRisk = deriveMineRiskLevel(records);

          mineSummary = {
            totalMatches: records.length,
            riskLevel: mineRisk,
            records,
          };

          previousRiskLevel = previousRiskLevel ?? mineRisk;
          currentRiskLevel = mineRisk;
        }
      }
    }

    const { data: insertedCheck, error: insertErr } = await sb
      .from("debacu_eval_manual_checks")
      .insert({
        org_id: ctx.org_id,
        property_id: ctx.property_id,
        performed_by_user_id: user.id,
        check_mode: mode,
        query_type: type,
        query_value_masked: normalized.masked,
        query_value_hash: queryHash,
        normalized_query: {
          type,
          normalized: normalized.normalized,
        },
        identity_key: primaryIdentityKey,
        identity_confidence: normalized.confidence,
        result_has_matches:
          (mode === "GLOBAL" && !!globalSummary?.hasSignals) ||
          (mode === "MINE" && Number(mineSummary?.totalMatches ?? 0) > 0),
        result_scope: mode === "GLOBAL" ? "GLOBAL_AGGREGATED" : "PROPERTY_OWNED",
        result_summary: {
          globalSummary,
          mineSummary,
        },
        previous_risk_level: previousRiskLevel,
        current_risk_level: currentRiskLevel,
        risk_changed: previousRiskLevel !== currentRiskLevel,
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
          previous_risk_level: previousRiskLevel,
          new_risk_level: currentRiskLevel,
          payload: {
            mode,
            queryType: type,
            source:
              mode === "GLOBAL"
                ? (guestRows.length > 0 ? "debacu_eval_guest_index" : "no_match")
                : "debacu_eval_manual_incidents",
            lookupColumn,
            lookupKey,
            matchedProfiles: guestRows.length,
            matchedMineRecords: Number(mineSummary?.totalMatches ?? 0),
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
        mode,
        criteria: {
          type,
          valueMasked: normalized.masked,
        },
        globalSummary,
        mineSummary,
        previousRiskLevel,
        currentRiskLevel,
        debug: {
          primaryIdentityKey,
          lookupColumn,
          lookupKey,
          guestRowsFound: guestRows.length,
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
      msg === "QUERY_VALUE_REQUIRED" ||
      msg === "INVALID_MODE"
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

    console.error("manual_check error:", msg);

    return json(req, 500, {
      ok: false,
      error: "request_failed",
      detail: "internal_error",
    });
  }
});