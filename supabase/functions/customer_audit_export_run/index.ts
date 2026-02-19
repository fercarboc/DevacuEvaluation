// supabase/functions/customer_audit_export_run/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { PDFDocument, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, supabaseServiceClient } from "../_shared/auth.ts";

/** ======================================================
 * CONFIG
 * ====================================================== */
const APP_ID = "DEBACU_EVAL"; // si tu audit_log usa app_id
const APP_CODE = "DEBACU_EVAL";
const STORAGE_BUCKET = "customer-exports";

/** ======================================================
 * INPUT
 * ====================================================== */
type ReqBody = {
  org_id?: string | null;

  export_type: "PDF" | "CSV";
  export_scope: string; // aquí SOLO "AUDIT_LOG"

  period_from: string; // yyyy-mm-dd
  period_to: string; // yyyy-mm-dd
  filters?: any; // opcional: { q?, event_type? }
};

function assertDate(s: string, name: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`invalid_${name}`);
}

/** rango por created_at: [from 00:00:00Z, to+1 00:00:00Z) */
function toIsoRange(period_from: string, period_to: string) {
  const fromIso = `${period_from}T00:00:00.000Z`;
  const toPlus1 = new Date(`${period_to}T00:00:00.000Z`);
  toPlus1.setUTCDate(toPlus1.getUTCDate() + 1);
  const toIso = toPlus1.toISOString();
  return { fromIso, toIso };
}

function normalizeFilters(v: unknown): Record<string, unknown> {
  if (!v) return {};
  if (typeof v === "object") return v as Record<string, unknown>;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch {
      // ignore
    }
  }
  return {};
}

function escapeCsvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** ======================================================
 * MULTI-ORG + ENTITLEMENTS
 * ====================================================== */
async function resolveOrgForUserOrThrow(
  admin: ReturnType<typeof createClient>,
  userId: string,
  requestedOrgId?: string | null
): Promise<{ org_id: string; role: string | null }> {
  // 1) org_id explícito (recomendado)
  if (requestedOrgId) {
    // preferimos ACTIVE si existe status
    try {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id, role")
        .eq("org_id", requestedOrgId)
        .eq("user_id", userId)
        .eq("status", "ACTIVE")
        .maybeSingle();

      if (error) throw error;
      if (!data?.org_id) throw new Error("FORBIDDEN_NOT_MEMBER");
      return { org_id: String(data.org_id), role: (data.role ?? null) as string | null };
    } catch {
      const { data, error } = await admin
        .from("debacu_eval_org_members")
        .select("org_id, role")
        .eq("org_id", requestedOrgId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) throw new Error(`membership_lookup_failed`);
      if (!data?.org_id) throw new Error("FORBIDDEN_NOT_MEMBER");
      return { org_id: String(data.org_id), role: (data.role ?? null) as string | null };
    }
  }

  // 2) fallback determinista: primera membership ACTIVE, si no, primera
  try {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, role, created_at")
      .eq("user_id", userId)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data?.org_id) throw new Error("FORBIDDEN_NO_ORG");
    return { org_id: String(data.org_id), role: (data.role ?? null) as string | null };
  } catch {
    const { data, error } = await admin
      .from("debacu_eval_org_members")
      .select("org_id, role, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`membership_lookup_failed`);
    if (!data?.org_id) throw new Error("FORBIDDEN_NO_ORG");
    return { org_id: String(data.org_id), role: (data.role ?? null) as string | null };
  }
}

type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  subscription_status: string | null;
};

async function loadEntitlementsOrThrow(admin: ReturnType<typeof createClient>, orgId: string) {
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, subscription_status")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error("entitlements_failed");
  if (!data?.org_id) throw new Error("FORBIDDEN_NO_ENTITLEMENTS");
  return data as EntitlementsRow;
}

