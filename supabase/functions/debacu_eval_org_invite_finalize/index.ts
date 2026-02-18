// supabase/functions/debacu_eval_org_invite_accept/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

type Body = {
  org_id?: string | null;
  orgId?: string | null;
};

function err(code: string) {
  return { ok: false, error: "request_failed", detail: code };
}
function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}
function safeLowerEmail(v: any) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, err("method_not_allowed"));

  try {
    const user = await requireUser(req);

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return json(req, 400, err("invalid_json"));

    const orgIdFromBody = safeStr(body.org_id ?? body.orgId) || null;

    const email = safeLowerEmail(user.email);
    if (!email) return json(req, 400, err("invalid_user_email"));

    const supabase = supabaseServiceClient();
    const nowIso = new Date().toISOString();

    // 0) Si viene org_id, idempotencia: ¿ya está ACTIVE en ese org?
    if (orgIdFromBody) {
      const { data: already, error: aErr } = await supabase
        .from("debacu_eval_org_members")
        .select("id, org_id, status")
        .eq("org_id", orgIdFromBody)
        .eq("auth_user_id", user.id) // ⚠️ si tu columna real es user_id, cambia aquí
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (aErr) return json(req, 500, err("db_read_failed"));
      if (already?.id) return json(req, 200, { ok: true, mode: "ALREADY_ACTIVE", org_id: already.org_id });
    }

    // 1) Buscar INVITED por invited_email (y org_id si viene)
    let q = supabase
      .from("debacu_eval_org_members")
      .select("id, org_id, status, role, invited_email, auth_user_id, created_at")
      .eq("status", "INVITED")
      .eq("invited_email", email);

    if (orgIdFromBody) q = q.eq("org_id", orgIdFromBody);

    const { data: invite, error: invErr } = await q
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (invErr) return json(req, 500, err("db_read_failed"));
    if (!invite?.id) {
      // idempotencia global: si ya está ACTIVE en algún org, devuélvelo; si no, 404
      const { data: active, error: actErr } = await supabase
        .from("debacu_eval_org_members")
        .select("id, org_id, status, created_at")
        .eq("status", "ACTIVE")
        .eq("auth_user_id", user.id) // ⚠️ si tu columna real es user_id, cambia aquí
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (actErr) return json(req, 500, err("db_read_failed"));
      if (active?.id) return json(req, 200, { ok: true, mode: "ALREADY_ACTIVE", org_id: active.org_id });

      return json(req, 404, err("invite_not_found"));
    }

    // 2) Activar: INVITED -> ACTIVE + set auth_user_id
    const { error: updErr } = await supabase
      .from("debacu_eval_org_members")
      .update({
        status: "ACTIVE",
        auth_user_id: user.id, // ⚠️ si tu columna real es user_id, cambia aquí
        updated_at: nowIso,
      })
      .eq("id", invite.id);

    if (updErr) {
      // Conflictos típicos de unique (p.ej. ya existe ACTIVE para ese org/user)
      return json(req, 409, err("activation_conflict"));
    }

    return json(req, 200, { ok: true, mode: "ACTIVATED", org_id: invite.org_id });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "");
    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, err("UNAUTHENTICATED"));
    }
    return json(req, 500, err("internal_error"));
  }
});
