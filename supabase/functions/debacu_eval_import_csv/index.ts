// supabase/functions/debacu_eval_import_csv/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";
import { json, preflight } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GLOBAL_PEPPER = Deno.env.get("DEBACU_GLOBAL_PEPPER")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

// ----------------------
// Helpers
// ----------------------

function normalizeDocument(v?: string) {
  if (!v) return null;
  return v.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

function normalizeEmail(v?: string) {
  if (!v) return null;
  const email = v.trim().toLowerCase();
  if (!email.includes("@")) return null;
  return email;
}

function normalizePhone(v?: string) {
  if (!v) return null;
  const digits = v.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return digits;
}

function normalizeCountry(v?: string) {
  if (!v) return "ESP";
  return v.trim().toUpperCase().slice(0, 3);
}

async function generateIdentityKey(identifier: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(GLOBAL_PEPPER),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(identifier));

  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ----------------------
// Main
// ----------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" });

  // 1. Verificar JWT
  let authUser: any;
  try {
    authUser = await requireUser(req);
  } catch {
    return json(req, 401, { error: "UNAUTHORIZED" });
  }

  try {
    const body = await req.json();
    const rows = body?.rows ?? [];
    const org_id = body?.org_id;

    if (!org_id) {
      return json(req, 400, { error: "org_id required" });
    }

    // 2. Verificar que el usuario pertenece a la org
    const sb = supabaseServiceClient();
    const { data: member, error: memberError } = await sb
      .from("debacu_eval_org_members")
      .select("org_id, role, status")
      .eq("user_id", authUser.id)
      .eq("org_id", org_id)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (memberError || !member?.org_id) {
      return json(req, 403, { error: "FORBIDDEN" });
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      return json(req, 400, { error: "rows required" });
    }

    // Crear batch
    const { data: batch, error: batchError } = await supabase
      .from("debacu_eval_import_batches")
      .insert({
        org_id,
        import_type: "DAILY_CHECKIN",
        total_rows: rows.length,
      })
      .select()
      .single();

    if (batchError) throw batchError;

    const results: any[] = [];

    for (const row of rows) {
      let error_code: string | null = null;

      const checkin_date = row.checkin_date;
      const checkout_date = row.checkout_date ?? null;

      if (!checkin_date || isNaN(Date.parse(checkin_date))) {
        error_code = "INVALID_DATE";
      }

      const document_norm = normalizeDocument(row.document);
      const email_norm = normalizeEmail(row.email);
      const phone_digits = normalizePhone(row.phone);

      if (!document_norm && !email_norm && !phone_digits) {
        error_code = "NO_IDENTIFIER";
      }

      if (error_code) {
        await supabase.from("debacu_eval_import_rows").insert({
          batch_id: batch.id,
          org_id,
          identity_key: "ERROR",
          checkin_date,
          match_status: "ERROR",
          error_code,
        });

        results.push({ row, error: error_code });
        continue;
      }

      // Jerarquía identidad
      const raw_identifier = document_norm
        ? `DOC:${document_norm}`
        : email_norm
        ? `EMAIL:${email_norm}`
        : `PHONE:${phone_digits}`;

      const identity_key = await generateIdentityKey(raw_identifier);

      const today = new Date().toISOString().slice(0, 10);
      const is_completed = checkin_date < today;

      // Insert stay (dedupe)
      await supabase.from("debacu_eval_guest_stays").insert({
        org_id,
        identity_key,
        full_name: row.full_name ?? null,
        checkin_date,
        checkout_date,
        stay_status: is_completed ? "COMPLETED" : "PLANNED",
        import_batch_id: batch.id,
      });

      // Actualizar índice global
      await supabase.rpc("debacu_eval_upsert_guest_index_from_stay", {
        p_identity_key: identity_key,
        p_activity_date: checkin_date,
        p_is_completed: is_completed,
      });

      // Consultar índice
      const { data: guestIndex } = await supabase
        .from("debacu_eval_import_guest_index")
        .select("*")
        .eq("identity_key", identity_key)
        .single();

      let match_status = "NO_MATCH";

      if (guestIndex) {
        if (guestIndex.risk_band === "LOW") match_status = "MATCH_LOW";
        if (guestIndex.risk_band === "MEDIUM") match_status = "MATCH_MEDIUM";
        if (guestIndex.risk_band === "HIGH") match_status = "MATCH_HIGH";
      }

      await supabase.from("debacu_eval_import_rows").insert({
        batch_id: batch.id,
        org_id,
        identity_key,
        full_name: row.full_name ?? null,
        checkin_date,
        checkout_date,
        match_status,
        risk_band_at_import: guestIndex?.risk_band ?? null,
      });

      results.push({
        full_name: row.full_name,
        checkin_date,
        match_status,
        risk_band: guestIndex?.risk_band ?? null,
        stays_count: guestIndex?.stays_count ?? 0,
        incidents_count: guestIndex?.incidents_count ?? 0,
        total_net_loss: guestIndex?.total_net_loss ?? 0,
      });
    }

    return json(req, 200, {
      batch_id: batch.id,
      processed: results.length,
      results,
    });
  } catch (err) {
    console.error(err);
    return json(req, 500, { error: "import_failed" });
  }
});