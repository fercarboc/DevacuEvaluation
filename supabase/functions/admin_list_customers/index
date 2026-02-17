// supabase/functions/admin_list_customers/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";

/* =======================
 * Env + clients
 * ======================= */
function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function supabaseServiceClient() {
  const SUPABASE_URL = requireEnv("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
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
    // ✅ JWT-only + admin gate centralizado (fuera ADMIN_EMAILS)
    await requireAdmin(req);

    const body = await req.json().catch(() => ({}));
    const q = String(body?.q ?? "").trim();
    const limit = Math.min(Math.max(Number(body?.limit ?? 200), 1), 500);
    const offset = Math.max(Number(body?.offset ?? 0), 0);

    const sb = supabaseServiceClient();

    let query = sb
      .from("customers")
      .select(
        "id, name, email, plan_id, billing_frequency, phone, country, address, city, nif, is_active, created_at"
      )
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (q) {
      // intenta evitar comodines accidentales
      // (si necesitas exactitud 100% con escaping, mejor mover esto a FTS o query dedicada)
      const qq = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
      query = query.or(`name.ilike.%${qq}%,email.ilike.%${qq}%`);
    }

    const { data: customers, error } = await query;
    if (error) return json(req, 500, { ok: false, error: "db_error", detail: error.message });

    // Resolver plan_name (opcional)
    const planIds = [...new Set((customers ?? []).map((c: any) => c.plan_id).filter(Boolean))];
    const planMap = new Map<string, string>();

    if (planIds.length) {
      const { data: plans, error: pErr } = await sb.from("plans").select("id, name").in("id", planIds);
      if (!pErr) for (const p of plans ?? []) planMap.set(p.id, p.name);
    }

    const rows = (customers ?? []).map((c: any) => ({
      ...c,
      plan_name: c.plan_id ? planMap.get(c.plan_id) ?? null : null,
      last_login_at: null, // placeholder
    }));

    return json(req, 200, {
      ok: true,
      data: rows,
      meta: { limit, offset, count: rows.length },
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
