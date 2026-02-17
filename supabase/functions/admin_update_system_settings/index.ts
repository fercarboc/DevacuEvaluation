// supabase/functions/admin_update_system_settings/index.ts
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

function supabaseServiceClient() {
  const SUPABASE_URL = requireEnv("SUPABASE_URL");
  const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
}

function firstIp(req: Request) {
  const xf = req.headers.get("x-forwarded-for") ?? "";
  if (!xf) return null;
  return xf.split(",")[0]?.trim() || null;
}

function validate(payload: any) {
  const retention_days = Number(payload?.retention_days);
  const abuse_threshold_percent = Number(payload?.abuse_threshold_percent);
  const allow_new_access_requests = Boolean(payload?.allow_new_access_requests);

  if (!Number.isInteger(retention_days)) {
    throw Object.assign(new Error("retention_days must be integer"), { status: 400 });
  }
  if (retention_days < 30 || retention_days > 730) {
    throw Object.assign(new Error("retention_days out of range (30..730)"), { status: 400 });
  }

  if (!Number.isInteger(abuse_threshold_percent)) {
    throw Object.assign(new Error("abuse_threshold_percent must be integer"), { status: 400 });
  }
  if (abuse_threshold_percent < 1 || abuse_threshold_percent > 99) {
    throw Object.assign(new Error("abuse_threshold_percent out of range (1..99)"), { status: 400 });
  }

  return { retention_days, abuse_threshold_percent, allow_new_access_requests };
}

function buildDiff(before: any, after: any) {
  const keys = ["retention_days", "abuse_threshold_percent", "allow_new_access_requests"];
  const diff: Record<string, { before: any; after: any }> = {};
  for (const k of keys) {
    if (before?.[k] !== after?.[k]) diff[k] = { before: before?.[k], after: after?.[k] };
  }
  return diff;
}

const SINGLETON_ID = "singleton";

/* =======================
 * Main
 * ======================= */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  try {
    // ✅ JWT-only + admin gate centralizado
    // Necesitamos actor_user_id + actor_email para audit.
    // OJO: si tu requireAdmin no devuelve email, añádelo en _shared/auth.ts o cámbialo aquí.
    const actor: any = await requireAdmin(req);

    const actor_user_id = actor?.user_id ?? actor?.user?.id ?? null;
    const actor_email = actor?.email ?? actor?.user?.email ?? null;

    if (!actor_user_id) {
      // si tu shared no devuelve user_id, algo está mal
      throw Object.assign(new Error("UNAUTHORIZED"), { status: 401 });
    }

    const sb = supabaseServiceClient();

    const payload = await req.json().catch(() => ({}));
    const next = validate(payload);

    // leer settings actuales
    const { data: current, error: selErr } = await sb
      .from("debacu_eval_system_settings")
      .select("retention_days, abuse_threshold_percent, allow_new_access_requests, updated_at, updated_by")
      .eq("id", SINGLETON_ID)
      .maybeSingle();

    if (selErr) throw selErr;

    // defaults defensivos (mejor tener defaults en DB)
    const before = current ?? {
      retention_days: 90,
      abuse_threshold_percent: 75,
      allow_new_access_requests: true,
      updated_at: new Date().toISOString(),
      updated_by: null,
    };

    const after = { ...before, ...next };
    const diff = buildDiff(before, after);

    if (Object.keys(diff).length === 0) {
      return json(req, 200, { ok: true, data: { settings: before, audit_id: null, unchanged: true } });
    }

    const nowIso = new Date().toISOString();

    // upsert singleton
    const { data: updated, error: upErr } = await sb
      .from("debacu_eval_system_settings")
      .upsert(
        {
          id: SINGLETON_ID,
          retention_days: after.retention_days,
          abuse_threshold_percent: after.abuse_threshold_percent,
          allow_new_access_requests: after.allow_new_access_requests,
          updated_at: nowIso, // si tienes trigger DB, puedes quitarlo
          updated_by: actor_user_id,
        },
        { onConflict: "id" }
      )
      .select("retention_days, abuse_threshold_percent, allow_new_access_requests, updated_at, updated_by")
      .single();

    if (upErr) throw upErr;

    // audit
    const ip = firstIp(req);
    const userAgent = req.headers.get("user-agent") ?? null;

    const { data: audit, error: insErr } = await sb
      .from("debacu_eval_settings_audit_log")
      .insert({
        actor_user_id,
        actor_email,
        action: "UPDATE_SETTINGS",
        settings_before: before,
        settings_after: updated,
        diff,
        ip,
        user_agent: userAgent,
      })
      .select("id")
      .single();

    if (insErr) throw insErr;

    return json(req, 200, {
      ok: true,
      data: {
        settings: updated,
        audit_id: audit?.id ?? null,
        unchanged: false,
      },
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);

    // coherente con el resto
    if (msg === "UNAUTHORIZED" || msg === "missing_bearer" || msg === "invalid_token") {
      return json(req, 401, { ok: false, error: "unauthorized" });
    }
    if (msg === "FORBIDDEN" || msg === "forbidden_admin_only") {
      return json(req, 403, { ok: false, error: "forbidden" });
    }

    const status = e?.status ?? 500;
    return json(req, status, { ok: false, error: "unexpected", detail: msg });
  }
});
