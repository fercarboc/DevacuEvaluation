// supabase/functions/_shared/cors.ts
// deno-lint-ignore-file no-explicit-any

const ALLOWED_ORIGINS = new Set<string>([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function getAllowOrigin(req: Request): string {
  const origin = req.headers.get("Origin") ?? "";
  if (!origin) return ""; // non-browser / server-to-server
  return ALLOWED_ORIGINS.has(origin) ? origin : "";
}

export function corsHeaders(req: Request): Headers {
  const h = new Headers();

  const allowOrigin = getAllowOrigin(req);
  if (allowOrigin) {
    h.set("Access-Control-Allow-Origin", allowOrigin);
    // Evita cache incorrecto entre orígenes
    h.set("Vary", "Origin");
  }

  // Importante: reflejar headers solicitados en preflight (patrón Supabase)
  // para que no se rompa si el SDK añade headers nuevos.
  const reqHeaders = req.headers.get("Access-Control-Request-Headers");
  h.set(
    "Access-Control-Allow-Headers",
    reqHeaders ??
      "authorization, apikey, content-type, x-client-info, x-supabase-client",
  );

  // Métodos que realmente usas
  h.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");

  // Si NO usas cookies, no pongas credentials.
  // (Con Authorization: Bearer es suficiente)
  // h.set("Access-Control-Allow-Credentials", "true");

  // Opcional: cache de preflight (reduce ruido en network)
  h.set("Access-Control-Max-Age", "86400");

  return h;
}

export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function json(req: Request, status: number, body: Record<string, any>): Response {
  const headers = corsHeaders(req);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}
