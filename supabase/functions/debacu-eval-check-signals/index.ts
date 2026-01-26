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
    case "0": return 0;
    case "1-2": return 1;
    case "3-5": return 3;
    case "6-10": return 6;
    case "10+": return 10;
    default: return 0;
  }
}

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-session-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(resBody: unknown, status = 200) {
  return new Response(JSON.stringify(resBody), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// --------------------
// Normalizadores
// --------------------
function normalizeEmail(s: string) {
  return s.trim().toLowerCase();
}
function normalizeDoc(s: string) {
  return s.trim().toUpperCase().replace(/[\s-]/g, "");
}
function normalizePhone(s: string) {
  const digits = s.replace(/\D/g, "");
  const variants = new Set<string>();
  if (digits) {
    variants.add(digits);
    if (digits.length === 9) variants.add("34" + digits);
    if (digits.startsWith("34") && digits.length === 11) variants.add(digits.slice(2));
  }
  return { digits, variants: Array.from(variants) };
}
function detectKind(q: string): "email" | "phone" | "doc" | "unknown" {
  const v = q.trim();
  if (v.includes("@")) return "email";
  const digits = v.replace(/\D/g, "");
  if (digits.length >= 7 && digits.length >= v.replace(/\s/g, "").length * 0.7) return "phone";
  if (/[A-Za-z]/.test(v) && /\d/.test(v)) return "doc";
  return "unknown";
}

function maskForAudit(kind: string, raw: string) {
  const v = raw.trim();
  if (!v) return "—";
  if (kind === "email") {
    const [a, b] = v.split("@");
    const left = (a ?? "").slice(0, 2);
    return `${left}•••@•••`;
  }
  if (kind === "phone") {
    const digits = v.replace(/\D/g, "");
    return digits.slice(0, 2) + "•••";
  }
  if (kind === "doc") {
    return v.slice(0, 2) + "•••";
  }
  return v.slice(0, 2) + "•••";
}

serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!SUPABASE_URL || !SERVICE_ROLE) return json({ error: "Missing server configuration" }, 500);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    const sessionToken = req.headers.get("x-session-token") || "";
    if (!sessionToken) return json({ error: "Missing x-session-token" }, 401);

    const body = await req.json().catch(() => ({}));
    const q_raw = String(body?.q_input ?? body?.query ?? "").trim();
    const months = Number(body?.months ?? 24);
    const k = Number(body?.k ?? 3);

    if (!q_raw) {
      return json({
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

    // 1) Validar sesión
    const { data: session, error: sessErr } = await supabase
      .from("debacu_eval_sessions")
      .select("customer_id,expires_at,revoked_at")
      .eq("token", sessionToken)
      .maybeSingle();

    if (sessErr || !session) return json({ error: "Invalid session" }, 401);
    if (session.revoked_at) return json({ error: "Session revoked" }, 401);
    if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
      return json({ error: "Session expired" }, 401);
    }

    // 2) Normalizar input (para aumentar match)
    const kind = detectKind(q_raw);

    let q_input = q_raw;
    if (kind === "email") q_input = normalizeEmail(q_raw);
    if (kind === "doc") q_input = normalizeDoc(q_raw);
    if (kind === "phone") {
      // Enviamos el dígito principal, pero dejamos la info de variantes en meta para depurar.
      const ph = normalizePhone(q_raw);
      q_input = ph.digits; // (ideal: la RPC debería admitir variantes)
    }

    // 3) RPC agregada
    const { data, error } = await supabase.rpc("debacu_eval_check_signals", {
      q_input,
      months,
      k,
    });

    if (error) return json({ error: "RPC failed", detail: error.message }, 500);

    const row = Array.isArray(data) ? data[0] : data;

    const countBucket: CountBucket = (() => {
      const raw = String(row?.count_bucket ?? "").trim();
      if (raw === "0" || raw === "1-2" || raw === "3-5" || raw === "6-10" || raw === "10+") return raw;
      const c = Number(row?.count_exact ?? row?.count ?? row?.total ?? 0);
      return bucketizeCount(c);
    })();

    const countExact = Number(row?.count_exact ?? row?.count ?? row?.total ?? 0) || 0;

    const hasMatches = Boolean(
      row?.has_matches ?? ((countBucket !== "0") || (countExact > 0)),
    );

    const avgStars =
      row?.avg_stars === null || row?.avg_stars === undefined
        ? null
        : Math.max(0, Math.min(5, Number(row.avg_stars)));

    const riskUp = String(row?.risk ?? "NO_CONCLUYENTE").toUpperCase();
    const risk: Risk =
      (riskUp === "BAJO" || riskUp === "MEDIO" || riskUp === "ALTO")
        ? (riskUp as Risk)
        : "NO_CONCLUYENTE";

    const resultCountForAudit = bucketToMinCount(countBucket);

    // 4) Audit log (best-effort)
    try {
      await supabase.from("debacu_eval_audit_log").insert({
        action: "CHECK_SIGNALS",
        event_type: "CHECK_SIGNALS",
        entity: "EVALUATION_SEARCH",
        entity_id: null,

        customer_id: session.customer_id,
        app_id: "DEBACU_EVAL",

        search_kind: row?.match_strength ?? kind ?? null,
        search_value_masked: maskForAudit(kind, q_raw),
        search_value_hash: null,

        // ⚠️ si quieres privacidad: usa resultCountForAudit
        result_count: resultCountForAudit,

        meta: {
          has_matches: hasMatches,
          count_exact: countExact,
          count_bucket: countBucket,
          avg_stars: avgStars,
          risk,
          match_strength: row?.match_strength ?? null,
          window: row?.time_window ?? `${months}M`,
          input_kind: kind,
          input_raw_masked: maskForAudit(kind, q_raw),
          input_norm_used: q_input,
          // si es phone, dejamos variantes para depurar (SIN PII exacta si te preocupa; aquí va “digits”, ya es PII)
          // quítalo si no quieres:
          // phone_variants: kind === "phone" ? normalizePhone(q_raw).variants : undefined,
        },

        created_at: new Date().toISOString(),
      });
    } catch {
      // ignore
    }

    // 5) Respuesta al front
    return json({
      matchStrength: (row?.match_strength ?? "MEDIUM") as MatchStrength,
      hasMatches,
      countExact,
      countBucket,
      avgStars,
      risk,
      topTypologies: Array.isArray(row?.top_typologies) ? row.top_typologies : [],
      timeWindow: String(row?.time_window ?? `${months}M`),
      message: String(row?.message ?? ""),
    });
  } catch (e) {
    return json({ error: "Unexpected error", detail: String((e as any)?.message ?? e) }, 500);
  }
});
