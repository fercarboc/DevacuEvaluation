// supabase/functions/debacu_eval_org_members_list/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

type Role = "OWNER" | "ADMIN" | "STAFF";

function supabaseService() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function err(req: Request, status: number, detail:
  | "UNAUTHENTICATED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "missing_org_id"
  | "invalid_org_id"
  | "request_failed",
) {
  return json(req, status, { ok: false, error: "request_failed", detail });
}

async function resolvePrivilegedOrgId(
  sb: ReturnType<typeof supabaseService>,
  userId: string,
  orgIdFromBody?: string | null,
): Promise<string | null> {
  const base = sb
    .from("debacu_eval_org_members")
    .select("org_id, role, status, created_at")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .in("role", ["OWNER", "ADMIN"]);

  if (orgIdFromBody) {
    const { data, error } = await base.eq("org_id", orgIdFromBody).maybeSingle();
    if (error || !data) return null;
    return data.org_id as string;
  }

  // Fallback determinista: primera membership ACTIVE (OWNER/ADMIN) por created_at asc
  const { data, error } = await base.order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (error || !data) return null;
  return data.org_id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "request_failed", detail: "METHOD_NOT_ALLOWED" });

  // Auth JWT-only
  const user = await requireUser(req).catch(() => null);
  if (!user?.id) return err(req, 401, "UNAUTHENTICATED");

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const org_id_in = (body?.org_id ?? null) as string | null;

  const sb = supabaseService();

  // Multi-org: si viene org_id lo validamos; si no, fallback determinista.
  const orgId = await resolvePrivilegedOrgId(sb, user.id, org_id_in);
  if (!orgId) {
    // Si enviaron org_id y no tienen membership -> FORBIDDEN
    // Si no enviaron, también FORBIDDEN (no hay org privilegiada)
    return err(req, 403, "FORBIDDEN");
  }

  // 1) Members (sin join)
  const { data: members, error: membersErr } = await sb
    .from("debacu_eval_org_members")
    .select("id, created_at, org_id, user_id, role, status, invited_email, created_by_user_id, updated_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });

  if (membersErr) return err(req, 500, "request_failed");

  const memberRows = members ?? [];
  const memberIds = memberRows.map((m: any) => m.id).filter(Boolean);

  // 2) Profiles (2ª query + map)
  // Nota: asumimos FK típica org_member_id; si tu columna se llama distinto, cámbiala aquí.
  let profilesByMemberId = new Map<string, any>();
  if (memberIds.length > 0) {
    const { data: profiles, error: profErr } = await sb
      .from("debacu_eval_org_member_profiles")
      .select("org_member_id, first_name, last_name, title, phone")
      .in("org_member_id", memberIds);

    if (profErr) return err(req, 500, "request_failed");

    for (const p of (profiles ?? []) as any[]) {
      if (p?.org_member_id) profilesByMemberId.set(p.org_member_id, p);
    }
  }

  const membersOut = memberRows.map((m: any) => ({
    ...m,
    profile: profilesByMemberId.get(m.id) ?? null,
  }));

  // 3) Entitlements (ya tienes la view)
  const { data: ent, error: entErr } = await sb
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, plan_code, subscription_status, max_users, seats_used, seats_available")
    .eq("org_id", orgId)
    .maybeSingle();

  if (entErr) return err(req, 500, "request_failed");

  return json(req, 200, {
    ok: true,
    data: {
      org_id: orgId,
      members: membersOut,
      entitlements: ent ?? null,
    },
  });
});
