import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

/* ENV */
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

type Body = {
  usernameOrEmail: string;
  appCode?: string; // "DEBACU_EVAL"
};

function norm(s: string) {
  return (s ?? "").trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });

  try {
    const body = (await req.json()) as Body;
    const usernameOrEmail = norm(body.usernameOrEmail);
    const appCode = norm(body.appCode ?? "DEBACU_EVAL");

    if (!usernameOrEmail) {
      return json(req, 400, {
        ok: false,
        error_obj: { code: "VALIDATION_ERROR", message: "usernameOrEmail required" },
      });
    }

    // Si ya es email
    if (usernameOrEmail.includes("@")) {
      return json(req, 200, { ok: true, data: { email: usernameOrEmail.toLowerCase() } });
    }

    // Resolver username -> email (asunción típica: customers.service_username -> customers.email)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data, error } = await admin
      .from("customers")
      .select("email")
      .eq("app_id", appCode)
      .eq("service_username", usernameOrEmail)
      .maybeSingle();

    if (error) {
      return json(req, 500, {
        ok: false,
        error_obj: { code: "DB_ERROR", message: error.message },
      });
    }

    const email = (data?.email ?? "").trim().toLowerCase();
    if (!email) {
      return json(req, 404, {
        ok: false,
        error_obj: { code: "USER_NOT_FOUND", message: "username not mapped to email" },
      });
    }

    return json(req, 200, { ok: true, data: { email } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "UNKNOWN";
    return json(req, 500, { ok: false, error_obj: { code: "UNEXPECTED", message: msg } });
  }
});
