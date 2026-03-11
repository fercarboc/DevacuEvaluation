// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

import { parseCsv } from "../_shared/csv.ts";
import { buildHeaderMap, pickValueFromRow } from "../_shared/mapping.ts";
import { validateUnifiedRow } from "../_shared/validator.ts";
import { buildReservationKey } from "../_shared/reservationKeys.ts";
import { buildIdentityKey } from "../_shared/identity.ts";
import {
  normalizeDateToISO,
  normalizeDecimalString,
  normalizeIntegerString,
  normalizeCurrency,
  normalizeReservationStatus,
  splitGuestFullName,
} from "../_shared/normalizers.ts";

/* ======================================================
 * Types
 * ====================================================== */
type ParsedCsvRow = Record<string, unknown>;
type JsonRecord = Record<string, unknown>;

type IdentityResult = {
  identity_key: string;
  input_kind: "DOC" | "EMAIL" | "PHONE";
  normalized_identifier: string;
} | null;

/* ======================================================
 * Env + client
 * ====================================================== */
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

/* ======================================================
 * Response helpers
 * ====================================================== */
function ok(req: Request, data: unknown, status = 200) {
  return json(req, status, data);
}

function fail(req: Request, status: number, detail: string, extra?: Record<string, unknown>) {
  return json(req, status, {
    ok: false,
    error: "request_failed",
    detail,
    ...(extra ?? {}),
  });
}

/* ======================================================
 * Generic helpers
 * ====================================================== */
function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

function toNullableString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function toNullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function requiredString(value: unknown, field: string): string {
  const s = String(value ?? "").trim();
  if (!s) throw new Error(`missing_required_field:${field}`);
  return s;
}

function requiredNumber(value: unknown, field: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`invalid_required_number:${field}`);
  return n;
}

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  const bytes = new Uint8Array(buf);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizePropertyCode(value: string | null): string | null {
  if (!value) return null;
  return (
    value
      .trim()
      .toUpperCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120) || null
  );
}

function inferPropertyCode(row: JsonRecord): string | null {
  const direct = toNullableString(row.property_code);
  if (direct) return direct;

  const fromName = normalizePropertyCode(toNullableString(row.property_name));
  return fromName;
}

function inferImportProfileCode(headerMap: Record<string, string>): string {
  const mappedFields = Object.keys(headerMap).sort();
  if (mappedFields.length === 0) return "AUTO_GENERIC";

  const hasReservation = mappedFields.includes("reservation_id");
  const hasCheckin = mappedFields.includes("checkin_date");
  const hasCheckout = mappedFields.includes("checkout_date");
  const hasRevenue = mappedFields.includes("gross_revenue");

  if (hasReservation && hasCheckin && hasCheckout && hasRevenue) {
    return "AUTO_UNIFIED_BASE";
  }

  return "AUTO_GENERIC";
}

function countWarningsForRow(warnings: unknown[]): number {
  return Array.isArray(warnings) && warnings.length > 0 ? 1 : 0;
}

/* ======================================================
 * Multi-org resolution
 * - formData may include org_id
 * - fallback to first ACTIVE membership
 * ====================================================== */
async function resolveOrgForUser(
  sb: ReturnType<typeof supabaseServiceClient>,
  userId: string,
  orgIdInput?: string | null,
): Promise<string> {
  const requestedOrgId = String(orgIdInput ?? "").trim();

  if (requestedOrgId) {
    const { data, error } = await sb
      .from("debacu_eval_org_members")
      .select("org_id")
      .eq("user_id", userId)
      .eq("org_id", requestedOrgId)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (error) throw new Error("membership_check_failed");
    if (!data?.org_id) throw new Error("FORBIDDEN");
    return String(data.org_id);
  }

  const { data, error } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, created_at")
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("membership_lookup_failed");
  if (!data?.org_id) throw new Error("FORBIDDEN");

  return String(data.org_id);
}

/* ======================================================
 * CSV row normalization
 * ====================================================== */
