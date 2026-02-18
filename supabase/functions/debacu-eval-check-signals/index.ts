// supabase/functions/debacu-eval-check-signals/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

/* ======================================================
 * Types
 * ====================================================== */
type Risk = "BAJO" | "MEDIO" | "ALTO" | "NO_CONCLUYENTE";
type MatchStrength = "STRONG" | "MEDIUM" | "WEAK";
type CountBucket = "0" | "1-2" | "3-5" | "6-10" | "10+";
type Scope = "GLOBAL" | "MY"; // GLOBAL = sin filtro customer_id, MY = filtro customer_id

const APP_ID = "DEBACU_EVAL";

/* ======================================================
 * Env + clients
 * ====================================================== */
function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const ANON_KEY = mustEnv("SUPABASE_ANON_KEY");

function supabaseServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function supabaseAnonClientNoAuth() {
  // para resetPasswordForEmail / otros flujos anon si hiciera falta (aquí no se usa)
  return createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/* ======================================================
 * Utils
 * ====================================================== */
function errResp(req: Request, status: number, detail: string) {
  return json(req, status, { ok: false, error: "request_failed", detail });
}

async function readJson(req: Request) {
  try {
    const t = await req.text();
    if (!t) return {};
    return JSON.parse(t);
  } catch {
    return {};
  }
}

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

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
 * Multi-org resolution (org_id optional)
 * - Si viene org_id: validar membership ACTIVE en ese org
 * - Si no viene: fallback determinista a primera membership ACTIVE
 * - Resuelve customer_id asociado al org
 * ====================================================== */
async function resolveOrgAndCustomerId(sbAdmin: ReturnType<typeof supabaseServiceClient>, userId: string, orgId?: string) {
  const org_id_in = safeStr(orgId);

  if (org_id_in) {
    const { data: mem, error } = await sbAdmin
      .from("debacu_eval_org_members")
      .select("org_id, role, status, created_at")
      .eq("user_id", userId)
      .eq("org_id", org_id_in)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (error) throw new Error("membership_check_failed");
    if (!mem?.org_id) throw new Error("FORBIDDEN");
    const customer_id = await resolveCustomerIdForOrg(sbAdmin, String(mem.org_id));
    return { org_id: String(mem.org_id), role: mem.role ?? null, customer_id };
  }

  // fallback determinista: primera ACTIVE por created_at asc
  const { data: mem, error } = await sbAdmin
    .from("debacu_eval_org_members")
    .select("org_id, role, status, created_at")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("membership_lookup_failed");
  if (!mem?.org_id) throw new Error("FORBIDDEN");

  const customer_id = await resolveCustomerIdForOrg(sbAdmin, String(mem.org_id));
  return { org_id: String(mem.org_id), role: mem.role ?? null, customer_id };
}

async function resolveCustomerIdForOrg(sbAdmin: ReturnType<typeof supabaseServiceClient>, org_id: string): Promise<string> {
  // 1) preferir view entitlements si existe
  try {
    const { data: ent, error: entErr } = await sbAdmin
      .from("debacu_eval_org_entitlements_v")
      .select("customer_id")
      .eq("org_id", org_id)
      .maybeSingle();

    if (!entErr && ent?.customer_id) return String(ent.customer_id);
  } catch {
    // ignore (view puede no existir en algún entorno)
  }

  // 2) fallback organizations
  const { data: org, error: orgErr } = await sbAdmin
    .from("debacu_eval_organizations")
    .select("customer_id")
    .eq("id", org_id)
    .maybeSingle();

  if (orgErr) throw new Error("org_lookup_failed");
  if (!org?.customer_id) throw new Error("FORBIDDEN");
  return String(org.customer_id);
}

/* ======================================================
 * Query builders
 * ====================================================== */
function makeBaseCount(sbAdmin: ReturnType<typeof supabaseServiceClient>, scope: Scope, customerId: string, cutoffISO: string) {
  let q = sbAdmin
    .from("debacu_evaluations")
    .select("id", { count: "exact", head: true })
    .gte("created_at", cutoffISO);

  if (scope === "MY") q = q.eq("customer_id", customerId);
  return q;
}

function makeBaseRatings(
  sbAdmin: ReturnType<typeof supabaseServiceClient>,
  scope: Scope,
  customerId: string,
  cutoffISO: string,
  lim: number,
) {
  let q = sbAdmin
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
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return errResp(req, 405, "method_not_allowed");

  try {
    // 1) JWT obligatorio
    const user = await requireUser(req);

    const sbAdmin = supabaseServiceClient();
    const body = await readJson(req);

    // multi-org: UI debería mandar org_id siempre
    const org_id = safeStr(body?.org_id ?? body?.orgId ?? "");
    const { customer_id: customerId } = await resolveOrgAndCustomerId(sbAdmin, user.id, org_id || undefined);

    const q_raw = String(body?.q_input ?? body?.query ?? body?.q_raw ?? "").trim();
    const scope = parseScope(body?.scope); // "GLOBAL" | "MY"

    // ventana: por defecto 24M, permitido 1..60
    const months = clampInt(body?.months, 1, 60, 24);
    const k = clampInt(body?.k, 1, 20, 3);
    const maxRatingsForAvg = clampInt(body?.max_avg_samples, 50, 2000, 500);

    if (!q_raw) {
      return json(req, 200, {
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

      // best-effort (sin reventar la respuesta si falla)
      await sbAdmin.from("debacu_eval_audit_log").insert(auditPayload);

      return json(req, 200, {
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

    const baseCount = makeBaseCount(sbAdmin, scope, String(customerId), cutoffISO);
    const baseRatings = makeBaseRatings(sbAdmin, scope, String(customerId), cutoffISO, maxRatingsForAvg);

    let countExact = 0;

    // 3) Count
    if (kind === "email") {
      const q = normalizeEmail(q_raw);
      const { count, error } = await baseCount.eq("email", q);
      if (error) return errResp(req, 500, "query_failed");
      countExact = Number(count ?? 0);
    } else if (kind === "doc") {
      const q = normalizeDoc(q_raw);
      const { count, error } = await baseCount.eq("document", q);
      if (error) return errResp(req, 500, "query_failed");
      countExact = Number(count ?? 0);
    } else if (kind === "phone") {
      const vars = normalizePhoneVariants(q_raw);
      if (!vars.length) {
        countExact = 0;
      } else {
        const { count, error } = await baseCount.in("phone", vars);
        if (error) return errResp(req, 500, "query_failed");
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

    // 5) Audit log (best-effort, RGPD: usa bucket mínimo)
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
        count_bucket: countBucket,
        avg_stars: avgStars,
        risk,
        match_strength: strength,
        window: `${months}M`,
      },
    };

    await sbAdmin.from("debacu_eval_audit_log").insert(auditPayload);

    // 6) Response
    return json(req, 200, {
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

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") return errResp(req, 401, "UNAUTHORIZED");
    if (msg === "FORBIDDEN") return errResp(req, 403, "FORBIDDEN");
    if (msg.startsWith("missing_") || msg.startsWith("invalid_")) return errResp(req, 400, msg);

    // no filtrar detalle interno
    return errResp(req, 500, "internal_error");
  }
});
