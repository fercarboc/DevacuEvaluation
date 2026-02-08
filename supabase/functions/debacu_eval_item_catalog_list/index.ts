// supabase/functions/debacu_eval_item_catalog_list/index.ts
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
  customerIdFromBody?: string | null,
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

  // Si el cliente manda customerId, lo validamos contra el token
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

  if (req.method !== "POST") {
    return json(origin, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const sessionToken = req.headers.get("x-session-token") || "";
    if (!sessionToken) {
      return json(origin, 401, { ok: false, error: "Missing x-session-token" });
    }

    // Body opcional: puede venir vacío o incluso no ser JSON.
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    // customerId real SIEMPRE viene del token (y si body lo trae, se valida)
    const { customerId } = await assertEvalSession(
      supabase,
      sessionToken,
      body?.customerId ?? null,
    );

    // Global
    const { data: globalItems, error: e1 } = await supabase
      .from("debacu_item_catalog")
      .select(
        "item_code,title,category,unit_price,currency,description,is_active,updated_at",
      )
      .eq("is_active", true)
      .order("title", { ascending: true });

    if (e1) return json(origin, 500, { ok: false, error: e1.message });

    // Hotel (si tienes is_active ahí, puedes filtrar también; lo dejo como lo tenías)
    const { data: hotelItems, error: e2 } = await supabase
      .from("debacu_hotel_item_catalog")
      .select(
        "item_code,title,category,unit_price,currency,description,is_active,updated_at",
      )
      .eq("customer_id", customerId)
      .order("title", { ascending: true });

    if (e2) return json(origin, 500, { ok: false, error: e2.message });

    // Merge: si el hotel define mismo item_code, gana hotel
    const map = new Map<string, any>();
    for (const it of globalItems ?? []) {
      map.set(it.item_code, { ...it, scope: "GLOBAL" });
    }
    for (const it of hotelItems ?? []) {
      map.set(it.item_code, { ...it, scope: "HOTEL" });
    }

    const items = Array.from(map.values()).sort((a, b) =>
      String(a.title).localeCompare(String(b.title))
    );

    return json(origin, 200, { ok: true, customerId, items });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    // Clasificación simple de errores "esperables" (cliente/auth) vs server
    const isAuthOrClient =
      msg.includes("Missing") ||
      msg.includes("Invalid session") ||
      msg.includes("Session revoked") ||
      msg.includes("Session expired") ||
      msg.includes("mismatch");

    return json(origin, isAuthOrClient ? 400 : 500, { ok: false, error: msg });
  }
});
