// supabase/functions/debacu_eval_access_request_create/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { json, preflight } from "../_shared/cors.ts";
import { supabaseServiceClient } from "../_shared/auth.ts";

type PropertyType = "HOTEL" | "RURAL" | "APARTMENTS" | "HOSTEL" | "OTHER";

type Body = {
  company_name: string;
  legal_name?: string;
  cif: string;
  address?: string;
  city?: string;
  country?: string;
  property_type: PropertyType;
  rooms_count?: number;
  website?: string;
  contact_name: string;
  contact_role?: string;
  email: string;
  phone?: string;
  notes?: string;

  accepted_professional_use?: boolean;
};

function isValidEmail(s: string) {
  const v = String(s || "").trim();
  // validación simple (suficiente para UI), sin regex agresivo
  return v.includes("@") && v.includes(".") && v.length <= 320;
}

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

  // ✅ público (sin JWT): NO requireUser aquí
  const body = await readJsonSafe<Body>(req);
  if (!body) {
    return json(req, 400, {
      ok: false,
      error: "request_failed",
      detail: "invalid_json",
    });
  }

  const company_name = body.company_name?.trim();
  const legal_name = body.legal_name?.trim() || null;
  const cif = body.cif?.trim();
  const address = body.address?.trim() || null;
  const city = body.city?.trim() || null;
  const country = body.country?.trim() || "ESP";
  const property_type = body.property_type;
  const website = body.website?.trim() || null;
  const contact_name = body.contact_name?.trim();
  const contact_role = body.contact_role?.trim() || null;
  const email = body.email?.trim();
  const phone = body.phone?.trim() || null;
  const notes = body.notes?.trim() || null;

  if (!company_name) {
    return json(req, 400, { ok: false, error: "request_failed", detail: "missing_company_name" });
  }
  if (!cif) {
    return json(req, 400, { ok: false, error: "request_failed", detail: "missing_cif" });
  }
  if (!contact_name) {
    return json(req, 400, { ok: false, error: "request_failed", detail: "missing_contact_name" });
  }
  if (!email || !isValidEmail(email)) {
    return json(req, 400, { ok: false, error: "request_failed", detail: "invalid_email" });
  }
  if (!property_type) {
    return json(req, 400, { ok: false, error: "request_failed", detail: "missing_property_type" });
  }

  const rooms_count =
    typeof body.rooms_count === "number" && Number.isFinite(body.rooms_count)
      ? Math.max(0, Math.floor(body.rooms_count))
      : null;

  // Service role (consistente)
  const supabase = supabaseServiceClient();

  try {
    // ✅ evitar duplicados PENDING por (email,cif)
    const { data: existing, error: existingErr } = await supabase
      .from("debacu_eval_access_requests")
      .select("id, created_at")
      .eq("status", "PENDING")
      .eq("email", email)
      .eq("cif", cif)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingErr) {
      return json(req, 500, {
        ok: false,
        error: "request_failed",
        detail: "DB_READ_FAILED",
      });
    }

    if (existing?.id) {
      return json(req, 200, {
        ok: true,
        id: existing.id,
        created_at: existing.created_at,
        duplicate: true,
      });
    }

    // ✅ insert + select (created_at real)
    const { data, error } = await supabase
      .from("debacu_eval_access_requests")
      .insert({
        status: "PENDING",
        company_name,
        legal_name,
        cif,
        address,
        city,
        country,
        property_type,
        rooms_count,
        website,
        contact_name,
        contact_role,
        email,
        phone,
        notes,

        // Mantengo tu comportamiento actual:
        accepted_terms: false,
        accepted_professional_use: !!body.accepted_professional_use,
      })
      .select("id, created_at")
      .maybeSingle();

    if (error) {
      return json(req, 500, {
        ok: false,
        error: "request_failed",
        detail: "DB_INSERT_FAILED",
      });
    }

    if (!data?.id) {
      return json(req, 500, {
        ok: false,
        error: "request_failed",
        detail: "draft_not_created",
      });
    }

    return json(req, 200, {
      ok: true,
      id: data.id,
      created_at: data.created_at,
    });
  } catch {
    return json(req, 500, {
      ok: false,
      error: "request_failed",
      detail: "INTERNAL_ERROR",
    });
  }
});
