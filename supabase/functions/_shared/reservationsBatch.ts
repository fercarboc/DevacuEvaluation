import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function upsertReservationsBatch(
  supabase: SupabaseClient,
  orgId: string,
  rows: Record<string, any>[]
) {

  const payload = rows.map(r => ({
    org_id: orgId,
    reservation_key: r.reservation_key,
    reservation_id: r.reservation_id ?? null,

    booking_date: r.booking_date ?? null,
    checkin_date: r.checkin_date ?? null,
    checkout_date: r.checkout_date ?? null,

    reservation_status: r.status ?? null,

    revenue: r.gross_revenue ?? null,
    rooms: r.rooms ?? null,

    channel: r.channel ?? null,
    segment: r.segment ?? null
  }));

  return await supabase
    .from("debacu_eval_reservations")
    .upsert(payload, {
      onConflict: "org_id,reservation_key"
    });

}