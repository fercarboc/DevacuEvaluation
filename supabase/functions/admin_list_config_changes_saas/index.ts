// supabase/functions/admin_list_config_changes_saas/index.ts
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

function clampInt(v: any, def: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const i = Math.trunc(n);
  return Math.max(min, Math.min(max, i));
}

function isYmd(s: any) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// evita que % y _ actúen como comodines en ilike/or
function sanitizeIlikeTerm(s: string) {
  return s.replace(/[%_]/g, (m) => `\\${m}`);
}

function supabaseServiceClient() {
  const SUPABASE_URL = requireEnv("SUPABASE_URL");
  const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  try {
    await requireAdmin(req);

    const payload = await req.json().catch(() => ({}));

    const rawQ = typeof payload?.q === "string" ? payload.q.trim().toLowerCase() : "";
    const q = rawQ ? sanitizeIlikeTerm(rawQ) : "";

    const from = isYmd(payload?.from) ? payload.from : "";
    const to = isYmd(payload?.to) ? payload.to : "";

    const limit = clampInt(payload?.limit, 25, 1, 100);
    const offset = clampInt(payload?.offset, 0, 0, 100000);

    const sb = supabaseServiceClient();

    let query = sb
      .from("debacu_eval_settings_audit_log")
      .select(
        "id, created_at, actor_user_id, actor_email, action, diff, ip, user_agent, settings_before, settings_after",
        { count: "exact" }
      )
      .order("created_at", { ascending: false });

    if (q) {
      query = query.or(`actor_email.ilike.%${q}%,action.ilike.%${q}%`);
    }

    if (from) {
      query = query.gte("created_at", `${from}T00:00:00.000Z`);
    }

    if (to) {
      const d = new Date(`${to}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      query = query.lt("created_at", d.toISOString());
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) throw error;

    return json(req, 200, {
      ok: true,
      data: {
        rows: data ?? [],
        total: count ?? 0,
        limit,
        offset,
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
