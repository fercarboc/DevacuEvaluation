// supabase/functions/_shared/cors.ts
// deno-lint-ignore-file no-explicit-any

/**
 * CORS compartido (Debacu)
 * - Permite origins explícitos (local + debacu.com)
 * - Permite cualquier subdominio *.vercel.app (preview + prod en Vercel)
 * - NO usa "*" (porque usamos Authorization Bearer)
 * - Refleja Access-Control-Request-Headers en preflight (robusto)
 */

const EXPLICIT_ALLOWED_ORIGINS = new Set<string>([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
  "https://debacu-evaluation.vercel.app",
  "https://devacu-evaluation.vercel.app",
]);

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;

  // allow exact
  if (EXPLICIT_ALLOWED_ORIGINS.has(origin)) return true;

  // allow Vercel preview/prod subdomains
  // examples:
  // - https://debacu-evaluation.vercel.app
  // - https://debacu-evaluation-xxxx-team.vercel.app
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();

    // only https on vercel
    if (u.protocol !== "https:") return false;

    // allow *.vercel.app
    if (host === "vercel.app") return false; // (no root)
    if (host.endsWith(".vercel.app")) return true;

    return false;
  } catch {
    return false;
  }
}

function getAllowOrigin(req: Request): string {
  const origin = req.headers.get("Origin") ?? "";
  if (!origin) return ""; // non-browser / server-to-server
  return isAllowedOrigin(origin) ? origin : "";
}

export function corsHeaders(req: Request): Headers {
  const h = new Headers();

  const allowOrigin = getAllowOrigin(req);
  if (allowOrigin) {
    h.set("Access-Control-Allow-Origin", allowOrigin);
    // Evita cache incorrecto entre orígenes
    h.set("Vary", "Origin");
  }

  // Reflejar headers solicitados en preflight (más compatible)
  const reqHeaders = req.headers.get("Access-Control-Request-Headers");
  h.set(
    "Access-Control-Allow-Headers",
    reqHeaders ??
      "authorization, apikey, content-type, x-client-info, x-supabase-client",
  );

  // Métodos típicos
  h.set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");

  // Si NO usas cookies, NO habilitar credentials
  // (JWT Bearer + apikey es suficiente)
  // h.set("Access-Control-Allow-Credentials", "true");

  // Cache de preflight
  h.set("Access-Control-Max-Age", "86400");

  return h;
}

export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function json(
  req: Request,
  status: number,
  body: Record<string, any>,
): Response {
  const headers = corsHeaders(req);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}
