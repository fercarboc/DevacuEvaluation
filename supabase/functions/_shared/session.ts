// supabase/functions/_shared/session.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type SessionCtx = {
  session_id: string;
  customer_id: string;
  customer_name: string | null;
  app_code: string;
};

export function getServiceClient() {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

export async function requireSession(req: Request): Promise<SessionCtx> {
  const token = (req.headers.get("x-session-token") ?? "").trim();
  if (!token) throw new Error("missing_session_token");

  const sb = getServiceClient();

  const { data, error } = await sb
    .from("debacu_eval_sessions")
    .select("id, token, customer_id, customer_name, app_code, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (error) throw new Error(`session_lookup_failed: ${error.message}`);
  if (!data) throw new Error("invalid_session_token");

  if (data.revoked_at) throw new Error("session_revoked");

  const exp = new Date(data.expires_at).getTime();
  if (!Number.isNaN(exp) && exp <= Date.now()) throw new Error("session_expired");

  return {
    session_id: data.id,
    customer_id: data.customer_id,
    customer_name: data.customer_name ?? null,
    app_code: data.app_code,
  };
}
