// supabase/functions/debacu_eval_hotel_pricing_overrides_upsert/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/** ======================================================
 *  CORS (whitelist + preflight 204)
 *  ====================================================== */
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function corsHeaders(origin: string | null) {
  const o = origin ?? "";
  const allowOrigin = ALLOWED_ORIGINS.has(o) ? o : "https://debacu.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-debacu-eval-session-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}
function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

/** ======================================================
 *  ENV
 *  ====================================================== */
function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = mustEnv("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

/** ======================================================
 *  Types
 *  ====================================================== */
type UpsertBody = {
  // target (XOR)
  incident_type?: string | null;
  item_code?: string | null;

  // overrides
  unit_price_override?: number | null;
  gross_min_override?: number | null;
  gross_max_override?: number | null;
  recovery_pct_override?: number | null;

  notes?: string | null;
  is_active?: boolean | null;

  // optional (si lo prefieres en body en vez de header)
  session_token?: string | null;
};

type RequestContext = {
  auth_user_id: string;
  customer_id: string;
  is_admin: boolean;
};

/** ======================================================
 *  Helpers
 *  ====================================================== */
function clampText(v: unknown, max: number) {
  const s = String(v ?? "").trim();
  return s.length > max ? s.slice(0, max) : s;
}
function normCode(v: unknown, max: number) {
  return clampText(v, max).toUpperCase();
}
function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function toBoolOrNull(v: unknown): boolean | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return null;
}
function xor(a: unknown, b: unknown) {
  const aOk = a !== null && a !== undefined && String(a).trim() !== "";
  const bOk = b !== null && b !== undefined && String(b).trim() !== "";
  return (aOk && !bOk) || (!aOk && bOk);
}

async function readJsonSafe(req: Request) {
  const text = await req.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null, text };
  }
}

/**
 * Contexto seguridad:
 * - Verifica JWT (Authorization: Bearer ...)
 * - Verifica debacu session token (header x-debacu-eval-session-token o body.session_token)
 * - Resuelve customer_id + is_admin
 *
 * Nota: si no existe tu tabla de sesiones, ajusta el bloque "SESSION TABLE" a tu modelo real.
 */
async function getContext(req: Request, origin: string | null): Promise<RequestContext> {
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!jwt) throw new Error("No JWT (Authorization Bearer) supplied.");

  const tokenFromHeader = req.headers.get("x-debacu-eval-session-token")?.trim() || "";
  const { json: body } = await readJsonSafe(req.clone());
  const tokenFromBody = (body?.session_token ? String(body.session_token).trim() : "") || "";
  const sessionToken = tokenFromHeader || tokenFromBody;

  if (!sessionToken) throw new Error("No Debacu session_token supplied.");

  // client ANON para validar JWT
  const supaAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });

  const { data: userRes, error: userErr } = await supaAuth.auth.getUser();
  if (userErr || !userRes?.user) throw new Error("Invalid Supabase session (getUser failed).");

  const auth_user_id = userRes.user.id;

  // service role para leer tablas internas
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // === SESSION TABLE (ajusta nombres/columnas si difieren) =====================
  // Esperado: debacu_eval_sessions(session_token text pk, auth_user_id uuid, customer_id uuid, is_admin bool, expires_at timestamptz, revoked_at timestamptz)
  const { data: sess, error: sessErr } = await admin
    .from("debacu_eval_sessions")
    .select("session_token, auth_user_id, customer_id, is_admin, expires_at, revoked_at")
    .eq("session_token", sessionToken)
    .maybeSingle();

  if (sessErr) {
    // fallback a modelo alternativo si aún no tienes esa tabla
    // (por ejemplo customers.user_id)
    const { data: cust, error: custErr } = await admin
      .from("customers")
      .select("id, is_admin, user_id")
      .eq("user_id", auth_user_id)
      .maybeSingle();

    if (custErr || !cust?.id) throw new Error("No session mapping found (sessions/customers).");
    return { auth_user_id, customer_id: cust.id, is_admin: Boolean(cust.is_admin) };
  }

  if (!sess) throw new Error("Invalid debacu session_token.");
  if (String(sess.auth_user_id) !== auth_user_id) throw new Error("Session token not owned by this user.");
  if (sess.revoked_at) throw new Error("Session token revoked.");
  if (sess.expires_at && new Date(sess.expires_at).getTime() <= Date.now()) throw new Error("Session token expired.");
  if (!sess.customer_id) throw new Error("Session has no customer_id.");

  return { auth_user_id, customer_id: String(sess.customer_id), is_admin: Boolean(sess.is_admin) };
  // ============================================================================
}

