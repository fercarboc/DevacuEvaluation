// supabase/functions/debacu_eval_request_access/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { json, preflight } from "../_shared/cors.ts";
import { supabaseServiceClient } from "../_shared/auth.ts";

type Body = {
  company_name?: string;
  legal_name?: string | null;
  cif?: string;

  address?: string | null;
  city?: string | null;
  country?: string | null;

  property_type?: string | null;
  rooms_count?: number | null;

  website?: string | null;

  contact_name?: string;
  contact_role?: string | null;

  email?: string;
  phone?: string | null;

  accepted_terms?: boolean;
  accepted_professional_use?: boolean;

  notes?: string | null;
};

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}
function safeUpper(v: any) {
  return typeof v === "string" ? v.trim().toUpperCase() : "";
}
function safeLower(v: any) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}
function safeNullableStr(v: any) {
  const s = safeStr(v);
  return s ? s : null;
}
function safeNullableNumber(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function readJsonSafe<T>(req: Request): Promise<T> {
  try {
    const t = await req.text();
    if (!t) return {} as T;
    return JSON.parse(t) as T;
  } catch {
    return {} as T;
  }
}

function fail(req: Request, status: number, detail: string, extra?: Record<string, unknown>) {
  return json(req, status, {
    ok: false,
    error: "request_failed",
    detail,
    ...(extra ?? {}),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed");

  // Endpoint público: no JWT.
  const body = await readJsonSafe<Body>(req);

  const company_name = safeStr(body.company_name);
  const legal_name = safeNullableStr(body.legal_name);

  const cif = safeStr(body.cif);

  const address = safeNullableStr(body.address);
  const city = safeNullableStr(body.city);
  const country = safeUpper(body.country || "ESP") || "ESP";

  const property_type = safeNullableStr(body.property_type);
  const rooms_count = safeNullableNumber(body.rooms_count);

  const website = safeNullableStr(body.website);

  const contact_name = safeStr(body.contact_name);
  const contact_role = safeNullableStr(body.contact_role);

  const email = safeLower(body.email);
  const phone = safeNullableStr(body.phone);

  const accepted_terms = !!body.accepted_terms;
  const accepted_professional_use = !!body.accepted_professional_use;

  const notes = safeNullableStr(body.notes);

  // Validaciones mínimas
  if (!company_name) return fail(req, 400, "missing_company_name");
  if (!cif) return fail(req, 400, "missing_cif");
  if (!contact_name) return fail(req, 400, "missing_contact_name");
  if (!email) return fail(req, 400, "missing_email");
  if (!isEmail(email)) return fail(req, 400, "invalid_email");

  if (!accepted_terms || !accepted_professional_use) {
    return fail(req, 400, "missing_acceptance");
  }

  const sb = supabaseServiceClient();

  // Deduplicación: si hay una PENDING con ese email, devolver esa
  const { data: existing, error: existingError } = await sb
    .from("debacu_eval_access_requests")
    .select("id,status")
    .eq("email", email)
    .eq("status", "PENDING")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) return fail(req, 500, "db_read_failed");
  if (existing?.id) {
    return json(req, 200, { ok: true, id: existing.id, duplicate: true });
  }

  const payload = {
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
    accepted_terms,
    accepted_professional_use,
    notes,
  };

  const { data, error } = await sb
    .from("debacu_eval_access_requests")
    .insert(payload)
    .select("id, created_at")
    .single();

  if (error) return fail(req, 500, "db_insert_failed");

  // created_at real (por si lo necesitas en UI/logs)
  return json(req, 200, { ok: true, id: data.id, created_at: data.created_at });
});