function buildNormalizedRow(
  rawRow: ParsedCsvRow,
  headerMap: ReturnType<typeof buildHeaderMap>,
): JsonRecord {
  const guestFullNameRaw = pickValueFromRow(rawRow, headerMap, "guest_full_name");
  const firstNameRaw = pickValueFromRow(rawRow, headerMap, "first_name");
  const lastNameRaw = pickValueFromRow(rawRow, headerMap, "last_name");

  const splitName = splitGuestFullName(guestFullNameRaw);

  return {
    reservation_id: pickValueFromRow(rawRow, headerMap, "reservation_id"),
    reservation_line_id: pickValueFromRow(rawRow, headerMap, "reservation_line_id"),
    property_code: pickValueFromRow(rawRow, headerMap, "property_code"),
    property_name: pickValueFromRow(rawRow, headerMap, "property_name"),

    booking_date: normalizeDateToISO(
      pickValueFromRow(rawRow, headerMap, "booking_date"),
    ),
    checkin_date: normalizeDateToISO(
      pickValueFromRow(rawRow, headerMap, "checkin_date"),
    ),
    checkout_date: normalizeDateToISO(
      pickValueFromRow(rawRow, headerMap, "checkout_date"),
    ),

    status: normalizeReservationStatus(
      pickValueFromRow(rawRow, headerMap, "status"),
    ),

    channel: pickValueFromRow(rawRow, headerMap, "channel"),
    segment: pickValueFromRow(rawRow, headerMap, "segment"),
    company: pickValueFromRow(rawRow, headerMap, "company"),
    agency: pickValueFromRow(rawRow, headerMap, "agency"),

    guest_full_name: splitName.guest_full_name,
    first_name: firstNameRaw ?? splitName.first_name,
    last_name: lastNameRaw ?? splitName.last_name,

    document: pickValueFromRow(rawRow, headerMap, "document"),
    email: pickValueFromRow(rawRow, headerMap, "email"),
    phone: pickValueFromRow(rawRow, headerMap, "phone"),
    country: pickValueFromRow(rawRow, headerMap, "country"),

    rooms: normalizeIntegerString(
      pickValueFromRow(rawRow, headerMap, "rooms"),
    ),

    gross_revenue: normalizeDecimalString(
      pickValueFromRow(rawRow, headerMap, "gross_revenue"),
    ),
    net_revenue: normalizeDecimalString(
      pickValueFromRow(rawRow, headerMap, "net_revenue"),
    ),
    commission_amount: normalizeDecimalString(
      pickValueFromRow(rawRow, headerMap, "commission_amount"),
    ),

    currency: normalizeCurrency(
      pickValueFromRow(rawRow, headerMap, "currency"),
    ),

    adults: normalizeIntegerString(
      pickValueFromRow(rawRow, headerMap, "adults"),
    ),
    children: normalizeIntegerString(
      pickValueFromRow(rawRow, headerMap, "children"),
    ),

    room_type: pickValueFromRow(rawRow, headerMap, "room_type"),
    rate_plan: pickValueFromRow(rawRow, headerMap, "rate_plan"),
    market_code: pickValueFromRow(rawRow, headerMap, "market_code"),
    source_system: pickValueFromRow(rawRow, headerMap, "source_system"),

    cancelled_at: normalizeDateToISO(
      pickValueFromRow(rawRow, headerMap, "cancelled_at"),
    ),
  };
}

/* ======================================================
 * Extra validation for this import
 * - currency is required because DB has NOT NULL
 * ====================================================== */
