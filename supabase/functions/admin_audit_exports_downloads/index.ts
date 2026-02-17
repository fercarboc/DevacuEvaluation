// supabase/functions/admin_audit_exports_downloads/index.ts
// deno-lint-ignore-file no-explicit-any

import { json, preflight } from "../_shared/cors.ts";
import { requireAdmin, supabaseServiceClient } from "../_shared/auth.ts";

type Body = {
  export_id: string;
  limit?: number;
  offset?: number;
};

function cleanStr(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function cleanInt(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

Deno.serve(async (req) => {
  // ✅ CORS
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  try {
    // ✅ ADMIN (JWT-only real + RPC is_admin())
    await requireAdmin(req);

    const body = (await req.json().catch(() => ({}))) as Body;

    const export_id = cleanStr(body?.export_id);
    if (!export_id) return json(req, 400, { ok: false, error: "export_id_required" });

    const limit = Math.min(Math.max(cleanInt(body?.limit, 200), 1), 500);
    const offset = Math.max(cleanInt(body?.offset, 0), 0);

    // ✅ Service role SOLO para lectura admin (no para auth)
    const sb = supabaseServiceClient();

    const { data, error } = await sb
      .from("debacu_eval_audit_export_downloads")
      .select("id, export_id, created_at, downloaded_by, downloaded_by_email, ip, user_agent")
      .eq("export_id", export_id)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return json(req, 500, { ok: false, error: "db_error", detail: error.message });
    }

    const rows = (data ?? []).map((r: any) => ({
      id: r.id,
      export_id: r.export_id,
      downloaded_at: r.created_at,
      downloaded_by_user_id: r.downloaded_by ?? null,
      downloaded_by_email: r.downloaded_by_email ?? null,
      ip: r.ip ?? null,
      user_agent: r.user_agent ?? null,
    }));

    return json(req, 200, { ok: true, data: rows, paging: { limit, offset } });
  } catch (e: any) {
    const msg = e?.message ?? String(e);

    if (msg === "UNAUTHORIZED") {
      return json(req, 401, { ok: false, error: "unauthorized" });
    }
    if (msg === "FORBIDDEN") {
      return json(req, 403, { ok: false, error: "forbidden" });
    }
    if (msg === "ADMIN_CHECK_FAILED") {
      return json(req, 500, { ok: false, error: "admin_check_failed" });
    }

    return json(req, 500, { ok: false, error: "unexpected", detail: msg });
  }
});
