// supabase/functions/admin_audit_exports_list/index.ts
// deno-lint-ignore-file no-explicit-any

import { json, preflight } from "../_shared/cors.ts";
import { requireAdmin, supabaseServiceClient } from "../_shared/auth.ts";

type Body = {
  /**
   * Mantener por compatibilidad con el front (aunque NO exista en la view).
   * Lo mapeamos a filter_source.
   */
  app_id: string;

  customer_id?: string | null;
  from?: string | null;
  to?: string | null;
  format?: string | null;
  type?: string | null;
  provided_to_type?: string | null;
  q?: string | null;
  limit?: number | null;
  offset?: number | null;
};

/**
 * Tu view NO tiene app_id.
 * Si quieres seguir usando app_id desde el front, lo traducimos a filter_source.
 * Ajusta este mapeo según cómo guardes tus exports.
 */
function mapAppIdToSource(appId: string): string | null {
  const a = String(appId || "").toUpperCase().trim();

  if (a === "SYSTEM") return "SYSTEM";
  if (a === "DEBACU_EVAL") return "PRODUCT";
  if (a === "ALL") return null;

  return null; // default: no filtrar por source
}

function cleanInt(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

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

    const app_id = cleanStr(body?.app_id);
    if (!app_id) return json(req, 400, { ok: false, error: "app_id_required" });

    const limit = Math.min(Math.max(cleanInt(body?.limit, 50), 1), 200);
    const offset = Math.max(cleanInt(body?.offset, 0), 0);

    const sb = supabaseServiceClient();

    // ✅ View agregada con descargas
    let query = sb
      .from("debacu_eval_audit_exports_with_downloads")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // ✅ NO existe app_id en la view, así que lo mapeamos a filter_source
    const source = mapAppIdToSource(app_id);
    if (source) query = query.eq("filter_source", source);

    // filtros existentes en tu view (normalizados)
    const customer_id = cleanStr(body.customer_id);
    const format = cleanStr(body.format);
    const type = cleanStr(body.type);
    const from = cleanStr(body.from);
    const to = cleanStr(body.to);

    if (customer_id) query = query.eq("filter_customer", customer_id);
    if (format) query = query.eq("format", format);
    if (type) query = query.eq("filter_type", type);
    if (from) query = query.gte("filter_from", from);
    if (to) query = query.lte("filter_to", to);

    /**
     * provided_to_type:
     * Tu view tiene delivered_to_*; si no tienes un campo específico,
     * aquí no podemos filtrar "bien" sin añadir columna/vista.
     * Lo dejamos sin filtrar.
     */
    if (body.provided_to_type) {
      // futuro: query = query.eq("provided_to_type", body.provided_to_type)
    }

    if (body.q) {
      // Búsqueda simple por storage_path / delivered_to_* / reason
      // Evitamos wildcard-injection: quitamos % y _
      const term = String(body.q).trim().replace(/[%_]/g, "");
      if (term) {
        query = query.or(
          `storage_path.ilike.%${term}%,` +
            `delivered_to_name.ilike.%${term}%,` +
            `delivered_to_org.ilike.%${term}%,` +
            `delivered_to_reason.ilike.%${term}%`,
        );
      }
    }

    const { data, error } = await query;
    if (error) {
      return json(req, 500, { ok: false, error: "db_error", detail: error.message });
    }

    // ✅ mapeo para que cuadre con ExportRow del frontend
    const rows = (data ?? []).map((r: any) => ({
      id: r.id,
      created_at: r.created_at,

      // devolvemos el app_id que mandó el front (aunque no exista en DB)
      app_id,
      customer_id: r.filter_customer ?? null,

      type: r.filter_type ?? "",
      source: r.filter_source ?? "",
      format: r.format ?? "",

      file_name: r.storage_path ? String(r.storage_path).split("/").pop() : "",
      mime_type:
        r.format === "PDF"
          ? "application/pdf"
          : r.format === "CSV"
            ? "text/csv"
            : "application/octet-stream",

      storage_bucket: r.storage_bucket ?? "system-exports",
      storage_path: r.storage_path ?? "",

      row_count: r.row_count ?? null,
      date_from: r.filter_from ?? null,
      date_to: r.filter_to ?? null,

      provided_to_type: r.delivered_to_org ? "ORG" : null,
      provided_to_name: r.delivered_to_name ?? null,
      provided_to_contact: null,
      provided_to_ref: r.delivered_to_reference ?? null,

      purpose: null,
      legal_basis: null,
      notes: null,

      generated_by_email: r.generated_by_email ?? null,
    }));

    // ✅ Firma homogénea: ok + data (y dentro paging)
    return json(req, 200, { ok: true, data: { rows, paging: { limit, offset } } });
  } catch (e: any) {
    const msg = e?.message ?? String(e);

    if (msg === "UNAUTHORIZED") return json(req, 401, { ok: false, error: "unauthorized" });
    if (msg === "FORBIDDEN") return json(req, 403, { ok: false, error: "forbidden" });
    if (msg === "ADMIN_CHECK_FAILED") return json(req, 500, { ok: false, error: "admin_check_failed" });

    return json(req, 500, { ok: false, error: "unexpected", detail: msg });
  }
});
