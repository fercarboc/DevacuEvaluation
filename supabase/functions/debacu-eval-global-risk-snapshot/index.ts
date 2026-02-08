// supabase/functions/debacu-eval-global-risk-snapshot/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// (opcional) CORS si ya lo usas igual en todas
function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
    "Access-Control-Max-Age": "86400",
  };
}

function json(status: number, body: unknown, req: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" }, req);

  // usa Service Role para saltar RLS en agregados globales
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("debacu_eval_global_risk_snapshot_v")
    .select("pct5,pct4,pct3,pct2,pct1,pct_bajo,pct_medio,pct_alto")
    .single();

  if (error) return json(500, { ok: false, error: error.message }, req);

  // Tu clientService acepta {ok:true,data} o directo.
  // Devuelvo {ok:true,data} para estándar.
  return json(200, { ok: true, data }, req);
});