function assertOrgActive(ent: EntitlementsRow) {
  if (ent.subscription_status !== "ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
  if (!ent.customer_id) throw new Error("FORBIDDEN_NO_CUSTOMER");
}

/** ======================================================
 * AUDIT LOG TYPES + BUILDERS
 * ====================================================== */
type AuditLogRow = {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  action: string | null;
  entity: string | null;
  entity_id: string | null;
  meta: any;
  customer_id: string | null;
  app_id: string | null;
  event_type: string | null;
  evaluation_id: string | null;
  search_kind: string | null;
  search_value_masked: string | null;
  search_value_hash: string | null;
  result_count: number | null;
};

function pickMeta(meta: any, key: string): string {
  if (!meta || typeof meta !== "object") return "";
  const v = (meta as any)[key];
  return v === null || v === undefined ? "" : String(v);
}

async function buildCsv(rows: AuditLogRow[]) {
  const header = [
    "created_at",
    "action",
    "entity",
    "entity_id",
    "event_type",
    "search_kind",
    "search_value_masked",
    "result_count",
    "risk",
    "window",
    "time_window",
    "match_strength",
    "meta_json",
  ];
  const lines: string[] = [];
  lines.push(header.map(escapeCsvCell).join(","));

  for (const r of rows) {
    const risk = pickMeta(r.meta, "risk");
    const window = pickMeta(r.meta, "window");
    const time_window = pickMeta(r.meta, "time_window");
    const match_strength = pickMeta(r.meta, "match_strength");
    const meta_json = r.meta ? JSON.stringify(r.meta) : "";

    const row = [
      r.created_at,
      r.action ?? "",
      r.entity ?? "",
      r.entity_id ?? "",
      r.event_type ?? "",
      r.search_kind ?? "",
      r.search_value_masked ?? "",
      r.result_count ?? "",
      risk,
      window,
      time_window,
      match_strength,
      meta_json,
    ].map(escapeCsvCell);

    lines.push(row.join(","));
  }

  return lines.join("\n");
}

async function buildPdf(rows: AuditLogRow[], title: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  const page = pdf.addPage([595, 842]); // A4
  const { height } = page.getSize();

  let y = height - 50;
  page.drawText(title, { x: 50, y, size: 14, font });
  y -= 24;

  page.drawText(`Filas: ${rows.length}`, { x: 50, y, size: 10, font });
  y -= 18;

  // tabla simple (preview); no intentes meter 10k líneas en PDF aquí
  const maxLines = 60;
  const slice = rows.slice(0, maxLines);

  for (const r of slice) {
    const line =
      `${r.created_at} | ${r.event_type ?? ""} | ${r.action ?? ""} | ${r.search_value_masked ?? ""} | rc=${r.result_count ?? ""}`;
    if (y < 60) break;
    page.drawText(line.substring(0, 120), { x: 50, y, size: 8, font });
    y -= 12;
  }

  if (rows.length > maxLines && y >= 60) {
    page.drawText(`(Mostradas ${maxLines} primeras filas)`, { x: 50, y, size: 8, font });
  }

  return await pdf.save();
}

/** ======================================================
 * DATA FETCH (sin OR raro: 2 queries + merge)
 * ====================================================== */
const AUDIT_COLS =
  "id,created_at,actor_user_id,action,entity,entity_id,meta,customer_id,app_id,event_type,evaluation_id,search_kind,search_value_masked,search_value_hash,result_count";

async function fetchAuditRows(
  admin: ReturnType<typeof createClient>,
  params: {
    org_id: string;
    customer_id: string;
    fromIso: string;
    toIso: string;
    filters: Record<string, unknown>;
  }
): Promise<AuditLogRow[]> {
  const { org_id, customer_id, fromIso, toIso, filters } = params;

  const eventType = (filters as any)?.event_type ? String((filters as any).event_type) : "";
  const qText = (filters as any)?.q ? String((filters as any).q).trim() : "";

  // Query A: customer_id = customer_id
  let qA = admin
    .from("debacu_eval_audit_log")
    .select(AUDIT_COLS)
    .eq("app_id", APP_ID)
    .eq("customer_id", customer_id)
    .gte("created_at", fromIso)
    .lt("created_at", toIso);

  if (eventType) qA = qA.eq("event_type", eventType);
  if (qText) {
    // OR simple para texto en varias columnas (aceptable)
    qA = qA.or(`action.ilike.%${qText}%,entity.ilike.%${qText}%,search_value_masked.ilike.%${qText}%`);
  }

  const { data: aRows, error: aErr } = await qA;
  if (aErr) throw new Error("audit_log_query_failed");

  // Query B: customer_id IS NULL AND meta->>org_id = org_id
  let qB = admin
    .from("debacu_eval_audit_log")
    .select(AUDIT_COLS)
    .eq("app_id", APP_ID)
    .is("customer_id", null)
    .eq("meta->>org_id", org_id)
    .gte("created_at", fromIso)
    .lt("created_at", toIso);

  if (eventType) qB = qB.eq("event_type", eventType);
  if (qText) {
    qB = qB.or(`action.ilike.%${qText}%,entity.ilike.%${qText}%,search_value_masked.ilike.%${qText}%`);
  }

  const { data: bRows, error: bErr } = await qB;
  if (bErr) throw new Error("audit_log_query_failed");

  // Merge + sort + de-dup by id
  const merged = [...((aRows ?? []) as any[]), ...((bRows ?? []) as any[])] as AuditLogRow[];
  const seen = new Set<string>();
  const dedup: AuditLogRow[] = [];
  for (const r of merged) {
    if (!r?.id) continue;
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    dedup.push(r);
  }
  dedup.sort((x, y) => String(x.created_at).localeCompare(String(y.created_at)));
  return dedup;
}

/** ======================================================
 * ERROR MAPPING (STRICT)
 * ====================================================== */
function mapError(e: unknown): { status: number; detail: string } {
  const msg = String((e as any)?.message ?? e ?? "request_failed");

  if (msg === "UNAUTHENTICATED" || msg === "UNAUTHORIZED") return { status: 401, detail: "UNAUTHENTICATED" };
  if (msg === "PLAN_NOT_ACTIVE") return { status: 402, detail: "PLAN_NOT_ACTIVE" };

  if (msg.startsWith("FORBIDDEN") || msg === "membership_lookup_failed" || msg === "entitlements_failed") {
    return { status: 403, detail: "FORBIDDEN" };
  }

  if (msg.startsWith("invalid_") || msg.startsWith("missing_")) return { status: 400, detail: msg };
  if (msg === "unsupported_scope") return { status: 400, detail: "invalid_export_scope" };

  // no stack traces / no detalles internos
  return { status: 500, detail: "INTERNAL" };
}

/** ======================================================
 * MAIN
 * ====================================================== */
export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "method_not_allowed", detail: "method_not_allowed" });
  }

  const admin = supabaseServiceClient();

  try {
    const user = await requireUser(req);

    const body = (await req.json().catch(() => null)) as ReqBody | null;
    if (!body) throw new Error("invalid_json");

    const export_type = String(body.export_type ?? "").toUpperCase();
    const export_scope = String(body.export_scope ?? "").trim();
    if (export_type !== "PDF" && export_type !== "CSV") throw new Error("invalid_export_type");

    // ✅ Solo AUDIT_LOG aquí (como tu función original)
    if (export_scope !== "AUDIT_LOG") throw new Error("unsupported_scope");

    const period_from = String(body.period_from ?? "").trim();
    const period_to = String(body.period_to ?? "").trim();

    assertDate(period_from, "period_from");
    assertDate(period_to, "period_to");
    if (period_from > period_to) throw new Error("invalid_period_range");

    const filters = normalizeFilters(body.filters);
    const { fromIso, toIso } = toIsoRange(period_from, period_to);

    // ✅ multi-org + plan
    const { org_id, role } = await resolveOrgForUserOrThrow(
      admin,
      user.id,
      body.org_id ? String(body.org_id) : null
    );
    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertOrgActive(ent);

    const customer_id = String(ent.customer_id);

    // 1) query audit log (2 queries + merge)
    const auditRows = await fetchAuditRows(admin, { org_id, customer_id, fromIso, toIso, filters });

    // 2) crear registro export PENDING (tabla definitiva)
    // Nota: ajusta nombres si tu schema difiere.
    const exportId = crypto.randomUUID();

    const { data: created, error: insErr } = await admin
      .from("debacu_eval_audit_exports")
      .insert({
        id: exportId,
        org_id,
        customer_id,
        app_code: APP_CODE,

        generated_by_user_id: user.id,
        generated_by_email: user.email,


        delivered_to_name: "Team Hotel",
        delivered_to_org: null,
        delivered_to_reason: "SELF_SERVICE_EXPORT",
        delivered_to_reference: export_scope,

        filter_source: export_scope,
        filter_customer: null,
        filter_type: "created_at",
        filter_from: period_from,
        filter_to: period_to,

        format: export_type,
        row_count: 0,

        storage_bucket: STORAGE_BUCKET,
        storage_path: "",

        file_sha256: null,
        file_bytes: null,

        status: "PENDING",
        meta: {
          app_code: APP_CODE,
          org_id,
          customer_id,
          role,
          filters,
          export_scope,
        },
      } as any)
      .select("id, created_at, status")
      .maybeSingle();

    if (insErr || !created?.id) throw new Error("request_failed");

    // 3) generar fichero
    let fileBytes: Uint8Array;
    let ext: "csv" | "pdf";
    let contentType: string;

    if (export_type === "CSV") {
      const csv = await buildCsv(auditRows);
      fileBytes = new TextEncoder().encode(csv);
      ext = "csv";
      contentType = "text/csv; charset=utf-8";
    } else {
      const pdfBytes = await buildPdf(
        auditRows,
        `Debacu Evaluation360 — AUDIT_LOG (${period_from} a ${period_to})`
      );
      fileBytes = new Uint8Array(pdfBytes);
      ext = "pdf";
      contentType = "application/pdf";
    }

    const hash = await sha256Hex(fileBytes);
    const size = fileBytes.byteLength;

    // path UUID (sin upsert)
    const storage_path = `debacu_eval/org/${org_id}/exports/${exportId}.${ext}`;

    // 4) upload (sin upsert)
    const up = await admin.storage.from(STORAGE_BUCKET).upload(storage_path, fileBytes, {
      contentType,
      upsert: false,
    });

    if (up.error) {
      // marcar FAILED (best-effort) y devolver error
      await admin
        .from("debacu_eval_audit_exports")
        .update({
          status: "FAILED",
          meta: { ...(created as any)?.meta, error_code: "UPLOAD_FAILED" },
        })
        .eq("id", exportId);

      throw new Error("request_failed");
    }

    // 5) update READY (si falla, borrar storage best-effort)
    const { error: updErr } = await admin
      .from("debacu_eval_audit_exports")
      .update({
        status: "READY",
        row_count: auditRows.length,
        storage_bucket: STORAGE_BUCKET,
        storage_path,
        file_sha256: hash,
        file_bytes: size,
      } as any)
      .eq("id", exportId);

    if (updErr) {
      // higiene: borrar archivo
      try {
        await admin.storage.from(STORAGE_BUCKET).remove([storage_path]);
      } catch {
        // ignore best-effort
      }
      throw new Error("request_failed");
    }

    // 6) signed url (best-effort; si falla, que UI use get_signed_url)
    let signed_url: string | null = null;
    try {
      const signed = await admin.storage.from(STORAGE_BUCKET).createSignedUrl(storage_path, 60 * 10);
      signed_url = signed.data?.signedUrl ?? null;
    } catch {
      signed_url = null;
    }

    return json(req, 200, {
      ok: true,
      export_id: exportId,
      status: "READY",
      row_count: auditRows.length,
      storage_bucket: STORAGE_BUCKET,
      storage_path,
      signed_url,
      expires_in: signed_url ? 600 : null,
    });
  } catch (e) {
    const mapped = mapError(e);
    return json(req, mapped.status, { ok: false, error: "request_failed", detail: mapped.detail });
  }
});
