// supabase/functions/_shared/auth.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

// ================================
// ENV VALIDATION
// ================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL) {
  console.error("[auth.ts] SUPABASE_URL missing");
  throw new Error("SUPABASE_URL_NOT_DEFINED");
}

if (!SERVICE_ROLE_KEY) {
  console.error("[auth.ts] SUPABASE_SERVICE_ROLE_KEY missing");
  throw new Error("SERVICE_ROLE_KEY_NOT_DEFINED");
}

// ================================
// SERVICE CLIENT
// ================================

export function supabaseServiceClient() {
  return createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

// ================================
// INTERNAL: Extract Bearer
// ================================

function getBearer(req: Request) {
  const raw =
    req.headers.get("authorization") ??
    req.headers.get("Authorization") ??
    "";

  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? "";
}

// ================================
// requireUser
// ================================

export async function requireUser(req: Request) {
  const jwt = getBearer(req);

  if (!jwt) {
    console.error("[requireUser] No Bearer token found");
    throw new Error("UNAUTHORIZED_NO_BEARER");
  }

  const sb = supabaseServiceClient();

  const { data, error } = await sb.auth.getUser(jwt);

  if (error) {
    console.error("[requireUser] getUser error:", {
      message: error.message,
      status: (error as any)?.status ?? null,
    });
    throw new Error("UNAUTHORIZED_INVALID_JWT");
  }

  if (!data?.user?.id) {
    console.error("[requireUser] No user resolved from JWT");
    throw new Error("UNAUTHORIZED_NO_USER");
  }

  console.log("[requireUser] Authenticated user:", data.user.id);

  return data.user; // { id, email, ... }
}

// ================================
// requireAdmin
// ================================

export async function requireAdmin(req: Request) {
  const user = await requireUser(req);

  const sb = supabaseServiceClient();

  const { data, error } = await sb
    .from("debacu_eval_admin_users")
    .select("user_id, active")
    .eq("user_id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    console.error("[requireAdmin] DB error:", error);
    throw new Error("ADMIN_CHECK_FAILED");
  }

  if (!data?.user_id) {
    console.error("[requireAdmin] User is not active admin:", user.id);
    throw new Error("FORBIDDEN");
  }

  console.log("[requireAdmin] Admin validated:", user.id);

  return {
    user_id: user.id,
    email: user.email ?? null,
  };
}