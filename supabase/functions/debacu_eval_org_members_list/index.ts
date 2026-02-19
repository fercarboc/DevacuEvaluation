// supabase/functions/debacu_eval_org_members_list/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

type Role = "OWNER" | "ADMIN" | "STAFF";

function err(
  req: Request,
  status: number,
  detail:
    | "UNAUTHENTICATED"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "missing_org_id"
    | "invalid_org_id"
    | "request_failed"
    | "METHOD_NOT_ALLOWED",
) {
  return json(req, status, { ok: false, error: "request_failed", detail });
}

/**
 * En algunos despliegues tu columna se llama auth_user_id (no user_id).
 * Probamos ambas opciones de forma determinista.
 */
async function resolvePrivilegedOrgId(
  sb: ReturnType<typeof createClient>,
  userId: string,
  orgIdFromBody?: string | null,
): Promise<string | null> {
  async function tryWithUserCol(userCol: "user_id" | "auth_user_id") {
    const base = sb
      .from("debacu_eval_org_members")
      .select("org_id, role, status, created_at")
      .eq(userCol, userId)
      .eq("status", "ACTIVE")
      .in("role", ["OWNER", "ADMIN"]);

    if (orgIdFromBody) {
      const { data, error } = await base.eq("org_id", orgIdFromBody).maybeSingle();
      if (error || !data?.org_id) return null;
      return String(data.org_id);
    }

    const { data, error } = await base
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data?.org_id) return null;
    return String(data.org_id);
  }

  // 1) Intento con user_id
  const a = await tryWithUserCol("user_id");
  if (a) return a;

  // 2) Fallback con auth_user_id
  const b = await tryWithUserCol("auth_user_id");
  if (b) return b;

  return null;
}

export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return err(req, 405, "METHOD_NOT_ALLOWED");

  // JWT-only
  const user = await requireUser(req).catch(() => null);
  if (!user?.id) return err(req, 401, "UNAUTHENTICATED");

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const org_id_in = (body?.org_id ?? null) as string | null;

  // Service role client (recomendado para listar miembros + perfiles sin RLS líos)
  // Si prefieres no usarlo, cambia a createClient con SERVICE_ROLE_KEY como en tu versión.
  const sb = supabaseServiceClient();

  const orgId = await resolvePrivilegedOrgId(sb, user.id, org_id_in);
  if (!orgId) return err(req, 403, "FORBIDDEN");

  // 1) Members (sin join)
  const { data: members, error: membersErr } = await sb
    .from("debacu_eval_org_members")
    .select("id, created_at, org_id, user_id, auth_user_id, role, status, invited_email, created_by_user_id, updated_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (membersErr) {
    console.error("MEMBERS_QUERY_FAILED", membersErr);
    return err(req, 500, "request_failed");
  }

  const memberRows = (members ?? []) as any[];
  const memberIds = memberRows.map((m) => m.id).filter(Boolean);

  // 2) Profiles (tabla real: debacu_eval_org_member_profiles)
  // Columnas reales (según tu screenshot): member_id, org_id, first_name, last_name, title, phone, created_at, updated_at
  const profilesByMemberId = new Map<string, any>();

  if (memberIds.length > 0) {
    const { data: profiles, error: profErr } = await sb
      .from("debacu_eval_org_member_profiles")
      .select("member_id, org_id, first_name, last_name, title, phone")
      .eq("org_id", orgId) // buena práctica: asegura tenant
      .in("member_id", memberIds);

    if (profErr) {
      console.error("PROFILES_QUERY_FAILED", profErr);
      return err(req, 500, "request_failed");
    }

    for (const p of (profiles ?? []) as any[]) {
      if (p?.member_id) profilesByMemberId.set(String(p.member_id), p);
    }
  }

  const membersOut = memberRows.map((m) => ({
    ...m,
    profile: profilesByMemberId.get(String(m.id)) ?? null,
  }));

  // 3) Entitlements (view real)
  const { data: ent, error: entErr } = await sb
    .from("debacu_eval_org_entitlements_v")
    .select(
      "org_id, customer_id, plan_code, subscription_status, max_users, extra_seats, seats_total, seats_used, seats_available",
    )
    .eq("org_id", orgId)
    .maybeSingle();

  if (entErr) {
    console.error("ENTITLEMENTS_QUERY_FAILED", entErr);
    return err(req, 500, "request_failed");
  }

  return json(req, 200, {
    ok: true,
    data: {
      org_id: orgId,
      members: membersOut,
      entitlements: ent ?? null,
    },
  });
});
