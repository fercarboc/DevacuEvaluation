import { MonthlyData } from '../types';

const TOTAL_ROOMS = 18;
const DAYS_IN_MONTH = 30;

export const getMockMonthly = (propertyId: string): MonthlyData[] => {
  const months = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ];
  
  const seed = propertyId === 'hotel_achuri' ? 1 : 2;

  return months.map((month, i) => {
    const monthFactor = (Math.sin(i * seed) + 1) / 2;
    const occ = 40 + (monthFactor * 50); // 40% to 90%
    const rn = Math.floor((occ / 100) * TOTAL_ROOMS * DAYS_IN_MONTH);
    const adr = 65 + (monthFactor * 30);
    const revenue = rn * adr;
    const revpar = revenue / (TOTAL_ROOMS * DAYS_IN_MONTH);
    const difVsLY = (Math.random() * 30) - 10; // -10% to 20%

    return {
      propertyId,
      month,
      occ,
      rn,
      adr,
      revenue,
      revpar,
      difVsLY
    };
  });
};
