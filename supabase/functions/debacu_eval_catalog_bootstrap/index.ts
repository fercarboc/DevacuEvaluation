import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

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
    Vary: "Origin",
    // ✅ JWT-only: quitado x-session-token
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

const DEFAULT_APP_ID = "DEBACU_EVAL";

function getBearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? "";
}

/**
 * JWT-only:
 * - valida JWT con auth.getUser(jwt)
 * - resuelve org/customer desde debacu_eval_org_members (auth_user_id)
 *   (esto fuerza que el usuario pertenezca a una org activa)
 */
async function requireJwtOrg(
  supabase: ReturnType<typeof createClient>,
  jwt: string,
  appId: string
) {
  const { data: u, error: uErr } = await supabase.auth.getUser(jwt);
  if (uErr || !u?.user) throw new Error("Invalid Supabase JWT");

  const userId = u.user.id;

  // Ajusta este lookup si tus columnas difieren:
  const { data: mem, error: mErr } = await supabase
    .from("debacu_eval_org_members")
    .select("org_id, status, app_code, role")
    .eq("auth_user_id", userId)
    .eq("status", "ACTIVE")
    .eq("app_code", appId)
    .maybeSingle();

  if (mErr) throw new Error(mErr.message);
  if (!mem?.org_id) throw new Error("User has no ACTIVE org membership");

  return { userId, customerId: String(mem.org_id), role: String(mem.role ?? "STAFF") };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") return json(origin, 405, { ok: false, error: "Method not allowed" });

  try {
    const jwt = getBearer(req);
    if (!jwt) return json(origin, 401, { ok: false, error: "Missing Authorization Bearer token" });

    const body = await req.json().catch(() => ({}));
    const appId = body?.appId ? String(body.appId) : DEFAULT_APP_ID;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${SERVICE_ROLE}` } },
    });

    // ✅ obliga a que el usuario sea válido y pertenezca a una org activa
    // (aunque para seed global realmente no hace falta customerId)
    await requireJwtOrg(supabase, jwt, appId);

    // 1) Incidents: si está vacío, sembramos base
    const { count: incCount, error: e0 } = await supabase
      .from("debacu_incident_catalog")
      .select("incident_type", { count: "exact", head: true });

    if (e0) return json(origin, 500, { ok: false, error: e0.message });

    let seededIncidents = 0;
    if ((incCount ?? 0) === 0) {
      const seedInc = [
        {
          incident_type: "MISSING_ITEMS",
          title: "Missing items",
          description: "Objetos faltantes (toallas, albornoces, etc.)",
          severity: 3,
          default_gross_min: null,
          default_gross_max: null,
          default_recovery_pct: null,
          suggested_actions: "Revisar habitación y registrar item faltante",
          is_active: true,
        },
        {
          incident_type: "PROPERTY_DAMAGE",
          title: "Daños materiales",
          description: "Daños en habitación o zonas comunes",
          severity: 4,
          default_gross_min: 50,
          default_gross_max: 500,
          default_recovery_pct: null,
          suggested_actions: "Fotos + parte interno + comunicación a cliente",
          is_active: true,
        },
        {
          incident_type: "PAYMENT_ISSUE",
          title: "Problema de pago",
          description: "Impago, tarjeta rechazada, disputa",
          severity: 4,
          default_gross_min: null,
          default_gross_max: null,
          default_recovery_pct: 100,
          suggested_actions: "Intentar cobro / contactar / registrar disputa",
          is_active: true,
        },
        {
          incident_type: "NO_SHOW",
          title: "No show",
          description: "No presentación",
          severity: 3,
          default_gross_min: null,
          default_gross_max: null,
          default_recovery_pct: 100,
          suggested_actions: "Aplicar política no-show y registrar",
          is_active: true,
        },
      ];

      const { error: eIns } = await supabase.from("debacu_incident_catalog").insert(seedInc);
      if (eIns) return json(origin, 500, { ok: false, error: eIns.message });
      seededIncidents = seedInc.length;
    }

    // 2) Items globales: si está vacío, sembramos unos básicos
    const { count: itemCount, error: e1 } = await supabase
      .from("debacu_item_catalog")
      .select("item_code", { count: "exact", head: true });

    if (e1) return json(origin, 500, { ok: false, error: e1.message });

    let seededItems = 0;
    if ((itemCount ?? 0) === 0) {
      const seedItems = [
        {
          item_code: "TOWEL",
          title: "Toalla",
          category: "Linen",
          unit_price: 12,
          currency: "EUR",
          description: null,
          is_active: true,
        },
        {
          item_code: "BATHROBE",
          title: "Albornoz",
          category: "Linen",
          unit_price: 35,
          currency: "EUR",
          description: null,
          is_active: true,
        },
        {
          item_code: "PILLOW",
          title: "Almohada",
          category: "Room",
          unit_price: 20,
          currency: "EUR",
          description: null,
          is_active: true,
        },
      ];

      const { error: eIns2 } = await supabase.from("debacu_item_catalog").insert(seedItems);
      if (eIns2) return json(origin, 500, { ok: false, error: eIns2.message });
      seededItems = seedItems.length;
    }

    return json(origin, 200, { ok: true, seededIncidents, seededItems });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const isClient =
      msg.includes("Missing") ||
      msg.includes("Invalid") ||
      msg.includes("membership") ||
      msg.includes("org");

    return json(origin, isClient ? 400 : 500, { ok: false, error: msg });
  }
});
