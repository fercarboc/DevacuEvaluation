export type PlanType = 'Básico' | 'Medium' | 'Premium' | 'Grandes Cadenas';

export interface Plan {
  id: PlanType;
  maxProperties: number;
}

export type PropertyType = 'Hotel' | 'Apartamento' | 'Rural' | 'Hostel';

export interface Property {
  id: string;
  name: string;
  company: string;
  cif: string;
  type: PropertyType;
  roomsCount: number;
  category: string;
  address: string;
  city: string;
  postalCode: string;
  province: string;
  country: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  availableRooms: number;
  baseRate: number;
  currency: string;
  vatIncluded: boolean;
  active: boolean;
}

export type DemandIndex = 'Verde' | 'Amarillo' | 'Rojo';

export type EventImpact = 'LOW' | 'MEDIUM' | 'HIGH';
export type EventType = 'FAIR' | 'HOLIDAY' | 'HIGH_SEASON' | 'LOW_SEASON' | 'BRIDGE' | 'OTHER';

export type DashboardPeriod = 'MTD' | 'LAST_30' | 'NEXT_30' | 'NEXT_90' | 'YTD';

export interface EventRow {
  id: string;
  propertyId: string;
  name: string;
  type: EventType;
  startDate: string;
  endDate: string;
  impact: EventImpact;
  note?: string;
}

export interface PickupData {
  propertyId: string;
  arrivalDate: string;
  occToday: number;
  roomsToday: number;
  roomsHistory: number;
  pickup: number;
  adrToday: number;
  revenueToday: number;
  revenueHistory: number;
  revenuePickup: number;
  paceVsLY: number;
  demandIndex: DemandIndex;
}

export interface KPIStats {
  value: number;
  lastYearValue: number;
  label: string;
  type: 'percentage' | 'currency' | 'number';
}

export interface DailyData {
  propertyId: string;
  date: string;
  occ: number;
  roomsSold: number;
  adr: number;
  revenue: number;
  pvp: number;
  isHighOcc?: boolean;
  isLowOcc?: boolean;
}

export interface MonthlyData {
  propertyId: string;
  month: string;
  occ: number;
  rn: number;
  adr: number;
  revenue: number;
  revpar: number;
  difVsLY: number;
}

export interface DashboardData {
  kpis: {
    occ: KPIStats;
    roomsSold: KPIStats;
    adr: KPIStats;
    revenue: KPIStats;
    revpar: KPIStats;
  };
  revenueChart: {
    date: string;
    current: number;
    lastYear: number;
  }[];
  occupancyChart: {
    date: string;
    value: number;
  }[];
}

export interface PickupInsight {
  type: 'positive' | 'negative' | 'neutral';
  message: string;
  date?: string;
}

export type Channel =
  | "DIRECT_WEB"
  | "DIRECT_PHONE"
  | "WALK_IN"
  | "BOOKING"
  | "EXPEDIA"
  | "AIRBNB"
  | "AGENCY"
  | "OTHER";

export type Segment =
  | "LEISURE"
  | "BUSINESS"
  | "CORPORATE"
  | "GROUPS"
  | "LONG_STAY"
  | "OTHER";

export type DailyChannelSegmentRow = {
  propertyId: string;
  date: string; // YYYY-MM-DD
  roomsTotal: number;
  roomsSold: number;
  revenue: number;
  pvp: number;
  channel: Channel;
  segment: Segment;
  status?: "CONFIRMED" | "CANCELLED" | "NO_SHOW" | "CHECKED_IN" | "CHECKED_OUT";
};

export type ReservationRow = {
  propertyId: string;
  reservationId: string;

  bookingDate: string;
  arrivalDate: string;
  departureDate: string;

  rooms: number;
  nights: number; // dep-arr
  revenue: number;

  channel: Channel;
  segment: Segment;

  status:
    | "CONFIRMED"
    | "CANCELLED"
    | "NO_SHOW"
    | "CHECKED_IN"
    | "CHECKED_OUT";

  commissionPct: number;
};