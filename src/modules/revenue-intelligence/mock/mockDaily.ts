import { DailyData } from '../types';

const TOTAL_ROOMS = 18;

export const getMockDaily = (propertyId: string): DailyData[] => {
  const data: DailyData[] = [];
  const now = new Date();
  
  // Seed based on propertyId to have consistent random data
  const seed = propertyId === 'hotel_achuri' ? 1 : 2;
  
  for (let i = 0; i < 30; i++) {
    const date = new Date(now);
    date.setDate(now.getDate() - 15 + i);
    const dateStr = date.toISOString().split('T')[0];
    
    // Random but somewhat consistent data
    const dayFactor = (Math.sin(i * seed) + 1) / 2; // 0 to 1
    const roomsSold = Math.floor(dayFactor * TOTAL_ROOMS);
    const occ = (roomsSold / TOTAL_ROOMS) * 100;
    const adr = 60 + (dayFactor * 35); // 60 to 95
    const revenue = roomsSold * adr;
    const pvp = adr * 1.15;
    
    data.push({
      propertyId,
      date: dateStr,
      occ,
      roomsSold,
      adr,
      revenue,
      pvp,
      isHighOcc: occ > 85,
      isLowOcc: occ < 50
    });
  }
  
  return data;
};
