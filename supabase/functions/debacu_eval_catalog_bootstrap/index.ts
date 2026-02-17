import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { supabaseServiceClient } from "../_shared/supabase.ts";

type Body = {
  org_id?: string; // recomendado: UI siempre manda org_id
};

function safeStr(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function isMissingRelation(err: any) {
  const msg = String(err?.message ?? "");
  return /relation .* does not exist|does not exist|undefined table/i.test(msg);
}

async function resolveOrgAndCustomer(params: {
  sb: ReturnType<typeof createClient>;
  user_id: string;
  org_id?: string | null;
}) {
  const { sb, user_id } = params;
  const org_id_in = safeStr(params.org_id ?? "");

  // 1) si viene org_id: validar membership ACTIVE para ese org
  if (org_id_in) {
    const { data: mem, error: memErr } = await sb
      .from("debacu_eval_org_members")
      .select("org_id, status")
      .eq("user_id", user_id)
      .eq("org_id", org_id_in)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (memErr) throw new Error(`MEMBERSHIP_FAILED:${memErr.message}`);
    if (!mem?.org_id) throw new Error("FORBIDDEN");

    const { data: org, error: orgErr } = await sb
      .from("debacu_eval_organizations")
      .select("id, customer_id")
      .eq("id", org_id_in)
      .maybeSingle();

    if (orgErr) throw new Error(`ORG_LOOKUP_FAILED:${orgErr.message}`);
    if (!org?.customer_id) throw new Error("FORBIDDEN");

    return { org_id: org_id_in, customer_id: String(org.customer_id) };
  }

  // 2) fallback determinista: primera membership ACTIVE
  const { data: mem1, error: mem1Err } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, status, created_at")
    .eq("user_id", user_id)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (mem1Err) throw new Error(`MEMBERSHIP_FAILED:${mem1Err.message}`);
  if (!mem1?.org_id) throw new Error("FORBIDDEN");

  const org_id = String(mem1.org_id);

  const { data: org, error: orgErr } = await sb
    .from("debacu_eval_organizations")
    .select("id, customer_id")
    .eq("id", org_id)
    .maybeSingle();

  if (orgErr) throw new Error(`ORG_LOOKUP_FAILED:${orgErr.message}`);
  if (!org?.customer_id) throw new Error("FORBIDDEN");

  return { org_id, customer_id: String(org.customer_id) };
}

/**
 * Inserta seeds en una tabla, pero solo si ese customer_id no tiene filas.
 * OJO: NO usamos upsert. Idempotencia por "si está vacío".
 */
async function seedIfEmpty(params: {
  sb: ReturnType<typeof createClient>;
  table: string;
  customer_id: string;
  countSelectColumn: string; // una columna existente en esa tabla
  rows: any[];
}) {
  const { sb, table, customer_id, countSelectColumn, rows } = params;

  const { count, error: cErr } = await sb
    .from(table)
    .select(countSelectColumn, { count: "exact", head: true })
    .eq("customer_id", customer_id);

  if (cErr) {
    if (isMissingRelation(cErr)) return { ok: false as const, reason: "missing_table" as const };
    throw new Error(`DB_COUNT_FAILED:${table}:${cErr.message}`);
  }

  if ((count ?? 0) > 0) return { ok: true as const, seeded: 0 };

  const { error: insErr } = await sb.from(table).insert(rows);
  if (insErr) throw new Error(`DB_INSERT_FAILED:${table}:${insErr.message}`);

  return { ok: true as const, seeded: rows.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "request_failed", detail: "method_not_allowed" });

  try {
    const user = await requireUser(req);

    const body = (await req.json().catch(() => ({}))) as Body;
    const org_id = safeStr(body?.org_id);

    const sb = supabaseServiceClient();

    // tenant
    const { customer_id, org_id: resolved_org_id } = await resolveOrgAndCustomer({
      sb,
      user_id: user.id,
      org_id: org_id || null,
    });

    // =========================
    // Seeds por customer/hotel
    // =========================

    // Incidents
    const incidentSeeds = [
      {
        customer_id,
        incident_type: "MISSING_ITEMS",
        title: "Missing items",
        description: "Objetos faltantes (toallas, albornoces, etc.)",
        severity: 3,
        default_gross_min: null,
        default_gross_max: null,
        default_recovery_pct: null,
        suggested_actions: "Revisar habitación y registrar item faltante",
        is_active: true,
      },
      {
        customer_id,
        incident_type: "PROPERTY_DAMAGE",
        title: "Daños materiales",
        description: "Daños en habitación o zonas comunes",
        severity: 4,
        default_gross_min: 50,
        default_gross_max: 500,
        default_recovery_pct: null,
        suggested_actions: "Fotos + parte interno + comunicación a cliente",
        is_active: true,
      },
      {
        customer_id,
        incident_type: "PAYMENT_ISSUE",
        title: "Problema de pago",
        description: "Impago, tarjeta rechazada, disputa",
        severity: 4,
        default_gross_min: null,
        default_gross_max: null,
        default_recovery_pct: 100,
        suggested_actions: "Intentar cobro / contactar / registrar disputa",
        is_active: true,
      },
      {
        customer_id,
        incident_type: "NO_SHOW",
        title: "No show",
        description: "No presentación",
        severity: 3,
        default_gross_min: null,
        default_gross_max: null,
        default_recovery_pct: 100,
        suggested_actions: "Aplicar política no-show y registrar",
        is_active: true,
      },
    ];

    // Items
    const itemSeeds = [
      {
        customer_id,
        item_code: "TOWEL",
        title: "Toalla",
        category: "Linen",
        unit_price: 12,
        currency: "EUR",
        description: null,
        is_active: true,
      },
      {
        customer_id,
        item_code: "BATHROBE",
        title: "Albornoz",
        category: "Linen",
        unit_price: 35,
        currency: "EUR",
        description: null,
        is_active: true,
      },
      {
        customer_id,
        item_code: "PILLOW",
        title: "Almohada",
        category: "Room",
        unit_price: 20,
        currency: "EUR",
        description: null,
        is_active: true,
      },
    ];

    // =========================
    // TABLAS: intentamos customer-scoped primero
    // (si no existen, fallback)
    // =========================

    // incidents
    let seededIncidents = 0;
    {
      const r1 = await seedIfEmpty({
        sb,
        table: "debacu_incident_catalog_customer",
        customer_id,
        countSelectColumn: "incident_type",
        rows: incidentSeeds,
      });

      if (r1.ok) {
        seededIncidents = r1.seeded;
      } else {
        // fallback
        const r2 = await seedIfEmpty({
          sb,
          table: "debacu_incident_catalog",
          customer_id,
          countSelectColumn: "incident_type",
          rows: incidentSeeds,
        });

        if (!r2.ok) {
          return json(req, 500, {
            ok: false,
            error: "request_failed",
            detail: "missing_catalog_tables: incidents",
          });
        }

        seededIncidents = r2.seeded;
      }
    }

    // items
    let seededItems = 0;
    {
      const r1 = await seedIfEmpty({
        sb,
        table: "debacu_item_catalog_customer",
        customer_id,
        countSelectColumn: "item_code",
        rows: itemSeeds,
      });

      if (r1.ok) {
        seededItems = r1.seeded;
      } else {
        // fallback
        const r2 = await seedIfEmpty({
          sb,
          table: "debacu_item_catalog",
          customer_id,
          countSelectColumn: "item_code",
          rows: itemSeeds,
        });

        if (!r2.ok) {
          return json(req, 500, {
            ok: false,
            error: "request_failed",
            detail: "missing_catalog_tables: items",
          });
        }

        seededItems = r2.seeded;
      }
    }

    return json(req, 200, {
      ok: true,
      data: {
        org_id: resolved_org_id,
        customer_id,
        seededIncidents,
        seededItems,
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    const status =
      msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED" ? 401 :
      msg === "FORBIDDEN" || msg.startsWith("MEMBERSHIP_FAILED") || msg.startsWith("ORG_LOOKUP_FAILED") ? 403 :
      msg.startsWith("DB_") ? 500 :
      500;

    const detail =
      status === 403 ? "FORBIDDEN" :
      status === 401 ? "UNAUTHENTICATED" :
      msg;

    return json(req, status, { ok: false, error: "request_failed", detail });
  }
});
