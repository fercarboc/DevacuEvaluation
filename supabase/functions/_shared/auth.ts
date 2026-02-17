// supabase/functions/_shared/auth.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/**
 * Cliente “USER”: se crea con ANON, pero usa el JWT del request para identidad (auth.getUser()).
 * No usa service role nunca.
 */
export function supabaseUserClient(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, ANON_KEY, {
    global: {
      headers: {
        Authorization: auth,
        apikey: ANON_KEY,
      },
    },
  });
}

/**
 * Cliente “ADMIN/DB”: service-role SOLO para lectura/escritura de tablas admin internas,
 * checks y queries que no deben pasar por RLS.
 */
export function supabaseServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
}

export type AuthUser = { id: string; email?: string | null };

export async function requireUser(req: Request): Promise<AuthUser> {
  const sbUser = supabaseUserClient(req);

  const { data, error } = await sbUser.auth.getUser();
  if (error || !data?.user?.id) throw new Error("UNAUTHORIZED");

  return { id: data.user.id, email: data.user.email ?? null };
}

/**
 * Admin check SIN RPC.
 * Tabla sugerida: public.debacu_eval_admin_users(user_id uuid, is_active bool, ...)
 */
export async function requireAdmin(req: Request): Promise<AuthUser> {
  const user = await requireUser(req);
  const sb = supabaseServiceClient();

  const { data, error } = await sb
    .from("debacu_eval_admin_users")
    .select("user_id, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw new Error("ADMIN_CHECK_FAILED");
  if (!data || data.is_active !== true) throw new Error("FORBIDDEN");

  return user;
}
