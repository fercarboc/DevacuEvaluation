// supabase/functions/_shared/properties.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Sb = ReturnType<typeof createClient>;

function normLegacy(s: string) {
  return String(s || "").trim().toLowerCase();
}

/**
 * Resuelve property_id:
 * - Si payload.property_id existe => lo valida (que pertenece al org)
 * - Si no, usa creator_customer_id como legacy_customer_code (org-scoped)
 *   y hace upsert/get.
 */
export async function resolvePropertyId(opts: {
  supabaseAdmin: Sb;   // service role client
  orgId: string;
  propertyId?: string | null;
  creatorCustomerId?: string | null; // legacy
  // opcional: nombre para crear
  propertyName?: string | null;
}) {
  const { supabaseAdmin, orgId } = opts;

  // 1) Modo nuevo
  if (opts.propertyId) {
    const { data, error } = await supabaseAdmin
      .from("debacu_eval_properties")
      .select("id, org_id")
      .eq("id", opts.propertyId)
      .maybeSingle();

    if (error) throw error;
    if (!data || data.org_id !== orgId) throw new Error("PROPERTY_NOT_IN_ORG");
    return data.id as string;
  }

  // 2) Modo legacy
  const legacy = normLegacy(opts.creatorCustomerId || "");
  if (!legacy) throw new Error("MISSING_PROPERTY_OR_LEGACY");

  // buscar
  const { data: existing, error: e1 } = await supabaseAdmin
    .from("debacu_eval_properties")
    .select("id")
    .eq("org_id", orgId)
    .eq("legacy_customer_code_norm", legacy) // <-- campo norm para index + unique
    .maybeSingle();

  if (e1) throw e1;
  if (existing?.id) return existing.id as string;

  // crear (compatibilidad hacia atrás)
  const payload = {
    org_id: orgId,
    name: (opts.propertyName || legacy).trim().toUpperCase(),
    legacy_customer_code: opts.creatorCustomerId,
    legacy_customer_code_norm: legacy,
    status: "ACTIVE",
  };

  const { data: created, error: e2 } = await supabaseAdmin
    .from("debacu_eval_properties")
    .insert(payload)
    .select("id")
    .single();

  if (e2) throw e2;
  return created.id as string;
}