// supabase/functions/debacu-eval-check-signals/index.ts
import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Risk = "BAJO" | "MEDIO" | "ALTO" | "NO_CONCLUYENTE";
type MatchStrength = "STRONG" | "MEDIUM" | "WEAK";
type CountBucket = "0" | "1-2" | "3-5" | "6-10" | "10+";

function bucketizeCount(n: number): CountBucket {
  if (!n || n <= 0) return "0";
  if (n <= 2) return "1-2";
  if (n <= 5) return "3-5";
  if (n <= 10) return "6-10";
  return "10+";
}

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

// CORS allowlist (mejor que "*")
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
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-session-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

// --------------------
// Normalizadores
// --------------------
function normalizeEmail(s: string) {
  return s.trim().toLowerCase();
}

/**
 * Normaliza documentos (DNI/NIE/PASAPORTE genérico) quitando espacios/guiones
 * y pasando a mayúsculas.
 */
function normalizeDoc(s: string) {
  return s.trim().toUpperCase().replace(/[\s-]/g, "");
}

/**
 * Variantes de teléfono: solo dígitos.
 * - Si 9 dígitos: añade prefijo 34
 * - Si empieza por 34 y 11 dígitos: añade variante sin 34
 */
function normalizePhoneVariants(s: string) {
  const digits = s.replace(/\D/g, "");
  const variants = new Set<string>();
  if (digits) {
    variants.add(digits);
    if (digits.length === 9) variants.add("34" + digits);
    if (digits.startsWith("34") && digits.length === 11) variants.add(digits.slice(2));
  }
  return Array.from(variants);
}

/**
 * Heurística robusta:
 * 1) email
 * 2) doc (DNI/NIE/patrón doc mixto con letra+digitos)  <-- CLAVE: antes que phone
 * 3) phone (solo si parece realmente teléfono)
 */
