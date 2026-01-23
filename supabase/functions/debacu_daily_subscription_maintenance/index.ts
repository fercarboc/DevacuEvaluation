// supabase/functions/debacu_daily_subscription_maintenance/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const CRON_SECRET = mustEnv("CRON_SECRET");

// Opcionales
const DEFAULT_GRACE_DAYS = Number(Deno.env.get("DEFAULT_GRACE_DAYS") ?? "3");
const BATCH_LIMIT = Number(Deno.env.get("BATCH_LIMIT") ?? "1000");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Para tu cron interno NO hace falta CORS, pero lo dejo por si lo disparas manualmente desde navegador.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isoNow() {
  return new Date().toISOString();
}

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function addDaysFromNow(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/**
 * Inserta eventos en subscription_events (snake_case)
 * OJO: si tu tabla NO tiene algunas columnas (p.ej stripe_customer_id),
 * déjalas en null o elimina del insert.
 */
async function insertEvent(params: {
  type: string;
  customer_id?: string | null;
  app_id?: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  payload?: Record<string, unknown>;
}) {
  // idempotencia best-effort: generamos un id único por evento
  // (si en tu tabla stripe_event_id es UNIQUE, esto siempre insertará, porque es nuevo)
  const stripe_event_id = `cron_${params.type}_${crypto.randomUUID()}`;

  const { error } = await supabase.from("subscription_events").insert({
    stripe_event_id,
    type: params.type,
    payload: params.payload ?? {},
    created_at: isoNow(),

    // ✅ snake_case (ajusta si tu tabla tiene nombres diferentes)
    customer_id: params.customer_id ?? null,
    app_id: params.app_id ?? null,
    stripe_customer_id: params.stripe_customer_id ?? null,
    stripe_subscription_id: params.stripe_subscription_id ?? null,
  });

  if (error) {
    const msg = String((error as any)?.message ?? "").toLowerCase();
    // si existiera unique y colisiona por alguna razón, ignoramos
    if (!(msg.includes("duplicate") || msg.includes("unique"))) throw error;
  }
}

/**
 * 1) TRIAL (Opción B) expirados:
 * - billing_frequency = FREE_TRIAL
 * - status = ACTIVE
 * - next_billing_date <= today
 * -> status = PENDING_PAYMENT
 * -> required_plan_code = BASIC
 * -> required_billing_frequency = MONTHLY
 * -> grace_ends_at = now + DEFAULT_GRACE_DAYS (si era null)
 */
async function processTrialExpirations() {
  const now = isoNow();
  const today = isoDate(); // yyyy-mm-dd (para comparar con columnas date)

  const { data: rows, error } = await supabase
    .from("subscriptions")
    .select(
      [
        "id",
        "customer_id",
        "app_id",
        "status",
        "billing_frequency",
        "next_billing_date",
        "grace_ends_at",
        "stripe_customer_id",
        "stripe_subscription_id",
      ].join(","),
    )
    .eq("status", "ACTIVE")
    .eq("billing_frequency", "FREE_TRIAL")
    .not("next_billing_date", "is", null)
    .lte("next_billing_date", today) // trial vencido si hoy >= next_billing_date
    .limit(BATCH_LIMIT);

  if (error) throw error;

  let updated = 0;

  for (const r of rows ?? []) {
    const grace = r.grace_ends_at ?? addDaysFromNow(DEFAULT_GRACE_DAYS);

    const { error: upErr } = await supabase
      .from("subscriptions")
      .update({
        status: "PENDING_PAYMENT",
        grace_ends_at: grace,

        // ✅ alineado con tu decisión
        required_plan_code: "BASIC",
        required_billing_frequency: "MONTHLY",

        updated_at: now,
      })
      .eq("id", r.id)
      .eq("status", "ACTIVE")
      .eq("billing_frequency", "FREE_TRIAL"); // idempotencia

    if (!upErr) {
      updated++;
      await insertEvent({
        type: "CRON_TRIAL_FREE_EXPIRED_TO_PENDING",
        customer_id: r.customer_id ?? null,
        app_id: r.app_id ?? null,
        stripe_customer_id: r.stripe_customer_id ?? null,
        stripe_subscription_id: r.stripe_subscription_id ?? null,
        payload: {
          subscription_id: r.id,
          next_billing_date: r.next_billing_date,
          grace_ends_at: grace,
          required_plan_code: "BASIC",
          required_billing_frequency: "MONTHLY",
        },
      });
    }
  }

  return { updated, scanned: (rows ?? []).length };
}

/**
 * 2) PENDING_PAYMENT con grace vencida:
 * - status = PENDING_PAYMENT
 * - grace_ends_at < now()
 * -> status = SUSPENDED + suspended_at
 */
async function processGraceExpiredSuspensions() {
  const now = isoNow();

  const { data: rows, error } = await supabase
    .from("subscriptions")
    .select(
      [
        "id",
        "customer_id",
        "app_id",
        "status",
        "grace_ends_at",
        "stripe_customer_id",
        "stripe_subscription_id",
      ].join(","),
    )
    .eq("status", "PENDING_PAYMENT")
    .not("grace_ends_at", "is", null)
    .lt("grace_ends_at", now)
    .limit(BATCH_LIMIT);

  if (error) throw error;

  let updated = 0;

  for (const r of rows ?? []) {
    const { error: upErr } = await supabase
      .from("subscriptions")
      .update({
        status: "SUSPENDED",
        suspended_at: now,
        updated_at: now,
      })
      .eq("id", r.id)
      .eq("status", "PENDING_PAYMENT"); // idempotencia

    if (!upErr) {
      updated++;
      await insertEvent({
        type: "CRON_GRACE_EXPIRED_TO_SUSPENDED",
        customer_id: r.customer_id ?? null,
        app_id: r.app_id ?? null,
        stripe_customer_id: r.stripe_customer_id ?? null,
        stripe_subscription_id: r.stripe_subscription_id ?? null,
        payload: {
          subscription_id: r.id,
          grace_ends_at: r.grace_ends_at,
          suspended_at: now,
        },
      });
    }
  }

  return { updated, scanned: (rows ?? []).length };
}

/**
 * 3) Limpieza: evitar múltiples ACTIVE por (customer_id, app_id)
 * - deja solo la más reciente (start_date/created_at)
 * - el resto => REPLACED + end_date=today
 *
 * Nota: para bases grandes esto conviene pasarlo a SQL (CTE + window func).
 * Para ahora, lo hacemos “best-effort” y con límite.
 */
async function fixDuplicateActives() {
  const now = isoNow();
  const today = isoDate();

  const { data: rows, error } = await supabase
    .from("subscriptions")
    .select("id, customer_id, app_id, status, start_date, created_at")
    .eq("status", "ACTIVE")
    .limit(5000);

  if (error) throw error;

  const list = rows ?? [];
  const groups = new Map<string, typeof list>();

  for (const r of list) {
    const key = `${r.customer_id}__${r.app_id}`;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }

  let replaced = 0;

  for (const [key, arr] of groups.entries()) {
    if (arr.length <= 1) continue;

    // Orden: más reciente primero
    arr.sort((a: any, b: any) => {
      const aStart = a.start_date ? String(a.start_date) : "";
      const bStart = b.start_date ? String(b.start_date) : "";
      if (aStart !== bStart) return aStart < bStart ? 1 : -1;

      const aCreated = a.created_at ? String(a.created_at) : "";
      const bCreated = b.created_at ? String(b.created_at) : "";
      return aCreated < bCreated ? 1 : -1;
    });

    const keep = arr[0];
    const toReplace = arr.slice(1).map((x: any) => x.id);

    const { error: upErr } = await supabase
      .from("subscriptions")
      .update({
        status: "REPLACED",
        end_date: today,
        replaces_subscription_id: keep.id,
        updated_at: now,
      })
      .in("id", toReplace)
      .eq("status", "ACTIVE"); // idempotencia

    if (!upErr) {
      replaced += toReplace.length;

      await insertEvent({
        type: "CRON_FIX_DUPLICATE_ACTIVE",
        customer_id: keep.customer_id ?? null,
        app_id: keep.app_id ?? null,
        payload: {
          kept_active_id: keep.id,
          replaced_ids: toReplace,
          group_key: key,
          end_date: today,
        },
      });
    }
  }

  return { replaced, groups: groups.size, scanned: list.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  // Seguridad cron interno
  const secret = req.headers.get("x-cron-secret");
  if (!secret || secret !== CRON_SECRET) {
    return json(401, { error: "Unauthorized (cron secret)" });
  }

  try {
    const started_at = isoNow();

    const r1 = await processTrialExpirations();
    const r2 = await processGraceExpiredSuspensions();
    const r3 = await fixDuplicateActives();

    await insertEvent({
      type: "CRON_DAILY_MAINTENANCE_OK",
      payload: { r1, r2, r3, started_at, finished_at: isoNow() },
    });

    return json(200, { ok: true, r1, r2, r3, started_at, finished_at: isoNow() });
  } catch (e) {
    const msg = String((e as any)?.message ?? e);

    // intentamos loguear el error, pero si falla no queremos romper la respuesta
    try {
      await insertEvent({
        type: "CRON_DAILY_MAINTENANCE_ERROR",
        payload: { error: msg, ran_at: isoNow() },
      });
    } catch {
      // ignore
    }

    return json(500, { ok: false, error: msg });
  }
});
