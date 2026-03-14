// supabase/functions/_shared/screeningProperty.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

type Sb = ReturnType<typeof createClient>;

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export type PropertyContext = {
  property_id: string;
  org_id: string;
};

export async function resolvePropertyContextOrThrow(opts: {
  supabaseAdmin: Sb;
  authUserId: string;
  propertyId?: string | null;
}) : Promise<PropertyContext> {
  const { supabaseAdmin, authUserId, propertyId } = opts;

  const pId = String(propertyId ?? "").trim();
  if (!pId) throw new Error("invalid_property_id");
  if (!isUuid(pId)) throw new Error("invalid_property_id");

  const { data: property, error: propertyError } = await supabaseAdmin
    .from("debacu_eval_properties")
    .select("id, org_id")
    .eq("id", pId)
    .maybeSingle();

  if (propertyError) throw new Error(`property_lookup_failed:${propertyError.message}`);
  if (!property?.id || !property?.org_id) throw new Error("PROPERTY_NOT_FOUND");

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("debacu_eval_org_members")
    .select("org_id, auth_user_id, status")
    .eq("org_id", property.org_id)
    .eq("auth_user_id", authUserId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (membershipError) throw new Error(`membership_lookup_failed:${membershipError.message}`);
  if (!membership?.org_id) throw new Error("NO_ORG_MEMBERSHIP");

  return {
    property_id: String(property.id),
    org_id: String(property.org_id),
  };
}