function detectKind(q: string): "email" | "phone" | "doc" | "unknown" {
  const v = q.trim();
  if (!v) return "unknown";

  // email
  if (v.includes("@")) return "email";

  const compact = v.replace(/\s+/g, "");
  const doc = normalizeDoc(compact);

  // DNI: 8 dígitos + letra
  if (/^\d{8}[A-Z]$/.test(doc)) return "doc";

  // NIE: X/Y/Z + 7 dígitos + letra
  if (/^[XYZ]\d{7}[A-Z]$/.test(doc)) return "doc";

  // Pasaporte / doc genérico: mezcla letras+digitos y longitud razonable
  // (evita clasificar cosas raras muy cortas)
  if (/[A-Z]/.test(doc) && /\d/.test(doc) && doc.length >= 7 && doc.length <= 20) return "doc";

  // phone: exige que sea casi todo dígitos (o con +) y longitud típica
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

  // si parece documento DNI/NIE, no es nombre
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

// riesgo simple (sin tipologías)
function computeRisk(countExact: number, avgStars: number | null): Risk {
  if (!countExact || countExact <= 0) return "NO_CONCLUYENTE";
  if (avgStars == null) return "NO_CONCLUYENTE";

  if (countExact >= 3 && avgStars <= 2.2) return "ALTO";
  if (countExact >= 2 && avgStars <= 3.0) return "MEDIO";
  if (avgStars >= 4.0) return "BAJO";
  return "MEDIO";
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
    if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return json(req, { error: "Missing server configuration" }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    const sessionToken = req.headers.get("x-session-token") || "";
    if (!sessionToken) return json(req, { error: "Missing x-session-token" }, 401);

    const body = await req.json().catch(() => ({}));
    const q_raw = String(body?.q_input ?? body?.query ?? body?.q_raw ?? "").trim();
    const months = Number(body?.months ?? 24);
    const k = Number(body?.k ?? 3);
    const maxRatingsForAvg = Number(body?.max_avg_samples ?? 500);

    if (!q_raw) {
      return json(req, {
        matchStrength: "MEDIUM" as MatchStrength,
        hasMatches: false,
        countExact: 0,
        countBucket: "0" as CountBucket,
        risk: "NO_CONCLUYENTE" as Risk,
        timeWindow: `${months}M`,
        topTypologies: [],
        avgStars: null,
        message: "Introduce un criterio válido.",
      });
    }

    // 1) validar sesión Debacu propia
    const { data: session, error: sessErr } = await supabase
      .from("debacu_eval_sessions")
      .select("customer_id,expires_at,revoked_at")
      .eq("token", sessionToken)
      .maybeSingle();

    if (sessErr || !session) return json(req, { error: "Invalid session" }, 401);
    if (session.revoked_at) return json(req, { error: "Session revoked" }, 401);
    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
      return json(req, { error: "Session expired" }, 401);
    }

    const strength = classifyStrength(q_raw);

    // si es nombre/apellidos solo -> NO_CONCLUYENTE
    if (strength === "WEAK") {
      try {
        await supabase.from("debacu_eval_audit_log").insert({
          action: "CHECK_SIGNALS",
          event_type: "CHECK_SIGNALS",
          entity: "EVALUATION_SEARCH",
          entity_id: null,
          customer_id: session.customer_id,
          app_id: "DEBACU_EVAL",
          search_kind: "WEAK",
          search_value_masked: maskForAudit("unknown", q_raw),
          search_value_hash: null,
          result_count: 0,
          meta: { message: "WEAK_NAME_ONLY" },
          created_at: new Date().toISOString(),
        });
      } catch {
        // ignore
      }

      return json(req, {
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
      });
    }

    // 2) normalizar + construir filtro
    const kind = detectKind(q_raw);

    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - Math.max(1, Math.min(60, months)));
    const cutoffISO = cutoff.toISOString();

    const base = supabase
      .from("debacu_evaluations")
      .select("id", { count: "exact", head: true })
      .gte("created_at", cutoffISO);

    let countExact = 0;

    if (kind === "email") {
      const q = normalizeEmail(q_raw);
      const { count, error } = await base.eq("email", q);
      if (error) return json(req, { error: "Query failed", detail: error.message }, 500);
      countExact = Number(count ?? 0);
    } else if (kind === "doc") {
      const q = normalizeDoc(q_raw);
      const { count, error } = await base.eq("document", q);
      if (error) return json(req, { error: "Query failed", detail: error.message }, 500);
      countExact = Number(count ?? 0);
    } else if (kind === "phone") {
      const vars = normalizePhoneVariants(q_raw);
      if (!vars.length) {
        countExact = 0;
      } else {
        const { count, error } = await base.in("phone", vars);
        if (error) return json(req, { error: "Query failed", detail: error.message }, 500);
        countExact = Number(count ?? 0);
      }
    } else {
      countExact = 0;
    }

    const countBucket = bucketizeCount(countExact);
    const hasMatches = countExact > 0;

    // 3) avgStars (sin RPC): sample limitado
    let avgStars: number | null = null;
    if (hasMatches) {
      let rows: Array<{ rating: unknown }> = [];

      const lim = Math.max(50, Math.min(2000, maxRatingsForAvg));

      if (kind === "email") {
        const q = normalizeEmail(q_raw);
        const { data, error } = await supabase
          .from("debacu_evaluations")
          .select("rating")
          .eq("email", q)
          .gte("created_at", cutoffISO)
          .limit(lim);
        if (!error && Array.isArray(data)) rows = data as any;
      } else if (kind === "doc") {
        const q = normalizeDoc(q_raw);
        const { data, error } = await supabase
          .from("debacu_evaluations")
          .select("rating")
          .eq("document", q)
          .gte("created_at", cutoffISO)
          .limit(lim);
        if (!error && Array.isArray(data)) rows = data as any;
      } else if (kind === "phone") {
        const vars = normalizePhoneVariants(q_raw);
        if (vars.length) {
          const { data, error } = await supabase
            .from("debacu_evaluations")
            .select("rating")
            .in("phone", vars)
            .gte("created_at", cutoffISO)
            .limit(lim);
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

    // 4) Audit log best-effort
    const resultCountForAudit = bucketToMinCount(countBucket);
    try {
      await supabase.from("debacu_eval_audit_log").insert({
        action: "CHECK_SIGNALS",
        event_type: "CHECK_SIGNALS",
        entity: "EVALUATION_SEARCH",
        entity_id: null,
        customer_id: session.customer_id,
        app_id: "DEBACU_EVAL",

        search_kind: kind,
        search_value_masked: maskForAudit(kind, q_raw),
        search_value_hash: null,

        result_count: resultCountForAudit,
        meta: {
          has_matches: hasMatches,
          count_exact: countExact,
          count_bucket: countBucket,
          avg_stars: avgStars,
          risk,
          match_strength: strength,
          window: `${months}M`,
        },
        created_at: new Date().toISOString(),
      });
    } catch {
      // ignore
    }

    // 5) Respuesta
    return json(req, {
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
    });
  } catch (e) {
    return json(req, { error: "Unexpected error", detail: String((e as any)?.message ?? e) }, 500);
  }
});
