// supabase/functions/admin_audit_exports_stats/index.ts
// deno-lint-ignore-file no-explicit-any

import { json, preflight } from "../_shared/cors.ts";
import { requireAdmin, supabaseServiceClient } from "../_shared/auth.ts";

type Body = { export_id: string };

function cleanStr(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

Deno.serve(async (req) => {
  // ✅ CORS
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "method_not_allowed" });
  }

  try {
    // ✅ ADMIN (JWT-only real; sin RPC)
    await requireAdmin(req);

    const body = (await req.json().catch(() => ({}))) as Partial<Body>;
    const export_id = cleanStr(body?.export_id);
    if (!export_id) return json(req, 400, { ok: false, error: "export_id_required" });

    const sb = supabaseServiceClient();

    // 1) count SIN traer filas (head: true)
    const { count, error: countErr } = await sb
      .from("debacu_eval_audit_export_downloads")
      .select("id", { count: "exact", head: true })
      .eq("export_id", export_id);

    if (countErr) {
      return json(req, 500, {
        ok: false,
        error: "db_error",
        detail: `count: ${countErr.message}`,
      });
    }

    // 2) last (solo 1 fila)
    const { data: lastRow, error: lastErr } = await sb
      .from("debacu_eval_audit_export_downloads")
      .select("created_at, downloaded_by_email")
      .eq("export_id", export_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastErr) {
      return json(req, 500, {
        ok: false,
        error: "db_error",
        detail: `last: ${lastErr.message}`,
      });
    }

    return json(req, 200, {
      ok: true,
      data: {
        export_id,
        download_count: count ?? 0,
        last_downloaded_at: lastRow?.created_at ?? null,
        last_downloaded_by_email: lastRow?.downloaded_by_email ?? null,
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
