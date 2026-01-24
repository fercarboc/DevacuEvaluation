import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

type Body = {
  request_id: string;
  accepted_professional_use: boolean;
};

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return json(405, { error: "Method not allowed" });

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = (await req.json()) as Body;
    if (!body.request_id) return json(400, { error: "request_id required" });

    // Comprobar que ya hay PDF de aceptación
    const { data: row, error: selErr } = await supabase
      .from("debacu_eval_access_requests")
      .select("id, status, accepted_terms, accepted_terms_pdf_path")
      .eq("id", body.request_id)
      .maybeSingle();

    if (selErr) return json(500, { error: selErr.message });
    if (!row) return json(404, { error: "request not found" });

    if (!row.accepted_terms || !row.accepted_terms_pdf_path) {
      return json(400, { error: "terms not accepted with proof" });
    }

    const { error: updErr } = await supabase
      .from("debacu_eval_access_requests")
      .update({
        status: "PENDING",
        accepted_professional_use: !!body.accepted_professional_use,
      })
      .eq("id", body.request_id);

    if (updErr) return json(500, { error: updErr.message });

    return json(200, { ok: true });
  } catch (e: any) {
    return json(500, { error: e?.message ?? String(e) });
  }
});
