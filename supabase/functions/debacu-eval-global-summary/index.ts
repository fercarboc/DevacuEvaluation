import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "https://debacu.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

/* =========================
 * AUTH (JWT)
 * ========================= */
function userClient(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

async function requireJwtUser(req: Request) {
  const sb = userClient(req);
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/* =========================
 * Normalizadores + Top/Rest
 * ========================= */
function stripAccentsUpper(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function normalizeCountry(raw: string | null): string {
  const v = String(raw ?? "").trim();
  if (!v) return "N/D";
  const up = stripAccentsUpper(v);

  // España
  if (up === "ES" || up === "ESP" || up === "ESPANA" || up === "ESPAÑA" || up === "SPAIN") return "ESP";

  // ISO2 / ISO3
  if (/^[A-Z]{2}$/.test(up)) return up;
  if (/^[A-Z]{3}$/.test(up)) return up;

  // nombre (no inventamos ISO)
  return up;
}

function normalizePlatform(raw: string | null): string {
  const v = String(raw ?? "").trim();
  if (!v) return "N/D";
  return stripAccentsUpper(v);
}

function topNWithRest(
  counts: Record<string, number>,
  total: number,
  n: number,
  keyName: "country" | "platform",
) {
  const entries = Object.entries(counts)
    .filter(([k, c]) => k && (c ?? 0) > 0)
    .sort((a, b) => b[1] - a[1]);

  const top = entries.slice(0, n).map(([k, c]) => ({
    [keyName]: k,
    pct: total > 0 ? Number(((c * 100) / total).toFixed(1)) : 0,
  }));

  const restEntries = entries.slice(n);
  const restCount = restEntries.reduce((acc, [, c]) => acc + c, 0);

  return {
    top,
    rest: {
      keys: restEntries.length, // nº de items fuera del top
      pct: total > 0 ? Number(((restCount * 100) / total).toFixed(1)) : 0,
    },
  };
}

export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders(req) });
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  try {
    // 1) JWT obligatorio (solo controla acceso)
    await requireJwtUser(req);

    // 2) GLOBAL dataset (no filtrar por hotel)
    const { data, error } = await admin
      .from("debacu_evaluations")
      .select("platform,nationality");

    if (error) return json(req, 500, { ok: false, error: error.message });

    const rows = (data ?? []) as { platform: string | null; nationality: string | null }[];

    const platformCounts: Record<string, number> = {};
    const countryCounts: Record<string, number> = {};

    for (const r of rows) {
      const p = normalizePlatform(r.platform);
      const c = normalizeCountry(r.nationality);
      platformCounts[p] = (platformCounts[p] ?? 0) + 1;
      countryCounts[c] = (countryCounts[c] ?? 0) + 1;
    }

    const totalCount = rows.length;

    const platformsAgg = topNWithRest(platformCounts, totalCount, 5, "platform");
    const countriesAgg = topNWithRest(countryCounts, totalCount, 5, "country");

    return json(req, 200, {
      ok: true,
      data: {
        // ✅ compatibilidad: tu UI antigua suele depender de esto
        totalCount,
        platformCounts,
        countryCounts,

        // ✅ nuevo: Top5 + resto en %
        countries_total_distinct: Object.keys(countryCounts).length,
        platforms_total_distinct: Object.keys(platformCounts).length,

        countries_top: countriesAgg.top,
        countries_rest: countriesAgg.rest, // { keys, pct }
        platforms_top: platformsAgg.top,
        platforms_rest: platformsAgg.rest,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const code = msg === "UNAUTHENTICATED" ? 401 : 500;
    console.error("debacu-eval-global-summary error:", e);
    return json(req, code, { ok: false, error: "request_failed", detail: msg });
  }
});
