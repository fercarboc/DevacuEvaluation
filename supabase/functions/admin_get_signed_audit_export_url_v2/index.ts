// supabase/functions/admin_audit_exports_signed_url/index.ts
// (ajusta el nombre si ya existe; te dejo el contenido estándar)
// deno-lint-ignore-file no-explicit-any

import { json, preflight } from "../_shared/cors.ts";
import { requireAdmin, supabaseServiceClient } from "../_shared/auth.ts";

function cleanStr(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}
function cleanInt(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function getIp(req: Request) {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

type Body = {
  export_id?: string | null;
  id?: string | null; // compat
  expires_in?: number | null; // seconds
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "method_not_allowed" });
  }

  try {
    // ✅ Admin real (JWT-only; sin RPC)
    const adminUser = await requireAdmin(req);

    const sb = supabaseServiceClient();
    const body = (await req.json().catch(() => ({}))) as Partial<Body>;

    const export_id = cleanStr(body?.export_id) ?? cleanStr(body?.id);
    if (!export_id) return json(req, 400, { ok: false, error: "export_id_required" });

    // seconds: 60..3600 (1 min..1h)
    const expires_in = Math.min(Math.max(cleanInt(body?.expires_in, 600), 60), 60 * 60);

    // OJO: aquí debes usar TU tabla real (audit_exports vs debacu_eval_audit_exports)
    const { data: exp, error: expErr } = await sb
      .from("audit_exports")
      .select("id, storage_bucket, storage_path")
      .eq("id", export_id)
      .maybeSingle();

    if (expErr) return json(req, 500, { ok: false, error: "db_error", detail: expErr.message });
    if (!exp?.storage_bucket || !exp?.storage_path) {
      return json(req, 404, { ok: false, error: "export_not_found" });
    }

    const { data: signed, error: signErr } = await sb.storage
      .from(exp.storage_bucket)
      .createSignedUrl(exp.storage_path, expires_in);

    if (signErr || !signed?.signedUrl) {
      return json(req, 500, { ok: false, error: "sign_failed", detail: signErr?.message ?? "no-url" });
    }

    // Log de descarga (si falla NO bloquea la descarga)
    const ip = getIp(req);
    const user_agent = req.headers.get("user-agent") ?? null;

    const { error: insErr } = await sb.from("debacu_eval_audit_export_downloads").insert({
      export_id,
      downloaded_by: adminUser.id,
      downloaded_by_email: adminUser.email ?? null,
      ip,
      user_agent,
    });

    // ✅ Firma homogénea
    return json(req, 200, {
      ok: true,
      data: {
        signed_url: signed.signedUrl,
        expires_in,
        ...(insErr
          ? { warn: "download_log_failed", warn_detail: insErr.message }
          : {}),
      },
    });
  } catch (e: any) {
    const msg = e?.message ?? String(e);

    if (msg === "UNAUTHORIZED") return json(req, 401, { ok: false, error: "unauthorized" });
    if (msg === "FORBIDDEN") return json(req, 403, { ok: false, error: "forbidden" });
    if (msg === "ADMIN_CHECK_FAILED") return json(req, 500, { ok: false, error: "admin_check_failed" });

    return json(req, 500, { ok: false, error: "unexpected", detail: msg });
  }
});
