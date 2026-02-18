// supabase/functions/debacu_eval_username_to_email/index.ts
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

type Body = {
  usernameOrEmail?: string;
  appCode?: string; // default: "DEBACU_EVAL"
};

function norm(s: unknown) {
  return String(s ?? "").trim();
}

function isEmail(s: string) {
  return s.includes("@");
}

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function err(
  req: Request,
  status: number,
  detail:
    | "UNAUTHENTICATED"
    | "missing_usernameOrEmail"
    | "missing_appCode"
    | "user_not_found"
    | "request_failed",
) {
  return json(req, status, { ok: false, error: "request_failed", detail });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "request_failed", detail: "METHOD_NOT_ALLOWED" });
  }

  // ✅ JWT-only (si esto lo usas en login, aquí se romperá)
  const user = await requireUser(req).catch(() => null);
  if (!user?.id) return err(req, 401, "UNAUTHENTICATED");

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const usernameOrEmail = norm(body.usernameOrEmail);
  const appCode = norm(body.appCode || "DEBACU_EVAL");

  if (!usernameOrEmail) return err(req, 400, "missing_usernameOrEmail");
  if (!appCode) return err(req, 400, "missing_appCode");

  // Si ya es email, devolvemos normalizado
  if (isEmail(usernameOrEmail)) {
    return json(req, 200, { ok: true, data: { email: usernameOrEmail.toLowerCase() } });
  }

  // Resolver username -> email (customers.service_username -> customers.email)
  const sb = serviceClient();

  const { data, error } = await sb
    .from("customers")
    .select("email")
    .eq("app_id", appCode)
    .eq("service_username", usernameOrEmail)
    .maybeSingle();

  if (error) return err(req, 500, "request_failed");

  const email = norm(data?.email).toLowerCase();
  if (!email) return err(req, 404, "user_not_found");

  return json(req, 200, { ok: true, data: { email } });
});
