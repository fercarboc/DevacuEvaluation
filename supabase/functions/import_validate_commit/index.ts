// supabase/functions/import_validate_commit/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`MISSING_ENV:${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const GLOBAL_PEPPER = mustEnv("DEBACU_GLOBAL_PEPPER");

// ✅ Storage bucket donde guardas los CSV
//    Por defecto: customer-imports (NO customer-exports)
const IMPORT_BUCKET = Deno.env.get("DEBACU_IMPORT_BUCKET") || "customer-imports";

// ------------------------------------------------------------
// Supabase admin client (Service Role)
// ------------------------------------------------------------
function sbAdmin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ------------------------------------------------------------
// Utils
// ------------------------------------------------------------
function str(v: unknown) {
  return String(v ?? "").trim();
}
function lower(v: unknown) {
  return str(v).toLowerCase();
}
function upper(v: unknown) {
  return str(v).toUpperCase();
}
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function toISODate(v: unknown): string | null {
  const t = str(v);
  if (!t) return null;
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}
function digitsOnly(v: unknown) {
  const d = str(v).replace(/\D/g, "");
  return d || "";
}
function normalizeEmail(v: unknown) {
  const e = lower(v);
  if (!e || !e.includes("@")) return null;
  return e;
}
function normalizeDocument(v: unknown) {
  const t = str(v);
  if (!t) return null;
  const out = t.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return out || null;
}
function normalizePhone(v: unknown) {
  const d = digitsOnly(v);
  if (!d || d.length < 7) return null;
  return d;
}
function chunk<T>(arr: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
function todayIsoTs() {
  return new Date().toISOString();
}
function daysBetweenFromToday(dateISO: string) {
  const d = new Date(dateISO);
  const ms = Date.now() - d.getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Math.floor(ms / 86400000));
}

// ------------------------------------------------------------
// ✅ Guard: membership check (ACTIVE) para org_id
// ------------------------------------------------------------
async function requireOrgMemberActive(admin: ReturnType<typeof sbAdmin>, org_id: string, user_id: string) {
  const { data, error } = await admin
    .from("debacu_eval_org_members")
    .select("id, status, role")
    .eq("org_id", org_id)
    .eq("user_id", user_id)
    .maybeSingle();

  if (error) throw new Error(`org_member_check_failed:${error.message}`);
  if (!data?.id) return { ok: false as const, reason: "NOT_MEMBER" as const };
  if (String(data.status || "").toUpperCase() !== "ACTIVE") return { ok: false as const, reason: "NOT_ACTIVE" as const };

  return { ok: true as const, member: data };
}

// ------------------------------------------------------------
// CSV parser (simple, soporta comillas y comas)
// ------------------------------------------------------------
function parseCsv(csvText: string, delimiter = ",") {
  const rows: string[][] = [];
  let cur = "";
  let inQuotes = false;
  let row: string[] = [];

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i];

    if (ch === '"') {
      const next = csvText[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      row.push(cur);
      cur = "";
      continue;
    }

    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && csvText[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      const allEmpty = row.every((c) => str(c) === "");
      if (!allEmpty) rows.push(row);
      row = [];
      continue;
    }

    cur += ch;
  }

  if (cur.length || row.length) {
    row.push(cur);
    const allEmpty = row.every((c) => str(c) === "");
    if (!allEmpty) rows.push(row);
  }

  return rows;
}

