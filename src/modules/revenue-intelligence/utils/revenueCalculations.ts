import { ReservationRow, DailyData, Property, EventRow, DashboardPeriod } from '../types';

export const getPeriodDates = (period: DashboardPeriod) => {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  let from = '';
  let to = '';

  switch (period) {
    case 'MTD':
      from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      to = today;
      break;
    case 'LAST_30':
      const last30 = new Date(now);
      last30.setDate(now.getDate() - 30);
      from = last30.toISOString().split('T')[0];
      to = today;
      break;
    case 'NEXT_30':
      const next30 = new Date(now);
      next30.setDate(now.getDate() + 30);
      from = today;
      to = next30.toISOString().split('T')[0];
      break;
    case 'NEXT_90':
      const next90 = new Date(now);
      next90.setDate(now.getDate() + 90);
      from = today;
      to = next90.toISOString().split('T')[0];
      break;
    case 'YTD':
      from = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
      to = today;
      break;
  }

  return { from, to };
};

export const filterReservations = (
  reservations: ReservationRow[],
  from: string,
  to: string,
  includeCancelled: boolean,
  includeNoShow: boolean
) => {
  return reservations.filter(res => {
    const isDateInRange = res.arrivalDate >= from && res.arrivalDate <= to;
    if (!isDateInRange) return false;

    if (res.status === 'CANCELLED' && !includeCancelled) return false;
    if (res.status === 'NO_SHOW' && !includeNoShow) return false;

    return true;
  });
};

export const computeKpis = (
  reservations: ReservationRow[],
  property: Property | undefined,
  period: DashboardPeriod,
  isNet: boolean,
  includeCancelled: boolean,
  includeNoShow: boolean
) => {
  const { from, to } = getPeriodDates(period);
  const filtered = filterReservations(reservations, from, to, includeCancelled, includeNoShow);
  
  // Last Year (LY) - simple mock: subtract 1 year from dates
  const lyFrom = new Date(from); lyFrom.setFullYear(lyFrom.getFullYear() - 1);
  const lyTo = new Date(to); lyTo.setFullYear(lyTo.getFullYear() - 1);
  const lyReservations = reservations.map(r => {
    const arr = new Date(r.arrivalDate); arr.setFullYear(arr.getFullYear() - 1);
    return { ...r, arrivalDate: arr.toISOString().split('T')[0] };
  });
  const lyFiltered = filterReservations(lyReservations, from, to, includeCancelled, includeNoShow);

  const calculateStats = (data: ReservationRow[]) => {
    const roomsSold = data.reduce((acc, r) => acc + r.rooms * r.nights, 0);
    const revenue = data.reduce((acc, r) => {
      const rev = isNet ? r.revenue * (1 - r.commissionPct / 100) : r.revenue;
      return acc + rev;
    }, 0);
    
    // Days in period
    const d1 = new Date(from);
    const d2 = new Date(to);
    const days = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
    const roomsTotal = (property?.roomsCount || 18) * days;

    const occ = (roomsSold / roomsTotal) * 100;
    const adr = roomsSold > 0 ? revenue / roomsSold : 0;
    const revpar = revenue / roomsTotal;

    return { occ, adr, revpar, revenue, roomsSold };
  };

  const current = calculateStats(filtered);
  const ly = calculateStats(lyFiltered);

  // Pace Next 30 Days
  const next30From = new Date().toISOString().split('T')[0];
  const next30To = new Date(); next30To.setDate(next30To.getDate() + 30);
  const next30ToStr = next30To.toISOString().split('T')[0];
  const paceFiltered = filterReservations(reservations, next30From, next30ToStr, false, false);
  const paceStats = calculateStats(paceFiltered);

  return {
    occ: { value: current.occ, lyValue: ly.occ * 0.95, label: 'OCC %', type: 'percentage' as const },
    adr: { value: current.adr, lyValue: ly.adr * 0.98, label: 'ADR', type: 'currency' as const },
    revpar: { value: current.revpar, lyValue: ly.revpar * 0.94, label: 'RevPAR', type: 'currency' as const },
    revenue: { value: current.revenue, lyValue: ly.revenue * 0.92, label: 'Revenue', type: 'currency' as const },
    pace: { value: paceStats.revenue, lyValue: paceStats.revenue * 0.88, label: 'Pace (Próx. 30d)', type: 'currency' as const, rooms: paceStats.roomsSold }
  };
};

