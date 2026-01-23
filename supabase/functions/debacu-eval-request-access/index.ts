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

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return json(200, { ok: true });

  try {
    const SUPABASE_URL = mustEnv("SUPABASE_URL");
    const SERVICE_ROLE = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const body = await req.json().catch(() => ({}));

    const company_name = String(body?.company_name ?? "").trim();
    const legal_name = String(body?.legal_name ?? "").trim() || null;
    const cif = String(body?.cif ?? "").trim();

    const address = String(body?.address ?? "").trim() || null;
    const city = String(body?.city ?? "").trim() || null;
    const country = String(body?.country ?? "ESP").trim().toUpperCase() || "ESP";

    const property_type = String(body?.property_type ?? "").trim();
    const rooms_count_raw = body?.rooms_count;
    const rooms_count =
      typeof rooms_count_raw === "number" && Number.isFinite(rooms_count_raw)
        ? rooms_count_raw
        : null;

    const website = String(body?.website ?? "").trim() || null;

    const contact_name = String(body?.contact_name ?? "").trim();
    const contact_role = String(body?.contact_role ?? "").trim() || null;

    const email = String(body?.email ?? "").trim().toLowerCase();
    const phone = String(body?.phone ?? "").trim() || null;

    const accepted_terms = !!body?.accepted_terms;
    const accepted_professional_use = !!body?.accepted_professional_use;

    const notes = String(body?.notes ?? "").trim() || null;

    // Validaciones mínimas
    if (!company_name || !cif || !contact_name || !email) {
      return json(400, { error: "Faltan campos obligatorios" });
    }
    if (!isEmail(email)) return json(400, { error: "Email inválido" });
    if (!accepted_terms || !accepted_professional_use) {
      return json(400, { error: "Debe aceptar términos y uso profesional" });
    }

    // Deduplicación: si hay una PENDING con ese email, no crear otra
    const { data: existing, error: existingError } = await supabase
      .from("debacu_eval_access_requests")
      .select("id,status")
      .eq("email", email)
      .eq("status", "PENDING")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      console.error("existingError:", existingError);
      return json(500, { error: "Error comprobando solicitud existente" });
    }

    if (existing?.id) {
      return json(200, { ok: true, id: existing.id, duplicate: true });
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

    const { data, error } = await supabase
      .from("debacu_eval_access_requests")
      .insert(payload)
      .select("id")
      .single();

    if (error) {
      console.error("insert error:", error);
      return json(500, { error: "Error creando solicitud", detail: error.message });
    }

    return json(200, { ok: true, id: data.id });
  } catch (e) {
    console.error("FATAL request access error:", e);
    return json(500, { error: "Error", detail: String(e?.message ?? e) });
  }
});