// ------------------------------------------------------------
// Identity HMAC
// ------------------------------------------------------------
async function hmacHex(message: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(GLOBAL_PEPPER),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type IdentityInfo = {
  identity_key: string | null;
  match_basis: "DOCUMENT" | "EMAIL" | "PHONE" | "NAME_DOB" | null;
  match_confidence: "HIGH" | "MEDIUM" | "LOW";
  document_norm: string | null;
  email_norm: string | null;
  phone_digits: string | null;
};

async function computeIdentity(row: any, strategy: string): Promise<IdentityInfo> {
  const doc = normalizeDocument(row.document_number ?? row.documentNumber);
  const docCountry = upper(row.document_country ?? row.documentCountry);
  const email = normalizeEmail(row.email);
  const phone = normalizePhone(row.phone);
  const dob = toISODate(row.date_of_birth ?? row.dateOfBirth);
  const first = str(row.first_name ?? row.firstName);
  const last = str(row.last_name ?? row.lastName);

  const st = String(strategy || "").toUpperCase();

  let raw: string | null = null;
  let basis: IdentityInfo["match_basis"] = null;
  let conf: IdentityInfo["match_confidence"] = "LOW";

  if (st === "DOCUMENT_STRONG") {
    if (doc && docCountry) {
      raw = `DOC:${doc}|C:${docCountry}`;
      basis = "DOCUMENT";
      conf = "HIGH";
    } else if (doc) {
      raw = `DOC:${doc}`;
      basis = "DOCUMENT";
      conf = "HIGH";
    }
  } else if (st === "DOCUMENT") {
    if (doc) {
      raw = `DOC:${doc}`;
      basis = "DOCUMENT";
      conf = "HIGH";
    }
  } else if (st === "EMAIL") {
    if (email) {
      raw = `EMAIL:${email}`;
      basis = "EMAIL";
      conf = "MEDIUM";
    }
  } else if (st === "PHONE") {
    if (phone) {
      raw = `PHONE:${phone}`;
      basis = "PHONE";
      conf = "MEDIUM";
    }
  } else if (st === "NAME_DOB") {
    if (first && last && dob) {
      raw = `NAME_DOB:${upper(first)}|${upper(last)}|${dob}`;
      basis = "NAME_DOB";
      conf = "LOW";
    }
  }

  if (!raw) {
    if (doc) {
      raw = `DOC:${doc}`;
      basis = "DOCUMENT";
      conf = "HIGH";
    } else if (email) {
      raw = `EMAIL:${email}`;
      basis = "EMAIL";
      conf = "MEDIUM";
    } else if (phone) {
      raw = `PHONE:${phone}`;
      basis = "PHONE";
      conf = "MEDIUM";
    } else if (first && last && dob) {
      raw = `NAME_DOB:${upper(first)}|${upper(last)}|${dob}`;
      basis = "NAME_DOB";
      conf = "LOW";
    }
  }

  if (!raw) {
    return {
      identity_key: null,
      match_basis: null,
      match_confidence: "LOW",
      document_norm: doc,
      email_norm: email,
      phone_digits: phone,
    };
  }

  const identity_key = await hmacHex(raw);
  return {
    identity_key,
    match_basis: basis,
    match_confidence: conf,
    document_norm: doc,
    email_norm: email,
    phone_digits: phone,
  };
}

// ------------------------------------------------------------
// Required fields por run_type
// ------------------------------------------------------------
function requiredFieldsFor(runType: string) {
  const rt = String(runType || "").toUpperCase();

  if (rt === "INHOUSE_TODAY") return ["checkin_date", "first_name", "last_name"];
  if (rt === "FUTURE_BOOKINGS") return ["checkin_date", "checkout_date", "first_name", "last_name"];
  if (rt === "HISTORICAL_STAYS") return ["checkin_date", "checkout_date", "status", "channel", "first_name", "last_name"];
  if (rt === "HISTORICAL_BOOKINGS") return ["booking_created_at", "checkin_date", "checkout_date", "status", "channel", "first_name", "last_name"];
  return ["checkin_date", "first_name", "last_name"];
}

// ------------------------------------------------------------
// Mapping: hotel_column -> debacu_field
// ------------------------------------------------------------
function applyMapping(headers: string[], values: string[], mapping: Record<string, string>) {
  const obj: Record<string, any> = {};
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const v = values[i] ?? "";
    const debacuField = mapping?.[h];
    if (debacuField) obj[debacuField] = v;
  }
  return obj;
}

// ------------------------------------------------------------
// Storage read
// ------------------------------------------------------------
async function readCsvFromStorage(admin: ReturnType<typeof sbAdmin>, filePath: string) {
  const { data, error } = await admin.storage.from(IMPORT_BUCKET).download(filePath);
  if (error || !data) throw new Error(`storage_download_failed:${error?.message || "no_data"}`);
  const text = await data.text();
  return text;
}

