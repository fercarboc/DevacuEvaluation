 import { DailyChannelSegmentRow, Channel, Segment, DailyData } from '../types';

export const getMockChannelSegmentData = (propertyId: string, roomsTotal: number): DailyChannelSegmentRow[] => {
  const data: DailyChannelSegmentRow[] = [];
  const now = new Date();
  const seed = propertyId === 'hotel_achuri' ? 1 : 2;

  for (let i = 0; i < 60; i++) {
    const date = new Date(now);
    date.setDate(now.getDate() - 45 + i);
    const dateStr = date.toISOString().split('T')[0];
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;

    // Total rooms sold for the day (consistent with mockDaily logic)
    const dayFactor = (Math.sin(i * seed) + 1) / 2;
    const totalRoomsSold = Math.floor(dayFactor * roomsTotal);
    
    let remainingRooms = totalRoomsSold;

    while (remainingRooms > 0) {
      const roomsForThisRow = Math.min(remainingRooms, Math.floor(Math.random() * 2) + 1);
      
      let channel: Channel = "OTHER";
      const randChannel = Math.random();
      if (randChannel < 0.4) channel = "BOOKING";
      else if (randChannel < 0.6) channel = "EXPEDIA";
      else if (randChannel < (isWeekend ? 0.85 : 0.75)) channel = "DIRECT_WEB";
      else if (randChannel < 0.9) channel = "AGENCY";
      else if (randChannel < 0.95) channel = "DIRECT_PHONE";
      else channel = "WALK_IN";

      let segment: Segment = "OTHER";
      const randSegment = Math.random();
      if (isWeekend) {
        if (randSegment < 0.7) segment = "LEISURE";
        else if (randSegment < 0.85) segment = "GROUPS";
        else segment = "LONG_STAY";
      } else {
        if (randSegment < 0.4) segment = "BUSINESS";
        else if (randSegment < 0.7) segment = "CORPORATE";
        else if (randSegment < 0.9) segment = "LEISURE";
        else segment = "OTHER";
      }

      const adr = 70 + (dayFactor * 40) + (Math.random() * 10 - 5);
      const revenue = roomsForThisRow * adr;

      data.push({
        propertyId,
        date: dateStr,
        roomsTotal,
        roomsSold: roomsForThisRow,
        revenue,
        pvp: adr * 1.15,
        channel,
        segment,
        status: "CHECKED_OUT"
      });

      remainingRooms -= roomsForThisRow;
    }
  }

  return data;
};

// Helper to derive DailyData from granular data to ensure consistency
export const deriveDailyFromGranular = (granularData: DailyChannelSegmentRow[]): DailyData[] => {
  const dailyMap: Record<string, DailyData> = {};

  granularData.forEach(row => {
    if (!dailyMap[row.date]) {
      dailyMap[row.date] = {
        propertyId: row.propertyId,
        date: row.date,
        occ: 0,
        roomsSold: 0,
        adr: 0,
        revenue: 0,
        pvp: 0
      };
    }
    const day = dailyMap[row.date];
    day.roomsSold += row.roomsSold;
    day.revenue += row.revenue;
    // We take the last PVP or average? Let's just take the last one for simplicity
    day.pvp = row.pvp;
  });

  return Object.values(dailyMap).map(day => {
    // Assuming 18 rooms if not specified, but we have roomsTotal in row
    const roomsTotal = granularData.find(r => r.date === day.date)?.roomsTotal || 18;
    return {
      ...day,
      occ: (day.roomsSold / roomsTotal) * 100,
      adr: day.roomsSold > 0 ? day.revenue / day.roomsSold : 0,
      isHighOcc: (day.roomsSold / roomsTotal) > 0.85,
      isLowOcc: (day.roomsSold / roomsTotal) < 0.4
    };
  }).sort((a, b) => a.date.localeCompare(b.date));
};