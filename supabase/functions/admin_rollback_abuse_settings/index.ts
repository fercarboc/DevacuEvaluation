// supabase/functions/admin_rollback_abuse_settings/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";

/* =======================
 * Env + client
 * ======================= */
function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function supabaseServiceClient() {
  const SUPABASE_URL = requireEnv("SUPABASE_URL");
  const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

/* =======================
 * Rollback helpers
 * ======================= */
// Campos permitidos para rollback (lo demás se ignora)
const ALLOWED_FIELDS = new Set([
  "ack_warning_minutes",
  "ack_critical_minutes",
  "resolve_warning_minutes",
  "resolve_critical_minutes",
]);

function pickRollbackPayload(oldValues: any) {
  const src = oldValues && typeof oldValues === "object" ? oldValues : {};
  const out: Record<string, any> = {};
  for (const k of Object.keys(src)) {
    if (ALLOWED_FIELDS.has(k)) out[k] = src[k];
  }
  return out;
}

function shallowSameAllowed(a: any, b: any) {
  for (const k of ALLOWED_FIELDS) {
    // solo comparamos si el payload trae esa key
    if (Object.prototype.hasOwnProperty.call(a, k)) {
      if (JSON.stringify(a[k]) !== JSON.stringify(b?.[k])) return false;
    }
  }
  return true;
}

/* =======================
 * Main
 * ======================= */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  try {
    const admin = await requireAdmin(req); // debe lanzar UNAUTHORIZED/FORBIDDEN (o similar) en tu shared

    const body = await req.json().catch(() => ({}));
    const auditId = body?.audit_id ? String(body.audit_id) : "";
    if (!auditId) return json(req, 400, { ok: false, error: "missing_audit_id" });

    const sb = supabaseServiceClient();

    // 1) Leer log
    const { data: logRow, error: logErr } = await sb
      .from("settings_audit_log")
      .select("id, table_name, record_id, action, old_values, new_values, changed_at")
      .eq("id", auditId)
      .maybeSingle();

    if (logErr) return json(req, 500, { ok: false, error: "db_error", detail: logErr.message });
    if (!logRow) return json(req, 404, { ok: false, error: "audit_not_found" });

    if (logRow.table_name !== "abuse_settings" || logRow.action !== "UPDATE") {
      return json(req, 400, { ok: false, error: "invalid_audit_row" });
    }

    const settingsId = logRow.record_id;
    if (!settingsId) return json(req, 400, { ok: false, error: "missing_record_id" });

    // 2) Construir payload de rollback
    const payload = pickRollbackPayload(logRow.old_values);
    if (Object.keys(payload).length === 0) {
      return json(req, 400, { ok: false, error: "nothing_to_rollback" });
    }

    // (Opcional pero útil) leer estado actual y evitar updates inútiles
    const { data: current, error: curErr } = await sb
      .from("abuse_settings")
      .select("id, ack_warning_minutes, ack_critical_minutes, resolve_warning_minutes, resolve_critical_minutes")
      .eq("id", settingsId)
      .maybeSingle();

    if (curErr) return json(req, 500, { ok: false, error: "db_error", detail: curErr.message });
    if (!current) return json(req, 404, { ok: false, error: "settings_not_found" });

    if (shallowSameAllowed(payload, current)) {
      return json(req, 200, {
        ok: true,
        no_change: true,
        rolled_back_to_audit_id: auditId,
        abuse_settings_id: settingsId,
        updated: current,
      });
    }

    // 3) Aplicar rollback y firmar
    // Si tienes triggers en DB para updated_at, quita updated_at de aquí.
    const updatePayload = {
      ...payload,
      updated_by: admin.user_id ?? admin.user?.id ?? null, // según cómo devuelva tu requireAdmin shared
      updated_at: new Date().toISOString(),
    };

    const { data: updated, error: upErr } = await sb
      .from("abuse_settings")
      .update(updatePayload)
      .eq("id", settingsId)
      .select("*")
      .maybeSingle();

    if (upErr) return json(req, 500, { ok: false, error: "db_error", detail: upErr.message });

    return json(req, 200, {
      ok: true,
      rolled_back_to_audit_id: auditId,
      abuse_settings_id: settingsId,
      updated,
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