// ------------------------------------------------------------
// Prev run finder (para delta)
// ------------------------------------------------------------
async function getPreviousRunId(
  admin: ReturnType<typeof sbAdmin>,
  org_id: string,
  run_type: string,
  current_run_id: string,
) {
  const { data: cur, error: curErr } = await admin
    .from("screening_runs")
    .select("id, created_at")
    .eq("id", current_run_id)
    .maybeSingle();

  if (curErr || !cur?.created_at) return null;

  const { data: prev, error: prevErr } = await admin
    .from("screening_runs")
    .select("id")
    .eq("org_id", org_id)
    .eq("run_type", run_type)
    .lt("created_at", cur.created_at)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (prevErr || !prev?.id) return null;
  return String(prev.id);
}

// ------------------------------------------------------------
// Risk decay
// ------------------------------------------------------------
function decayFactor(days_since_last: number | null) {
  if (days_since_last === null || days_since_last === undefined) return 1;
  if (days_since_last < 90) return 1;
  if (days_since_last < 180) return 0.8;
  if (days_since_last < 365) return 0.5;
  return 0.25;
}

function bandRank(b: string) {
  return b === "HIGH" ? 3 : b === "MEDIUM" ? 2 : 1;
}
function confRank(c: string) {
  return c === "HIGH" ? 3 : c === "MEDIUM" ? 2 : 1;
}

