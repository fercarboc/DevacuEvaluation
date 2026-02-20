// supabase/functions/debacu_eval_org_members_list/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

/**
 * Privileged org resolution:
 * - Requiere OWNER/ADMIN + status ACTIVE
 * - FIX: acepta user_id OR auth_user_id (sin suposiciones de esquema)
 */
async function resolvePrivilegedOrgIdOrThrow(params: {
  admin: ReturnType<typeof supabaseServiceClient>;
  userId: string;
  orgIdFromBody?: string | null;
}): Promise<{ org_id: string; resolved_by: "requested" | "first_active" }> {
  const { admin, userId, orgIdFromBody } = params;
  const uid = String(userId);
  const requested = (orgIdFromBody ?? "").trim() || null;

  if (requested && !isUuid(requested)) throw new Error("invalid_org_id");

  // Base query: membership privileged
  const base = admin
    .from("debacu_eval_org_members")
    .select("org_id, role, status, created_at")
    .or(`user_id.eq.${uid},auth_user_id.eq.${uid}`)
    .eq("status", "ACTIVE")
    .in("role", ["OWNER", "ADMIN"]);

  if (requested) {
    const { data, error } = await base.eq("org_id", requested).maybeSingle();
    if (error) throw new Error("request_failed");
    if (!data?.org_id) throw new Error("FORBIDDEN");
    return { org_id: String(data.org_id), resolved_by: "requested" };
  }

  const { data, error } = await base
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("request_failed");
  if (!data?.org_id) throw new Error("FORBIDDEN");
  return { org_id: String(data.org_id), resolved_by: "first_active" };
}

export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return err(req, 405, "METHOD_NOT_ALLOWED");

  const admin = supabaseServiceClient();

  try {
    const user = await requireUser(req);

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const org_id_in = (body?.org_id ?? null) as string | null;

    const { org_id: orgId, resolved_by: org_id_resolved_by } = await resolvePrivilegedOrgIdOrThrow({
      admin,
      userId: user.id,
      orgIdFromBody: org_id_in,
    });

    // 1) Members
    const { data: members, error: membersErr } = await admin
      .from("debacu_eval_org_members")
      .select("id, created_at, org_id, user_id, auth_user_id, role, status, invited_email, created_by_user_id, updated_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: true });

    if (membersErr) {
      console.error("MEMBERS_QUERY_FAILED", membersErr);
      throw new Error("request_failed");
    }

    const memberRows = (members ?? []) as any[];
    const memberIds = memberRows.map((m) => m.id).filter(Boolean);

    // 2) Profiles
    const profilesByMemberId = new Map<string, any>();

    if (memberIds.length > 0) {
      const { data: profiles, error: profErr } = await admin
        .from("debacu_eval_org_member_profiles")
        .select("member_id, org_id, first_name, last_name, title, phone")
        .eq("org_id", orgId)
        .in("member_id", memberIds);

      if (profErr) {
        console.error("PROFILES_QUERY_FAILED", profErr);
        throw new Error("request_failed");
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
    const { data: ent, error: entErr } = await admin
      .from("debacu_eval_org_entitlements_v")
      .select("org_id, customer_id, plan_code, subscription_status, max_users, extra_seats, seats_total, seats_used, seats_available")
      .eq("org_id", orgId)
      .maybeSingle();

    if (entErr) {
      console.error("ENTITLEMENTS_QUERY_FAILED", entErr);
      throw new Error("request_failed");
    }

    return json(req, 200, {
      ok: true,
      data: {
        org_id: orgId,
        org_id_resolved_by,
        members: membersOut,
        entitlements: ent ?? null,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") return err(req, 401, "UNAUTHENTICATED");
    if (msg === "invalid_org_id") return err(req, 400, "invalid_org_id");
    if (msg === "FORBIDDEN") return err(req, 403, "FORBIDDEN");

    console.error("debacu_eval_org_members_list error:", msg);
    return err(req, 500, "request_failed");
  }
});