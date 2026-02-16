// supabase/functions/debacu-eval-check-signals/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/* ======================================================
 * Types
 * ====================================================== */
type Risk = "BAJO" | "MEDIO" | "ALTO" | "NO_CONCLUYENTE";
type MatchStrength = "STRONG" | "MEDIUM" | "WEAK";
type CountBucket = "0" | "1-2" | "3-5" | "6-10" | "10+";
type Scope = "GLOBAL" | "MY"; // GLOBAL = sin filtro customer_id, MY = filtro customer_id

/* ======================================================
 * Buckets
 * ====================================================== */
function bucketizeCount(n: number): CountBucket {
  if (!n || n <= 0) return "0";
  if (n <= 2) return "1-2";
  if (n <= 5) return "3-5";
  if (n <= 10) return "6-10";
  return "10+";
}

// Para auditoría RGPD: guardamos bucket mínimo, no exacto.
function bucketToMinCount(bucket: CountBucket): number {
  switch (bucket) {
    case "0":
      return 0;
    case "1-2":
      return 1;
    case "3-5":
      return 3;
    case "6-10":
      return 6;
    case "10+":
      return 10;
    default:
      return 0;
  }
}

/* ======================================================
 * CORS allowlist
 * ====================================================== */
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://debacu.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    Vary: "Origin",
    // ✅ JWT-only (sin x-session-token)
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(req) },
  });
}

/* ======================================================
 * Normalizadores
 * ====================================================== */
function normalizeEmail(s: string) {
  return s.trim().toLowerCase();
}

function normalizeDoc(s: string) {
  return s.trim().toUpperCase().replace(/[\s-]/g, "");
}

/**
 * Devuelve variantes de teléfono para comparar en DB si el campo `phone`
 * está guardado con o sin prefijo 34.
 */
function normalizePhoneVariants(raw: string) {
  const digits = raw.replace(/\D/g, "");
  const variants = new Set<string>();
  if (!digits) return [];
  variants.add(digits);
  if (digits.length === 9) variants.add("34" + digits);
  if (digits.startsWith("34") && digits.length === 11) variants.add(digits.slice(2));
  return Array.from(variants);
}

/**
 * Heurística robusta:
 * 1) email
 * 2) doc
 * 3) phone
 */
function detectKind(q: string): "email" | "phone" | "doc" | "unknown" {
  const v = q.trim();
  if (!v) return "unknown";
  if (v.includes("@")) return "email";

  const compact = v.replace(/\s+/g, "");
  const doc = normalizeDoc(compact);

  // DNI: 8 dígitos + letra
  if (/^\d{8}[A-Z]$/.test(doc)) return "doc";
  // NIE: X/Y/Z + 7 dígitos + letra
  if (/^[XYZ]\d{7}[A-Z]$/.test(doc)) return "doc";
  // Pasaporte / doc genérico (letras+digitos, longitud razonable)
  if (/[A-Z]/.test(doc) && /\d/.test(doc) && doc.length >= 7 && doc.length <= 20) return "doc";

  // phone: casi todo dígitos (o +) y longitud típica
  const digits = compact.replace(/\D/g, "");
  const nonDigits = compact.replace(/\d/g, "");
  const isMostlyDigits = digits.length >= 7 && digits.length >= compact.length - nonDigits.length;
  const isPhoneLike =
    /^\+?\d[\d\s().-]*$/.test(compact) &&
    digits.length >= 7 &&
    digits.length <= 15 &&
    isMostlyDigits;

  if (isPhoneLike) return "phone";
  return "unknown";
}

function looksLikeNameOnly(q: string) {
  const t = q.trim();
  if (t.length < 5) return false;
  if (t.includes("@")) return false;

  const kind = detectKind(t);
  if (kind === "doc" || kind === "phone" || kind === "email") return false;

  const parts = t.split(/\s+/).filter(Boolean);
  const hasLetters = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/.test(t);
  return hasLetters && parts.length >= 2;
}

function classifyStrength(q: string): MatchStrength {
  const kind = detectKind(q);
  if (kind === "email" || kind === "phone" || kind === "doc") return "STRONG";
  if (looksLikeNameOnly(q)) return "WEAK";
  return "MEDIUM";
}

function maskForAudit(kind: string, raw: string) {
  const v = raw.trim();
  if (!v) return "—";
  if (kind === "email") {
    const [a] = v.split("@");
    const left = (a ?? "").slice(0, 2);
    return `${left}•••@•••`;
  }
  if (kind === "phone") {
    const digits = v.replace(/\D/g, "");
    return digits.slice(0, 2) + "•••";
  }
  if (kind === "doc") return v.slice(0, 2) + "•••";
  return v.slice(0, 2) + "•••";
}

/* ======================================================
 * Riesgo (simple, sin tipologías)
 * ====================================================== */
