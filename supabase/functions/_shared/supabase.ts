// supabase/functions/_shared/supabase.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

export function supabaseServiceClient() {
  const url = mustEnv("SUPABASE_URL");
  const key = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function supabaseAnonClient() {
  const url = mustEnv("SUPABASE_URL");
  const key = mustEnv("SUPABASE_ANON_KEY");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
