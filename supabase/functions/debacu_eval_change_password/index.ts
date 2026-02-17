// supabase/functions/debacu_eval_change_password/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

function isStrongEnough(pw: string) {
  // Ajusta a tu política real. Esto es un mínimo razonable.
  return typeof pw === "string" && pw.length >= 10;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);

  if (req.method !== "POST") {
    return json(req, 405, {
      ok: false,
      error: "request_failed",
      detail: "method_not_allowed",
    });
  }

  // JWT-only
  const user = await requireUser(req);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const new_password = (body?.new_password ?? "").toString();

  if (!new_password) {
    return json(req, 400, {
      ok: false,
      error: "request_failed",
      detail: "missing_new_password",
    });
  }

  if (!isStrongEnough(new_password)) {
    return json(req, 400, {
      ok: false,
      error: "request_failed",
      detail: "invalid_new_password",
    });
  }

  try {
    // Service role: update password en Auth (admin)
    const sbAdmin = supabaseServiceClient();

    const { error } = await sbAdmin.auth.admin.updateUserById(user.id, {
      password: new_password,
    });

    if (error) {
      // No filtramos detalles internos
      return json(req, 500, {
        ok: false,
        error: "request_failed",
        detail: "request_failed",
      });
    }

    return json(req, 200, { ok: true });
  } catch {
    return json(req, 500, {
      ok: false,
      error: "request_failed",
      detail: "internal_error",
    });
  }
});
