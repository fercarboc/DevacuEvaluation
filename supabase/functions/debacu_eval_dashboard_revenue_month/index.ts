// supabase/functions/debacu_eval_dashboard_revenue_month/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

// ─── Utils ────────────────────────────────────────────────────────────────

function startOfMonthISO(d = new Date()): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0));
  return x.toISOString().slice(0, 10);
}

function addMonthsStartISO(monthsBack: number): string {
  const now = new Date();
  const x = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1, 0, 0, 0));
  return x.toISOString().slice(0, 10);
}

function asNumber(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function isUuid(v: unknown): v is string {
  if (typeof v !== "string") return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function safeUpper(v?: string | null) {
  return (v ?? "").toUpperCase();
}

type Sb = ReturnType<typeof supabaseServiceClient>;

const BATCH_SIZE = 200;

// ─── Resolución de org ────────────────────────────────────────────────────

async function resolveOrgIdForUser(
  sb: Sb,
  authUserId: string,
  requestedOrgId?: string | null,
): Promise<{ ok: true; org_id: string } | { ok: false; status: number; detail: string }> {
  if (requestedOrgId) {
    if (!isUuid(requestedOrgId)) return { ok: false, status: 400, detail: "invalid_org_id" };

    const { data, error } = await sb
      .from("debacu_eval_org_members")
      .select("org_id")
      .eq("auth_user_id", authUserId)
      .eq("org_id", requestedOrgId)
      .eq("status", "ACTIVE")
      .limit(1)
      .maybeSingle();

    if (error) return { ok: false, status: 500, detail: "DB_ERROR" };
    if (!data?.org_id) return { ok: false, status: 403, detail: "NO_ORG_MEMBERSHIP" };
    return { ok: true, org_id: String(data.org_id) };
  }

  const { data, error } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .eq("auth_user_id", authUserId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, status: 500, detail: "DB_ERROR" };
  if (!data?.org_id) return { ok: false, status: 403, detail: "NO_ORG_MEMBERSHIP" };
  return { ok: true, org_id: String(data.org_id) };
}

async function loadEntitlements(
  sb: Sb,
  orgId: string,
): Promise<
  | { ok: true; ent: { org_id: string; customer_id: string | null; subscription_status: string | null; plan_code: string | null } }
  | { ok: false; status: number; detail: string }
> {
  const { data, error } = await sb
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, seats_used, plan_code, max_users, subscription_status")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) return { ok: false, status: 500, detail: "DB_ERROR" };
  if (!data) return { ok: false, status: 403, detail: "NO_ENTITLEMENTS" };
  return { ok: true, ent: data as any };
}

function planActive(ent: { subscription_status: string | null; plan_code: string | null }): boolean {
  const st = safeUpper(ent.subscription_status);
  return Boolean(ent.plan_code) && (st === "ACTIVE" || st === "TRIAL_ACTIVE");
}

// ─── Lookup en debacu_eval_guest_index por lotes ─────────────────────────
//
// debacu_eval_guest_index: tabla canónica de riesgo por huésped (global, sin org_id).
// El filtro de org/propiedad siempre viene de debacu_eval_guest_stays.

async function batchGuestIndex(
  sb: Sb,
  identityKeys: string[],
): Promise<Map<string, { risk_band: string; incidents_count: number; total_net_loss: number }>> {
  const result = new Map<string, { risk_band: string; incidents_count: number; total_net_loss: number }>();
  if (!identityKeys.length) return result;

  for (let i = 0; i < identityKeys.length; i += BATCH_SIZE) {
    const chunk = identityKeys.slice(i, i + BATCH_SIZE);
    const { data, error } = await sb
      .from("debacu_eval_guest_index")
      .select("identity_key, risk_band, incidents_count, total_net_loss")
      .in("identity_key", chunk);

    if (!error && data) {
      for (const g of data as any[]) {
        result.set(String(g.identity_key), {
          risk_band: safeUpper(g.risk_band),
          incidents_count: asNumber(g.incidents_count),
          total_net_loss: asNumber(g.total_net_loss),
        });
      }
    }
  }

  return result;
}

// ─── Lookup de canal por identity_keys (via reservation_identities → reservations) ──
//
// debacu_eval_reservation_identities: vincula identity_key ↔ reservation_key (org-scoped)
// debacu_eval_reservations: tiene el campo channel (OTA, DIRECTO, etc.) y gross_revenue

async function buildChannelMap(
  sb: Sb,
  orgId: string,
  identityKeys: string[],
  dateFrom: string,
  dateTo: string,
): Promise<Map<string, string>> {
  // identity_key → channel
  const result = new Map<string, string>();
  if (!identityKeys.length) return result;

  // Paso 1: identity_key → reservation_key (org-scoped)
  const reservationKeys: string[] = [];
  const identityToReservation = new Map<string, string>();

  for (let i = 0; i < identityKeys.length; i += BATCH_SIZE) {
    const chunk = identityKeys.slice(i, i + BATCH_SIZE);
    const { data, error } = await sb
      .from("debacu_eval_reservation_identities")
      .select("identity_key, reservation_key")
      .eq("org_id", orgId)
      .in("identity_key", chunk);

    if (!error && data) {
      for (const r of data as any[]) {
        identityToReservation.set(String(r.identity_key), String(r.reservation_key));
        reservationKeys.push(String(r.reservation_key));
      }
    }
  }

  if (!reservationKeys.length) return result;

  // Paso 2: reservation_key → channel (filtrado por fecha de checkin)
  const uniqueResKeys = [...new Set(reservationKeys)];
  for (let i = 0; i < uniqueResKeys.length; i += BATCH_SIZE) {
    const chunk = uniqueResKeys.slice(i, i + BATCH_SIZE);
    const { data, error } = await sb
      .from("debacu_eval_reservations")
      .select("reservation_key, channel")
      .eq("org_id", orgId)
      .in("reservation_key", chunk)
      .gte("checkin_date", dateFrom)
      .lte("checkin_date", dateTo);

    if (!error && data) {
      const resChannelMap = new Map<string, string>();
      for (const r of data as any[]) {
        resChannelMap.set(String(r.reservation_key), String(r.channel ?? "UNKNOWN"));
      }
      for (const [ikey, rkey] of identityToReservation.entries()) {
        const ch = resChannelMap.get(rkey);
        if (ch) result.set(ikey, ch);
      }
    }
  }

  return result;
}

// ─── Handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);

  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "request_failed", detail: "method_not_allowed" });
  }

  let user: any;
  try {
    user = await requireUser(req);
  } catch {
    return json(req, 401, { ok: false, error: "request_failed", detail: "UNAUTHENTICATED" });
  }

  const sb = supabaseServiceClient();

  try {
    const body = await req.json().catch(() => ({} as any));
    const requestedOrgId = body?.org_id ?? null;
    const propertyId = body?.property_id && isUuid(body.property_id) ? String(body.property_id) : null;

    // 1) Org
    const orgRes = await resolveOrgIdForUser(sb, user.id, requestedOrgId);
    if (!orgRes.ok) {
      return json(req, orgRes.status, { ok: false, error: "request_failed", detail: orgRes.detail });
    }
    const orgId = orgRes.org_id;

    // 2) Entitlements
    const entRes = await loadEntitlements(sb, orgId);
    if (!entRes.ok) {
      return json(req, entRes.status, { ok: false, error: "request_failed", detail: entRes.detail });
    }
    if (!planActive(entRes.ent)) {
      return json(req, 402, { ok: false, error: "request_failed", detail: "PLAN_NOT_ACTIVE" });
    }

    // 3) Rangos de fecha
    const month_from = startOfMonthISO();
    const trend_from = addMonthsStartISO(5); // 6 meses incluyendo el actual

    // 4) Evidencia del mes desde debacu_eval_org_guest_evidence
    //    Esta tabla tiene property_id + importes reales por incidencia (gross, recovered, net).
    let monthEvidenceQ = sb
      .from("debacu_eval_org_guest_evidence")
      .select("identity_key, incident_type, economic_impact_gross, economic_recovered, economic_net_loss")
      .eq("org_id", orgId)
      .gte("event_date", month_from)
      .not("incident_type", "is", null);

    if (propertyId) {
      monthEvidenceQ = monthEvidenceQ.eq("property_id", propertyId);
    }

    const { data: monthEvData, error: monthEvErr } = await monthEvidenceQ;

    if (monthEvErr) {
      return json(req, 500, { ok: false, error: "request_failed", detail: "DB_ERROR" });
    }

    const monthEvidence = Array.isArray(monthEvData) ? (monthEvData as any[]) : [];

    // 5) Agregar KPIs del mes
    let month_incidents = 0;
    let month_gross = 0;
    let month_recovered = 0;
    let month_net = 0;
    const monthIdentityKeys = new Set<string>();

    for (const ev of monthEvidence) {
      month_incidents++;
      month_gross += asNumber(ev.economic_impact_gross);
      month_recovered += asNumber(ev.economic_recovered);
      month_net += asNumber(ev.economic_net_loss);
      if (ev.identity_key) monthIdentityKeys.add(String(ev.identity_key));
    }

    const monthKeys = [...monthIdentityKeys];

    // 6) by_platform: canal por identity_key a través de reservation_identities → reservations
    const byPlatformMap = new Map<string, { platform: string; incidents: number; net_loss: number }>();

    try {
      const channelMap = await buildChannelMap(sb, orgId, monthKeys, month_from, month_from.slice(0, 7) + "-31");

      for (const ev of monthEvidence) {
        if (!ev.identity_key) continue;
        const ch = channelMap.get(String(ev.identity_key)) ?? "UNKNOWN";
        const cur = byPlatformMap.get(ch) ?? { platform: ch, incidents: 0, net_loss: 0 };
        cur.incidents += 1;
        cur.net_loss += asNumber(ev.economic_net_loss);
        byPlatformMap.set(ch, cur);
      }
    } catch { /* best-effort: si falla el join de reservas, by_platform queda vacío */ }

    const by_platform = Array.from(byPlatformMap.values()).sort((a, b) => b.net_loss - a.net_loss);

    // 7) Tendencia 6 meses desde debacu_eval_org_guest_evidence agrupado por event_date
    let trendEvidenceQ = sb
      .from("debacu_eval_org_guest_evidence")
      .select("event_date, economic_net_loss")
      .eq("org_id", orgId)
      .gte("event_date", trend_from)
      .not("incident_type", "is", null);

    if (propertyId) {
      trendEvidenceQ = trendEvidenceQ.eq("property_id", propertyId);
    }

    const { data: trendEvData } = await trendEvidenceQ;
    const trendMap = new Map<string, number>();

    for (const ev of (Array.isArray(trendEvData) ? (trendEvData as any[]) : [])) {
      const k = String(ev.event_date ?? "").slice(0, 7); // YYYY-MM
      if (!k || k.length < 7) continue;
      trendMap.set(k, (trendMap.get(k) ?? 0) + asNumber(ev.economic_net_loss));
    }

    const now = new Date();
    const trendKeys: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const x = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      trendKeys.push(x.toISOString().slice(0, 7));
    }

    const last_6_months = trendKeys.map((k) => ({
      month: k,
      net_loss: Number((trendMap.get(k) ?? 0).toFixed(2)),
    }));

    return json(req, 200, {
      ok: true,
      data: {
        org_id: orgId,
        month: month_from.slice(0, 7),
        property_id: propertyId ?? null,
        impact: {
          incidents_count: month_incidents,
          gross_loss: Number(month_gross.toFixed(2)),
          recovered: Number(month_recovered.toFixed(2)),
          net_loss: Number(month_net.toFixed(2)),
        },
        by_platform,
        trends: { last_6_months },
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "");
    console.error("debacu_eval_dashboard_revenue_month error:", msg);

    return json(req, 500, { ok: false, error: "request_failed", detail: "internal_error" });
  }
});
