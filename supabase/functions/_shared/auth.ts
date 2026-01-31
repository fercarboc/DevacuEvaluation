// supabase/functions/_shared/auth.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export function supabaseUserClient(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
}

export function supabaseServiceClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

function getBearer(req: Request) {
  const h = req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

export async function requireUser(req: Request) {
  const token = getBearer(req);
  if (!token) return { ok: false as const, reason: "unauthorized" as const };

  const sbUser = supabaseUserClient(req);
  const { data, error } = await sbUser.auth.getUser(token);
  if (error || !data?.user) return { ok: false as const, reason: "unauthorized" as const };

  return { ok: true as const, user: data.user, sbUser };
}

export async function requireAdmin(req: Request) {
  const base = await requireUser(req);
  if (!base.ok) return base;

  // ✅ Fuente de verdad: RPC is_admin() en DB (SECURITY DEFINER + admin_users)
  const { data, error } = await base.sbUser.rpc("is_admin");
  if (error || !data) return { ok: false as const, reason: "forbidden" as const };

  return { ok: true as const, user: base.user };
}
