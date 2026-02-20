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

function err(code: string, detail?: string, extra?: Record<string, unknown>) {
  return {
    ok: false,
    error: "request_failed",
    detail: detail ? `${code}:${detail}` : code,
    ...(extra ?? {}),
  };
}

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}
function safeLower(v: any) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
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

    const userId = safeStr(user?.id);
    const userEmail = safeLower((user as any)?.email);

    if (!userId) return json(req, 401, err("UNAUTHENTICATED"));

    const sb = supabaseServiceClient();

    // 1) Cargar org y customer_id
    const { data: org, error: orgErr } = await sb
      .from("debacu_eval_organizations")
      .select("id, customer_id")
      .eq("id", orgId)
      .maybeSingle();

    if (orgErr) return json(req, 500, err("db_read_failed", "ORG_READ"));
    if (!org?.id) return json(req, 404, err("org_not_found"));
    if (!org.customer_id) return json(req, 409, err("org_missing_customer_id"));

    // 2) Buscar membership en ESTA org (canónico primero)
    // 2.1) por auth_user_id
    const { data: mAuth, error: mAuthErr } = await sb
      .from("debacu_eval_org_members")
      .select("id, role, status, user_id, auth_user_id, invited_email")
      .eq("org_id", orgId)
      .eq("auth_user_id", userId)
      .maybeSingle();

    if (mAuthErr) return json(req, 500, err("db_read_failed", "MEM_READ_AUTH"));

    // 2.2) por user_id legacy
    const { data: mLegacy, error: mLegacyErr } = await sb
      .from("debacu_eval_org_members")
      .select("id, role, status, user_id, auth_user_id, invited_email")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();

    if (mLegacyErr) return json(req, 500, err("db_read_failed", "MEM_READ_LEGACY"));

    // 2.3) por invited_email (fila huérfana sin ids)
    let mEmail: any = null;
    if (userEmail) {
      const { data, error } = await sb
        .from("debacu_eval_org_members")
        .select("id, role, status, user_id, auth_user_id, invited_email")
        .eq("org_id", orgId)
        .ilike("invited_email", userEmail)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (error) return json(req, 500, err("db_read_failed", "MEM_READ_EMAIL"));
      mEmail = data;
    }

    const member = mAuth?.id ? mAuth : mLegacy?.id ? mLegacy : mEmail?.id ? mEmail : null;

    if (member?.id) {
      // Si existe, lo activamos si procede y aseguramos auth_user_id
      const nextStatus = String(member.status || "").toUpperCase() === "INVITED" ? "ACTIVE" : member.status;

      const patch: Record<string, any> = {
        status: nextStatus,
        auth_user_id: userId, // ✅ canónico
        updated_at: new Date().toISOString(),
      };

      // legacy compat: si tu sistema aún usa user_id en algún sitio, lo sincronizamos
      patch.user_id = userId;

      // si no había invited_email y sí tenemos email, lo rellenamos para trazabilidad
      if (!safeLower(member.invited_email) && userEmail) patch.invited_email = userEmail;

      const { error: upErr } = await sb.from("debacu_eval_org_members").update(patch).eq("id", member.id);
      if (upErr) return json(req, 500, err("db_write_failed", "MEM_UPDATE"));

      return json(req, 200, {
        ok: true,
        app_id: appId,
        org_id: orgId,
        customer_id: org.customer_id,
      });
    }

    // 3) NO existe membership en esta org.
    // Antes de insertar: comprobar si este usuario YA tiene una ACTIVE en otra org
    const { data: otherActive, error: otherErr } = await sb
      .from("debacu_eval_org_members")
      .select("id, org_id, role, status")
      .eq("auth_user_id", userId)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (otherErr) return json(req, 500, err("db_read_failed", "MEM_OTHER_ACTIVE"));

    if (otherActive?.id && String(otherActive.org_id) !== orgId) {
      // Esto es EXACTAMENTE el caso del 23505:
      // ya hay ACTIVE para este auth_user_id en otra org -> no podemos crear otra
      return json(
        req,
        409,
        err("membership_conflict", "USER_ALREADY_ACTIVE_IN_OTHER_ORG", {
          user_id: userId,
          current_org_id: orgId,
          existing_org_id: otherActive.org_id,
          existing_member_id: otherActive.id,
        }),
      );
    }

    // 4) Insertar (solo si no hay conflicto global)
    const { count, error: cntErr } = await sb
      .from("debacu_eval_org_members")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId);

    if (cntErr) return json(req, 500, err("db_read_failed", "MEM_COUNT"));

    const membersCount = count ?? 0;
    const role = membersCount === 0 ? "OWNER" : "STAFF";

    const { error: insErr } = await sb.from("debacu_eval_org_members").insert({
      org_id: orgId,
      role,
      status: "ACTIVE",
      auth_user_id: userId, // ✅ canónico
      user_id: userId, // legacy compat (si existe la columna)
      invited_email: userEmail || null,
      updated_at: new Date().toISOString(),
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