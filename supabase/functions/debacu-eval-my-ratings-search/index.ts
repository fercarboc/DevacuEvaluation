// supabase/functions/debacu-eval-my-ratings-search/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://debacu.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-session-token",
    "Access-Control-Max-Age": "86400",
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

function parseControlledComment(comment?: string | null) {
  const raw = (comment || "").trim();
  const out: Record<string, string> = {};
  if (!raw) return out;

  raw
    .split("|")
    .map((p) => p.trim())
    .forEach((pair) => {
      const idx = pair.indexOf("=");
      if (idx === -1) return;
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      out[k] = v;
    });

  return out;
}

function monthsSince(d: Date) {
  const now = new Date();
  let m = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (m < 0) m = 0;
  return m;
}

function humanAgo(d: Date) {
  const ms = Date.now() - d.getTime();
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) return "hoy";
  if (days === 1) return "hace 1 día";
  if (days < 30) return `hace ${days} días`;
  const months = Math.floor(days / 30);
  if (months === 1) return "hace 1 mes";
  if (months < 24) return `hace ${months} meses`;
  const years = Math.floor(months / 12);
  return years === 1 ? "hace 1 año" : `hace ${years} años`;
}

function bucketTimeWindow(m: number) {
  if (m <= 6) return "6M";
  if (m <= 12) return "12M";
  if (m <= 18) return "18M";
  if (m <= 24) return "24M";
  if (m <= 36) return "36M";
  return "36M+";
}

type Pattern = "LOW" | "MODERATE" | "HIGH";

function patternFromCount(n: number): Pattern {
  if (n <= 1) return "LOW";
  if (n <= 3) return "MODERATE";
  return "HIGH";
}

function dominantSignalFromRow(row: any) {
  const incident = String(row?.incident_type ?? "").trim();
  const rating = Number(row?.rating ?? 0);

  const netLoss = Number(row?.economic_net_loss ?? 0);
  const gross = Number(row?.economic_impact_gross ?? 0);
  const items = row?.impact_items;

  const hasEconomic = (Number.isFinite(netLoss) && netLoss > 0) || (Number.isFinite(gross) && gross > 0);
  const hasItems = Array.isArray(items) && items.length > 0;

  if (hasEconomic) return "INCIDENT_ECONOMIC";
  if (incident) return incident;
  if (hasItems) return "IMPACT_ITEMS";
  if (rating > 0 && rating <= 2) return "BAD_RATING";
  if (rating === 3) return "NEUTRAL_RATING";
  return "INFO_ONLY";
}

/** -----------------------
 * Econ bucketing (MISMO ESTILO que global: "0–100", "101–200", etc)
 * ---------------------- */
const ECON_BUCKETS = [
  { min: 0, max: 0, label: "0 €" },
  { min: 1, max: 100, label: "0–100 €" },
  { min: 101, max: 200, label: "101–200 €" },
  { min: 201, max: 300, label: "201–300 €" },
  { min: 301, max: 400, label: "301–400 €" },
  { min: 401, max: 500, label: "401–500 €" },
  { min: 501, max: 750, label: "501–750 €" },
  { min: 751, max: 1000, label: "751–1.000 €" },
  { min: 1001, max: 1500, label: "1.001–1.500 €" },
  { min: 1501, max: 2500, label: "1.501–2.500 €" },
  { min: 2501, max: 5000, label: "2.501–5.000 €" },
  { min: 5001, max: 999999999, label: "5.001+ €" },
];

function econLabelFor(n: number) {
  const v = Math.max(0, Number.isFinite(n) ? n : 0);
  for (const b of ECON_BUCKETS) {
    if (v >= b.min && v <= b.max) return b.label;
  }
  return "0 €";
}

type CountBucket = "0" | "1-2" | "3-5" | "6-10" | "10+";
function countBucket(n: number): CountBucket {
  if (n <= 0) return "0";
  if (n <= 2) return "1-2";
  if (n <= 5) return "3-5";
  if (n <= 10) return "6-10";
  return "10+";
}
type RiskLevel = "BAJO" | "MEDIO" | "ALTO" | "NO_CONCLUYENTE";

function riskFromAvgStars(avg: number | null): RiskLevel {
  if (avg == null) return "NO_CONCLUYENTE";
  if (avg >= 4) return "BAJO";
  if (avg >= 3) return "MEDIO";
  return "ALTO";
}

async function resolveSessionCustomer(sb: ReturnType<typeof createClient>, token: string) {
  const { data, error } = await sb
    .from("debacu_eval_sessions")
    .select("id, customer_id, customer_name, app_code, revoked_at, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("invalid_session_token");
  if (data.revoked_at) throw new Error("session_revoked");
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) throw new Error("session_expired");

  return {
    customer_id: String(data.customer_id),
    customer_name: String(data.customer_name ?? ""),
    app_code: String(data.app_code ?? "DEBACU_EVAL"),
  };
}

