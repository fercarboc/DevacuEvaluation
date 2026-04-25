// supabase/functions/_shared/cors.ts
// deno-lint-ignore-file no-explicit-any

const ALLOWED_ORIGINS = new Set<string>([
  "http://localhost:3000",
  "http://localhost:5173",
  // debacu.com (legacy brand domain)
  "https://debacu.com",
  "https://www.debacu.com",
  // debacuapp.com (production app domain)
  "https://debacuapp.com",
  "https://www.debacuapp.com",
  // Vercel named deployments
  "https://devacu-evaluation.vercel.app",
]);

function isAllowedVercelPreview(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== "https:" || !u.hostname.endsWith(".vercel.app")) return false;
    return (
      u.hostname.startsWith("debacu-evaluation-") ||
      u.hostname.startsWith("debacuapp-")
    );
  } catch {
    return false;
  }
}

function resolveAllowOrigin(req: Request): string {
  const origin = req.headers.get("Origin") ?? "";
  if (!origin) return "";

  if (ALLOWED_ORIGINS.has(origin)) {
    console.log(`[CORS] ✅ Allowed origin: ${origin}`);
    return origin;
  }

  if (isAllowedVercelPreview(origin)) {
    console.log(`[CORS] ✅ Allowed Vercel preview: ${origin}`);
    return origin;
  }

  console.warn(`[CORS] ⛔ Blocked origin: ${origin} | path: ${new URL(req.url).pathname}`);
  return "";
}

export function corsHeaders(req: Request): Headers {
  const h = new Headers();
  const allowOrigin = resolveAllowOrigin(req);

  if (allowOrigin) {
    h.set("Access-Control-Allow-Origin", allowOrigin);
    h.set("Vary", "Origin");
  }

  // Reflect requested headers so SDK upgrades don't break preflight
  const reqHeaders = req.headers.get("Access-Control-Request-Headers");
  h.set(
    "Access-Control-Allow-Headers",
    reqHeaders ?? "authorization, x-client-info, apikey, content-type",
  );
  h.set("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  h.set("Access-Control-Max-Age", "86400");

  return h;
}

export function preflight(req: Request): Response {
  const origin = req.headers.get("Origin") ?? "unknown";
  console.log(`[CORS] Preflight OPTIONS from: ${origin}`);
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export function json(req: Request, status: number, body: any): Response {
  const h = corsHeaders(req);
  h.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers: h });
}
