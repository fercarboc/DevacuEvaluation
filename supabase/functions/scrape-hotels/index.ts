// ============================================================
//  Supabase Edge Function: scrape-hotels
//  Fuente: Overpass API (OpenStreetMap) — gratuita, sin API key
//  Uso: POST /functions/v1/scrape-hotels
//  Body: { "province": "Barcelona", "bbox": [1.49,41.08,2.33,41.79] }
// ============================================================
//
//  DESPLIEGUE:
//    supabase functions deploy scrape-hotels --no-verify-jwt
//
//  VARIABLES DE ENTORNO necesarias en Supabase Dashboard:
//    SUPABASE_URL         → automática en Edge Functions
//    SUPABASE_SERVICE_ROLE_KEY → añadir manualmente (Settings > Edge Functions)
//
//  LLAMADA DE EJEMPLO (desde curl o Postman):
//    curl -X POST https://<project>.supabase.co/functions/v1/scrape-hotels \
//      -H "Authorization: Bearer <service_role_key>" \
//      -H "Content-Type: application/json" \
//      -d '{"province":"Barcelona","bbox":[1.49,41.08,2.33,41.79]}'
//
//  BBOXES DE PROVINCIAS ESPAÑOLAS MÁS COMUNES:
//    Barcelona : [1.49, 41.08, 2.33, 41.79]
//    Madrid    : [-4.58, 39.88, -3.05, 40.92]
//    Málaga    : [-5.37, 36.49, -3.81, 37.23]
//    Valencia  : [-1.53, 38.61, -0.00, 40.09]
// ============================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Tipos ────────────────────────────────────────────────────

interface RequestBody {
  province: string;
  bbox: [number, number, number, number]; // [lon_min, lat_min, lon_max, lat_max]
  dry_run?: boolean; // si true, devuelve los datos sin insertar en DB
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags: Record<string, string>;
}

interface HotelRecord {
  hotel_name: string;
  category: number;
  chain_name: string | null;
  is_independent: boolean;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  locality: string | null;
  postal_code: string | null;
  province: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  source: string;
  source_url: string;
}

// ── Mapeo de estrellas OSM → integer ─────────────────────────

const STAR_MAP: Record<string, number> = {
  "1": 1, "1.0": 1,
  "2": 2, "2.0": 2,
  "3": 3, "3.0": 3,
  "4": 4, "4.0": 4,
  "5": 5, "5.0": 5,
};

// Cadenas hoteleras conocidas (detección por nombre)
const KNOWN_CHAINS: [string, string][] = [
  ["NH ", "NH Hotels"],
  ["Meliá", "Meliá Hotels"],
  ["Barceló", "Barceló Hotels"],
  ["Hilton", "Hilton"],
  ["Marriott", "Marriott"],
  ["Accor", "Accor"],
  ["Novotel", "Accor"],
  ["Ibis", "Accor"],
  ["Mercure", "Accor"],
  ["AC Hotel", "AC Hotels by Marriott"],
  ["Catalonia", "Catalonia Hotels"],
  ["H10", "H10 Hotels"],
  ["Eurostars", "Eurostars Hotels"],
  ["Silken", "Silken Hotels"],
  ["Vincci", "Vincci Hotels"],
  ["Ayre", "Ayre Hotels"],
  ["Husa", "Husa Hotels"],
  ["Best Western", "Best Western"],
  ["Holiday Inn", "IHG"],
  ["Radisson", "Radisson"],
  ["Hyatt", "Hyatt"],
  ["Wyndham", "Wyndham"],
];

// ── Helpers ───────────────────────────────────────────────────

function detectChain(name: string): { chain: string | null; isIndependent: boolean } {
  for (const [keyword, chain] of KNOWN_CHAINS) {
    if (name.toLowerCase().includes(keyword.toLowerCase())) {
      return { chain, isIndependent: false };
    }
  }
  return { chain: null, isIndependent: true };
}

function parseStars(tags: Record<string, string>): number {
  // OSM usa "stars" o "tourism:stars"
  const raw = tags["stars"] ?? tags["tourism:stars"] ?? tags["hotel:stars"] ?? "";
  return STAR_MAP[raw.trim()] ?? 0; // 0 = desconocido
}

function buildAddress(tags: Record<string, string>): string | null {
  const street = tags["addr:street"] ?? "";
  const number = tags["addr:housenumber"] ?? "";
  if (!street) return null;
  return number ? `${street} ${number}` : street;
}

function elementToCoords(el: OverpassElement): { lat: number | null; lon: number | null } {
  if (el.lat !== undefined && el.lon !== undefined) {
    return { lat: el.lat, lon: el.lon };
  }
  if (el.center) {
    return { lat: el.center.lat, lon: el.center.lon };
  }
  return { lat: null, lon: null };
}

