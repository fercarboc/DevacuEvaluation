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
    "Vary": "Origin",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-session-token",
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

async function assertEvalSession(
  supabase: ReturnType<typeof createClient>,
  sessionToken: string,
  customerIdFromBody?: string | null
) {
  const { data, error } = await supabase
    .from("debacu_eval_sessions")
    .select("customer_id, expires_at, revoked_at")
    .eq("token", sessionToken)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("Invalid session token");
  if (data.revoked_at) throw new Error("Session revoked");
  if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
    throw new Error("Session expired");
  }

  const tokenCustomerId = String(data.customer_id);
  if (customerIdFromBody && String(customerIdFromBody) !== tokenCustomerId) {
    throw new Error("customerId mismatch vs session token");
  }

  return { customerId: tokenCustomerId };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") return json(origin, 405, { error: "Method not allowed" });

  try {
    const sessionToken = req.headers.get("x-session-token") || "";
    if (!sessionToken) return json(origin, 401, { error: "Missing x-session-token" });

    const body = await req.json().catch(() => ({}));
    const customerId = body?.customerId ? String(body.customerId) : null;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    await assertEvalSession(supabase, sessionToken, customerId);

    // 1) Incidents: si está vacío, sembramos base
    const { count: incCount, error: e0 } = await supabase
      .from("debacu_incident_catalog")
      .select("incident_type", { count: "exact", head: true });

    if (e0) return json(origin, 500, { error: e0.message });

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
      if (eIns) return json(origin, 500, { error: eIns.message });
      seededIncidents = seedInc.length;
    }

    // 2) Items globales: si está vacío, sembramos unos básicos
    const { count: itemCount, error: e1 } = await supabase
      .from("debacu_item_catalog")
      .select("item_code", { count: "exact", head: true });

    if (e1) return json(origin, 500, { error: e1.message });

    let seededItems = 0;
    if ((itemCount ?? 0) === 0) {
      const seedItems = [
        { item_code: "TOWEL", title: "Toalla", category: "Linen", unit_price: 12, currency: "EUR", description: null, is_active: true },
        { item_code: "BATHROBE", title: "Albornoz", category: "Linen", unit_price: 35, currency: "EUR", description: null, is_active: true },
        { item_code: "PILLOW", title: "Almohada", category: "Room", unit_price: 20, currency: "EUR", description: null, is_active: true },
      ];

      const { error: eIns2 } = await supabase.from("debacu_item_catalog").insert(seedItems);
      if (eIns2) return json(origin, 500, { error: eIns2.message });
      seededItems = seedItems.length;
    }

    return json(origin, 200, { ok: true, seededIncidents, seededItems });
  } catch (e: any) {
    return json(origin, 500, { error: String(e?.message ?? e) });
  }
});
