// supabase/functions/debacu_eval_audit_export_signed_url/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireAdmin, supabaseServiceClient } from "../_shared/auth.ts";

type Body = {
  export_id: string;
  expires_seconds?: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

async function readJsonSafe<T>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "request_failed", detail: "METHOD_NOT_ALLOWED" });
  }

  // ✅ Admin JWT-only (sin email hardcode)
  let adminUser: any;
  try {
    const admin = await requireAdmin(req);
    adminUser = (admin as any)?.user ?? admin;
  } catch (e: any) {
    const msg = e?.message ?? "";
    const status = msg === "UNAUTHENTICATED" ? 401 : 403;
    const detail = status === 401 ? "UNAUTHENTICATED" : "FORBIDDEN";
    return json(req, status, { ok: false, error: "request_failed", detail });
  }

  const body = await readJsonSafe<Body>(req);
  if (!body) {
    return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_json" });
  }

  const export_id = safeStr(body.export_id);
  if (!export_id) {
    return json(req, 400, { ok: false, error: "request_failed", detail: "missing_export_id" });
  }

  const expires = clamp(Number(body.expires_seconds ?? 600), 60, 3600);

  const sb = supabaseServiceClient();

  // 1) buscar export
  const { data: exp, error: expErr } = await sb
    .from("debacu_eval_audit_exports")
    .select("id, storage_bucket, storage_path")
    .eq("id", export_id)
    .maybeSingle();

  if (expErr) {
    return json(req, 500, { ok: false, error: "request_failed", detail: "DB_READ_FAILED" });
  }
  if (!exp?.storage_bucket || !exp?.storage_path) {
    return json(req, 404, { ok: false, error: "request_failed", detail: "EXPORT_NOT_FOUND" });
  }

  // 2) log download (best-effort o hard-fail?)
  // Aquí lo dejo como HARD-FAIL, porque dijiste “trazabilidad”.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null;

  const userAgent = req.headers.get("user-agent") ?? null;

  const { error: logErr } = await sb.from("debacu_eval_audit_export_downloads").insert({
    export_id,
    downloaded_by: adminUser?.id ?? null,
    downloaded_by_email: (adminUser?.email ?? "").toLowerCase() || null,
    ip,
    user_agent: userAgent,
  });

  if (logErr) {
    return json(req, 500, { ok: false, error: "request_failed", detail: "DOWNLOAD_LOG_FAILED" });
  }

  // 3) signed url
  const { data: signed, error: signErr } = await sb.storage
    .from(exp.storage_bucket)
    .createSignedUrl(exp.storage_path, expires);

  if (signErr) {
    return json(req, 500, { ok: false, error: "request_failed", detail: "SIGNED_URL_FAILED" });
  }

  return json(req, 200, {
    ok: true,
    data: {
      export_id,
      signed_url: signed?.signedUrl ?? null,
      expires_seconds: expires,
    },
  });
});
