// supabase/functions/debacu_eval_invite_finalize/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

type Body = {
  action?: string | null; // "FINALIZE"
  org_id?: string | null;
  orgId?: string | null;
  app_id?: string | null;
  appId?: string | null;
};

const APP_ID = "DEBACU_EVAL";

function err(code: string, detail?: string) {
  return { ok: false, error: "request_failed", detail: detail ? `${code}:${detail}` : code };
}

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, err("method_not_allowed"));

  try {
    const user = await requireUser(req); // JWT-only
    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) return json(req, 400, err("invalid_json"));

    const action = safeStr(body.action).toUpperCase();
    if (action && action !== "FINALIZE") return json(req, 400, err("invalid_action"));

    const orgId = safeStr(body.org_id ?? body.orgId);
    if (!orgId || !isUuid(orgId)) return json(req, 400, err("invalid_org_id"));

    const appId = safeStr(body.app_id ?? body.appId) || APP_ID;

    const supabase = supabaseServiceClient();

    // 1) Cargar org y customer_id
    const { data: org, error: orgErr } = await supabase
      .from("debacu_eval_organizations")
      .select("id, customer_id")
      .eq("id", orgId)
      .maybeSingle();

    if (orgErr) return json(req, 500, err("db_read_failed", "ORG_READ"));
    if (!org?.id) return json(req, 404, err("org_not_found"));
    if (!org.customer_id) return json(req, 409, err("org_missing_customer_id"));

    // 2) ¿Ya hay membership para este user en esta org?
    // Nota: soporte si tienes auth_user_id legacy además de user_id
    const { data: member, error: memErr } = await supabase
      .from("debacu_eval_org_members")
      .select("id, role, status, user_id, auth_user_id")
      .eq("org_id", orgId)
      .or(`user_id.eq.${user.id},auth_user_id.eq.${user.id}`)
      .maybeSingle();

    if (memErr) return json(req, 500, err("db_read_failed", "MEM_READ"));

    if (member?.id) {
      // Si existe, lo activamos si procede (INVITED -> ACTIVE) y aseguramos ids
      const patch: Record<string, any> = {
        status: member.status === "INVITED" ? "ACTIVE" : member.status,
        user_id: user.id,
        updated_at: new Date().toISOString(),
      };
      // Si mantienes auth_user_id legacy, lo sincronizamos
      patch.auth_user_id = user.id;

      const { error: upErr } = await supabase
        .from("debacu_eval_org_members")
        .update(patch)
        .eq("id", member.id);

      if (upErr) return json(req, 500, err("db_write_failed", "MEM_UPDATE"));

      return json(req, 200, {
        ok: true,
        app_id: appId,
        org_id: orgId,
        customer_id: org.customer_id,
      });
    }

    // 3) No existe membership: decidir rol (OWNER si es el primero)
    const { count, error: cntErr } = await supabase
      .from("debacu_eval_org_members")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId);

    if (cntErr) return json(req, 500, err("db_read_failed", "MEM_COUNT"));

    const membersCount = count ?? 0;
    const role = membersCount === 0 ? "OWNER" : "STAFF";

    const { error: insErr } = await supabase.from("debacu_eval_org_members").insert({
      org_id: orgId,
      user_id: user.id,
      auth_user_id: user.id, // legacy compat (si existe la columna)
      role,
      status: "ACTIVE",
    });

    if (insErr) return json(req, 500, err("db_write_failed", "MEM_INSERT"));

    return json(req, 200, {
      ok: true,
      app_id: appId,
      org_id: orgId,
      customer_id: org.customer_id,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e ?? "");
    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return json(req, 401, err("UNAUTHENTICATED"));
    }
    return json(req, 500, err("internal_error", msg.slice(0, 120)));
  }
});