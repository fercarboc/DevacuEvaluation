// supabase/functions/admin_get_system_settings/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";

function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

const SINGLETON_ID = "singleton";

// ⚠️ Ajusta estos defaults a los tuyos reales si NO están en la tabla como DEFAULT.
const DEFAULTS = {
  retention_days: 365,
  abuse_threshold_percent: 10,
  allow_new_access_requests: true,
};

async function ensureSingleton(sb: any) {
  const { data: row, error } = await sb
    .from("debacu_eval_system_settings")
    .select("retention_days, abuse_threshold_percent, allow_new_access_requests, updated_at, updated_by")
    .eq("id", SINGLETON_ID)
    .maybeSingle();

  if (error) throw error;
  if (row) return row;

  const { data: created, error: upErr } = await sb
    .from("debacu_eval_system_settings")
    .upsert(
      { id: SINGLETON_ID, ...DEFAULTS },
      { onConflict: "id" }
    )
    .select("retention_days, abuse_threshold_percent, allow_new_access_requests, updated_at, updated_by")
    .single();

  if (upErr) throw upErr;
  return created;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  try {
    await requireAdmin(req);

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const data = await ensureSingleton(sb);
    return json(req, 200, { ok: true, data });
  } catch (e: any) {
    const msg = e?.message ?? String(e);

    if (msg === "UNAUTHORIZED" || msg === "missing_bearer" || msg === "invalid_token") {
      return json(req, 401, { ok: false, error: "unauthorized" });
    }
    if (msg === "FORBIDDEN" || msg === "forbidden_admin_only") {
      return json(req, 403, { ok: false, error: "forbidden" });
    }

    return json(req, 500, { ok: false, error: "unexpected", detail: msg });
  }
});
