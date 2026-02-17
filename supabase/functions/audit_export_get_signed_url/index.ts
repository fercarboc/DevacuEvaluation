// supabase/functions/audit_export_get_signed_url/index.ts
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
  const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function firstIp(req: Request) {
  const xf = req.headers.get("x-forwarded-for") ?? "";
  if (xf) return xf.split(",")[0]?.trim() || null;
  return req.headers.get("x-real-ip") ?? null;
}

function clampInt(v: any, def: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const i = Math.trunc(n);
  return Math.max(min, Math.min(max, i));
}

/* =======================
 * Main
 * ======================= */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  try {
    // ✅ Admin only (source of truth: debacu_eval_admin_users)
    const admin = await requireAdmin(req);

    const body = await req.json().catch(() => ({}));
    const exportId = String(body?.export_id ?? "").trim();
    const expiresIn = clampInt(body?.expires_in, 300, 60, 3600);

    if (!exportId) return json(req, 400, { ok: false, error: "missing_export_id" });

    const sb = supabaseServiceClient();

    // 1) Leer audit_exports para saber bucket + path
    // OJO: tus nombres reales son storage_bucket / storage_path (no "bucket")
    const { data: expRow, error: expErr } = await sb
      .from("audit_exports")
      .select("id, storage_bucket, storage_path")
      .eq("id", exportId)
      .maybeSingle();

    if (expErr) return json(req, 500, { ok: false, error: "db_error", detail: expErr.message });
    if (!expRow?.storage_bucket || !expRow?.storage_path) {
      return json(req, 404, { ok: false, error: "export_not_found" });
    }

    // 2) Firmar URL
    const { data: signed, error: signErr } = await sb.storage
      .from(String(expRow.storage_bucket))
      .createSignedUrl(String(expRow.storage_path), expiresIn);

    if (signErr || !signed?.signedUrl) {
      return json(req, 500, { ok: false, error: "sign_failed", detail: signErr?.message ?? "no_signed_url" });
    }

    // 3) Log descarga (mejor esfuerzo)
    const ip = firstIp(req);
    const ua = req.headers.get("user-agent") ?? null;

    // intentamos primero SYSTEM table; si no existe, fallback a debacu_eval_*
    let logged = false;
    let log_warning: string | null = null;

    // Tabla A: audit_export_downloads (SYSTEM)
    try {
      const { error: insErr } = await sb.from("audit_export_downloads").insert({
        export_id: exportId,
        downloaded_by_user_id: admin.user_id,
        downloaded_by_email: admin.email ?? null,
        ip,
        user_agent: ua,
      });
      if (!insErr) logged = true;
      else log_warning = `log_failed:audit_export_downloads:${insErr.message}`;
    } catch (e: any) {
      log_warning = `log_failed:audit_export_downloads:${e?.message ?? String(e)}`;
    }

    // Tabla B: debacu_eval_audit_export_downloads (si la A no existe / falla)
    if (!logged) {
      try {
        const { error: insErr2 } = await sb.from("debacu_eval_audit_export_downloads").insert({
          export_id: exportId,
          downloaded_by: admin.user_id,
          downloaded_by_email: admin.email ?? null,
          ip,
          user_agent: ua,
        });
        if (!insErr2) {
          logged = true;
          log_warning = null;
        } else {
          log_warning = `log_failed:debacu_eval_audit_export_downloads:${insErr2.message}`;
        }
      } catch (e: any) {
        log_warning = `log_failed:debacu_eval_audit_export_downloads:${e?.message ?? String(e)}`;
      }
    }

    return json(req, 200, {
      ok: true,
      data: {
        signed_url: signed.signedUrl,
        expires_in: expiresIn,
        export_id: exportId,
        logged_download: logged,
        warning: log_warning,
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
