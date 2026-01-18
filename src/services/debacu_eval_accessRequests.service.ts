import { supabase } from "@/services/supabaseClient";
import type { Database } from "@/types/database";

 
export type DebacuEvalAccessRequestInput = {
  company_name: string;
  legal_name?: string;
  cif: string;
  address?: string;
  city?: string;
  country?: string;

  property_type: "HOTEL" | "RURAL" | "APARTMENTS" | "HOSTEL" | "OTHER";
  rooms_count?: number;

  website?: string;

  contact_name: string;
  contact_role?: string;
  email: string;
  phone?: string;

  

  accepted_terms: boolean;
  accepted_professional_use: boolean;

  notes?: string;
};

export async function createDebacuEvalAccessRequest(
  input: DebacuEvalAccessRequestInput
) {
  const payload: Database["public"]["Tables"]["debacu_eval_access_requests"]["Insert"] =
    {
      status: "PENDING",
      company_name: input.company_name.trim(),
      legal_name: input.legal_name?.trim() || null,
      cif: input.cif.trim(),
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      country: (input.country?.trim() || "ESP").toUpperCase(),

      property_type: input.property_type,
      rooms_count: typeof input.rooms_count === "number" ? input.rooms_count : null,

      website: input.website?.trim() || null,

      contact_name: input.contact_name.trim(),
      contact_role: input.contact_role?.trim() || null,
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim() || null,

      accepted_terms: !!input.accepted_terms,
      accepted_professional_use: !!input.accepted_professional_use,

      notes: input.notes?.trim() || null,
    };

  const { data, error } = await supabase
    .from("debacu_eval_access_requests")
    .insert(payload)        // ✅ objeto (no array)
    .select("id")
    .single();
     


  if (error) throw error;
  return data;
}
