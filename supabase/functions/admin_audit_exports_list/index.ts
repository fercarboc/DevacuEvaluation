// Setup type definitions for built-in Supabase Runtime APIs
// supabase/functions/admin_audit_exports_list/index.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(res: any, status = 200) {
  return new Response(JSON.stringify(res), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
  });
}

function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

type Body = {
  // Mantener por compatibilidad con el front (aunque NO exista en la view).
  // Lo mapeamos a filter_source.
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

async function isAdmin(sb: any, userId: string, email: string) {
  // ✅ RECOMENDADO: tabla admin_users
  const { data, error } = await sb
    .from("debacu_eval_admin_users")
    .select("active")
    .eq("user_id", userId)
    .maybeSingle();

  if (!error && data?.active === true) return true;

  // fallback por si estás en transición
  return email === "admin@debacu.com";
}

/**
 * Tu view NO tiene app_id.
 * Si quieres seguir usando app_id desde el front, lo traducimos a filter_source.
 * Ajusta este mapeo según cómo guardes tus exports.
 */
function mapAppIdToSource(appId: string): string | null {
  const a = (appId || "").toUpperCase();

  // típicos
  if (a === "SYSTEM") return "SYSTEM";

  // si tu producto guarda exports con filter_source='PRODUCT'
  if (a === "DEBACU_EVAL") return "PRODUCT";

  // si quieres permitir "ALL" o valores no reconocidos sin filtrar
  if (a === "ALL") return null;

  return null; // default: no filtrar por source
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!jwt) return json({ ok: false, error: "Missing Bearer token" }, 401);

    // cliente con service role pero validando usuario con el JWT
    const sbUser = createClient(SUPABASE_URL, SERVICE_KEY, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });

    const { data: userData, error: userErr } = await sbUser.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "Invalid auth" }, 401);

    const userId = userData.user.id;
    const email = (userData.user.email || "").toLowerCase();

    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    if (!(await isAdmin(sb, userId, email))) {
      return json({ ok: false, error: "Forbidden" }, 403);
    }

    const body = (await req.json()) as Body;
    if (!body?.app_id) return json({ ok: false, error: "app_id required" }, 400);

    const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 200);
    const offset = Math.max(Number(body.offset ?? 0), 0);

    // ✅ view ya agregada con descargas
    let q = sb
      .from("debacu_eval_audit_exports_with_downloads")
      .select("*")
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    // ✅ NO existe app_id en la view, así que lo mapeamos a filter_source
    const source = mapAppIdToSource(body.app_id);
    if (source) q = q.eq("filter_source", source);

    // filtros existentes en tu view
    if (body.customer_id) q = q.eq("filter_customer", String(body.customer_id));
    if (body.format) q = q.eq("format", String(body.format));
    if (body.type) q = q.eq("filter_type", String(body.type));
    if (body.from) q = q.gte("filter_from", body.from);
    if (body.to) q = q.lte("filter_to", body.to);

    // provided_to_type: tu view tiene delivered_to_*; si no tienes un campo específico,
    // aquí no podemos filtrar "bien" sin añadir columna / vista. Lo dejamos sin filtrar.
    if (body.provided_to_type) {
      // ejemplo si algún día lo añades:
      // q = q.eq("provided_to_type", body.provided_to_type)
    }

    if (body.q) {
      // búsqueda simple por storage_path / delivered_to_* / reason
      const term = String(body.q).replace(/[%_]/g, "\\$&");
      q = q.or(
        `storage_path.ilike.%${term}%,delivered_to_name.ilike.%${term}%,delivered_to_org.ilike.%${term}%,delivered_to_reason.ilike.%${term}%`
      );
    }

    const { data, error } = await q;
    if (error) return json({ ok: false, error: error.message }, 400);

    // ✅ mapeo para que cuadre con ExportRow del frontend
    const rows = (data ?? []).map((r: any) => ({
      id: r.id,
      created_at: r.created_at,

      // devolvemos el app_id que mandó el front (aunque no exista en DB)
      app_id: body.app_id,
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

      // si tu view trae algo tipo download_count/last_downloaded_at, lo puedes incluir aquí
      // download_count: r.download_count ?? null,
      // last_downloaded_at: r.last_downloaded_at ?? null,
      // last_downloaded_by_email: r.last_downloaded_by_email ?? null,
    }));

    return json({ ok: true, data: rows });
  } catch (e: any) {
    return json({ ok: false, error: e?.message || "Unexpected error" }, 500);
  }
});
