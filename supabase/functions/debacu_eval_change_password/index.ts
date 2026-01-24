import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export default async function handler(req: Request) {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { username, current_password, new_password } = await req.json();

    if (!username || !current_password || !new_password) {
      return json(400, { error: "missing_fields" });
    }

    // 1) Buscar customer por service_username
    const { data: customer, error: cErr } = await supabase
      .from("customers")
      .select("id, service_username, service_password, is_active")
      .eq("service_username", username)
      .maybeSingle();

    if (cErr) return json(500, { error: "db_error", detail: cErr.message });
    if (!customer) return json(401, { error: "invalid_credentials" });
    if (!customer.is_active) return json(403, { error: "inactive_customer" });

    // 2) Validar password actual (si más adelante hasheas, aquí cambias la comparación)
    if ((customer.service_password ?? "") !== current_password) {
      return json(401, { error: "invalid_credentials" });
    }

    // 3) Update password
    const { error: uErr } = await supabase
      .from("customers")
      .update({ service_password: new_password })
      .eq("id", customer.id);

    if (uErr) return json(500, { error: "update_failed", detail: uErr.message });

    return json(200, { ok: true });
  } catch (e) {
    return json(500, { error: "unexpected", detail: String(e) });
  }
}
