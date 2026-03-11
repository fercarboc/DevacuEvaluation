import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function upsertReservation(
  supabase: SupabaseClient,
  orgId: string,
  row: Record<string, any>
) {
  return await supabase
    .from("debacu_eval_reservations")
    .upsert(
      {
        org_id: orgId,
        reservation_key: row.reservation_key,

        reservation_id: row.reservation_id ?? null,
        reservation_line_id: row.reservation_line_id ?? null,

        property_code: row.property_code ?? null,
        property_name: row.property_name ?? null,

        booking_date: row.booking_date ?? null,
        checkin_date: row.checkin_date ?? null,
        checkout_date: row.checkout_date ?? null,

        reservation_status: row.status ?? null,

        revenue: row.gross_revenue ?? null,
        net_revenue: row.net_revenue ?? null,
        commission_amount: row.commission_amount ?? null,

        currency: row.currency ?? null,

        rooms: row.rooms ?? null,
        adults: row.adults ?? null,
        children: row.children ?? null,

        channel: row.channel ?? null,
        segment: row.segment ?? null,
        company: row.company ?? null,
        agency: row.agency ?? null,

        room_type: row.room_type ?? null,
        rate_plan: row.rate_plan ?? null,

        market_code: row.market_code ?? null,
        source_system: row.source_system ?? null,
      },
      {
        onConflict: "org_id,reservation_key",
      }
    );
}