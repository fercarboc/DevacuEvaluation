// supabase/functions/debacu-eval-global-risk-snapshot/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

function supabaseServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function err(req: Request, status: number, detail: string) {
  return json(req, status, { ok: false, error: "request_failed", detail });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return err(req, 405, "method_not_allowed");

  try {
    // JWT obligatorio (aunque el snapshot sea "global", sigue siendo endpoint privado)
    await requireUser(req);

    const sb = supabaseServiceClient();

    const { data, error } = await sb
      .from("debacu_eval_global_risk_snapshot_v")
      .select("pct5,pct4,pct3,pct2,pct1,pct_bajo,pct_medio,pct_alto")
      .single();

    if (error) return err(req, 500, "db_read_failed");

    return json(req, 200, { ok: true, data });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") return err(req, 401, "UNAUTHORIZED");
    if (msg === "FORBIDDEN") return err(req, 403, "FORBIDDEN");

    return err(req, 500, "internal_error");
  }
});