function computeRisk(countExact: number, avgStars: number | null): Risk {
  if (!countExact || countExact <= 0) return "NO_CONCLUYENTE";
  if (avgStars == null) return "NO_CONCLUYENTE";

  if (countExact >= 3 && avgStars <= 2.2) return "ALTO";
  if (countExact >= 2 && avgStars <= 3.0) return "MEDIO";
  if (avgStars >= 4.0) return "BAJO";
  return "MEDIO";
}

function clampInt(n: unknown, min: number, max: number, def: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return def;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

function parseScope(x: unknown): Scope {
  const v = String(x ?? "GLOBAL").trim().toUpperCase();
  return v === "MY" ? "MY" : "GLOBAL";
}

/* ======================================================
 * JWT + tenant resolution (org -> customer)
 * ====================================================== */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const APP_ID = "DEBACU_EVAL";

function userClient(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

async function requireJwtUser(req: Request) {
  const sb = userClient(req);
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function requireOrgMemberAndCustomerId(user_id: string) {
  // 1) membership
  const { data: mem, error: memErr } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, role, created_at")
    .eq("user_id", user_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (memErr) throw new Error(`MEMBERSHIP_FAILED:${memErr.message}`);
  if (!mem?.org_id) throw new Error("FORBIDDEN_NO_ORG");

  const org_id = String(mem.org_id);
  const role = mem.role ?? null;

  // 2) customer_id: por view entitlements si existe, si no por organizations
  let customer_id: string | null = null;

  try {
    const { data: ent, error: entErr } = await admin
      .from("debacu_eval_org_entitlements_v")
      .select("customer_id")
      .eq("org_id", org_id)
      .maybeSingle();
    if (!entErr && ent?.customer_id) customer_id = String(ent.customer_id);
  } catch {
    // ignore
  }

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

  return { org_id, role, customer_id };
}

/* ======================================================
 * Query builders (evita el bug "qq.eq is not a function")
 * ====================================================== */
function makeBaseCount(scope: Scope, customerId: string, cutoffISO: string) {
  let q = admin
    .from("debacu_evaluations")
    .select("id", { count: "exact", head: true })
    .gte("created_at", cutoffISO);

  if (scope === "MY") q = q.eq("customer_id", customerId);
  return q;
}

function makeBaseRatings(scope: Scope, customerId: string, cutoffISO: string, lim: number) {
  let q = admin
    .from("debacu_evaluations")
    .select("rating")
    .gte("created_at", cutoffISO)
    .limit(lim);

  if (scope === "MY") q = q.eq("customer_id", customerId);
  return q;
}

/* ======================================================
 * Main
 * ====================================================== */
serve(async (req) => {
  try {
    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(req) });
    }
    if (req.method !== "POST") {
      return json(req, { ok: false, error: "method_not_allowed" }, 405);
    }

    if (!SUPABASE_URL || !SERVICE_ROLE || !ANON_KEY) {
      return json(req, { ok: false, error: "missing_server_configuration" }, 500);
    }

    // 1) JWT obligatorio
    const user = await requireJwtUser(req);

    // 2) customer_id por org membership
    const { customer_id: customerId } = await requireOrgMemberAndCustomerId(user.id);

    const body = await req.json().catch(() => ({} as any));

    const q_raw = String(body?.q_input ?? body?.query ?? body?.q_raw ?? "").trim();
    const scope = parseScope(body?.scope); // "GLOBAL" | "MY"

    // ventana: por defecto 24M, permitido 1..60
    const months = clampInt(body?.months, 1, 60, 24);
    const k = clampInt(body?.k, 1, 20, 3);
    const maxRatingsForAvg = clampInt(body?.max_avg_samples, 50, 2000, 500);

    if (!q_raw) {
      return json(req, {
        ok: true,
        data: {
          scope,
          matchStrength: "MEDIUM" as MatchStrength,
          hasMatches: false,
          countExact: 0,
          countBucket: "0" as CountBucket,
          risk: "NO_CONCLUYENTE" as Risk,
          timeWindow: `${months}M`,
          topTypologies: [],
          avgStars: null,
          message: "Introduce un criterio válido.",
          k,
        },
      });
    }

    const strength = classifyStrength(q_raw);

    // Si es nombre/apellidos solo -> NO_CONCLUYENTE (+ audit)
    if (strength === "WEAK") {
      const auditPayload = {
        action: "CHECK_SIGNALS",
        entity: "EVALUATION_SEARCH",
        event_type: "CHECK_SIGNALS",
        entity_id: null,
        actor_user_id: user.id,
        evaluation_id: null,

        customer_id: customerId ?? null,
        app_id: APP_ID,

        search_kind: "WEAK",
        search_value_masked: maskForAudit("unknown", q_raw),
        search_value_hash: null,

        result_count: 0,
        meta: { message: "WEAK_NAME_ONLY", scope },
      };

      const ins = await admin.from("debacu_eval_audit_log").insert(auditPayload);
      if (ins.error) console.error("AUDIT INSERT FAILED (WEAK)", ins.error, auditPayload);

      return json(req, {
        ok: true,
        data: {
          scope,
          matchStrength: "WEAK" as MatchStrength,
          hasMatches: false,
          countExact: 0,
          countBucket: "0" as CountBucket,
          risk: "NO_CONCLUYENTE" as Risk,
          timeWindow: `${months}M`,
          topTypologies: [],
          avgStars: null,
          message:
            "Resultado no concluyente: el dato aportado puede corresponder a varias personas. Para una comprobación técnica, añade email/teléfono/documento.",
          k,
        },
      });
    }

    const kind = detectKind(q_raw);

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffISO = cutoff.toISOString();

    // base builders
    const baseCount = makeBaseCount(scope, String(customerId), cutoffISO);
    const baseRatings = makeBaseRatings(scope, String(customerId), cutoffISO, maxRatingsForAvg);

    let countExact = 0;

    // 3) Count
    if (kind === "email") {
      const q = normalizeEmail(q_raw);
      const { count, error } = await baseCount.eq("email", q);
      if (error) return json(req, { ok: false, error: "query_failed", detail: error.message }, 500);
      countExact = Number(count ?? 0);
    } else if (kind === "doc") {
      const q = normalizeDoc(q_raw);
      // Nota: aquí asumo que en DB guardas el documento normalizado (como te aparece en tu ejemplo)
      // Si no lo guardas normalizado, iguala por `document` y asegúrate de guardar normalizado desde UI.
      const { count, error } = await baseCount.eq("document", q);
      if (error) return json(req, { ok: false, error: "query_failed", detail: error.message }, 500);
      countExact = Number(count ?? 0);
    } else if (kind === "phone") {
      const vars = normalizePhoneVariants(q_raw);
      if (!vars.length) {
        countExact = 0;
      } else {
        const { count, error } = await baseCount.in("phone", vars);
        if (error) return json(req, { ok: false, error: "query_failed", detail: error.message }, 500);
        countExact = Number(count ?? 0);
      }
    } else {
      countExact = 0;
    }

    const countBucket = bucketizeCount(countExact);
    const hasMatches = countExact > 0;

    // 4) avgStars
    let avgStars: number | null = null;

    if (hasMatches) {
      let rows: Array<{ rating: unknown }> = [];

      if (kind === "email") {
        const q = normalizeEmail(q_raw);
        const { data, error } = await baseRatings.eq("email", q);
        if (!error && Array.isArray(data)) rows = data as any;
      } else if (kind === "doc") {
        const q = normalizeDoc(q_raw);
        const { data, error } = await baseRatings.eq("document", q);
        if (!error && Array.isArray(data)) rows = data as any;
      } else if (kind === "phone") {
        const vars = normalizePhoneVariants(q_raw);
        if (vars.length) {
          const { data, error } = await baseRatings.in("phone", vars);
          if (!error && Array.isArray(data)) rows = data as any;
        }
      }

      const nums = rows
        .map((r) => Number((r as any)?.rating ?? 0))
        .filter((n) => n >= 1 && n <= 5);

      if (nums.length) {
        avgStars = nums.reduce((a, b) => a + b, 0) / nums.length;
        avgStars = Math.max(0, Math.min(5, avgStars));
      }
    }

    const risk = computeRisk(countExact, avgStars);

    // 5) Audit log (best-effort)
    const resultCountForAudit = bucketToMinCount(countBucket);
    const auditPayload = {
      action: "CHECK_SIGNALS",
      entity: "EVALUATION_SEARCH",
      event_type: "CHECK_SIGNALS",
      entity_id: null,
      actor_user_id: user.id,
      evaluation_id: null,

      customer_id: customerId ?? null,
      app_id: APP_ID,

      search_kind: kind,
      search_value_masked: maskForAudit(kind, q_raw),
      search_value_hash: null,

      result_count: resultCountForAudit,
      meta: {
        scope,
        has_matches: hasMatches,
        count_exact: countExact, // si quieres RGPD estricto: quítalo y deja bucket
        count_bucket: countBucket,
        avg_stars: avgStars,
        risk,
        match_strength: strength,
        window: `${months}M`,
      },
    };

    const ins = await admin.from("debacu_eval_audit_log").insert(auditPayload);
    if (ins.error) console.error("AUDIT INSERT FAILED", ins.error, auditPayload);

    // 6) Response
    return json(req, {
      ok: true,
      data: {
        scope,
        matchStrength: strength,
        hasMatches,
        countExact,
        countBucket,
        avgStars,
        risk,
        topTypologies: [],
        timeWindow: `${months}M`,
        message: "",
        k,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const status =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg.startsWith("FORBIDDEN") ||
          msg.startsWith("MEMBERSHIP_FAILED") ||
          msg.startsWith("ORG_LOOKUP_FAILED")
        ? 403
        : 500;

    console.error("CHECK_SIGNALS ERROR", e);
    return json(req, { ok: false, error: "request_failed", detail: msg }, status);
  }
});
