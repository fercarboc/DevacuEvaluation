// ============================================================
// ApaleoRoomMapper.ts
// Bloque 4 — Integrador Universal PMS v1.0
//
// Transforma RoomTypes y Rooms RAW de Apaleo a modelos
// canónicos Debacu. Sin PII — datos estructurales seguros.
// ============================================================

import type {
  ApaleoRoomType,
  ApaleoRoom,
} from "../connectors/ApaleoConnector.ts";

// ============================================================
// Tipos canónicos
// ============================================================

export interface CanonicalRoomType {
  org_id: string;
  property_id: string;
  connection_id: string;
  external_room_type_id: string;
  code: string | null;
  name: string;
  description: string | null;
  capacity_adults: number | null;
  capacity_children: number | null;
  max_occupancy: number | null;
  is_active: boolean;
  raw_status: string | null;
  source_updated_at: string | null;
}

export type CanonicalRoomOperationalStatus =
  | "AVAILABLE"
  | "OUT_OF_SERVICE"
  | "DIRTY"
  | "CLEAN"
  | "UNKNOWN";

export interface CanonicalRoom {
  org_id: string;
  property_id: string;
  connection_id: string;
  external_room_id: string;
  external_room_type_id: string | null;
  room_number: string | null;
  room_name: string | null;
  floor: string | null;
  building: string | null;
  is_active: boolean;
  operational_status: CanonicalRoomOperationalStatus;
  raw_status: string | null;
  source_updated_at: string | null;
}

// ============================================================
// Helpers
// ============================================================

function clean(v?: string | null): string {
  return String(v ?? "").trim();
}

function extractMultiLangName(
  name?: Record<string, string> | null,
): string {
  if (!name) return "Sin nombre";
  return name["es"] ?? name["en"] ?? Object.values(name)[0] ?? "Sin nombre";
}

function extractMultiLangDesc(
  desc?: Record<string, string> | null,
): string | null {
  if (!desc) return null;
  return desc["es"] ?? desc["en"] ?? Object.values(desc)[0] ?? null;
}

// Mapeo de estados operativos Apaleo → Debacu
const APALEO_ROOM_STATUS_MAP: Record<string, CanonicalRoomOperationalStatus> = {
  "Clean": "CLEAN",
  "Dirty": "DIRTY",
  "OutOfService": "OUT_OF_SERVICE",
  "OutOfOrder": "OUT_OF_SERVICE",
  "Available": "AVAILABLE",
  "Occupied": "AVAILABLE", // Ocupada pero operativa
};

function mapRoomStatus(
  status?: string | null,
  condition?: string | null,
): CanonicalRoomOperationalStatus {
  const s = clean(status);
  const c = clean(condition);

  // OutOfService/OutOfOrder tienen prioridad
  if (s === "OutOfService" || s === "OutOfOrder") return "OUT_OF_SERVICE";

  // Estado de condición (limpieza)
  if (c && APALEO_ROOM_STATUS_MAP[c]) return APALEO_ROOM_STATUS_MAP[c];

  return APALEO_ROOM_STATUS_MAP[s] ?? "UNKNOWN";
}

// ============================================================
// RoomType Mapper
// ============================================================

export function mapApaleoRoomType(
  raw: ApaleoRoomType,
  context: {
    org_id: string;
    property_id: string;
    connection_id: string;
  },
): CanonicalRoomType {
  const maxPersons = typeof raw.maxPersons === "number" ? raw.maxPersons : null;

  return {
    org_id: context.org_id,
    property_id: context.property_id,
    connection_id: context.connection_id,

    external_room_type_id: raw.id,
    code: clean(raw.code) || null,
    name: extractMultiLangName(raw.name),
    description: extractMultiLangDesc(raw.description),

    // Apaleo solo devuelve maxPersons, estimamos adults = maxPersons
    capacity_adults: maxPersons,
    capacity_children: null, // No disponible en Apaleo
    max_occupancy: maxPersons,

    is_active: true,
    raw_status: null,
    source_updated_at: null,
  };
}

export function mapApaleoRoomTypes(
  rawList: ApaleoRoomType[],
  context: {
    org_id: string;
    property_id: string;
    connection_id: string;
  },
): CanonicalRoomType[] {
  return rawList.map((r) => mapApaleoRoomType(r, context));
}

// ============================================================
// Room Mapper
// ============================================================

export function mapApaleoRoom(
  raw: ApaleoRoom,
  context: {
    org_id: string;
    property_id: string;
    connection_id: string;
  },
): CanonicalRoom {
  return {
    org_id: context.org_id,
    property_id: context.property_id,
    connection_id: context.connection_id,

    external_room_id: raw.id,
    external_room_type_id: raw.type?.id ?? null,

    room_number: clean(raw.name) || null,
    room_name: clean(raw.name) || null,
    floor: raw.floor != null ? String(raw.floor) : null,
    building: clean(raw.building) || null,

    is_active: raw.status !== "OutOfService" && raw.status !== "OutOfOrder",
    operational_status: mapRoomStatus(raw.status, raw.condition),
    raw_status: clean(raw.status) || null,

    source_updated_at: null, // Apaleo rooms no tienen updated_at
  };
}

export function mapApaleoRooms(
  rawList: ApaleoRoom[],
  context: {
    org_id: string;
    property_id: string;
    connection_id: string;
  },
): CanonicalRoom[] {
  return rawList.map((r) => mapApaleoRoom(r, context));
}