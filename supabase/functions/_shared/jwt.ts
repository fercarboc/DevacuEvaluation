import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

export type JwtCtx = {
  user_id: string;
  customer_id: string; // org_id en tu modelo
  role: "OWNER" | "ADMIN" | "STAFF";
  app_code: string;
};

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

function getBearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? "";
}

export function getServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${SERVICE_ROLE}` } },
  });
}

/**
 * JWT-only:
 * - valida JWT (usuario logado)
 * - resuelve customer_id/org_id mirando debacu_eval_org_members
 */
export async function requireJwtOrg(req: Request, appCode = "DEBACU_EVAL"): Promise<JwtCtx> {
  const jwt = getBearer(req);
  if (!jwt) throw new Error("missing_bearer_jwt");

  const sb = getServiceClient();

  // 1) validar JWT
  const { data: u, error: uErr } = await sb.auth.getUser(jwt);
  if (uErr || !u?.user) throw new Error("invalid_supabase_jwt");

  const userId = u.user.id;

  // 2) resolver org/customer desde membresía
  // ✅ Asumo que tienes (o vas a tener) auth_user_id en org_members.
  const { data: mem, error: mErr } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, role, status, app_code")
    .eq("auth_user_id", userId)
    .eq("status", "ACTIVE")
    .eq("app_code", appCode)
    .maybeSingle();

  if (mErr) throw new Error(`member_lookup_failed: ${mErr.message}`);
  if (!mem?.org_id) throw new Error("user_has_no_active_org");

  return {
    user_id: userId,
    customer_id: String(mem.org_id),
    role: (mem.role ?? "STAFF") as any,
    app_code: appCode,
  };
}
