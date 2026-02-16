import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

function json(req: Request, status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: { message: "Method not allowed" } });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) return json(req, 401, { ok: false, error: { message: "Missing bearer token" } });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // valida token supabase y obtiene user
  const { data: userRes, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userRes?.user) {
    return json(req, 401, { ok: false, error: { message: "Invalid token" } });
  }

  const email = (userRes.user.email ?? "").toLowerCase();

  // TODO: aquí tu lógica real:
  // - localizar org/hotel por email
  // - comprobar suscripción
  // - roles, etc.

  // EJEMPLO PAYWALL:
  // if (no_sub) return json(req, 200, { ok:false, error:{code:"NO_SUBSCRIPTION"} });

  // session_token (si lo sigues usando)
  const session_token = crypto.randomUUID();

  const user = {
    email,
    // ... lo que tu app necesite
    isAdmin: email === "admin@debacu.com",
  };

  return json(req, 200, { ok: true, session_token, user });
});
