// supabase/functions/debacu_eval_csv_unified_import/_shared/stayNights.ts

type SupabaseLike = {
  from: (table: string) => {
    delete: () => {
      eq: (column: string, value: unknown) => any;
    };
    insert: (rows: unknown[]) => Promise<{ error?: { message?: string } | null }>;
  };
};

function parseDateOnly(value: string): Date {
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${value}`);
  }
  return d;
}

function toDateOnlyString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;

  const normalized = String(value)
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");

  const n = Number(normalized);
  return Number.isFinite(n) ? n : fallback;
}

function diffNights(checkin: Date, checkout: Date): number {
  const ms = checkout.getTime() - checkin.getTime();
  return Math.round(ms / 86400000);
}

export async function rebuildStayNights(
  supabase: SupabaseLike,
  orgId: string,
  row: {
    reservation_key: string;
    property_code?: string | null;
    checkin_date: string;
    checkout_date: string;
    rooms?: string | number | null;
    gross_revenue?: string | number | null;
    net_revenue?: string | number | null;
    channel?: string | null;
    segment?: string | null;
    room_type?: string | null;
    rate_plan?: string | null;
    adults?: string | number | null;
    children?: string | number | null;
    currency?: string | null;
  },
): Promise<void> {
  const checkin = parseDateOnly(row.checkin_date);
  const checkout = parseDateOnly(row.checkout_date);

  const nightsCount = diffNights(checkin, checkout);

  if (nightsCount <= 0) {
    throw new Error(`Invalid stay range for reservation_key=${row.reservation_key}`);
  }

  const rooms = toNumber(row.rooms, 1);
  const grossRevenue = toNumber(row.gross_revenue, 0);
  const netRevenue = toNumber(row.net_revenue, grossRevenue);
  const adults = toNumber(row.adults, 0);
  const children = toNumber(row.children, 0);

  const grossPerNight = grossRevenue / nightsCount;
  const netPerNight = netRevenue / nightsCount;

  const deleteResult = await supabase
    .from("debacu_eval_stay_nights")
    .delete()
    .eq("org_id", orgId)
    .eq("reservation_key", row.reservation_key);

  if (deleteResult?.error) {
    throw new Error(deleteResult.error.message || "Failed deleting stay nights");
  }

  const nights: Record<string, unknown>[] = [];

  for (let i = 0; i < nightsCount; i++) {
    const d = new Date(checkin);
    d.setDate(checkin.getDate() + i);

    nights.push({
      org_id: orgId,
      property_code: row.property_code ?? null,
      reservation_key: row.reservation_key,
      stay_date: toDateOnlyString(d),
      room_nights: rooms,
      allocated_gross_revenue: grossPerNight,
      allocated_net_revenue: netPerNight,
      channel: row.channel ?? null,
      segment: row.segment ?? null,
      room_type: row.room_type ?? null,
      rate_plan: row.rate_plan ?? null,
      adults,
      children,
      currency: row.currency ?? null,
    });
  }

  const insertResult = await supabase
    .from("debacu_eval_stay_nights")
    .insert(nights);

  if (insertResult?.error) {
    throw new Error(insertResult.error.message || "Failed inserting stay nights");
  }
}