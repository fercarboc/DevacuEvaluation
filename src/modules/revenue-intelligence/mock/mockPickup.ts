import { PickupData, DemandIndex } from '../types';

const TOTAL_ROOMS = 18;

export const getMockPickup = (propertyId: string, daysAgo: number): PickupData[] => {
  const data: PickupData[] = [];
  const now = new Date();
  const seed = propertyId === 'hotel_achuri' ? 1 : 2;

  for (let i = 0; i < 30; i++) {
    const date = new Date(now);
    date.setDate(now.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    const dayFactor = (Math.sin(i * seed) + 1) / 2;
    const roomsToday = Math.floor(dayFactor * TOTAL_ROOMS);
    const roomsHistory = Math.max(0, roomsToday - Math.floor(Math.random() * 5));
    const pickup = roomsToday - roomsHistory;
    
    const adrToday = 65 + (dayFactor * 45); // 65 to 110
    const revenueToday = roomsToday * adrToday;
    const revenueHistory = roomsHistory * (adrToday * 0.95);
    const revenuePickup = revenueToday - revenueHistory;
    
    const paceVsLY = (Math.random() * 20) - 5; // -5% to 15%

    let demandIndex: DemandIndex = 'Amarillo';
    if (pickup >= 3) demandIndex = 'Verde';
    if (pickup <= 0 && roomsToday < TOTAL_ROOMS * 0.4) demandIndex = 'Rojo';

    data.push({
      propertyId,
      arrivalDate: dateStr,
      occToday: (roomsToday / TOTAL_ROOMS) * 100,
      roomsToday,
      roomsHistory,
      pickup,
      adrToday,
      revenueToday,
      revenueHistory,
      revenuePickup,
      paceVsLY,
      demandIndex
    });
  }

  return data;
};