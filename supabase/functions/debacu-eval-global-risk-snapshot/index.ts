// supabase/functions/debacu-eval-global-risk-snapshot/index.ts
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
    const { months } = await req.json().catch(() => ({ months: 6 }));
    const m = Number(months ?? 6);
    const windowMonths: 3 | 6 | 12 = m === 3 ? 3 : m === 12 ? 12 : 6;

    // aquí tú VALIDAS x-session-token si procede (no lo invento)
    const sessionToken = req.headers.get("x-session-token") ?? "";
    if (!sessionToken) return json(req, 401, { ok: false, error: "missing_session_token" });

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ejemplo: calcular distribución sobre debacu_evaluations en los últimos N meses
    // OJO: aquí debes decidir si filtras por app_code / etc.
    const from = new Date();
    from.setMonth(from.getMonth() - windowMonths);

    const { data, error } = await sb
      .from("debacu_evaluations")
      .select("rating")
      .gte("created_at", from.toISOString());

    if (error) return json(req, 500, { ok: false, error: error.message });

    const rows = (data ?? []) as { rating: number }[];
    const total = rows.length || 0;

    const c = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const r of rows) {
      const v = Number(r.rating ?? 0);
      if (v >= 1 && v <= 5) c[v as 1 | 2 | 3 | 4 | 5] += 1;
    }

    const pct = (n: number) => (total ? (n / total) * 100 : 0);

    const pct5 = pct(c[5]);
    const pct4 = pct(c[4]);
    const pct3 = pct(c[3]);
    const pct2 = pct(c[2]);
    const pct1 = pct(c[1]);

    const pct_bajo = pct(c[4] + c[5]); // 4-5
    const pct_medio = pct(c[3]); // 3
    const pct_alto = pct(c[1] + c[2]); // 1-2

    return json(req, 200, {
      ok: true,
      data: { pct5, pct4, pct3, pct2, pct1, pct_bajo, pct_medio, pct_alto },
    });
  } catch (e) {
    return json(req, 500, { ok: false, error: String(e?.message ?? e) });
  }
});
