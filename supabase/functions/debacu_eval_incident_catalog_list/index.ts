import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function corsHeaders(origin: string | null) {
  const o = origin ?? "";
  const allowOrigin = ALLOWED_ORIGINS.has(o) ? o : "https://debacu.com";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    Vary: "Origin",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-session-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json" },
  });
}

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

const DEFAULT_APP_ID = "DEBACU_EVAL";

function getBearer(req: Request) {
  const h = req.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? "";
}

type BaseIncident = {
  incident_type: string;
  title: string | null;
  description: string | null;
  severity: number | null;
  default_gross_min: number | null;
  default_gross_max: number | null;
  default_recovery_pct: number | null;
  suggested_actions: string | null;
  is_active: boolean;
};

type HotelOverride = {
  incident_type: string;
  is_active: boolean;

  severity_override: number | null;
  default_gross_min_override: number | null;
  default_gross_max_override: number | null;
  default_recovery_pct_override: number | null;

  title_override: string | null;
  description_override: string | null;
  suggested_actions_override: string | null;
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") return json(origin, 405, { ok: false, error: "Method not allowed" });

  try {
    // --------- Security headers ----------
    const jwt = getBearer(req);
    if (!jwt) return json(origin, 401, { ok: false, error: "Missing Authorization Bearer token" });

    const sessionToken = req.headers.get("x-session-token") || "";
    if (!sessionToken) return json(origin, 401, { ok: false, error: "Missing x-session-token" });

    // --------- Body ----------
    const body = await req.json().catch(() => ({}));
    const appId: string = body.appId ?? DEFAULT_APP_ID;

    // customerId NO debería venir del body, pero dejo fallback controlado
    const customerIdFromBody: string | null = body.customerId ?? null;

    // --------- Supabase admin client (service role) ----------
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
      },
    });

    // --------- Validar JWT Supabase (usuario logado) ----------
    const { data: u, error: uErr } = await supabase.auth.getUser(jwt);
    if (uErr || !u?.user) return json(origin, 401, { ok: false, error: "Invalid Supabase JWT" });

    // --------- Resolver sesión Debacu (sessionToken -> customerId) ----------
    const { data: sess, error: sErr } = await supabase
      .from("debacu_eval_sessions")
      .select("token, customer_id, app_code, expires_at, revoked_at")
      .eq("token", sessionToken)
      .maybeSingle();

    if (sErr) return json(origin, 500, { ok: false, error: sErr.message });
    if (!sess) return json(origin, 401, { ok: false, error: "Invalid debacu session token" });
    if (sess.revoked_at) return json(origin, 401, { ok: false, error: "Session revoked" });
    if (sess.app_code && sess.app_code !== appId) {
      return json(origin, 401, { ok: false, error: "Session app mismatch" });
    }
    if (sess.expires_at) {
      const exp = new Date(sess.expires_at).getTime();
      if (!Number.isNaN(exp) && exp < Date.now()) {
        return json(origin, 401, { ok: false, error: "Session expired" });
      }
    }

    const customerId: string | null = sess.customer_id ?? customerIdFromBody;
    if (!customerId) {
      return json(origin, 400, { ok: false, error: "Missing customerId (session has no customer_id)" });
    }

    // --------- 1) Catálogo base de incidencias (global) ----------
    const { data: base, error: e1 } = await supabase
      .from("debacu_incident_catalog")
      .select(
        "incident_type,title,description,severity,default_gross_min,default_gross_max,default_recovery_pct,suggested_actions,is_active"
      )
      .eq("is_active", true)
      .order("incident_type", { ascending: true });

    if (e1) return json(origin, 500, { ok: false, error: e1.message });

    // --------- 2) Overrides del hotel (NUEVA tabla) ----------
    // OJO: aquí NO filtramos is_active=true, porque si el hotel desactiva (false)
    // necesitamos leerlo para excluirlo.
    const { data: overrides, error: e2 } = await supabase
      .from("debacu_hotel_incident_overrides")
      .select(
        "incident_type,is_active,severity_override,default_gross_min_override,default_gross_max_override,default_recovery_pct_override,title_override,description_override,suggested_actions_override"
      )
      .eq("customer_id", customerId);

    if (e2) return json(origin, 500, { ok: false, error: e2.message });

    const overrideByType = new Map<string, HotelOverride>();
    for (const row of (overrides ?? []) as any[]) {
      if (!row?.incident_type) continue;
      overrideByType.set(String(row.incident_type), {
        incident_type: String(row.incident_type),
        is_active: !!row.is_active,
        severity_override: row.severity_override ?? null,
        default_gross_min_override: row.default_gross_min_override ?? null,
        default_gross_max_override: row.default_gross_max_override ?? null,
        default_recovery_pct_override: row.default_recovery_pct_override ?? null,
        title_override: row.title_override ?? null,
        description_override: row.description_override ?? null,
        suggested_actions_override: row.suggested_actions_override ?? null,
      });
    }

    // --------- 3) Merge effective (Opción A) ----------
    const items = ((base ?? []) as any[])
      .map((b): any => {
        const g: BaseIncident = {
          incident_type: String(b.incident_type),
          title: b.title ?? null,
          description: b.description ?? null,
          severity: b.severity ?? null,
          default_gross_min: b.default_gross_min ?? null,
          default_gross_max: b.default_gross_max ?? null,
          default_recovery_pct: b.default_recovery_pct ?? null,
          suggested_actions: b.suggested_actions ?? null,
          is_active: !!b.is_active,
        };

        const ov = overrideByType.get(g.incident_type) ?? null;

        // is_active efectivo
        const isActive = ov ? !!ov.is_active : g.is_active;
        if (!isActive) return null;

        return {
          incident_type: g.incident_type,
          title: ov?.title_override ?? g.title,
          description: ov?.description_override ?? g.description,
          severity: ov?.severity_override ?? g.severity,
          default_gross_min: ov?.default_gross_min_override ?? g.default_gross_min,
          default_gross_max: ov?.default_gross_max_override ?? g.default_gross_max,
          default_recovery_pct: ov?.default_recovery_pct_override ?? g.default_recovery_pct,
          suggested_actions: ov?.suggested_actions_override ?? g.suggested_actions,
          is_active: true,
          source: ov ? "OVERRIDE" : "GLOBAL",
        };
      })
      .filter(Boolean);

    // orden estable por incident_type
    items.sort((a: any, b: any) => String(a.incident_type).localeCompare(String(b.incident_type)));

    return json(origin, 200, { ok: true, appId, customerId, items });
  } catch (e) {
    return json(origin, 500, { ok: false, error: String((e as any)?.message ?? e) });
  }
});