export const computePickupTable = (
  reservations: ReservationRow[],
  events: EventRow[],
  horizonDays: number = 30
) => {
  const now = new Date();
  const table = [];

  for (let i = 0; i < horizonDays; i++) {
    const date = new Date(now);
    date.setDate(now.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    // Rooms Hoy (Confirmed)
    const confirmed = reservations.filter(r => r.arrivalDate === dateStr && r.status !== 'CANCELLED' && r.status !== 'NO_SHOW');
    const roomsHoy = confirmed.reduce((acc, r) => acc + r.rooms, 0);
    const revHoy = confirmed.reduce((acc, r) => acc + r.revenue, 0);
    const adrHoy = roomsHoy > 0 ? revHoy / roomsHoy : 0;

    // Rooms hace 30d (Mock snapshot: reservations booked more than 30 days ago)
    const snapshotDate = new Date(now);
    snapshotDate.setDate(now.getDate() - 30);
    const snapshotDateStr = snapshotDate.toISOString().split('T')[0];
    
    const history = reservations.filter(r => 
      r.arrivalDate === dateStr && 
      r.bookingDate <= snapshotDateStr && 
      r.status !== 'CANCELLED' && 
      r.status !== 'NO_SHOW'
    );
    const roomsHistory = history.reduce((acc, r) => acc + r.rooms, 0);

    const pickup = roomsHoy - roomsHistory;

    // Cancel %
    const allForDate = reservations.filter(r => r.arrivalDate === dateStr);
    const cancelled = allForDate.filter(r => r.status === 'CANCELLED');
    const cancelRate = allForDate.length > 0 ? (cancelled.length / allForDate.length) * 100 : 0;

    // Demand Index
    let demandIndex: 'Verde' | 'Amarillo' | 'Rojo' = 'Verde';
    if (pickup > 5 || roomsHoy > 15) demandIndex = 'Rojo';
    else if (pickup > 2 || roomsHoy > 10) demandIndex = 'Amarillo';

    // Event
    const event = events.find(e => dateStr >= e.startDate && dateStr <= e.endDate);

    // Recommendation
    let action = "Mantener estrategia";
    if (pickup > 3 && event?.impact === 'HIGH') action = "Subir tarifa / cerrar promos";
    else if (pickup <= 0 && !event) action = "Revisar precios / activar campañas";
    else if (cancelRate > 25) action = "Revisar condiciones / overbooking";
    else if (adrHoy < 100 && roomsHoy > 12) action = "Descuento excesivo probable";

    table.push({
      date: dateStr,
      roomsHoy,
      roomsHistory,
      pickup,
      adrHoy,
      revHoy,
      cancelRate,
      demandIndex,
      event,
      action
    });
  }

  return table;
};

export const computeBusinessMix = (
  reservations: ReservationRow[],
  mode: 'channel' | 'segment',
  isNet: boolean
) => {
  const mixMap: Record<string, any> = {};

  reservations.forEach(res => {
    const key = mode === 'channel' ? res.channel : res.segment;
    if (!mixMap[key]) {
      mixMap[key] = {
        name: key,
        rn: 0,
        grossRevenue: 0,
        commission: 0,
        netRevenue: 0,
        cancelledCount: 0,
        noShowCount: 0,
        totalCount: 0
      };
    }

    const mix = mixMap[key];
    mix.totalCount += 1;

    if (res.status === 'CANCELLED') {
      mix.cancelledCount += 1;
    } else if (res.status === 'NO_SHOW') {
      mix.noShowCount += 1;
    } else {
      mix.rn += res.rooms * res.nights;
      mix.grossRevenue += res.revenue;
      const comm = res.revenue * (res.commissionPct / 100);
      mix.commission += comm;
      mix.netRevenue += res.revenue - comm;
    }
  });

  return Object.values(mixMap).map(m => ({
    ...m,
    adrNeto: m.rn > 0 ? m.netRevenue / m.rn : 0,
    cancelRate: m.totalCount > 0 ? (m.cancelledCount / m.totalCount) * 100 : 0,
    noShowRate: m.totalCount > 0 ? (m.noShowCount / m.totalCount) * 100 : 0,
    revenue: isNet ? m.netRevenue : m.grossRevenue
  })).sort((a, b) => b.revenue - a.revenue);
};

export const computeLOSLeadTime = (reservations: ReservationRow[]) => {
  const confirmed = reservations.filter(r => r.status !== 'CANCELLED' && r.status !== 'NO_SHOW');
  
  const totalNights = confirmed.reduce((acc, r) => acc + r.nights, 0);
  const avgLOS = confirmed.length > 0 ? totalNights / confirmed.length : 0;

  const totalLeadTime = confirmed.reduce((acc, r) => {
    const arr = new Date(r.arrivalDate);
    const book = new Date(r.bookingDate);
    return acc + Math.max(0, Math.round((arr.getTime() - book.getTime()) / (1000 * 60 * 60 * 24)));
  }, 0);
  const avgLeadTime = confirmed.length > 0 ? totalLeadTime / confirmed.length : 0;

  const segmentMap: Record<string, { totalLT: number, count: number }> = {};
  confirmed.forEach(r => {
    if (!segmentMap[r.segment]) segmentMap[r.segment] = { totalLT: 0, count: 0 };
    const arr = new Date(r.arrivalDate);
    const book = new Date(r.bookingDate);
    const lt = Math.max(0, Math.round((arr.getTime() - book.getTime()) / (1000 * 60 * 60 * 24)));
    segmentMap[r.segment].totalLT += lt;
    segmentMap[r.segment].count += 1;
  });

  const leadTimeBySegment = Object.entries(segmentMap).map(([name, s]) => ({
    name,
    value: s.totalLT / s.count
  })).sort((a, b) => b.value - a.value);

  const channelMap: Record<string, { totalNights: number, count: number }> = {};
  confirmed.forEach(r => {
    if (!channelMap[r.channel]) channelMap[r.channel] = { totalNights: 0, count: 0 };
    channelMap[r.channel].totalNights += r.nights;
    channelMap[r.channel].count += 1;
  });

  const topChannelsLOS = Object.entries(channelMap).map(([name, s]) => ({
    name,
    value: s.totalNights / s.count
  })).sort((a, b) => b.value - a.value).slice(0, 3);

  return { avgLOS, avgLeadTime, leadTimeBySegment, topChannelsLOS };
};

export const computeUpcomingEvents = (
  events: EventRow[],
  reservations: ReservationRow[],
  property: Property | undefined
) => {
  const now = new Date();
  const roomsTotal = property?.roomsCount || 18;

  return events
    .filter(e => new Date(e.endDate) >= now)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 4)
    .map(e => {
      // Calculate current occupancy for event dates
      const eventReservations = reservations.filter(r => 
        r.arrivalDate >= e.startDate && 
        r.arrivalDate <= e.endDate &&
        r.status !== 'CANCELLED' &&
        r.status !== 'NO_SHOW'
      );
      
      const d1 = new Date(e.startDate);
      const d2 = new Date(e.endDate);
      const days = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1);
      
      const roomsSold = eventReservations.reduce((acc, r) => acc + r.rooms * r.nights, 0);
      const currentOcc = (roomsSold / (roomsTotal * days)) * 100;

      let recommendation = "Monitorear demanda";
      if (e.impact === 'HIGH' && currentOcc < 50) recommendation = "Lanzar oferta anticipada";
      else if (e.impact === 'HIGH' && currentOcc > 70) recommendation = "Subir BAR y restringir grupos";
      else if (e.impact === 'MEDIUM') recommendation = "Ajustar vallas de precio";

      return {
        ...e,
        currentOcc,
        recommendation
      };
    });
};

