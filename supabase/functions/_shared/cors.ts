// supabase/functions/_shared/cors.ts
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

export function corsHeaders(req: Request, extraMethods = "GET,POST,OPTIONS") {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": extraMethods,
    "Access-Control-Max-Age": "86400",
  };
}

export function preflight(req: Request, extraMethods = "GET,POST,OPTIONS") {
  return new Response(null, { status: 204, headers: corsHeaders(req, extraMethods) });
}

export function json(req: Request, status: number, body: unknown, extraMethods = "GET,POST,OPTIONS") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(req, extraMethods) },
  });
}
