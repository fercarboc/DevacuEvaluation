// supabase/functions/admin_update_system_settings/index.ts
// deno-lint-ignore-file no-explicit-any
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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(req: Request, status: number, body: any) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "content-type": "application/json; charset=utf-8" },
  });
}

function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function getBearer(req: Request) {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function parseAllowedEmails(csv: string | null) {
  const raw = (csv ?? "").trim();
  if (!raw) return ["admin@debacu.com"]; // fallback
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

async function requireAdminUser(req: Request) {
  const SUPABASE_URL = requireEnv("SUPABASE_URL");
  const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
  const ADMIN_EMAILS = Deno.env.get("ADMIN_EMAILS");

  const token = getBearer(req);
  if (!token) throw Object.assign(new Error("missing_bearer"), { status: 401 });

  const sbUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: u, error: uErr } = await sbUser.auth.getUser();
  if (uErr || !u?.user) throw Object.assign(new Error("invalid_token"), { status: 401 });

  const email = (u.user.email ?? "").toLowerCase();
  const allowed = parseAllowedEmails(ADMIN_EMAILS);
  const isAdmin = allowed.includes(email);

  if (!isAdmin) throw Object.assign(new Error("forbidden_admin_only"), { status: 403 });

  return { user_id: u.user.id, email: u.user.email ?? null };
}

function firstIp(req: Request) {
  const xf = req.headers.get("x-forwarded-for") ?? "";
  if (!xf) return null;
  return xf.split(",")[0]?.trim() || null;
}

function validate(payload: any) {
  const retention_days = Number(payload?.retention_days);
  const abuse_threshold_percent = Number(payload?.abuse_threshold_percent);
  const allow_new_access_requests = Boolean(payload?.allow_new_access_requests);

  if (!Number.isInteger(retention_days)) {
    throw Object.assign(new Error("retention_days must be integer"), { status: 400 });
  }
  if (retention_days < 30 || retention_days > 730) {
    throw Object.assign(new Error("retention_days out of range (30..730)"), { status: 400 });
  }

  if (!Number.isInteger(abuse_threshold_percent)) {
    throw Object.assign(new Error("abuse_threshold_percent must be integer"), { status: 400 });
  }
  if (abuse_threshold_percent < 1 || abuse_threshold_percent > 99) {
    throw Object.assign(new Error("abuse_threshold_percent out of range (1..99)"), { status: 400 });
  }

  return { retention_days, abuse_threshold_percent, allow_new_access_requests };
}

function buildDiff(before: any, after: any) {
  const keys = ["retention_days", "abuse_threshold_percent", "allow_new_access_requests"];
  const diff: Record<string, { before: any; after: any }> = {};
  for (const k of keys) {
    if (before?.[k] !== after?.[k]) diff[k] = { before: before?.[k], after: after?.[k] };
  }
  return diff;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  try {
    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SERVICE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

    // ✅ admin check igual que admin_whoami
    const actor = await requireAdminUser(req);

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const payload = await req.json().catch(() => ({}));
    const next = validate(payload);

    // Leer settings actuales (y asegurar singleton)
    const { data: current, error: selErr } = await sb
      .from("debacu_eval_system_settings")
      .select("retention_days, abuse_threshold_percent, allow_new_access_requests, updated_at, updated_by")
      .eq("id", "singleton")
      .maybeSingle();

    if (selErr) throw selErr;

    const before = current ?? {
      retention_days: 90,
      abuse_threshold_percent: 75,
      allow_new_access_requests: true,
      updated_at: new Date().toISOString(),
      updated_by: null,
    };

    const after = { ...before, ...next };
    const diff = buildDiff(before, after);

    if (Object.keys(diff).length === 0) {
      return json(req, 200, { ok: true, data: { settings: before, audit_id: null, unchanged: true } });
    }

    const nowIso = new Date().toISOString();

    const { data: updated, error: upErr } = await sb
      .from("debacu_eval_system_settings")
      .upsert(
        {
          id: "singleton",
          retention_days: after.retention_days,
          abuse_threshold_percent: after.abuse_threshold_percent,
          allow_new_access_requests: after.allow_new_access_requests,
          updated_at: nowIso,
          updated_by: actor.user_id,
        },
        { onConflict: "id" },
      )
      .select("retention_days, abuse_threshold_percent, allow_new_access_requests, updated_at, updated_by")
      .single();

    if (upErr) throw upErr;

    const ip = firstIp(req);
    const userAgent = req.headers.get("user-agent") ?? null;

    const { data: audit, error: insErr } = await sb
      .from("debacu_eval_settings_audit_log")
      .insert({
        actor_user_id: actor.user_id,
        actor_email: actor.email,
        action: "UPDATE_SETTINGS",
        settings_before: before,
        settings_after: updated,
        diff,
        ip,
        user_agent: userAgent,
      })
      .select("id")
      .single();

    if (insErr) throw insErr;

    return json(req, 200, {
      ok: true,
      data: {
        settings: updated,
        audit_id: audit?.id ?? null,
        unchanged: false,
      },
    });
  } catch (e: any) {
    const status = e?.status ?? 500;
    return json(req, status, { ok: false, error: "unexpected", detail: e?.message ?? String(e) });
  }
});
