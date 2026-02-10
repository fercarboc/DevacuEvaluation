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

  if (customerIdFromBody && String(customerIdFromBody) !== tokenCustomerId) {
    throw new Error("customerId mismatch vs session token");
  }

  return { customerId: tokenCustomerId };
}

type GlobalItem = {
  item_code: string;
  title: string | null;
  category: string | null;
  unit_price: number | null;
  currency: string | null;
  description: string | null;
  is_active: boolean;
  updated_at: string | null;
};

type HotelItem = {
  item_code: string;
  title: string | null;
  category: string | null;
  unit_price: number | null;
  currency: string | null;
  description: string | null;
  is_active: boolean | null; // por si tu tabla permite null
  updated_at: string | null;
};

function normCode(x: unknown) {
  return String(x ?? "").trim().toUpperCase();
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

    // Body opcional
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
    });

    const { customerId } = await assertEvalSession(
      supabase,
      sessionToken,
      body?.customerId ?? null,
    );

    // 1) Global activos
    const { data: globalItems, error: e1 } = await supabase
      .from("debacu_item_catalog")
      .select("item_code,title,category,unit_price,currency,description,is_active,updated_at")
      .eq("is_active", true);

    if (e1) return json(origin, 500, { ok: false, error: e1.message });

    // 2) Hotel items (NO filtrar is_active, porque si el hotel lo pone false
    // necesitamos leerlo para desactivar un item global)
    const { data: hotelItems, error: e2 } = await supabase
      .from("debacu_hotel_item_catalog")
      .select("item_code,title,category,unit_price,currency,description,is_active,updated_at")
      .eq("customer_id", customerId);

    if (e2) return json(origin, 500, { ok: false, error: e2.message });

    const globals = (globalItems ?? []) as any as GlobalItem[];
    const hotels = (hotelItems ?? []) as any as HotelItem[];

    const gMap = new Map<string, GlobalItem>();
    for (const g of globals) {
      const code = normCode(g.item_code);
      if (!code) continue;
      gMap.set(code, { ...g, item_code: code });
    }

    const hMap = new Map<string, HotelItem>();
    for (const h of hotels) {
      const code = normCode(h.item_code);
      if (!code) continue;
      hMap.set(code, { ...h, item_code: code });
    }

    // 3) Merge effective
    const out: any[] = [];

    // a) todo lo global (aplicando override si existe)
    for (const [code, g] of gMap.entries()) {
      const h = hMap.get(code) ?? null;

      const effectiveActive = h ? (h.is_active ?? true) : true;
      if (!effectiveActive) continue;

      out.push({
        item_code: code,
        title: h?.title ?? g.title,
        category: h?.category ?? g.category,
        unit_price: h?.unit_price ?? g.unit_price,
        currency: h?.currency ?? g.currency,
        description: h?.description ?? g.description,
        is_active: true,
        source: h ? "OVERRIDE" : "GLOBAL",
      });
    }

    // b) custom (hotel items que no existen en global)
    for (const [code, h] of hMap.entries()) {
      if (gMap.has(code)) continue;

      const active = h.is_active ?? true;
      if (!active) continue;

      out.push({
        item_code: code,
        title: h.title ?? code,
        category: h.category ?? "CUSTOM",
        unit_price: h.unit_price ?? null,
        currency: h.currency ?? "EUR",
        description: h.description ?? null,
        is_active: true,
        source: "CUSTOM",
      });
    }

    // 4) Orden estable (técnico) -> UI ya ordenará si quiere por title
    out.sort((a, b) => String(a.item_code).localeCompare(String(b.item_code)));

    return json(origin, 200, { ok: true, customerId, items: out });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    const isAuthOrClient =
      msg.includes("Missing") ||
      msg.includes("Invalid session") ||
      msg.includes("Session revoked") ||
      msg.includes("Session expired") ||
      msg.includes("mismatch");

    return json(origin, isAuthOrClient ? 400 : 500, { ok: false, error: msg });
  }
});
