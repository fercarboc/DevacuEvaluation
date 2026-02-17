// supabase/functions/admin_list_export_downloads/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";

/* =======================
 * Env + helpers
 * ======================= */
function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function clampInt(v: any, def: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const i = Math.trunc(n);
  return Math.max(min, Math.min(max, i));
}

function supabaseServiceClient() {
  const SUPABASE_URL = requireEnv("SUPABASE_URL");
  const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

/* =======================
 * Main
 * ======================= */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  try {
    // ✅ JWT-only + admin gate centralizado (sin ADMIN_EMAILS aquí)
    await requireAdmin(req);

    const body = await req.json().catch(() => ({}));

    const export_id = String(body?.export_id ?? "").trim();
    if (!export_id) return json(req, 400, { ok: false, error: "missing_export_id" });

    const limit = clampInt(body?.limit, 200, 1, 500);
    const offset = clampInt(body?.offset, 0, 0, 1_000_000);

    const sb = supabaseServiceClient();

    const { data, error, count } = await sb
      .from("debacu_eval_audit_export_downloads")
      .select(
        `
          id,
          created_at,
          export_id,
          downloaded_by,
          downloaded_by_email,
          ip,
          user_agent
        `,
        { count: "exact" }
      )
      .eq("export_id", export_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return json(req, 500, { ok: false, error: "db_error", detail: error.message });
    }

    return json(req, 200, {
      ok: true,
      data: data ?? [],
      meta: {
        export_id,
        limit,
        offset,
        count: count ?? (data ?? []).length,
      },
    });
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
