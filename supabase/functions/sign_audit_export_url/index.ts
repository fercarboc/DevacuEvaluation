// supabase/functions/admin_audit_export_signed_url/index.ts
// (ponle el nombre que uses en tu repo)
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireAdmin, supabaseServiceClient } from "../_shared/auth.ts";

type Body = {
  export_id?: string;
  expires_seconds?: number;
};

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function clampInt(n: unknown, min: number, max: number, def: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return def;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

function fail(req: Request, status: number, detail: string, extra?: Record<string, unknown>) {
  return json(req, status, { ok: false, error: "request_failed", detail, ...(extra ?? {}) });
}

async function readJsonSafe<T>(req: Request): Promise<T> {
  try {
    const t = await req.text();
    if (!t) return {} as T;
    return JSON.parse(t) as T;
  } catch {
    return {} as T;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed");

  // 1) ADMIN JWT-only (sin emails hardcode)
  let adminUser: any;
  try {
    const r = await requireAdmin(req);
    adminUser = r.user;
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") return fail(req, 401, "UNAUTHORIZED");
    return fail(req, 403, "FORBIDDEN");
  }

  // 2) body
  const body = await readJsonSafe<Body>(req);
  const export_id = safeStr(body.export_id);
  if (!export_id) return fail(req, 400, "missing_export_id");

  // 3) expires clamp: 60..3600, default 600
  const expires = clampInt(body.expires_seconds, 60, 3600, 600);

  // 4) service role (DB + Storage)
  const sb = supabaseServiceClient();

  // 5) load export
  const { data: exp, error: expErr } = await sb
    .from("debacu_eval_audit_exports")
    .select("id, storage_bucket, storage_path")
    .eq("id", export_id)
    .maybeSingle();

  if (expErr) return fail(req, 500, "DB_ERROR");
  if (!exp?.id) return fail(req, 404, "EXPORT_NOT_FOUND");

  const bucket = safeStr((exp as any).storage_bucket);
  const path = safeStr((exp as any).storage_path);
  if (!bucket || !path) return fail(req, 500, "DATA_INCONSISTENT");

  // 6) download log (trazabilidad real)
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;

  const userAgent = req.headers.get("user-agent") ?? null;

  const { error: logErr } = await sb
    .from("debacu_eval_audit_export_downloads")
    .insert({
      export_id: exp.id,
      downloaded_by: adminUser.id,
      ip,
      user_agent: userAgent,
    });

  if (logErr) return fail(req, 500, "DB_ERROR");

  // 7) signed url
  const { data: signed, error: signErr } = await sb.storage
    .from(bucket)
    .createSignedUrl(path, expires);

  if (signErr) return fail(req, 500, "STORAGE_SIGN_FAILED");

  return json(req, 200, {
    ok: true,
    data: {
      signed_url: signed?.signedUrl ?? null,
      expires_seconds: expires,
    },
  });
});
