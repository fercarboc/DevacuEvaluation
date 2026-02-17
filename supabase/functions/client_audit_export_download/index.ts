// supabase/functions/client_audit_export_download/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

const APP_ID = "DEBACU_EVAL";

function supabaseServiceClient() {
  const SUPABASE_URL = requireEnv("SUPABASE_URL");
  const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

function clampInt(v: any, def: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const i = Math.trunc(n);
  return Math.max(min, Math.min(max, i));
}

type ReqBody = {
  export_id?: string;
  org_id?: string; // opcional: si el user pertenece a varias orgs, pásalo desde UI
  expires_in_seconds?: number; // default 30min
};

async function resolveOrgIdForUser(sb: ReturnType<typeof supabaseServiceClient>, user_id: string, org_id?: string | null) {
  // Si viene org_id, validar membership
  if (org_id) {
    const { data: mem, error: memErr } = await sb
      .from("debacu_eval_org_members")
      .select("org_id, status")
      .eq("org_id", org_id)
      .eq("user_id", user_id)
      .maybeSingle();

    if (memErr) throw new Error(`MEMBERSHIP_FAILED:${memErr.message}`);
    if (!mem?.org_id) throw new Error("FORBIDDEN");
    if ((mem as any).status && String((mem as any).status) !== "ACTIVE") throw new Error("FORBIDDEN");
    return String(mem.org_id);
  }

  // Si NO viene org_id, coger la primera org ACTIVE del usuario
  const { data: mems, error } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, status, created_at")
    .eq("user_id", user_id)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) throw new Error(`MEMBERSHIP_LIST_FAILED:${error.message}`);

  const active = (mems ?? []).find((m: any) => !m?.status || String(m.status) === "ACTIVE");
  if (!active?.org_id) throw new Error("FORBIDDEN_NO_ORG");

  return String(active.org_id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  try {
    // 1) JWT user (Supabase Auth)
    const user = await requireUser(req); // devuelve { id, user_id, email }
    const user_id = user.user_id;
    const user_email = user.email ?? null;

    // 2) input
    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const export_id = String(body?.export_id ?? "").trim();
    const org_id_in = body?.org_id ? String(body.org_id).trim() : null;
    const expiresIn = clampInt(body?.expires_in_seconds, 60 * 30, 60, 60 * 60 * 24);

    if (!export_id) return json(req, 400, { ok: false, error: "missing_export_id" });

    const sb = supabaseServiceClient();

    // 3) org scope (membership)
    const org_id = await resolveOrgIdForUser(sb, user_id, org_id_in);

    // 4) load export row (scoped)
    const { data: exp, error: expErr } = await sb
      .from("customer_audit_exports")
      .select(
        [
          "id",
          "org_id",
          "app_id",
          "export_type",
          "export_scope",
          "period_from",
          "period_to",
          "row_count",
          "sha256",
          "file_size_bytes",
          "storage_bucket",
          "storage_path",
          "status",
          "created_at",
        ].join(","),
      )
      .eq("id", export_id)
      .eq("org_id", org_id)
      .eq("app_id", APP_ID)
      .maybeSingle();

    if (expErr) throw new Error(`EXPORT_LOOKUP_FAILED:${expErr.message}`);
    if (!exp?.id) return json(req, 404, { ok: false, error: "export_not_found" });

    if (String((exp as any).status ?? "") !== "READY") {
      return json(req, 409, { ok: false, error: "export_not_ready", status: (exp as any).status ?? null });
    }

    const bucket = String((exp as any).storage_bucket ?? "").trim();
    const path = String((exp as any).storage_path ?? "").trim();
    if (!bucket || !path) throw new Error("EXPORT_MISSING_STORAGE_FIELDS");

    // 5) signed url (service role)
    const { data: signed, error: sErr } = await sb.storage.from(bucket).createSignedUrl(path, expiresIn);
    if (sErr || !signed?.signedUrl) throw new Error(`SIGNED_URL_FAILED:${sErr?.message ?? "no_signed_url"}`);

    // 6) audit log (best effort, NO bloquea)
    try {
      await sb.from("debacu_eval_audit_log").insert({
        actor_user_id: user_id,
        action: "EXPORT_DOWNLOADED",
        entity: "AUDIT_EXPORT",
        entity_id: export_id,
        meta: {
          export_id,
          org_id,
          storage_bucket: bucket,
          storage_path: path,
          expires_in_seconds: expiresIn,
        },
        customer_id: null, // si aquí guardas customer_id, cámbialo por tu campo real
        app_id: APP_ID,
        event_type: "AUDIT_EXPORT",
        evaluation_id: null,
        search_kind: null,
        search_value_masked: null,
        search_value_hash: null,
        result_count: null,
        actor_email: user_email, // si tu tabla NO tiene actor_email, quita esta línea
      } as any);
    } catch {
      // ignore
    }

    return json(req, 200, {
      ok: true,
      data: {
        export_id: String((exp as any).id),
        org_id,
        signed_url: signed.signedUrl,
        expires_in_seconds: expiresIn,

        export_type: (exp as any).export_type ?? null,
        export_scope: (exp as any).export_scope ?? null,
        period_from: (exp as any).period_from ?? null,
        period_to: (exp as any).period_to ?? null,
        row_count: (exp as any).row_count ?? null,
        sha256: (exp as any).sha256 ?? null,
        file_size_bytes: (exp as any).file_size_bytes ?? null,
        storage_bucket: bucket,
        storage_path: path,
        created_at: (exp as any).created_at ?? null,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "UNAUTHORIZED" || msg === "missing_bearer" || msg === "invalid_token") {
      return json(req, 401, { ok: false, error: "unauthorized" });
    }
    if (msg.startsWith("FORBIDDEN")) {
      return json(req, 403, { ok: false, error: "forbidden", detail: msg });
    }
    if (msg.startsWith("EXPORT_LOOKUP_FAILED") || msg.startsWith("SIGNED_URL_FAILED")) {
      return json(req, 500, { ok: false, error: "server_error", detail: msg });
    }
    if (msg === "EXPORT_MISSING_STORAGE_FIELDS") {
      return json(req, 500, { ok: false, error: "server_error", detail: msg });
    }

    return json(req, 500, { ok: false, error: "unexpected", detail: msg });
  }
});
