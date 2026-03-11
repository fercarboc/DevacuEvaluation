import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function insertReservationSnapshot(
  supabase: SupabaseClient,
  orgId: string,
  reservationKey: string,
  payload: Record<string, any>
) {
  return await supabase
    .from("debacu_eval_reservation_snapshots")
    .insert({
      org_id: orgId,
      reservation_key: reservationKey,
      snapshot_payload: payload,
    });
}