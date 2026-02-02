// supabase/functions/debacu-eval-global-summary/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
    "Access-Control-Max-Age": "86400",
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders(req) });

  try {
    const sessionToken = req.headers.get("x-session-token") ?? "";
    if (!sessionToken) return json(req, 401, { ok: false, error: "missing_session_token" });

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Si quieres “toda la base”, no filtres.
    // Si quieres “solo DEBACU_EVAL”, filtra platform/app_code.
    const { data, error } = await sb
      .from("debacu_evaluations")
      .select("platform,nationality"); // nationality = país

    if (error) return json(req, 500, { ok: false, error: error.message });

    const rows = (data ?? []) as { platform: string | null; nationality: string | null }[];

    const platformCounts: Record<string, number> = {};
    const countryCounts: Record<string, number> = {};

    for (const r of rows) {
      const p = (r.platform || "N/D").trim();
      const c = (r.nationality || "N/D").trim();

      platformCounts[p] = (platformCounts[p] ?? 0) + 1;
      countryCounts[c] = (countryCounts[c] ?? 0) + 1;
    }

    const totalCount = rows.length;

    return json(req, 200, { ok: true, data: { totalCount, platformCounts, countryCounts } });
  } catch (e) {
    return json(req, 500, { ok: false, error: String(e?.message ?? e) });
  }
});
