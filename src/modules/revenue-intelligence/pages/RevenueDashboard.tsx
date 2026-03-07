import React, { useState, useMemo } from 'react';
import { useRevenue } from '../context/RevenuePropertyContext';
import { DashboardPeriod } from '../types';
import DashboardFilters from '../components/dashboard/DashboardFilters';
import KPIGrid from '../components/dashboard/KPIGrid';
import PickupPaceTable from '../components/dashboard/PickupPaceTable';
import BusinessMix from '../components/dashboard/BusinessMix';
import LOSLeadTime from '../components/dashboard/LOSLeadTime';
import UpcomingEvents from '../components/dashboard/UpcomingEvents';
import AlertsSidebar from '../components/dashboard/AlertsSidebar';
import { computeKpis, computePickupTable, computeBusinessMix, computeLOSLeadTime, computeUpcomingEvents, computeAlerts, getPeriodDates, filterReservations } from '../utils/revenueCalculations';

const RevenueDashboard: React.FC = () => {
  const { reservations, events, properties, activePropertyId } = useRevenue();
  const activeProperty = properties.find(p => p.id === activePropertyId);

  // Filter State
  const [period, setPeriod] = useState<DashboardPeriod>('MTD');
  const [isNet, setIsNet] = useState(true);
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const [includeNoShow, setIncludeNoShow] = useState(false);
  const [mixMode, setMixMode] = useState<'channel' | 'segment'>('channel');

  // Derived Data
  const stats = useMemo(() => 
    computeKpis(reservations, activeProperty, period, isNet, includeCancelled, includeNoShow),
    [reservations, activeProperty, period, isNet, includeCancelled, includeNoShow]
  );

  const pickupTableData = useMemo(() => 
    computePickupTable(reservations, events, 30),
    [reservations, events]
  );

  const businessMixData = useMemo(() => {
    const { from, to } = getPeriodDates(period);
    const filtered = filterReservations(reservations, from, to, includeCancelled, includeNoShow);
    return computeBusinessMix(filtered, mixMode, isNet);
  }, [reservations, period, mixMode, isNet, includeCancelled, includeNoShow]);

  const losLeadTimeData = useMemo(() => {
    const { from, to } = getPeriodDates(period);
    const filtered = filterReservations(reservations, from, to, includeCancelled, includeNoShow);
    return computeLOSLeadTime(filtered);
  }, [reservations, period, includeCancelled, includeNoShow]);

  const upcomingEventsData = useMemo(() => 
    computeUpcomingEvents(events, reservations, activeProperty),
    [events, reservations, activeProperty]
  );

  const alertsData = useMemo(() => 
    computeAlerts(reservations, pickupTableData, businessMixData),
    [reservations, pickupTableData, businessMixData]
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Header & Filters */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Revenue Intelligence</h1>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Dashboard de Acción Inmediata</p>
        </div>
        
        <DashboardFilters 
          period={period} setPeriod={setPeriod}
          isNet={isNet} setIsNet={setIsNet}
          includeCancelled={includeCancelled} setIncludeCancelled={setIncludeCancelled}
          includeNoShow={includeNoShow} setIncludeNoShow={setIncludeNoShow}
          activePropertyName={activeProperty?.name}
        />
      </div>

      {/* KPI Row */}
      <KPIGrid stats={stats} />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Left Column: Pickup & Business Mix */}
        <div className="xl:col-span-9 space-y-6">
          <div className="h-[600px]">
            <PickupPaceTable data={pickupTableData} />
          </div>
          
          <BusinessMix 
            data={businessMixData} 
            mode={mixMode} 
            setMode={setMixMode} 
          />
        </div>

        {/* Right Column: Context & Alerts */}
        <div className="xl:col-span-3 space-y-6">
          <AlertsSidebar alerts={alertsData} />
          
          <UpcomingEvents events={upcomingEventsData} />
          
          <LOSLeadTime data={losLeadTimeData} />
        </div>
      </div>
    </div>
  );
};

export default RevenueDashboard;