/** ======================================================
 *  Main
 *  ====================================================== */
Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(origin, 405, { ok: false, error: "Method not allowed" });

  try {
    // OJO: getContext lee el body con clone(), luego aquí lo leemos de verdad
    const ctx = await getContext(req, origin);

    const { json: body, text } = await readJsonSafe(req);
    if (!body) return json(origin, 400, { ok: false, error: "Invalid JSON body", detail: text.slice(0, 200) });

    const b = body as UpsertBody;

    const incident_type = b.incident_type ? normCode(b.incident_type, 60) : null;
    const item_code = b.item_code ? normCode(b.item_code, 60) : null;

    // Validación XOR (una y solo una)
    if (!xor(incident_type, item_code)) {
      return json(origin, 400, {
        ok: false,
        error: "Invalid target: provide exactly one of incident_type or item_code (XOR).",
      });
    }

    // numeric validations (mínimo)
    const unit_price_override = toNumOrNull(b.unit_price_override);
    const gross_min_override = toNumOrNull(b.gross_min_override);
    const gross_max_override = toNumOrNull(b.gross_max_override);
    const recovery_pct_override = toNumOrNull(b.recovery_pct_override);

    if (unit_price_override !== null && unit_price_override < 0) {
      return json(origin, 400, { ok: false, error: "unit_price_override must be >= 0" });
    }
    if (gross_min_override !== null && gross_min_override < 0) {
      return json(origin, 400, { ok: false, error: "gross_min_override must be >= 0" });
    }
    if (gross_max_override !== null && gross_max_override < 0) {
      return json(origin, 400, { ok: false, error: "gross_max_override must be >= 0" });
    }
    if (gross_min_override !== null && gross_max_override !== null && gross_min_override > gross_max_override) {
      return json(origin, 400, { ok: false, error: "gross_min_override cannot be greater than gross_max_override" });
    }
    if (recovery_pct_override !== null && (recovery_pct_override < 0 || recovery_pct_override > 100)) {
      return json(origin, 400, { ok: false, error: "recovery_pct_override must be 0..100" });
    }

    const notes = b.notes !== undefined ? clampText(b.notes, 500) : null;
    const is_active = toBoolOrNull(b.is_active);
    const effectiveIsActive = is_active === null ? true : is_active;

    // Service role (pero con checks estrictos arriba)
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // Insert/Upsert: depende del target
    // REQUISITO: índices únicos parciales (customer_id, incident_type) WHERE item_code IS NULL
    //            y (customer_id, item_code) WHERE incident_type IS NULL
    const baseRow = {
      customer_id: ctx.customer_id,
      incident_type: incident_type,
      item_code: item_code,
      unit_price_override,
      gross_min_override,
      gross_max_override,
      recovery_pct_override,
      notes,
      is_active: effectiveIsActive,
      updated_at: new Date().toISOString(),
    } as const;

    // Nota: .upsert + onConflict funciona si existe un unique index compatible.
    // Para parciales, usamos onConflict distinto según caso.
    const onConflict = incident_type ? "customer_id,incident_type" : "customer_id,item_code";

    const { data, error } = await admin
      .from("debacu_hotel_incident_pricing")
      .upsert(baseRow as any, { onConflict })
      .select("*")
      .single();

    if (error) {
      // Errores típicos:
      // - foreign key incident_type/item_code no existe en catálogo
      // - violación de CHECK XOR (si no aplicaste el SQL)
      return json(origin, 400, { ok: false, error: error.message, detail: error.details ?? null });
    }

    return json(origin, 200, { ok: true, row: data });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "Unknown error");
    // No filtramos detalles internos aquí
    return json(origin, 401, { ok: false, error: msg });
  }
});
