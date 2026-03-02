// ---------------------------------------------
// Normalización (país + plataforma + keys)
// ---------------------------------------------

export type ChannelCode = "OTA" | "DIRECT" | "AGENCY" | "B2B" | "OTHER";
export type PlatformCode =
  | "BOOKING"
  | "EXPEDIA"
  | "AIRBNB"
  | "DIRECT_WEB"
  | "DIRECT_PHONE"
  | "WALK_IN"
  | "TRAVEL_AGENCY"
  | "TTOO"
  | "MIRAI"
  | "OTHER";

export function normStr(v: unknown): string {
  return String(v ?? "").trim();
}

export function upper(v: unknown): string {
  return normStr(v).toUpperCase();
}

// ------------------
// Documento / Email / Teléfono
// ------------------

export function normalizeDocument(v: unknown): string | null {
  const s = upper(v).replace(/\s+/g, "").replace(/[-.]/g, "");
  return s.length ? s : null;
}

export function normalizeEmail(v: unknown): string | null {
  const s = normStr(v).toLowerCase();
  // simple sanity: must contain '@' and a dot after it
  if (!s || !s.includes("@")) return null;
  const at = s.indexOf("@");
  if (at < 1) return null;
  const domain = s.slice(at + 1);
  if (!domain.includes(".")) return null;
  return s;
}

export function normalizePhoneDigits(v: unknown): string | null {
  const digits = normStr(v).replace(/\D+/g, "");
  // muy conservador: si < 6 dígitos, es ruido
  if (!digits || digits.length < 6) return null;
  return digits;
}

// ------------------
// País: a ISO2
// ------------------

const COUNTRY_TO_ISO2: Record<string, string> = {
  // España
  ES: "ES",
  ESP: "ES",
  "ESPAÑA": "ES",
  SPAIN: "ES",

  // Reino Unido
  GB: "GB",
  GBR: "GB",
  UK: "GB",
  "UNITED KINGDOM": "GB",

  // Portugal
  PT: "PT",
  PRT: "PT",
  PORTUGAL: "PT",

  // Italia
  IT: "IT",
  ITA: "IT",
  ITALIA: "IT",
  ITALY: "IT",

  // Francia
  FR: "FR",
  FRA: "FR",
  FRANCE: "FR",

  // Países Bajos
  NL: "NL",
  NLD: "NL",
  HOLLAND: "NL",
  NETHERLANDS: "NL",

  // Bélgica
  BE: "BE",
  BEL: "BE",
  BELGIUM: "BE",

  // Alemania
  DE: "DE",
  DEU: "DE",
  GERMANY: "DE",

  // Irlanda
  IE: "IE",
  IRL: "IE",
  IRELAND: "IE",

  // Suiza
  CH: "CH",
  CHE: "CH",
  SWITZERLAND: "CH",

  // Austria
  AT: "AT",
  AUT: "AT",

  // Suecia
  SE: "SE",
  SWE: "SE",

  // Noruega
  NO: "NO",
  NOR: "NO",

  // Dinamarca
  DK: "DK",
  DNK: "DK",

  // Finlandia
  FI: "FI",
  FIN: "FI",

  // Polonia
  PL: "PL",
  POL: "PL",

  // Chequia
  CZ: "CZ",
  CZE: "CZ",

  // Rumanía
  RO: "RO",
  ROU: "RO",

  // Bulgaria
  BG: "BG",
  BGR: "BG",

  // Ucrania
  UA: "UA",
  UKR: "UA",

  // Rusia
  RU: "RU",
  RUS: "RU",

  // EEUU
  US: "US",
  USA: "US",
  "UNITED STATES": "US",

  // Canadá
  CA: "CA",
  CAN: "CA",

  // México
  MX: "MX",
  MEX: "MX",

  // Argentina
  AR: "AR",
  ARG: "AR",

  // Colombia
  CO: "CO",
  COL: "CO",

  // Chile
  CL: "CL",
  CHL: "CL",

  // Marruecos
  MA: "MA",
  MAR: "MA",
};