function validateNormalizedRowForImport(row: JsonRecord) {
  const base = validateUnifiedRow(row);

  const errors = [...base.errors];
  const warnings = [...base.warnings];

  if (!toNullableString(row.currency)) {
    errors.push("missing currency");
  }

  const propertyCode = inferPropertyCode(row);
  if (!propertyCode) {
    errors.push("missing property_code/property_name");
  }

  return {
    ...base,
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/* ======================================================
 * Reservation write
 * - preserves first_seen_* if row already exists
 * - updates last_seen_* on every import
 * ====================================================== */
async function upsertReservation(
  sb: ReturnType<typeof supabaseServiceClient>,
  params: {
    orgId: string;
    batchId: string;
    row: JsonRecord;
    propertyCode: string;
  },
) {
  const { orgId, batchId, row, propertyCode } = params;
  const nowIso = new Date().toISOString();
  const reservationKey = requiredString(row.reservation_key, "reservation_key");

  const { data: existing, error: existingError } = await sb
    .from("debacu_eval_reservations")
    .select("id, first_seen_batch_id, first_seen_at")
    .eq("org_id", orgId)
    .eq("property_code", propertyCode)
    .eq("reservation_key", reservationKey)
    .maybeSingle();

  if (existingError) {
    throw new Error(`reservation_lookup_failed:${existingError.message}`);
  }

  const payload = {
    org_id: orgId,
    property_code: propertyCode,
    reservation_key: reservationKey,
    reservation_id: requiredString(row.reservation_id, "reservation_id"),
    reservation_line_id: toNullableString(row.reservation_line_id),

    booking_date: requiredString(row.booking_date, "booking_date"),
    checkin_date: requiredString(row.checkin_date, "checkin_date"),
    checkout_date: requiredString(row.checkout_date, "checkout_date"),

    reservation_status: requiredString(row.status, "status"),
    currency: requiredString(row.currency, "currency"),

    gross_revenue: requiredNumber(row.gross_revenue, "gross_revenue"),
    commission_amount: toNullableNumber(row.commission_amount),
    net_revenue: toNullableNumber(row.net_revenue),

    rooms: requiredNumber(row.rooms, "rooms"),
    adults: toNullableNumber(row.adults),
    children: toNullableNumber(row.children),

    channel: toNullableString(row.channel),
    segment: toNullableString(row.segment),
    room_type: toNullableString(row.room_type),
    rate_plan: toNullableString(row.rate_plan),

    // Column is timestamptz; date-only fallback is acceptable for v1
    cancelled_at: toNullableString(row.cancelled_at),

    company: toNullableString(row.company),
    agency: toNullableString(row.agency),
    market_code: toNullableString(row.market_code),
    source_system: toNullableString(row.source_system),

    first_seen_batch_id: existing?.first_seen_batch_id ?? batchId,
    last_seen_batch_id: batchId,
    first_seen_at: existing?.first_seen_at ?? nowIso,
    last_seen_at: nowIso,
  };

  const { error } = await sb
    .from("debacu_eval_reservations")
    .upsert(payload, {
      onConflict: "org_id,property_code,reservation_key",
    });

  if (error) {
    throw new Error(`reservation_upsert_failed:${error.message}`);
  }
}

/* ======================================================
 * Snapshots
 * ====================================================== */
async function insertReservationSnapshot(
  sb: ReturnType<typeof supabaseServiceClient>,
  params: {
    batchId: string;
    orgId: string;
    propertyCode: string;
    row: JsonRecord;
  },
) {
  const { batchId, orgId, propertyCode, row } = params;
  const snapshotDate = new Date().toISOString().slice(0, 10);

  const { error } = await sb
    .from("debacu_eval_reservation_snapshots")
    .insert({
      batch_id: batchId,
      org_id: orgId,
      property_code: propertyCode,
      reservation_key: requiredString(row.reservation_key, "reservation_key"),
      snapshot_date: snapshotDate,

      booking_date: requiredString(row.booking_date, "booking_date"),
      checkin_date: requiredString(row.checkin_date, "checkin_date"),
      checkout_date: requiredString(row.checkout_date, "checkout_date"),

      reservation_status: requiredString(row.status, "status"),
      currency: requiredString(row.currency, "currency"),

      gross_revenue: requiredNumber(row.gross_revenue, "gross_revenue"),
      commission_amount: toNullableNumber(row.commission_amount),
      net_revenue: toNullableNumber(row.net_revenue),

      rooms: requiredNumber(row.rooms, "rooms"),
      adults: toNullableNumber(row.adults),
      children: toNullableNumber(row.children),

      channel: toNullableString(row.channel),
      segment: toNullableString(row.segment),
      room_type: toNullableString(row.room_type),
      rate_plan: toNullableString(row.rate_plan),

      cancelled_at: toNullableString(row.cancelled_at),
    });

  if (error) {
    throw new Error(`snapshot_insert_failed:${error.message}`);
  }
}

/* ======================================================
 * Stay nights rebuild
 * ====================================================== */
async function rebuildStayNights(
  sb: ReturnType<typeof supabaseServiceClient>,
  params: {
    orgId: string;
    batchId: string;
    propertyCode: string;
    row: JsonRecord;
  },
) {
  const { orgId, batchId, propertyCode, row } = params;

  const reservationKey = requiredString(row.reservation_key, "reservation_key");
  const checkinDate = requiredString(row.checkin_date, "checkin_date");
  const checkoutDate = requiredString(row.checkout_date, "checkout_date");

  const checkin = new Date(`${checkinDate}T00:00:00Z`);
  const checkout = new Date(`${checkoutDate}T00:00:00Z`);

  if (Number.isNaN(checkin.getTime()) || Number.isNaN(checkout.getTime())) {
    throw new Error(`invalid_stay_dates:${reservationKey}`);
  }

  const diffMs = checkout.getTime() - checkin.getTime();
  const nightsCount = Math.round(diffMs / 86400000);

  if (nightsCount <= 0) {
    throw new Error(`invalid_stay_range:${reservationKey}`);
  }

  const rooms = requiredNumber(row.rooms, "rooms");
  if (rooms <= 0) {
    throw new Error(`invalid_rooms:${reservationKey}`);
  }

  const grossRevenue = requiredNumber(row.gross_revenue, "gross_revenue");
  const netRevenue = toNullableNumber(row.net_revenue) ?? grossRevenue;

  const allocatedGross = grossRevenue / nightsCount;
  const allocatedNet = netRevenue / nightsCount;

  const { error: deleteError } = await sb
    .from("debacu_eval_stay_nights")
    .delete()
    .eq("org_id", orgId)
    .eq("property_code", propertyCode)
    .eq("reservation_key", reservationKey);

  if (deleteError) {
    throw new Error(`stay_nights_delete_failed:${deleteError.message}`);
  }

  const rows: Record<string, unknown>[] = [];

  for (let i = 0; i < nightsCount; i++) {
    const d = new Date(checkin);
    d.setUTCDate(checkin.getUTCDate() + i);

    rows.push({
      org_id: orgId,
      property_code: propertyCode,
      reservation_key: reservationKey,
      stay_date: d.toISOString().slice(0, 10),
      reservation_status: requiredString(row.status, "status"),
      rooms,
      room_nights: rooms,
      allocated_gross_revenue: allocatedGross,
      allocated_net_revenue: allocatedNet,
      channel: toNullableString(row.channel),
      segment: toNullableString(row.segment),
      room_type: toNullableString(row.room_type),
      rate_plan: toNullableString(row.rate_plan),
      source_batch_id: batchId,
    });
  }

  const { error: insertError } = await sb
    .from("debacu_eval_stay_nights")
    .insert(rows);

  if (insertError) {
    throw new Error(`stay_nights_insert_failed:${insertError.message}`);
  }
}

/* ======================================================
 * Main
 * ====================================================== */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return fail(req, 405, "method_not_allowed");

  try {
    const user = await requireUser(req);
    const sb = supabaseServiceClient();

    const form = await req.formData();

    const file = form.get("file");
    const modeRaw = form.get("mode");
    const orgIdRaw = form.get("org_id");
    const mode = String(modeRaw ?? "dry_run").trim().toLowerCase();

    if (!(file instanceof File)) {
      return fail(req, 400, "csv_file_missing");
    }

    if (mode !== "dry_run" && mode !== "commit") {
      return fail(req, 400, "invalid_mode");
    }

    const orgId = await resolveOrgForUser(
      sb,
      String((user as any).id),
      toNullableString(orgIdRaw),
    );

    const csvText = await file.text();
    const sourceFileSha256 = await sha256Hex(csvText);

    const parsed = await parseCsv(csvText);

    if (!parsed.headers?.length) {
      return fail(req, 400, "csv_headers_not_detected");
    }

    const headerMap = buildHeaderMap(parsed.headers);
    const importProfileCode = inferImportProfileCode(headerMap);

    const previewRows: JsonRecord[] = [];
    const rowErrors: JsonRecord[] = [];
    const allWarnings: JsonRecord[] = [];

    let rowsWarningCount = 0;

    for (let i = 0; i < parsed.rows.length; i++) {
      const rawRow = parsed.rows[i] as ParsedCsvRow;
      const rowNumber = i + 1;

      const normalizedRow = buildNormalizedRow(rawRow, headerMap);
      const propertyCode = inferPropertyCode(normalizedRow);

      const validation = validateNormalizedRowForImport(normalizedRow);

      let identityResult: IdentityResult = null;
      let screeningEligible = validation.screening_eligible;

      if (validation.valid && screeningEligible) {
        try {
          identityResult = await buildIdentityKey({
            document: toNullableString(normalizedRow.document),
            email: toNullableString(normalizedRow.email),
            phone: toNullableString(normalizedRow.phone),
          });
        } catch (err) {
          const message = extractErrorMessage(err);

          if (message === "NO_IDENTIFIER") {
            screeningEligible = false;
          } else {
            rowErrors.push({
              row_number: rowNumber,
              row: rawRow,
              errors: [`identity_error: ${message}`],
              warnings: validation.warnings,
            });
            continue;
          }
        }
      }

      if (!validation.valid) {
        rowErrors.push({
          row_number: rowNumber,
          row: rawRow,
          errors: validation.errors,
          warnings: validation.warnings,
        });
        continue;
      }

      const reservationKey = buildReservationKey(orgId, {
        property_code: propertyCode,
        property_name: toNullableString(normalizedRow.property_name),
        reservation_id: toNullableString(normalizedRow.reservation_id),
        reservation_line_id: toNullableString(normalizedRow.reservation_line_id),
      });

      const enrichedRow: JsonRecord = {
        ...normalizedRow,
        property_code: propertyCode,
        reservation_key: reservationKey,
        identity_key: identityResult?.identity_key ?? null,
        identity_input_kind: identityResult?.input_kind ?? null,
        screening_eligible: screeningEligible,
        import_capability: screeningEligible
          ? "SCREENING_AND_REVENUE"
          : "REVENUE_ONLY",
      };

      if (validation.warnings.length > 0) {
        rowsWarningCount += countWarningsForRow(validation.warnings);

        allWarnings.push({
          row_number: rowNumber,
          reservation_key: reservationKey,
          warnings: validation.warnings,
        });
      }

      previewRows.push(enrichedRow);
    }

    const summary = {
      screening_and_revenue_rows: previewRows.filter(
        (r) => r.import_capability === "SCREENING_AND_REVENUE",
      ).length,
      revenue_only_rows: previewRows.filter(
        (r) => r.import_capability === "REVENUE_ONLY",
      ).length,
      invalid_rows: rowErrors.length,
    };

    if (mode === "dry_run") {
      return ok(req, {
        ok: true,
        data: {
          mode,
          file_name: file.name,
          source_file_sha256: sourceFileSha256,
          delimiter: parsed.delimiter,
          header_row_index: parsed.headerRowIndex,
          skipped_top_lines: parsed.skippedTopLines,
          import_profile_code: importProfileCode,
          rows_detected: parsed.rows.length,
          rows_ok: previewRows.length,
          rows_warning: rowsWarningCount,
          rows_error: rowErrors.length,
          summary,
          preview: previewRows.slice(0, 50),
          errors: rowErrors,
          warnings: allWarnings,
          header_map: headerMap,
        },
      });
    }

    const propertyCodes = Array.from(
      new Set(
        previewRows
          .map((r) => toNullableString(r.property_code))
          .filter((v): v is string => Boolean(v)),
      ),
    );

    if (propertyCodes.length !== 1) {
      return fail(req, 400, "commit_requires_exactly_one_property_code", {
        detected_property_codes: propertyCodes,
      });
    }

    const propertyCode = propertyCodes[0];

    const duplicatedFile = await sb
      .from("debacu_eval_unified_import_batches")
      .select("id,status,source_file_name,uploaded_at")
      .eq("org_id", orgId)
      .eq("property_code", propertyCode)
      .eq("source_file_sha256", sourceFileSha256)
      .limit(1)
      .maybeSingle();

    if (duplicatedFile.error) {
      return fail(req, 500, "duplicate_file_check_failed", {
        detail_message: duplicatedFile.error.message,
      });
    }

    if (duplicatedFile.data) {
      return json(req, 409, {
        ok: false,
        error: "IMPORT_ALREADY_PROCESSED",
        existing_batch: duplicatedFile.data,
      });
    }

    const batchInsert = await sb
      .from("debacu_eval_unified_import_batches")
      .insert({
        org_id: orgId,
        property_code: propertyCode,
        import_profile_code: importProfileCode,
        source_file_name: file.name,
        source_file_sha256: sourceFileSha256,
        source_system: toNullableString(previewRows[0]?.source_system),
        separator: parsed.delimiter,
        status: "PENDING",
        rows_total: parsed.rows.length,
        rows_ok: previewRows.length,
        rows_warning: rowsWarningCount,
        rows_error: rowErrors.length,
        uploaded_by: (user as any)?.id ?? null,
        metadata: {
          header_map: headerMap,
          header_row_index: parsed.headerRowIndex,
          skipped_top_lines: parsed.skippedTopLines,
          summary,
          screening_enabled: false,
        },
      })
      .select("id")
      .single();

    if (batchInsert.error || !batchInsert.data?.id) {
      return fail(req, 500, "batch_create_failed", {
        detail_message: batchInsert.error?.message ?? null,
      });
    }

    const batchId = String(batchInsert.data.id);

    try {
      for (let i = 0; i < parsed.rows.length; i++) {
        const rawRow = parsed.rows[i] as ParsedCsvRow;
        const rowNumber = i + 1;

        const normalizedRow = buildNormalizedRow(rawRow, headerMap);
        const propertyCodeForRow = inferPropertyCode(normalizedRow);
        const validation = validateNormalizedRowForImport(normalizedRow);

        let identityResult: IdentityResult = null;
        let screeningEligible = validation.screening_eligible;

        if (validation.valid && screeningEligible) {
          try {
            identityResult = await buildIdentityKey({
              document: toNullableString(normalizedRow.document),
              email: toNullableString(normalizedRow.email),
              phone: toNullableString(normalizedRow.phone),
            });
          } catch (err) {
            const message = extractErrorMessage(err);

            if (message === "NO_IDENTIFIER") {
              screeningEligible = false;
            } else {
              const { error } = await sb
                .from("debacu_eval_unified_import_rows")
                .insert({
                  batch_id: batchId,
                  org_id: orgId,
                  row_number: rowNumber,
                  raw_payload: rawRow,
                  normalized_payload: normalizedRow,
                  validation_status: "ERROR",
                  validation_errors: [`identity_error: ${message}`],
                  validation_warnings: validation.warnings,
                  reservation_key: null,
                  identity_key: null,
                  screening_eligible: false,
                });

              if (error) {
                throw new Error(`import_row_error_insert_failed:${error.message}`);
              }

              continue;
            }
          }
        }

        if (!validation.valid || !propertyCodeForRow) {
          const validationErrors = !propertyCodeForRow
            ? [...validation.errors, "missing property_code/property_name"]
            : validation.errors;

          const { error } = await sb
            .from("debacu_eval_unified_import_rows")
            .insert({
              batch_id: batchId,
              org_id: orgId,
              row_number: rowNumber,
              raw_payload: rawRow,
              normalized_payload: normalizedRow,
              validation_status: "ERROR",
              validation_errors: validationErrors,
              validation_warnings: validation.warnings,
              reservation_key: null,
              identity_key: null,
              screening_eligible: false,
            });

          if (error) {
            throw new Error(`import_row_invalid_insert_failed:${error.message}`);
          }

          continue;
        }

        const reservationKey = buildReservationKey(orgId, {
          property_code: propertyCodeForRow,
          property_name: toNullableString(normalizedRow.property_name),
          reservation_id: toNullableString(normalizedRow.reservation_id),
          reservation_line_id: toNullableString(normalizedRow.reservation_line_id),
        });

        const enrichedRow: JsonRecord = {
          ...normalizedRow,
          property_code: propertyCodeForRow,
          reservation_key: reservationKey,
          identity_key: identityResult?.identity_key ?? null,
          identity_input_kind: identityResult?.input_kind ?? null,
          screening_eligible: screeningEligible,
          import_capability: screeningEligible
            ? "SCREENING_AND_REVENUE"
            : "REVENUE_ONLY",
        };

        const validationStatus = validation.warnings.length > 0 ? "WARNING" : "OK";

        const importRowInsert = await sb
          .from("debacu_eval_unified_import_rows")
          .insert({
            batch_id: batchId,
            org_id: orgId,
            row_number: rowNumber,
            raw_payload: rawRow,
            normalized_payload: enrichedRow,
            validation_status: validationStatus,
            validation_errors: [],
            validation_warnings: validation.warnings,
            reservation_key: reservationKey,
            identity_key: identityResult?.identity_key ?? null,
            screening_eligible: screeningEligible,
          });

        if (importRowInsert.error) {
          throw new Error(`import_row_insert_failed:${importRowInsert.error.message}`);
        }

        await upsertReservation(sb, {
          orgId,
          batchId,
          row: enrichedRow,
          propertyCode: propertyCodeForRow,
        });

        await insertReservationSnapshot(sb, {
          batchId,
          orgId,
          propertyCode: propertyCodeForRow,
          row: enrichedRow,
        });

        await rebuildStayNights(sb, {
          orgId,
          batchId,
          propertyCode: propertyCodeForRow,
          row: enrichedRow,
        });
      }

      const batchUpdate = await sb
        .from("debacu_eval_unified_import_batches")
        .update({
          status: "COMMITTED",
          committed_at: new Date().toISOString(),
          metadata: {
            header_map: headerMap,
            header_row_index: parsed.headerRowIndex,
            skipped_top_lines: parsed.skippedTopLines,
            summary,
            committed_rows: previewRows.length,
            screening_enabled: false,
          },
        })
        .eq("id", batchId);

      if (batchUpdate.error) {
        throw new Error(`batch_commit_update_failed:${batchUpdate.error.message}`);
      }

      return ok(req, {
        ok: true,
        data: {
          status: "ok",
          batch_id: batchId,
          property_code: propertyCode,
          rows_total: parsed.rows.length,
          rows_ok: previewRows.length,
          rows_warning: rowsWarningCount,
          rows_error: rowErrors.length,
          summary,
        },
      });
    } catch (commitErr) {
      await sb
        .from("debacu_eval_unified_import_batches")
        .update({
          status: "PARTIAL_ERROR",
          metadata: {
            header_map: headerMap,
            header_row_index: parsed.headerRowIndex,
            skipped_top_lines: parsed.skippedTopLines,
            summary,
            screening_enabled: false,
            commit_error: extractErrorMessage(commitErr),
          },
        })
        .eq("id", batchId);

      return fail(req, 500, "commit_failed", {
        batch_id: batchId,
        detail_message: extractErrorMessage(commitErr),
      });
    }
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") {
      return fail(req, 401, "UNAUTHORIZED");
    }
    if (msg === "FORBIDDEN") {
      return fail(req, 403, "FORBIDDEN");
    }
    if (
      msg.startsWith("missing_") ||
      msg.startsWith("invalid_") ||
      msg.includes("required_field")
    ) {
      return fail(req, 400, msg);
    }

    return fail(req, 500, "internal_error", { detail_message: msg });
  }
});