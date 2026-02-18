// supabase/functions/debacu-eval-global-summary/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`missing_env:${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

function supabaseServiceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function err(req: Request, status: number, detail: string) {
  return json(req, status, { ok: false, error: "request_failed", detail });
}

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return err(req, 405, "method_not_allowed");

  try {
    // 1) JWT obligatorio (control de acceso)
    await requireUser(req);

    // 2) GLOBAL dataset (no filtrar por hotel)
    const sb = supabaseServiceClient();

    const { data, error } = await sb
      .from("debacu_evaluations")
      .select("platform,nationality");

    if (error) return err(req, 500, "db_read_failed");

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
        // ✅ compatibilidad UI antigua
        totalCount,
        platformCounts,
        countryCounts,

        // ✅ Top5 + resto en %
        countries_total_distinct: Object.keys(countryCounts).length,
        platforms_total_distinct: Object.keys(platformCounts).length,

        countries_top: countriesAgg.top,
        countries_rest: countriesAgg.rest,
        platforms_top: platformsAgg.top,
        platforms_rest: platformsAgg.rest,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") return err(req, 401, "UNAUTHORIZED");
    if (msg === "FORBIDDEN") return err(req, 403, "FORBIDDEN");

    return err(req, 500, "internal_error");
  }
});
