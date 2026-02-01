// supabase/functions/admin_list_config_changes/index.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// =======================
// CORS (simple y seguro)
// =======================
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
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(req) },
  });
}

// =======================
// Env + helpers
// =======================
function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const SUPABASE_ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

function getBearer(req: Request) {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function parseAllowedEmails(csv: string | null) {
  const raw = (csv ?? "").trim();
  if (!raw) return ["admin@debacu.com"];
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function supabaseUserClient(token: string) {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });
}

function supabaseServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function requireAdmin(req: Request) {
  const token = getBearer(req);
  if (!token) return { ok: false as const, status: 401, error: "missing_bearer" as const };

  const sbUser = supabaseUserClient(token);

  const { data: userData, error: userErr } = await sbUser.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false as const, status: 401, error: "invalid_token" as const };
  }

  const allowed = parseAllowedEmails(Deno.env.get("ADMIN_EMAILS"));
  const email = (userData.user.email ?? "").toLowerCase().trim();
  const isAdmin = allowed.includes(email);

  if (!isAdmin) return { ok: false as const, status: 403, error: "forbidden" as const };

  return { ok: true as const, user: userData.user };
}

// =======================
// diff helpers (ignora campos "ruido")
// =======================
const IGNORE_KEYS = new Set([
  "updated_at",
  "created_at",
  "updated_by",
  "id",
]);

function normalizeObj(v: any) {
  if (!v || typeof v !== "object") return {};
  return v;
}

function buildDiffSummary(oldValues: any, newValues: any) {
  const oldObj = normalizeObj(oldValues);
  const newObj = normalizeObj(newValues);

  const keys = new Set<string>([
    ...Object.keys(oldObj),
    ...Object.keys(newObj),
  ]);

  const changes: Array<{ key: string; from: any; to: any }> = [];

  for (const k of keys) {
    if (IGNORE_KEYS.has(k)) continue;

    const a = oldObj[k];
    const b = newObj[k];

    // jsonb values: comparo por JSON string estable
    const aj = JSON.stringify(a);
    const bj = JSON.stringify(b);

    if (aj !== bj) changes.push({ key: k, from: a, to: b });
  }

  // summary corto para UI
  const parts = changes.slice(0, 6).map((c) => `${c.key}: ${c.from} -> ${c.to}`);
  const summary = parts.join(" · ") + (changes.length > 6 ? ` · +${changes.length - 6} más` : "");

  return { changes, summary, count: changes.length };
}

// =======================
// Main
// =======================
type RowOut = {
  audit_id: string;
  abuse_settings_id: string | null;
  created_at: string;
  actor_name: string | null;
  changes_count: number;
  changes_summary: string;
  changes?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  const admin = await requireAdmin(req);
  if (!admin.ok) return json(req, admin.status, { ok: false, error: admin.error });

  try {
    const body = await req.json().catch(() => ({}));
    const from = body?.from ? String(body.from) : null; // yyyy-mm-dd
    const to = body?.to ? String(body.to) : null;       // yyyy-mm-dd
    const limit = Math.min(Math.max(Number(body?.limit ?? 500), 1), 500);

    const sb = supabaseServiceClient();

    // Fuente real: settings_audit_log (ahí están los cambios)
    let q = sb
      .from("settings_audit_log")
      .select("id, table_name, record_id, action, old_values, new_values, changed_by, changed_at")
      .eq("table_name", "abuse_settings")
      .eq("action", "UPDATE")
      .order("changed_at", { ascending: false })
      .limit(limit);

    if (from) q = q.gte("changed_at", `${from}T00:00:00Z`);
    if (to) q = q.lte("changed_at", `${to}T23:59:59Z`);

    const { data, error } = await q;
    if (error) return json(req, 500, { ok: false, error: "db_error", detail: error.message });

    const rows: RowOut[] = (data ?? []).map((r: any) => {
      const diff = buildDiffSummary(r.old_values ?? {}, r.new_values ?? {});
      const actorName = r.changed_by ? String(r.changed_by) : null;

      return {
        audit_id: String(r.id),
        abuse_settings_id: r.record_id ? String(r.record_id) : null,
        created_at: String(r.changed_at),
        actor_name: actorName,
        changes_count: diff.count,
        changes_summary: diff.summary || "Sin cambios relevantes",
        changes: diff.count ? JSON.stringify(diff.changes) : null,
      };
    });

    return json(req, 200, { ok: true, rows });
  } catch (e: any) {
    return json(req, 500, { ok: false, error: "unexpected", detail: e?.message ?? String(e) });
  }
});