// ------------------------------------------------------------
// MAIN
// ------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  try {
    const user = await requireUser(req);
    const userId = String(user?.id || "");
    if (!userId) return json(req, 401, { ok: false, error: "UNAUTHENTICATED" });

    const body = await req.json().catch(() => null);
    if (!body) return json(req, 400, { ok: false, error: "invalid_json_body" });

    const admin = sbAdmin();

    const org_id = str(body.org_id ?? body.orgId);
    const profile_id = str(body.profile_id ?? body.profileId);
    const run_type = str(body.run_type ?? body.runType);
    const dry_run = body.dry_run === true || body.dryRun === true;
    const file_path = str(body.file_path ?? body.filePath);
    const csv_text = str(body.csv_text ?? body.csvText);

    if (!org_id) return json(req, 400, { ok: false, error: "missing_org_id" });
    if (!profile_id) return json(req, 400, { ok: false, error: "missing_profile_id" });
    if (!file_path && !csv_text) return json(req, 400, { ok: false, error: "missing_file_or_csv_text" });

    // ✅ Security gate: membership ACTIVE en org
    const mem = await requireOrgMemberActive(admin, org_id, userId);
    if (!mem.ok) {
      return json(req, 403, {
        ok: false,
        error: "FORBIDDEN",
        detail: mem.reason === "NOT_ACTIVE" ? "org_membership_not_active" : "org_membership_missing",
      });
    }

    // 1) Load profile
    const { data: profile, error: pErr } = await admin
      .from("import_profiles")
      .select("id, org_id, source_type, delimiter, identity_strategy, mapping, disabled_fields")
      .eq("id", profile_id)
      .eq("org_id", org_id)
      .maybeSingle();

    if (pErr || !profile) {
      return json(req, 404, { ok: false, error: "profile_not_found" });
    }

    const effectiveRunType = String(run_type || profile.source_type || "").toUpperCase();
    const delimiter = String(profile.delimiter || ",");
    const identity_strategy = String(profile.identity_strategy || "DOCUMENT_STRONG");
    const mapping = (profile.mapping || {}) as Record<string, string>;
    const disabled = new Set<string>((profile.disabled_fields || []) as string[]);

    // 2) Read CSV
    const csv = csv_text ? csv_text : await readCsvFromStorage(admin, file_path);

    // 3) Parse
    const rawRows = parseCsv(csv, delimiter);
    if (rawRows.length < 2) {
      return json(req, 400, { ok: false, error: "csv_empty_or_missing_rows" });
    }

    const headers = rawRows[0].map((h) => str(h));
    const dataRows = rawRows.slice(1);

    // 4) Create import job
    const file_hash = await crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(csv))
      .then((buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(""));

    const { data: job, error: jobErr } = await admin
      .from("import_jobs")
      .insert({
        org_id,
        user_id: userId,
        profile_id,
        file_path: file_path || "(inline)",
        file_hash,
        run_type: effectiveRunType,
        status: "UPLOADED",
      })
      .select("id")
      .single();

    if (jobErr || !job?.id) {
      return json(req, 500, { ok: false, error: "import_job_create_failed", detail: jobErr?.message });
    }

    const required = requiredFieldsFor(effectiveRunType).filter((f) => !disabled.has(f));

    // 5) Validate & normalize rows
    const errors: Array<{ row: number; field?: string; error: string }> = [];
    const parsed: any[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const rowNum = i + 2; // header=1
      const values = dataRows[i];
      const obj = applyMapping(headers, values, mapping);

      obj.checkin_date = toISODate(obj.checkin_date);
      obj.checkout_date = toISODate(obj.checkout_date);
      obj.booking_created_at = str(obj.booking_created_at || "");
      obj.status = upper(obj.status);
      obj.channel = str(obj.channel);
      obj.currency = upper(obj.currency);

      for (const f of required) {
        const v = obj[f];
        if (!str(v)) errors.push({ row: rowNum, field: f, error: "missing_required_field" });
      }

      const ident = await computeIdentity(obj, identity_strategy);
      if (!ident.identity_key) errors.push({ row: rowNum, field: "identity", error: "NO_IDENTIFIER" });

      obj.total_amount = num(obj.total_amount);
      obj.room_amount = num(obj.room_amount);
      obj.extras_amount = num(obj.extras_amount);
      obj.commission_amount = num(obj.commission_amount);
      obj.net_amount = num(obj.net_amount);
      obj.deposit_amount = num(obj.deposit_amount);

      obj.identity_key = ident.identity_key;
      obj.match_basis = ident.match_basis;
      obj.match_confidence = ident.match_confidence;

      obj.document_norm = ident.document_norm;
      obj.email_norm = ident.email_norm;
      obj.phone_digits = ident.phone_digits;

      parsed.push(obj);
    }

    const invalidRowNums = new Set(errors.map((e) => e.row));
    const validRows = parsed.filter((_, idx) => !invalidRowNums.has(idx + 2));

    await admin
      .from("import_jobs")
      .update({
        total_rows: dataRows.length,
        valid_rows: validRows.length,
        invalid_rows: dataRows.length - validRows.length,
        status: "VALIDATED",
        summary: {
          run_type: effectiveRunType,
          required_fields: required,
          errors_count: errors.length,
        },
      })
      .eq("id", job.id);

    if (dry_run) {
      return json(req, 200, {
        ok: true,
        mode: "DRY_RUN",
        import_job_id: job.id,
        total_rows: dataRows.length,
        valid_rows: validRows.length,
        invalid_rows: dataRows.length - validRows.length,
        errors: errors.slice(0, 300),
        preview: validRows.slice(0, 20),
      });
    }

    // 6) COMMIT: create screening_run
    const { data: run, error: runErr } = await admin
      .from("screening_runs")
      .insert({
        org_id,
        import_job_id: job.id,
        run_type: effectiveRunType,
        total_analyzed: 0,
        high_count: 0,
        medium_count: 0,
        low_count: 0,
      })
      .select("id")
      .single();

    if (runErr || !run?.id) {
      await admin.from("import_jobs").update({ status: "FAILED" }).eq("id", job.id);
      return json(req, 500, { ok: false, error: "screening_run_create_failed", detail: runErr?.message });
    }

    const runId = String(run.id);

    // Previous run for delta (persona+fecha)
    const prevRunId = await getPreviousRunId(admin, org_id, effectiveRunType, runId);

    // ✅ Prev snapshot: key(identity_key|checkin_date) -> {incidents, loss, band}
    const prevMap = new Map<string, { incidents: number; loss: number; band: string }>();
    if (prevRunId) {
      const { data: prevRows, error: prevErr } = await admin
        .from("screening_results")
        .select("identity_key,checkin_date,incidents_count,total_net_loss,risk_band")
        .eq("run_id", prevRunId);

      if (!prevErr && prevRows) {
        for (const pr of prevRows as any[]) {
          const ik = String(pr.identity_key || "");
          const cd = pr.checkin_date ? String(pr.checkin_date) : "";
          if (!ik || !cd) continue;
          const k = `${ik}|${cd}`;
          prevMap.set(k, {
            incidents: Number(pr.incidents_count ?? 0),
            loss: Number(pr.total_net_loss ?? 0),
            band: String(pr.risk_band ?? "LOW"),
          });
        }
      }
    }

    // ✅ Preload guest_index rows for ALL identity_keys (chunked)
    const uniqueIdentityKeys = Array.from(new Set(validRows.map((r) => String(r.identity_key || "")).filter(Boolean)));

    const indexMap = new Map<
      string,
      { incidents_count: number; total_net_loss: number; risk_band: string; last_incident_date: string | null }
    >();

    for (const part of chunk(uniqueIdentityKeys, 1000)) {
      const { data: idxRows, error: idxErr } = await admin
        .from("debacu_eval_import_guest_index")
        .select("identity_key,incidents_count,total_net_loss,risk_band,last_incident_date")
        .in("identity_key", part);

      if (idxErr) {
        await admin.from("import_jobs").update({ status: "FAILED" }).eq("id", job.id);
        return json(req, 500, { ok: false, error: "guest_index_preload_failed", detail: idxErr.message });
      }

      (idxRows || []).forEach((r: any) => {
        indexMap.set(String(r.identity_key), {
          incidents_count: Number(r.incidents_count ?? 0),
          total_net_loss: Number(r.total_net_loss ?? 0),
          risk_band: String(r.risk_band ?? "LOW"),
          last_incident_date: r.last_incident_date ? String(r.last_incident_date) : null,
        });
      });
    }

    // Persona + Fecha aggregation for screening_results & alerts
    type Agg = {
      identity_key: string;
      checkin_date: string;
      row_number: number;
      checkout_date: string | null;

      match_confidence: string;
      match_basis: string | null;

      incidents_count: number;
      total_net_loss: number;
      last_incident_date: string | null;
      days_since_last: number | null;

      risk_band: string;
      prev_risk_band: string | null;
      risk_band_changed: boolean;
      delta_incidents_count: number;
      delta_total_net_loss: number;

      total_amount_max: number;
    };

    const agg = new Map<string, Agg>();

    let high = 0, med = 0, lowc = 0;

    const watchWithRef: any[] = [];
    const watchNoRef: any[] = [];

    const WATCH_CHUNK = 500;
    const RESULTS_CHUNK = 1000;
    const ALERTS_CHUNK = 1000;

    const nowTs = todayIsoTs();

    for (let i = 0; i < validRows.length; i++) {
      const r = validRows[i];
      const identity_key = String(r.identity_key);
      const checkin_date = (r.checkin_date as string | null) || null;
      const checkout_date = (r.checkout_date as string | null) || null;

      if (!checkin_date) continue;

      const row_number = i + 2;

      const reservation_ref = str(r.reservation_ref);
      const watchPayload: any = {
        org_id,
        reservation_ref: reservation_ref || null,
        identity_key,
        checkin_date,
        checkout_date,
        channel: str(r.channel) || null,
        total_amount: r.total_amount ?? 0,
        currency: r.currency || null,
        status: r.status || null,
        last_seen_at: nowTs,
      };

      if (reservation_ref) watchWithRef.push(watchPayload);
      else watchNoRef.push(watchPayload);

      const idxRow = indexMap.get(identity_key);
      const incidents_count = Number(idxRow?.incidents_count ?? 0);
      const total_net_loss = Number(idxRow?.total_net_loss ?? 0);
      const base_band = String(idxRow?.risk_band ?? "LOW");
      const last_incident_date = idxRow?.last_incident_date ?? null;

      const days_since_last = last_incident_date ? daysBetweenFromToday(last_incident_date) : null;

      const df = decayFactor(days_since_last);
      const adjusted_loss = total_net_loss * df;

      let risk_band = base_band;
      if (incidents_count === 0 && adjusted_loss <= 0) risk_band = "LOW";
      else if (incidents_count >= 2 || adjusted_loss >= 200) risk_band = "HIGH";
      else risk_band = "MEDIUM";

      const prevKey = `${identity_key}|${checkin_date}`;
      let prev_band: string | null = null;
      let risk_band_changed = false;

      let delta_incidents = incidents_count;
      let delta_loss = total_net_loss;

      if (prevMap.has(prevKey)) {
        const prev = prevMap.get(prevKey)!;
        prev_band = prev.band;
        risk_band_changed = prev.band !== risk_band;
        delta_incidents = incidents_count - prev.incidents;
        delta_loss = total_net_loss - prev.loss;
      }

      if (!Number.isFinite(delta_incidents)) delta_incidents = 0;
      if (!Number.isFinite(delta_loss)) delta_loss = 0;

      const k = prevKey;
      const existing = agg.get(k);

      if (!existing) {
        agg.set(k, {
          identity_key,
          checkin_date,
          row_number,
          checkout_date,

          match_confidence: r.match_confidence || "LOW",
          match_basis: r.match_basis || null,

          incidents_count,
          total_net_loss,
          last_incident_date,
          days_since_last,

          risk_band,
          prev_risk_band: prev_band,
          risk_band_changed,
          delta_incidents_count: delta_incidents,
          delta_total_net_loss: delta_loss,

          total_amount_max: Number(r.total_amount ?? 0),
        });
      } else {
        if (row_number < existing.row_number) existing.row_number = row_number;

        if (checkout_date && (!existing.checkout_date || checkout_date > existing.checkout_date)) {
          existing.checkout_date = checkout_date;
        }

        const ta = Number(r.total_amount ?? 0);
        if (Number.isFinite(ta) && ta > existing.total_amount_max) existing.total_amount_max = ta;

        const mc = String(r.match_confidence || "LOW");
        if (confRank(mc) > confRank(existing.match_confidence)) {
          existing.match_confidence = mc;
          existing.match_basis = r.match_basis || null;
        }

        if (bandRank(risk_band) > bandRank(existing.risk_band)) {
          existing.risk_band = risk_band;
          existing.risk_band_changed = prev_band ? prev_band !== risk_band : false;
          existing.prev_risk_band = prev_band;
        }

        if (delta_incidents > existing.delta_incidents_count) existing.delta_incidents_count = delta_incidents;
        if (delta_loss > existing.delta_total_net_loss) existing.delta_total_net_loss = delta_loss;
      }

      if (watchWithRef.length >= WATCH_CHUNK) {
        const batch = watchWithRef.splice(0, watchWithRef.length);
        const { error: wErr } = await admin
          .from("watchlist_reservations")
          .upsert(batch, { onConflict: "org_id,reservation_ref" });
        if (wErr) {
          await admin.from("import_jobs").update({ status: "FAILED" }).eq("id", job.id);
          return json(req, 500, { ok: false, error: "watchlist_upsert_failed", detail: wErr.message });
        }
      }

      if (watchNoRef.length >= WATCH_CHUNK) {
        const batch = watchNoRef.splice(0, watchNoRef.length);
        const { error: wErr } = await admin
          .from("watchlist_reservations")
          .upsert(batch, { onConflict: "org_id,identity_key,checkin_date" });
        if (wErr) {
          await admin.from("import_jobs").update({ status: "FAILED" }).eq("id", job.id);
          return json(req, 500, { ok: false, error: "watchlist_upsert_failed", detail: wErr.message });
        }
      }
    }

    if (watchWithRef.length) {
      const { error: wErr } = await admin
        .from("watchlist_reservations")
        .upsert(watchWithRef, { onConflict: "org_id,reservation_ref" });
      if (wErr) {
        await admin.from("import_jobs").update({ status: "FAILED" }).eq("id", job.id);
        return json(req, 500, { ok: false, error: "watchlist_upsert_failed", detail: wErr.message });
      }
    }

    if (watchNoRef.length) {
      const { error: wErr } = await admin
        .from("watchlist_reservations")
        .upsert(watchNoRef, { onConflict: "org_id,identity_key,checkin_date" });
      if (wErr) {
        await admin.from("import_jobs").update({ status: "FAILED" }).eq("id", job.id);
        return json(req, 500, { ok: false, error: "watchlist_upsert_failed", detail: wErr.message });
      }
    }

    const consolidated = Array.from(agg.values());

    high = 0; med = 0; lowc = 0;
    for (const a of consolidated) {
      if (a.risk_band === "HIGH") high++;
      else if (a.risk_band === "MEDIUM") med++;
      else lowc++;
    }

    for (const part of chunk(consolidated, RESULTS_CHUNK)) {
      const batch = part.map((a) => ({
        run_id: runId,
        org_id,
        identity_key: a.identity_key,
        row_number: a.row_number,
        checkin_date: a.checkin_date,
        risk_band: a.risk_band,
        prev_risk_band: a.prev_risk_band,
        risk_band_changed: a.risk_band_changed,
        incidents_count: a.incidents_count,
        total_net_loss: a.total_net_loss,
        last_incident_date: a.last_incident_date,
        days_since_last: a.days_since_last,
        delta_incidents_count: a.delta_incidents_count,
        delta_total_net_loss: a.delta_total_net_loss,
        match_confidence: a.match_confidence,
        match_basis: a.match_basis,
        computed_at: nowTs,
      }));

      const { error: insErr } = await admin.from("screening_results").insert(batch);
      if (insErr) {
        await admin.from("import_jobs").update({ status: "FAILED" }).eq("id", job.id);
        return json(req, 500, { ok: false, error: "screening_results_insert_failed", detail: insErr.message });
      }
    }

    const alertsAll = consolidated
      .filter((a) => a.delta_incidents_count > 0 || a.delta_total_net_loss > 0 || a.risk_band_changed || a.risk_band === "HIGH")
      .map((a) => {
        const alert_type =
          a.risk_band === "HIGH"
            ? "HIGH_RISK"
            : a.risk_band_changed
            ? "RISK_CHANGED"
            : a.delta_incidents_count > 0
            ? "NEW_INCIDENT"
            : "DELTA_CHANGE";

        return {
          org_id,
          run_id: runId,
          identity_key: a.identity_key,
          row_number: a.row_number,
          alert_type,
          message: `Update detected (band=${a.risk_band}, Δinc=${a.delta_incidents_count}, Δloss=${a.delta_total_net_loss})`,
        };
      });

    for (const part of chunk(alertsAll, ALERTS_CHUNK)) {
      const { error: aErr } = await admin.from("screening_alerts").insert(part);
      if (aErr) {
        await admin.from("import_jobs").update({ status: "FAILED" }).eq("id", job.id);
        return json(req, 500, { ok: false, error: "screening_alerts_insert_failed", detail: aErr.message });
      }
    }

    await admin
      .from("screening_runs")
      .update({
        total_analyzed: consolidated.length,
        high_count: high,
        medium_count: med,
        low_count: lowc,
      })
      .eq("id", runId);

    await admin
      .from("import_jobs")
      .update({
        status: "COMMITTED",
        summary: {
          run_id: runId,
          prev_run_id: prevRunId,
          total_rows: dataRows.length,
          valid_rows: validRows.length,
          invalid_rows: dataRows.length - validRows.length,
          consolidated_rows: consolidated.length,
          high,
          medium: med,
          low: lowc,
        },
      })
      .eq("id", job.id);

    return json(req, 200, {
      ok: true,
      mode: "COMMIT",
      import_job_id: job.id,
      run_id: runId,
      prev_run_id: prevRunId,
      total_rows: dataRows.length,
      valid_rows: validRows.length,
      invalid_rows: dataRows.length - validRows.length,
      consolidated_rows: consolidated.length,
      high,
      medium: med,
      low: lowc,
      errors: errors.slice(0, 300),
    });
  } catch (e: any) {
    console.error("import_validate_commit error:", e);
    const msg = String(e?.message || e);

    if (msg.startsWith("MISSING_ENV:")) return json(req, 500, { ok: false, error: "missing_env", detail: msg });
    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") return json(req, 401, { ok: false, error: "UNAUTHENTICATED" });

    return json(req, 500, { ok: false, error: "request_failed", detail: msg });
  }
});