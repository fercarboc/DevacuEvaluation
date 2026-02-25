// supabase/functions/debacu_eval_global_guest_lookup/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { buildIdentityKey } from "../_shared/identity.ts";

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

function sbAdmin(req: Request) {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
}

type Resp = {
  ok: boolean;
  data?: {
    exists: boolean;

    // agregados (RGPD-safe)
    risk_band: "LOW" | "MEDIUM" | "HIGH" | null;
    stays_count: number;
    reservations_count: number;
    incidents_count: number;
    total_gross: number;
    total_recovered: number;
    total_net_loss: number;

    first_seen_date: string | null;
    last_seen_date: string | null;
    last_incident_date: string | null;

    // “técnico-light” (opcional pero útil para auditoría)
    input_kind: "DOC" | "EMAIL" | "PHONE";
  };
  error?: string;
  detail?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);

  try {
    // Auth (si quieres permitir FREE también, esto vale igual).
    const userSb = createClient(
      mustEnv("SUPABASE_URL"),
      mustEnv("SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    await requireUser(userSb);

    const body = await req.json().catch(() => ({}));
    const document = body?.document ?? null;
    const email = body?.email ?? null;
    const phone = body?.phone ?? null;

    const { identity_key, input_kind } = await buildIdentityKey({ document, email, phone });

    const admin = sbAdmin(req);

    const { data, error } = await admin
      .from("debacu_eval_import_guest_index")
      .select(
        [
          "risk_band",
          "stays_count",
          "reservations_count",
          "incidents_count",
          "total_gross",
          "total_recovered",
          "total_net_loss",
          "first_seen_date",
          "last_seen_date",
          "last_incident_date",
        ].join(","),
      )
      .eq("identity_key", identity_key)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      const out: Resp = {
        ok: true,
        data: {
          exists: false,
          risk_band: null,
          stays_count: 0,
          reservations_count: 0,
          incidents_count: 0,
          total_gross: 0,
          total_recovered: 0,
          total_net_loss: 0,
          first_seen_date: null,
          last_seen_date: null,
          last_incident_date: null,
          input_kind,
        },
      };
      return json(req, 200, out);
    }

    const out: Resp = {
      ok: true,
      data: {
        exists: true,
        risk_band: (data.risk_band ?? null) as any,
        stays_count: Number(data.stays_count ?? 0),
        reservations_count: Number(data.reservations_count ?? 0),
        incidents_count: Number(data.incidents_count ?? 0),
        total_gross: Number(data.total_gross ?? 0),
        total_recovered: Number(data.total_recovered ?? 0),
        total_net_loss: Number(data.total_net_loss ?? 0),
        first_seen_date: data.first_seen_date ? String(data.first_seen_date) : null,
        last_seen_date: data.last_seen_date ? String(data.last_seen_date) : null,
        last_incident_date: data.last_incident_date ? String(data.last_incident_date) : null,
        input_kind,
      },
    };
    return json(req, 200, out);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "UNKNOWN";
    const out: Resp = { ok: false, error: msg };
    // 401 si es auth, 400 resto (si quieres afinar, lo hacemos)
    const status = msg === "UNAUTHENTICATED" ? 401 : 400;
    return json(req, status, out);
  }
});