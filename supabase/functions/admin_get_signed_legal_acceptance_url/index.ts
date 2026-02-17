// supabase/functions/admin_access_request_terms_pdf_signed_url/index.ts
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

type Body = {
  request_id?: string | null;
  requestId?: string | null; // compat
  expires_in?: number | null; // seconds
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "method_not_allowed" });
  }

  try {
    // ✅ Admin real (JWT-only; sin RPC)
    await requireAdmin(req);

    const sb = supabaseServiceClient();
    const body = (await req.json().catch(() => ({}))) as Partial<Body>;

    const request_id = cleanStr(body?.request_id) ?? cleanStr(body?.requestId);
    if (!request_id) {
      return json(req, 400, { ok: false, error: "request_id_required" });
    }

    // 60..3600 (1 min..1h) — por defecto 15 min
    const expires_in = Math.min(Math.max(cleanInt(body?.expires_in, 60 * 15), 60), 60 * 60);

    // 1) leer bucket/path desde la tabla (fuente de verdad)
    const { data: row, error } = await sb
      .from("debacu_eval_access_requests")
      .select("accepted_terms, accepted_terms_pdf_bucket, accepted_terms_pdf_path")
      .eq("id", request_id)
      .maybeSingle();

    if (error) return json(req, 500, { ok: false, error: "db_error", detail: error.message });
    if (!row) return json(req, 404, { ok: false, error: "request_not_found" });

    if (row.accepted_terms !== true) {
      return json(req, 400, { ok: false, error: "terms_not_accepted" });
    }

    const bucket = (row.accepted_terms_pdf_bucket || "debacu_legal_acceptances") as string;
    const path = row.accepted_terms_pdf_path as string | null;

    if (!path) {
      return json(req, 404, { ok: false, error: "pdf_not_available" });
    }

    // 2) firmar URL
    const { data: signed, error: signErr } = await sb.storage
      .from(bucket)
      .createSignedUrl(path, expires_in);

    if (signErr || !signed?.signedUrl) {
      return json(req, 500, { ok: false, error: "sign_failed", detail: signErr?.message ?? "no-url" });
    }

    // ✅ Firma homogénea
    return json(req, 200, {
      ok: true,
      data: {
        signed_url: signed.signedUrl,
        expires_in,
        bucket,
        path,
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