function elementToHotel(el: OverpassElement, province: string): HotelRecord | null {
  const tags = el.tags ?? {};
  const name = tags["name"] ?? tags["official_name"] ?? "";
  if (!name) return null;

  const { lat, lon } = elementToCoords(el);
  const stars = parseStars(tags);
  const { chain, isIndependent } = detectChain(name);

  return {
    hotel_name: name,
    category: stars > 0 ? stars : 3, // default 3★ si OSM no tiene dato
    chain_name: tags["brand"] ?? chain,
    is_independent: !tags["brand"] && isIndependent,
    phone: tags["phone"] ?? tags["contact:phone"] ?? null,
    email: tags["email"] ?? tags["contact:email"] ?? null,
    website: tags["website"] ?? tags["contact:website"] ?? tags["url"] ?? null,
    address: buildAddress(tags),
    locality: tags["addr:city"] ?? tags["addr:town"] ?? tags["addr:village"] ?? null,
    postal_code: tags["addr:postcode"] ?? null,
    province,
    country: "España",
    latitude: lat,
    longitude: lon,
    source: "overpass_osm",
    source_url: `https://www.openstreetmap.org/${el.type}/${el.id}`,
  };
}

// ── Query Overpass ─────────────────────────────────────────────

async function fetchFromOverpass(bbox: [number, number, number, number]): Promise<OverpassElement[]> {
  // bbox en Overpass es: south,west,north,east  →  lat_min,lon_min,lat_max,lon_max
  const [lonMin, latMin, lonMax, latMax] = bbox;
  const overpassBbox = `${latMin},${lonMin},${latMax},${lonMax}`;

  const query = `
    [out:json][timeout:60];
    (
      node["tourism"="hotel"](${overpassBbox});
      way["tourism"="hotel"](${overpassBbox});
      relation["tourism"="hotel"](${overpassBbox});
      node["tourism"="hostel"](${overpassBbox});
      way["tourism"="hostel"](${overpassBbox});
      node["tourism"="motel"](${overpassBbox});
      way["tourism"="motel"](${overpassBbox});
      node["tourism"="guest_house"](${overpassBbox});
      way["tourism"="guest_house"](${overpassBbox});
    );
    out center tags;
  `;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    throw new Error(`Overpass error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.elements ?? [];
}

// ── Inserción en Supabase con upsert por nombre+provincia ──────

async function upsertHotels(
  supabase: ReturnType<typeof createClient>,
  hotels: HotelRecord[]
): Promise<{ inserted: number; skipped: number; errors: string[] }> {
  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;

  // Lotes de 50 para no saturar
  const BATCH_SIZE = 50;
  for (let i = 0; i < hotels.length; i += BATCH_SIZE) {
    const batch = hotels.slice(i, i + BATCH_SIZE);

    const { error, count } = await supabase
      .from("spain_hotels_master")
      .upsert(batch, {
        onConflict: "hotel_name,province", // evita duplicados
        ignoreDuplicates: true,
        count: "exact",
      });

    if (error) {
      errors.push(`Batch ${i / BATCH_SIZE + 1}: ${error.message}`);
      skipped += batch.length;
    } else {
      inserted += count ?? batch.length;
    }
  }

  return { inserted, skipped, errors };
}

// ── Handler principal ──────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // ── Parsear body ──
  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { province, bbox, dry_run = false } = body;

  if (!province || !bbox || bbox.length !== 4) {
    return new Response(
      JSON.stringify({ error: "Required: province (string) and bbox ([lon_min, lat_min, lon_max, lat_max])" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // 1. Fetch desde Overpass
    console.log(`[scrape-hotels] Consultando Overpass para ${province}...`);
    const elements = await fetchFromOverpass(bbox);
    console.log(`[scrape-hotels] Elementos OSM recibidos: ${elements.length}`);

    // 2. Transformar a HotelRecord
    const hotels: HotelRecord[] = elements
      .map((el) => elementToHotel(el, province))
      .filter((h): h is HotelRecord => h !== null);

    console.log(`[scrape-hotels] Hoteles válidos tras parseo: ${hotels.length}`);

    // 3. dry_run: devolver datos sin insertar
    if (dry_run) {
      return new Response(
        JSON.stringify({
          dry_run: true,
          province,
          total_found: hotels.length,
          sample: hotels.slice(0, 5),
          hotels,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Insertar en Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const result = await upsertHotels(supabase, hotels);

    console.log(`[scrape-hotels] Insertados: ${result.inserted} | Skipped: ${result.skipped}`);

    return new Response(
      JSON.stringify({
        success: true,
        province,
        total_found: hotels.length,
        inserted: result.inserted,
        skipped: result.skipped,
        errors: result.errors,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[scrape-hotels] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});