import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

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

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }
    if (req.method !== "POST") return json(405, { error: "Method not allowed" });

    const SUPABASE_URL = requireEnv("SUPABASE_URL");
    const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const body = (await req.json()) as Body;

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

    if (!company_name) return json(400, { error: "company_name required" });
    if (!cif) return json(400, { error: "cif required" });
    if (!contact_name) return json(400, { error: "contact_name required" });
    if (!email || !email.includes("@")) return json(400, { error: "valid email required" });
    if (!property_type) return json(400, { error: "property_type required" });

    const rooms_count =
      typeof body.rooms_count === "number" && Number.isFinite(body.rooms_count)
        ? body.rooms_count
        : null;

    // ✅ evitar duplicados de draft (opcional pero recomendado)
    const { data: existing, error: existingErr } = await supabase
      .from("debacu_eval_access_requests")
      .select("id")
      .eq("status", "PENDING")
      .eq("email", email)
      .eq("cif", cif)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingErr) return json(500, { error: existingErr.message });
    if (existing?.id) return json(200, { id: existing.id, duplicate: true });

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

       accepted_terms: false,
  accepted_professional_use: !!body.accepted_professional_use,
      })
      .select("id")
      .maybeSingle();

    if (error) return json(500, { error: error.message });
    if (!data?.id) return json(500, { error: "draft not created" });

    return json(200, { id: data.id });
  } catch (e: any) {
    return json(500, { error: e?.message ?? String(e) });
  }
});