export function normalizeCountryIso2(raw: unknown): string | null {
  const s0 = upper(raw);
  if (!s0) return null;

  // Limpieza básica para evitar valores con basura
  const s = s0.replace(/\s+/g, " ").trim();

  // Si ya es ISO2 válido (2 letras) lo aceptamos pero solo si es conocido en el mapa o parece razonable
  if (/^[A-Z]{2}$/.test(s)) return COUNTRY_TO_ISO2[s] ?? s;

  // Si es ISO3 u otra etiqueta: map
  const mapped = COUNTRY_TO_ISO2[s];
  return mapped ?? null;
}

// ------------------
// Plataforma + Canal
// ------------------

export type PlatformNorm = {
  platformRaw: string;
  platformCode: PlatformCode;
  channelCode: ChannelCode;
};

function channelFromPlatform(platformCode: PlatformCode): ChannelCode {
  switch (platformCode) {
    case "BOOKING":
    case "EXPEDIA":
    case "AIRBNB":
      return "OTA";
    case "DIRECT_WEB":
    case "DIRECT_PHONE":
    case "WALK_IN":
      return "DIRECT";
    case "TRAVEL_AGENCY":
      return "AGENCY";
    case "TTOO":
      return "B2B";
    case "MIRAI":
      // Recomendación: tratadlo como DIRECT para simplificar
      return "DIRECT";
    default:
      return "OTHER";
  }
}

function containsAny(s: string, needles: string[]): boolean {
  return needles.some((n) => s.includes(n));
}

export function normalizePlatform(raw: unknown): PlatformNorm {
  const platformRaw = normStr(raw);
  const s = upper(raw);

  // Vacío
  if (!s) {
    return { platformRaw, platformCode: "OTHER", channelCode: "OTHER" };
  }

  // OTA directas
  if (s.includes("BOOKING")) {
    return { platformRaw, platformCode: "BOOKING", channelCode: "OTA" };
  }
  if (containsAny(s, ["EXPEDIA", "TRAVELSCAPE"])) {
    return { platformRaw, platformCode: "EXPEDIA", channelCode: "OTA" };
  }
  if (s.includes("AIRBNB")) {
    return { platformRaw, platformCode: "AIRBNB", channelCode: "OTA" };
  }

  // MIRAI
  if (s.includes("MIRAI")) {
    const platformCode: PlatformCode = "MIRAI";
    return { platformRaw, platformCode, channelCode: channelFromPlatform(platformCode) };
  }

  // Directo web / motor propio
  if (
    containsAny(s, [
      "MOTOR_PROPIO",
      "MOTOR PROPIO",
      "MOTORPROPIO",
      "WEB",
      "DIRECT",
      "DIRECTA",
      "OTROS:PROPIA",
      "PROPIA",
    ])
  ) {
    const platformCode: PlatformCode = "DIRECT_WEB";
    return { platformRaw, platformCode, channelCode: channelFromPlatform(platformCode) };
  }

  // Teléfono
  if (containsAny(s, ["PHONE", "TELEFONO", "TEL", "CALL"])) {
    const platformCode: PlatformCode = "DIRECT_PHONE";
    return { platformRaw, platformCode, channelCode: channelFromPlatform(platformCode) };
  }

  // Walk-in
  if (containsAny(s, ["WALKIN", "WALK-IN", "RECEPCION", "RECEPTION"])) {
    const platformCode: PlatformCode = "WALK_IN";
    return { platformRaw, platformCode, channelCode: channelFromPlatform(platformCode) };
  }

  // Agencia
  if (containsAny(s, ["AGENCIA", "AGENCY", "TRAVEL AGENCY"])) {
    const platformCode: PlatformCode = "TRAVEL_AGENCY";
    return { platformRaw, platformCode, channelCode: channelFromPlatform(platformCode) };
  }

  // TTOO
  if (containsAny(s, ["TTOO", "TOUR OPERATOR", "TOUROPERATOR"])) {
    const platformCode: PlatformCode = "TTOO";
    return { platformRaw, platformCode, channelCode: channelFromPlatform(platformCode) };
  }

  // Otros
  return { platformRaw, platformCode: "OTHER", channelCode: "OTHER" };
}