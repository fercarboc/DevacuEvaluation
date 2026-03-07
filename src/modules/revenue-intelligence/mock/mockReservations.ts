import { ReservationRow, Channel, Segment } from '../types';

export const generateMockReservations = (propertyId: string): ReservationRow[] => {
  const reservations: ReservationRow[] = [];
  const now = new Date();
  const count = 700 + Math.floor(Math.random() * 200); // 700-900 reservations

  const channels: Channel[] = ["DIRECT_WEB", "DIRECT_PHONE", "WALK_IN", "BOOKING", "EXPEDIA", "AIRBNB", "AGENCY", "OTHER"];
  const segments: Segment[] = ["LEISURE", "BUSINESS", "CORPORATE", "GROUPS", "LONG_STAY", "OTHER"];

  for (let i = 0; i < count; i++) {
    // Random arrival date between -60 and +60 days from now
    const arrivalDate = new Date(now);
    arrivalDate.setDate(now.getDate() + (Math.floor(Math.random() * 120) - 60));
    
    // Channel distribution
    let channel: Channel = "OTHER";
    const randChannel = Math.random();
    if (randChannel < 0.35) channel = "BOOKING";
    else if (randChannel < 0.50) channel = "EXPEDIA";
    else if (randChannel < 0.70) channel = "DIRECT_WEB";
    else if (randChannel < 0.85) channel = "AGENCY";
    else if (randChannel < 0.92) channel = "DIRECT_PHONE";
    else if (randChannel < 0.96) channel = "AIRBNB";
    else channel = "WALK_IN";

    // Segment distribution based on day of week
    const isWeekend = arrivalDate.getDay() === 0 || arrivalDate.getDay() === 6;
    let segment: Segment = "OTHER";
    const randSegment = Math.random();
    if (isWeekend) {
      if (randSegment < 0.7) segment = "LEISURE";
      else if (randSegment < 0.85) segment = "GROUPS";
      else segment = "LONG_STAY";
    } else {
      if (randSegment < 0.5) segment = "BUSINESS";
      else if (randSegment < 0.8) segment = "CORPORATE";
      else segment = "LEISURE";
    }

    // Lead Time and LOS based on segment
    let leadTime = 1;
    let nights = 1;

    if (segment === "BUSINESS" || segment === "CORPORATE") {
      leadTime = Math.floor(Math.random() * 10) + 1; // Short lead time
      nights = Math.floor(Math.random() * 2) + 1;    // Short LOS
    } else if (segment === "LEISURE") {
      leadTime = Math.floor(Math.random() * 60) + 15; // Medium lead time
      nights = Math.floor(Math.random() * 4) + 2;     // Longer LOS
    } else if (segment === "LONG_STAY") {
      leadTime = Math.floor(Math.random() * 90) + 30;
      nights = Math.floor(Math.random() * 10) + 7;
    } else {
      leadTime = Math.floor(Math.random() * 30) + 5;
      nights = Math.floor(Math.random() * 3) + 1;
    }

    const bookingDate = new Date(arrivalDate);
    bookingDate.setDate(arrivalDate.getDate() - leadTime);

    const departureDate = new Date(arrivalDate);
    departureDate.setDate(arrivalDate.getDate() + nights);

    // Commission % based on channel
    let commissionPct = 0;
    if (channel === "BOOKING" || channel === "EXPEDIA") commissionPct = 15 + Math.random() * 7; // 15-22%
    else if (channel === "AGENCY") commissionPct = 10 + Math.random() * 5;
    else if (channel === "DIRECT_WEB" || channel === "DIRECT_PHONE") commissionPct = Math.random() * 3; // 0-3%
    else if (channel === "AIRBNB") commissionPct = 12 + Math.random() * 3;

    // Status distribution
    let status: ReservationRow["status"] = "CONFIRMED";
    const randStatus = Math.random();
    let cancelProb = 0.05;
    if (channel === "BOOKING" || channel === "EXPEDIA") cancelProb = 0.15 + Math.random() * 0.05; // 15-20%
    
    if (randStatus < cancelProb) status = "CANCELLED";
    else if (randStatus < cancelProb + 0.015) status = "NO_SHOW"; // 1.5% approx
    else if (arrivalDate < now) status = "CHECKED_OUT";

    const adr = 90 + (Math.random() * 70);
    const rooms = 1;

    reservations.push({
      propertyId,
      reservationId: `RES-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      bookingDate: bookingDate.toISOString().split('T')[0],
      arrivalDate: arrivalDate.toISOString().split('T')[0],
      departureDate: departureDate.toISOString().split('T')[0],
      rooms,
      nights,
      revenue: adr * nights * rooms,
      channel,
      segment,
      status,
      commissionPct
    });
  }

  return reservations;
};

// Helper to derive DailyChannelSegmentRow from Reservations
export const deriveGranularFromReservations = (reservations: ReservationRow[]): any[] => {
  const granularMap: Record<string, any> = {};

  reservations.forEach(res => {
    if (res.status === "CANCELLED" || res.status === "NO_SHOW") return;

    // For each night of the reservation
    for (let i = 0; i < res.nights; i++) {
      const date = new Date(res.arrivalDate);
      date.setDate(date.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      
      const key = `${dateStr}-${res.channel}-${res.segment}`;
      if (!granularMap[key]) {
        granularMap[key] = {
          propertyId: res.propertyId,
          date: dateStr,
          roomsTotal: 18, // Mock total rooms
          roomsSold: 0,
          revenue: 0,
          pvp: 0,
          channel: res.channel,
          segment: res.segment,
          status: "CHECKED_OUT"
        };
      }
      
      granularMap[key].roomsSold += res.rooms;
      granularMap[key].revenue += res.revenue / res.nights;
      granularMap[key].pvp = res.revenue / res.nights / res.rooms;
    }
  });

  return Object.values(granularMap);
};
