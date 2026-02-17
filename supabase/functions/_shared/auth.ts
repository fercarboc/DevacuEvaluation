// supabase/functions/_shared/auth.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

export function supabaseServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireUser(req: Request) {
  const auth = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) throw new Error("UNAUTHORIZED");

  const sbUser = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });

  const { data, error } = await sbUser.auth.getUser();
  if (error || !data?.user?.id) throw new Error("UNAUTHORIZED");

  return data.user; // { id, email, ... }
}

export async function requireAdmin(req: Request) {
  const user = await requireUser(req);

  // IMPORTANTE: check admin SIEMPRE con service role (evita RLS)
  const sb = supabaseServiceClient();

  const { data, error } = await sb
    .from("debacu_eval_admin_users")
    .select("user_id, active")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    console.error("requireAdmin db error:", error);
    throw new Error("ADMIN_CHECK_FAILED");
  }

  if (!data?.user_id) {
    throw new Error("FORBIDDEN");
  }

  return { user_id: user.id, email: user.email ?? null };
}
