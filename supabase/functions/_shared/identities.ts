import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function upsertReservationIdentity(
  supabase: SupabaseClient,
  orgId: string,
  identityKey: string,
  row: Record<string, any>
) {
  return await supabase
    .from("debacu_eval_reservation_identities")
    .upsert(
      {
        org_id: orgId,
        identity_key: identityKey,

        country: row.country ?? null,

        guest_full_name: row.guest_full_name ?? null,
        first_name: row.first_name ?? null,
        last_name: row.last_name ?? null,

        email: row.email ?? null,
        phone: row.phone ?? null,

        identity_strength: "STRONG",
      },
      {
        onConflict: "org_id,identity_key",
      }
    );
}