export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  try {
    const sessionToken = req.headers.get("x-session-token") ?? "";
    if (!sessionToken) return json(req, 401, { ok: false, error: "missing_session_token" });

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const query = String(body?.q ?? "").trim();
    const lim = Math.min(100, Math.max(1, Number(body?.limit ?? 50)));

    if (!query) {
      return json(req, 200, { ok: true, rows: [], signals: null });
    }

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // ✅ FIX CLAVE: el authorId se deriva SIEMPRE del x-session-token
    const sess = await resolveSessionCustomer(sb, sessionToken);
    const creatorUuid = sess.customer_id;

    const { data, error } = await sb
      .from("debacu_evaluations")
      .select(
        [
          "id",
          "document",
          "full_name",
          "nationality",
          "phone",
          "email",
          "rating",
          "comment",
          "creator_customer_id",
          "creator_customer_name",
          "creator_customer_uuid",
          "platform",
          "evaluation_date",
          "created_at",
          "incident_type",
          "economic_impact_gross",
          "economic_recovered",
          "economic_net_loss",
          "impact_items",
          "season_applied",
          "adr_reference",
          "adr_real_snapshot",
        ].join(",")
      )
      .eq("creator_customer_uuid", creatorUuid)
      .or(
        [
          `document.ilike.%${query}%`,
          `phone.ilike.%${query}%`,
          `email.ilike.%${query}%`,
          `full_name.ilike.%${query}%`,
        ].join(",")
      )
      .order("evaluation_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(lim);

    if (error) return json(req, 500, { ok: false, error: error.message });

    const rows = (data ?? []).map((r: any) => {
      const cc = parseControlledComment(r?.comment);

      const evidenceRaw = (cc["evidence"] || "").toLowerCase();
      const hasEvidence =
        evidenceRaw === "yes" || evidenceRaw === "si" || evidenceRaw === "sí" || evidenceRaw === "true";

      const dStr = r?.evaluation_date || r?.created_at;
      const d = dStr ? new Date(dStr) : new Date();
      const m = monthsSince(d);

      return {
        ...r,
        structured_summary: {
          hasEvidence,
          dominantSignal: dominantSignalFromRow(r),
          pattern: "LOW" as Pattern,
          timeWindow: bucketTimeWindow(m),
          lastSeenLabel: humanAgo(d),
        },
      };
    });

    const pattern = patternFromCount(rows.length);
    const outRows = rows.map((r: any) => ({
      ...r,
      structured_summary: {
        ...(r.structured_summary ?? {}),
        pattern,
      },
    }));

    // -------- signals agregadas “MIS REGISTROS” ----------
    const countExact = outRows.length;
    const avgStars =
      countExact > 0
        ? outRows.reduce((acc: number, x: any) => acc + (Number(x?.rating ?? 0) || 0), 0) / countExact
        : null;

    // Econ: suma gross y net (net_loss ya viene guardado si lo calculas en alta; si no, derivamos)
    let grossSum = 0;
    let netSum = 0;

    // Tipologías top
    const typCount: Record<string, number> = {};
    let lastSeen: Date | null = null;

    for (const r of outRows) {
      const g = Number(r?.economic_impact_gross ?? 0);
      const rec = Number(r?.economic_recovered ?? 0);
      const netSaved = Number(r?.economic_net_loss ?? NaN);

      const gross = Number.isFinite(g) ? Math.max(0, g) : 0;
      const recovered = Number.isFinite(rec) ? Math.max(0, rec) : 0;
      const net =
        Number.isFinite(netSaved) ? Math.max(0, netSaved) : Math.max(0, gross - recovered);

      grossSum += gross;
      netSum += net;

      const t = String(r?.incident_type ?? "").trim();
      if (t) typCount[t] = (typCount[t] || 0) + 1;

      const dStr = r?.evaluation_date || r?.created_at;
      const d = dStr ? new Date(dStr) : null;
      if (d && (!lastSeen || d.getTime() > lastSeen.getTime())) lastSeen = d;
    }

    const topTypologies = Object.entries(typCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k]) => k);

    const signals = {
      hasMatches: countExact > 0,
      countExact,
      countBucket: countBucket(countExact),
      avgStars: avgStars != null ? Number(avgStars.toFixed(2)) : null,
      risk: riskFromAvgStars(avgStars),
      timeWindow: "MINE",
      topTypologies,

      // ✅ aquí es donde CUADRA con global: labels por bucket
      economicGrossLabel: econLabelFor(grossSum),
      economicNetLabel: econLabelFor(netSum),
      economicTimeWindow: "MINE",

      lastSeenLabel: lastSeen ? humanAgo(lastSeen) : null,
    };

    return json(req, 200, { ok: true, rows: outRows, signals });
  } catch (e: any) {
    return json(req, 500, { ok: false, error: String(e?.message ?? e) });
  }
});
