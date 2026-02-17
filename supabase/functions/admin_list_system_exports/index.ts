// supabase/functions/admin_list_exports/index.ts
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

function clampInt(v: any, def: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const i = Math.trunc(n);
  return Math.max(min, Math.min(max, i));
}

function cleanStr(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function isYmd(s: any) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function escapeIlike(s: string) {
  // minimiza comodines accidentales en ilike
  return s.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function supabaseServiceClient() {
  const SUPABASE_URL = requireEnv("SUPABASE_URL");
  const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
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
    // ✅ JWT-only + admin gate centralizado
    await requireAdmin(req);

    const body = await req.json().catch(() => ({}));

    // ✅ app_id decide de dónde sale la lista
    const appId = cleanStr(body?.app_id) ?? "SYSTEM";

    // filtros comunes
    const qRaw = cleanStr(body?.q);
    const source = cleanStr(body?.source);
    const customer = cleanStr(body?.customer_id);
    const type = cleanStr(body?.type);
    const format = cleanStr(body?.format);

    const from = isYmd(body?.from) ? String(body.from) : null;
    const to = isYmd(body?.to) ? String(body.to) : null;

    const limit = clampInt(body?.limit, 50, 1, 200);
    const offset = clampInt(body?.offset, 0, 0, 1_000_000);

    const sb = supabaseServiceClient();

    let query: any;

    if (appId === "SYSTEM") {
      // --- SYSTEM: tabla audit_exports ---
      query = sb
        .from("audit_exports")
        .select(
          [
            "id",
            "created_at",
            "generated_by",
            "generated_by_email",
            "provided_to_type",
            "provided_to_name",
            "provided_to_ref",
            "provided_to_contact",
            "purpose",
            "legal_basis",
            "notes",
            "format",
            "row_count",
            "filters_json",
            "customer_id",
            "date_from",
            "date_to",
            "source",
            "type",
            "app_id",
            "storage_bucket",
            "storage_path",
            "file_name",
            "mime_type",
            "status",
          ].join(","),
          { count: "exact" }
        )
        .eq("app_id", "SYSTEM")
        .order("created_at", { ascending: false });

      // filtros (campos reales en audit_exports)
      if (source) query = query.eq("source", source);
      if (customer) query = query.eq("customer_id", customer);
      if (type) query = query.eq("type", type);
      if (format) query = query.eq("format", format);

      if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
      if (to) {
        const d = new Date(`${to}T00:00:00.000Z`);
        d.setUTCDate(d.getUTCDate() + 1);
        query = query.lt("created_at", d.toISOString());
      }

      if (qRaw) {
        const qq = escapeIlike(qRaw);
        query = query.or(
          [
            `generated_by_email.ilike.%${qq}%`,
            `provided_to_name.ilike.%${qq}%`,
            `provided_to_ref.ilike.%${qq}%`,
            `provided_to_contact.ilike.%${qq}%`,
            `storage_path.ilike.%${qq}%`,
            `file_name.ilike.%${qq}%`,
            `type.ilike.%${qq}%`,
            `source.ilike.%${qq}%`,
          ].join(",")
        );
      }
    } else {
      // --- APP: vista debacu_eval_audit_exports_with_downloads ---
      query = sb
        .from("debacu_eval_audit_exports_with_downloads")
        .select(
          [
            "id",
            "created_at",
            "generated_by_user_id",
            "generated_by_email",
            "delivered_to_name",
            "delivered_to_org",
            "delivered_to_reason",
            "delivered_to_reference",
            "filter_source",
            "filter_customer",
            "filter_type",
            "filter_from",
            "filter_to",
            "format",
            "row_count",
            "storage_bucket",
            "storage_path",
            "meta",
            "download_count",
            "last_download_at",
          ].join(","),
          { count: "exact" }
        )
        .order("created_at", { ascending: false });

      // filtros (campos filter_* de la vista)
      if (source) query = query.eq("filter_source", source);
      if (customer) query = query.eq("filter_customer", customer);
      if (type) query = query.eq("filter_type", type);
      if (format) query = query.eq("format", format);

      if (from) query = query.gte("created_at", `${from}T00:00:00.000Z`);
      if (to) {
        const d = new Date(`${to}T00:00:00.000Z`);
        d.setUTCDate(d.getUTCDate() + 1);
        query = query.lt("created_at", d.toISOString());
      }

      if (qRaw) {
        const qq = escapeIlike(qRaw);
        query = query.or(
          [
            `generated_by_email.ilike.%${qq}%`,
            `delivered_to_name.ilike.%${qq}%`,
            `delivered_to_org.ilike.%${qq}%`,
            `delivered_to_reason.ilike.%${qq}%`,
            `delivered_to_reference.ilike.%${qq}%`,
            `storage_path.ilike.%${qq}%`,
          ].join(",")
        );
      }
    }

    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) return json(req, 500, { ok: false, error: "db_error", detail: error.message });

    // ✅ Shape unificado para la UI (ExportRow)
    const rows = (data ?? []).map((r: any) => {
      if (appId === "SYSTEM") {
        return {
          id: r.id,
          created_at: r.created_at,

          generated_by_user_id: r.generated_by ?? null,
          generated_by_email: r.generated_by_email ?? null,

          delivered_to_name: r.provided_to_name ?? null,
          delivered_to_org: null,
          delivered_to_reason: r.purpose ?? null,
          delivered_to_reference: r.provided_to_ref ?? null,

          filter_source: r.source ?? null,
          filter_customer: r.customer_id ?? null,
          filter_type: r.type ?? null,
          filter_from: r.date_from ?? null,
          filter_to: r.date_to ?? null,

          format: r.format,
          row_count: r.row_count ?? 0,

          storage_bucket: r.storage_bucket,
          storage_path: r.storage_path,

          download_count: 0,
          last_download_at: null,
        };
      }

      return {
        id: r.id,
        created_at: r.created_at,

        generated_by_user_id: r.generated_by_user_id ?? null,
        generated_by_email: r.generated_by_email ?? null,

        delivered_to_name: r.delivered_to_name ?? null,
        delivered_to_org: r.delivered_to_org ?? null,
        delivered_to_reason: r.delivered_to_reason ?? null,
        delivered_to_reference: r.delivered_to_reference ?? null,

        filter_source: r.filter_source ?? null,
        filter_customer: r.filter_customer ?? null,
        filter_type: r.filter_type ?? null,
        filter_from: r.filter_from ?? null,
        filter_to: r.filter_to ?? null,

        format: r.format,
        row_count: r.row_count ?? 0,

        storage_bucket: r.storage_bucket,
        storage_path: r.storage_path,

        download_count: Number(r.download_count ?? 0),
        last_download_at: r.last_download_at ?? null,
      };
    });

    return json(req, 200, {
      ok: true,
      data: rows,
      meta: { limit, offset, count: count ?? rows.length },
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
