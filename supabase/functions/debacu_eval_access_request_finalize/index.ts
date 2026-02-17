// supabase/functions/debacu_eval_access_request_set_professional_use/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { json, preflight } from "../_shared/cors.ts";
import { supabaseServiceClient } from "../_shared/auth.ts";

type Body = {
  request_id: string;
  accepted_professional_use: boolean;
};

async function readJsonSafe<T>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, {
      ok: false,
      error: "request_failed",
      detail: "METHOD_NOT_ALLOWED",
    });
  }

  const body = await readJsonSafe<Body>(req);
  if (!body) {
    return json(req, 400, {
      ok: false,
      error: "request_failed",
      detail: "invalid_json",
    });
  }

  const request_id = String(body.request_id ?? "").trim();
  if (!request_id) {
    return json(req, 400, {
      ok: false,
      error: "request_failed",
      detail: "missing_request_id",
    });
  }

  const supabase = supabaseServiceClient();

  try {
    // 1) comprobar que existe y que hay prueba PDF
    const { data: row, error: selErr } = await supabase
      .from("debacu_eval_access_requests")
      .select("id, status, accepted_terms, accepted_terms_pdf_path")
      .eq("id", request_id)
      .maybeSingle();

    if (selErr) {
      return json(req, 500, {
        ok: false,
        error: "request_failed",
        detail: "DB_READ_FAILED",
      });
    }
    if (!row) {
      return json(req, 404, {
        ok: false,
        error: "request_failed",
        detail: "NOT_FOUND",
      });
    }

    if (!row.accepted_terms || !row.accepted_terms_pdf_path) {
      return json(req, 400, {
        ok: false,
        error: "request_failed",
        detail: "terms_not_accepted_with_proof",
      });
    }

    // 2) update (sin tocar stack traces / sin revelar mensajes)
    const { error: updErr } = await supabase
      .from("debacu_eval_access_requests")
      .update({
        // si tu flujo exige “volver a pending” lo mantengo,
        // si no, bórralo para evitar pisar estados.
        status: "PENDING",
        accepted_professional_use: !!body.accepted_professional_use,
      })
      .eq("id", request_id);

    if (updErr) {
      return json(req, 500, {
        ok: false,
        error: "request_failed",
        detail: "DB_UPDATE_FAILED",
      });
    }

    return json(req, 200, { ok: true });
  } catch {
    return json(req, 500, {
      ok: false,
      error: "request_failed",
      detail: "INTERNAL_ERROR",
    });
  }
});
