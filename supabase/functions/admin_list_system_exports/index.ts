import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(req) },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function getBearer(req: Request) {
  const h = req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function supabaseUserClient(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
}

function supabaseServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function parseAllowedEmails(csv: string | null) {
  const raw = (csv ?? "").trim();
  if (!raw) return ["admin@debacu.com"];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function requireAdmin(req: Request) {
  const token = getBearer(req);
  if (!token) {
    return { ok: false as const, status: 401, error: "missing_bearer" as const };
  }

  const sbUser = supabaseUserClient(req);
  const { data: userData, error: userErr } = await sbUser.auth.getUser();

  if (userErr || !userData?.user) {
    return { ok: false as const, status: 401, error: "invalid_token" as const };
  }

  const allowed = parseAllowedEmails(Deno.env.get("ADMIN_EMAILS"));
  const email = (userData.user.email ?? "").toLowerCase().trim();

  if (!allowed.includes(email)) {
    return { ok: false as const, status: 403, error: "forbidden" as const };
  }

  return { ok: true as const, user: userData.user };
}

function cleanStr(v: any) {
  const s = String(v ?? "").trim();
  return s ? s : null;
}

function escapeIlike(s: string) {
  return s.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  const admin = await requireAdmin(req);
  if (!admin.ok) return json(req, admin.status, { ok: false, error: admin.error });

  try {
    const body = await req.json().catch(() => ({}));

    // ✅ app_id decide de dónde sale la lista
    const appId = cleanStr(body?.app_id) ?? "SYSTEM";

    // filtros comunes (pero OJO: los campos cambian según origen)
    const q = cleanStr(body?.q);
    const source = cleanStr(body?.source);
    const customer = cleanStr(body?.customer_id);
    const type = cleanStr(body?.type);
    const format = cleanStr(body?.format);
    const from = cleanStr(body?.from);
    const to = cleanStr(body?.to);

    const limit = Math.min(Number(body?.limit ?? 50), 200);
    const offset = Math.max(Number(body?.offset ?? 0), 0);

    const sb = supabaseServiceClient();

    // ✅ Query según appId
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
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      // filtros (campos reales en audit_exports)
      if (source) query = query.eq("source", source);
      if (customer) query = query.eq("customer_id", customer);
      if (type) query = query.eq("type", type);
      if (format) query = query.eq("format", format);

      if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
      if (to) query = query.lte("created_at", `${to}T23:59:59Z`);

      if (q) {
        const qq = escapeIlike(q);
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
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      // filtros (campos filter_* de la vista)
      if (source) query = query.eq("filter_source", source);
      if (customer) query = query.eq("filter_customer", customer);
      if (type) query = query.eq("filter_type", type);
      if (format) query = query.eq("format", format);

      if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
      if (to) query = query.lte("created_at", `${to}T23:59:59Z`);

      if (q) {
        const qq = escapeIlike(q);
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

    const { data, error, count } = await query;
    if (error) return json(req, 500, { ok: false, error: "db_error", detail: error.message });

    // ✅ Shape unificado para la UI (ExportRow)
    const rows = (data ?? []).map((r: any) => {
      if (appId === "SYSTEM") {
        return {
          id: r.id,
          created_at: r.created_at,

          generated_by_user_id: r.generated_by ?? null,
          generated_by_email: r.generated_by_email ?? null,

          // UI usa delivered_*; en SYSTEM vienen de provided_*
          delivered_to_name: r.provided_to_name ?? null,
          delivered_to_org: null,
          delivered_to_reason: r.purpose ?? null,
          delivered_to_reference: r.provided_to_ref ?? null,

          // UI usa filter_*; en SYSTEM vienen de source/type/date_*
          filter_source: r.source ?? null,
          filter_customer: r.customer_id ?? null,
          filter_type: r.type ?? null,
          filter_from: r.date_from ?? null,
          filter_to: r.date_to ?? null,

          format: r.format,
          row_count: r.row_count ?? 0,

          storage_bucket: r.storage_bucket,
          storage_path: r.storage_path,

          // de momento, descargas para SYSTEM = 0 (si luego lo quieres, se conecta con audit_export_downloads)
          download_count: 0,
          last_download_at: null,
        };
      }

      // vista app
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
    return json(req, 500, { ok: false, error: "unexpected", detail: e?.message ?? String(e) });
  }
});
