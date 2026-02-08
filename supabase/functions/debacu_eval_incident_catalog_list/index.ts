// supabase/functions/debacu_eval_incident_catalog_list/index.ts
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
    "Vary": "Origin",
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

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");

  // Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") return json(origin, 405, { error: "Method not allowed" });

  try {
    // --------- Headers de seguridad ----------
    const jwt = getBearer(req);
    if (!jwt) return json(origin, 401, { error: "Missing Authorization Bearer token" });

    const sessionToken = req.headers.get("x-session-token") || "";
    if (!sessionToken) return json(origin, 401, { error: "Missing x-session-token" });

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
          // opcional: para que quede claro en logs
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
      },
    });

    // --------- Validar JWT Supabase (usuario logado) ----------
    // Con service role, podemos validar el JWT del usuario llamando a auth.getUser(jwt)
    const { data: u, error: uErr } = await supabase.auth.getUser(jwt);
    if (uErr || !u?.user) return json(origin, 401, { error: "Invalid Supabase JWT" });

    // --------- Resolver sesión Debacu (sessionToken -> customerId) ----------
    // AJUSTA AQUÍ si tu tabla/columnas difieren.
    // En tus dumps: debacu_eval_sessions tiene: id, token, customer_id, customer_name, app_code, ...
    const { data: sess, error: sErr } = await supabase
      .from("debacu_eval_sessions")
      .select("token, customer_id, app_code, expires_at, revoked_at")
      .eq("token", sessionToken)
      .maybeSingle();

    if (sErr) return json(origin, 500, { error: sErr.message });

    // Si no existe sesión, cortamos
    if (!sess) return json(origin, 401, { error: "Invalid debacu session token" });

    // Chequeos básicos de sesión
    if (sess.revoked_at) return json(origin, 401, { error: "Session revoked" });
    if (sess.app_code && sess.app_code !== appId) {
      return json(origin, 401, { error: "Session app mismatch" });
    }
    if (sess.expires_at) {
      const exp = new Date(sess.expires_at).getTime();
      if (!Number.isNaN(exp) && exp < Date.now()) {
        return json(origin, 401, { error: "Session expired" });
      }
    }

    const customerId: string | null = sess.customer_id ?? customerIdFromBody;
    if (!customerId) {
      return json(origin, 400, { error: "Missing customerId (session has no customer_id)" });
    }

    // --------- 1) Catálogo base de incidencias ----------
    // OJO: en tu código pusiste "debacu_incident_catalog".
    // En Debacu Eval normalmente prefijas con debacu_eval_... pero dejo tu nombre tal cual.
    const { data: base, error: e1 } = await supabase
      .from("debacu_incident_catalog")
      .select("*")
      .eq("is_active", true)
      .order("incident_type", { ascending: true });

    if (e1) return json(origin, 500, { error: e1.message });

    // --------- 2) Overrides del hotel ----------
    // Esta tabla mezcla overrides de incidentes y artículos.
    const { data: overrides, error: e2 } = await supabase
      .from("debacu_hotel_incident_pricing")
      .select("*")
      .eq("customer_id", customerId)
      .eq("is_active", true);

    if (e2) return json(origin, 500, { error: e2.message });

    const overrideByIncident = new Map<string, any>();
    for (const row of overrides ?? []) {
      // interpretamos como override de incidencia cuando hay incident_type y NO hay item_code
      if (row?.incident_type && !row?.item_code) {
        overrideByIncident.set(row.incident_type, row);
      }
    }

    const incidents = (base ?? []).map((i: any) => {
      const ov = overrideByIncident.get(i.incident_type) ?? null;
      return {
        ...i,
        override: ov
          ? {
              unit_price_override: ov.unit_price_override ?? null,
              gross_min_override: ov.gross_min_override ?? null,
              gross_max_override: ov.gross_max_override ?? null,
              recovery_pct_override: ov.recovery_pct_override ?? null,
              notes: ov.notes ?? null,
              updated_at: ov.updated_at ?? null,
            }
          : null,
      };
    });

    return json(origin, 200, { appId, customerId, incidents });
  } catch (e) {
    return json(origin, 500, { error: String((e as any)?.message ?? e) });
  }
});
