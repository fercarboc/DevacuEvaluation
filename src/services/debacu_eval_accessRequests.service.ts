import { supabase } from "@/services/supabaseClient";

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
  const { data, error } = await supabase.functions.invoke(
    "debacu-eval-request-access",
    {
      body: input,
    }
  );

  if (error) throw error;

  if (!data?.id) {
    if (data?.duplicate && data.id) {
      return { id: data.id };
    }
    throw new Error("Respuesta inválida del servidor (sin id)");
  }

  return { id: data.id };
}
