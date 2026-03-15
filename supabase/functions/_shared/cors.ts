// supabase/functions/_shared/cors.ts
// deno-lint-ignore-file no-explicit-any

const ALLOWED_ORIGINS = new Set<string>([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
  "https://devacu-evaluation.vercel.app",
]);

// Solo permite previews del proyecto propio (debacu-evaluation-*)
// No permite cualquier *.vercel.app para evitar orígenes externos arbitrarios
function isAllowedVercelPreview(origin: string) {
  try {
    const u = new URL(origin);
    return (
      u.protocol === "https:" &&
      u.hostname.endsWith(".vercel.app") &&
      u.hostname.startsWith("debacu-evaluation-")
    );
  } catch {
    return false;
  }
}

function getAllowOrigin(req: Request): string {
  const origin = req.headers.get("Origin") ?? "";
  if (!origin) return "";

  if (ALLOWED_ORIGINS.has(origin)) return origin;
  if (isAllowedVercelPreview(origin)) return origin;

  return "";
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