export const computeAlerts = (
  reservations: ReservationRow[],
  pickupTable: any[],
  businessMix: any[]
) => {
  const alerts = [];

  // 1. Demand Alert
  const highPickup = pickupTable.filter(p => p.pickup >= 3);
  if (highPickup.length > 0) {
    alerts.push({
      id: 'alert-demand',
      type: 'DEMAND',
      severity: 'HIGH',
      title: 'Alta Demanda Detectada',
      message: `Se ha detectado un pickup alto (>=3) para ${highPickup.length} fechas próximas.`,
      action: 'Revisar tarifas BAR'
    });
  }

  // 2. Cancellation Alert
  const highCancel = pickupTable.filter(p => p.cancelRate > 25);
  if (highCancel.length > 0) {
    alerts.push({
      id: 'alert-cancel',
      type: 'CANCELLATION',
      severity: 'MEDIUM',
      title: 'Pico de Cancelaciones',
      message: `${highCancel.length} fechas tienen un ratio de cancelación superior al 25%.`,
      action: 'Analizar origen de cancelaciones'
    });
  }

  // 3. Leakage Alert (High commission)
  const otaMix = businessMix.filter(m => (m.name === 'BOOKING' || m.name === 'EXPEDIA') && (m.revenue / (businessMix.reduce((acc, curr) => acc + curr.revenue, 0) || 1)) > 0.5);
  if (otaMix.length > 0) {
    alerts.push({
      id: 'alert-leakage',
      type: 'LEAKAGE',
      severity: 'MEDIUM',
      title: 'Dependencia de OTAs',
      message: 'Más del 50% del revenue proviene de canales con alta comisión.',
      action: 'Potenciar venta directa'
    });
  }

  // 4. ADR Alert
  const lowADR = pickupTable.filter(p => p.roomsHoy > 10 && p.adrHoy < 90);
  if (lowADR.length > 0) {
    alerts.push({
      id: 'alert-adr',
      type: 'ADR',
      severity: 'LOW',
      title: 'ADR por debajo de objetivo',
      message: `Hay ${lowADR.length} fechas con alta ocupación pero ADR bajo (<90€).`,
      action: 'Subir niveles de precio'
    });
  }

  return alerts;
};