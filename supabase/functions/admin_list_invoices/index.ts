// supabase/functions/admin_list_invoices/index.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json, preflight } from "../_shared/cors.ts";

function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SRV_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

function getBearer(req: Request) {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function parseAllowedEmails(csv: string | null) {
  const raw = (csv ?? "").trim();
  if (!raw) return ["admin@debacu.com"];
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function sbUser(token: string) {
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
}

function sbSrv() {
  return createClient(SUPABASE_URL, SRV_KEY, { auth: { persistSession: false } });
}

async function requireAdmin(req: Request) {
  const token = getBearer(req);
  if (!token) return { ok: false as const, status: 401, error: "missing_bearer" };

  const userClient = sbUser(token);
  const { data: u, error: uErr } = await userClient.auth.getUser();
  if (uErr || !u?.user) return { ok: false as const, status: 401, error: "invalid_token" };

  const allowed = parseAllowedEmails(Deno.env.get("ADMIN_EMAILS"));
  const email = (u.user.email ?? "").toLowerCase().trim();
  if (!allowed.includes(email)) return { ok: false as const, status: 403, error: "forbidden" };

  return { ok: true as const, user: u.user };
}

type Body = {
  app_id?: string | null;
  customer_id?: string | null;
  status?: string | null;
  limit?: number;
  offset?: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  const admin = await requireAdmin(req);
  if (!admin.ok) return json(req, admin.status, { ok: false, error: admin.error });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;

    const appId = String(body.app_id ?? "DEBACU_EVAL");
    const limit = Math.min(Math.max(Number(body.limit ?? 50), 1), 200);
    const offset = Math.max(Number(body.offset ?? 0), 0);

    const sb = sbSrv();

    let q = sb
      .from("debacu_eval_invoices")
      .select(
        [
          "id",
          "app_id",
          "customer_id",
          "stripe_invoice_id",
          "invoice_number",
          "invoice_created_at",
          "status",
          "amount_total",
          "currency",
          "hosted_invoice_url",
          "invoice_pdf",
          "created_at",
        ].join(","),
        { count: "exact" }
      )
      .eq("app_id", appId)
      .order("invoice_created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (body.customer_id) q = q.eq("customer_id", body.customer_id);
    if (body.status) q = q.eq("status", body.status);

    const { data, error, count } = await q;

    if (error) return json(req, 500, { ok: false, error: "db_error", detail: error.message });

    return json(req, 200, {
      ok: true,
      data: {
        rows: data ?? [],
        count: count ?? 0,
        limit,
        offset,
      },
    });
  } catch (e: any) {
    return json(req, 500, { ok: false, error: "unexpected", detail: e?.message ?? String(e) });
  }
});
