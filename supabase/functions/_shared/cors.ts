// supabase/functions/_shared/cors.ts
// deno-lint-ignore-file no-explicit-any

const ALLOWED_ORIGINS = new Set<string>([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",

  // ✅ Tu Vercel (prod)
  "https://devacu-evaluation.vercel.app",
]);

function isAllowedVercelOrigin(origin: string) {
  // ✅ Permite previews tipo: https://xxx.vercel.app
  // Si NO quieres permitir previews, borra esta función y su uso.
  try {
    const u = new URL(origin);
    return u.protocol === "https:" && u.hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function getAllowOrigin(req: Request): string {
  const origin = req.headers.get("Origin") ?? "";
  if (!origin) return ""; // non-browser / server-to-server

  if (ALLOWED_ORIGINS.has(origin)) return origin;

  // ✅ opcional: permitir todos los subdominios de vercel.app
  if (isAllowedVercelOrigin(origin)) return origin;

  return ""; // IMPORTANT: si no está permitido, NO devuelvas debacu.com
}

export function corsHeaders(req: Request): Headers {
  const h = new Headers();

  const allowOrigin = getAllowOrigin(req);
  if (allowOrigin) {
    h.set("Access-Control-Allow-Origin", allowOrigin);
    h.set("Vary", "Origin");
  }

  // Refleja headers solicitados para no romper cuando el SDK cambie
  const reqHeaders = req.headers.get("Access-Control-Request-Headers");
  if (reqHeaders) h.set("Access-Control-Allow-Headers", reqHeaders);
  else h.set("Access-Control-Allow-Headers", "authorization, x-client-info, apikey, content-type");

  h.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  h.set("Access-Control-Max-Age", "86400");

  return h;
}

export function preflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function json(req: Request, status: number, body: any): Response {
  const h = corsHeaders(req);
  h.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers: h });
}
