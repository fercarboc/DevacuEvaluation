// supabase/functions/customer_audit_export_run/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { PDFDocument, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-session-token",
    "Access-Control-Max-Age": "86400",
  };
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

function userClient(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

async function requireJwtUser(req: Request) {
  const sb = userClient(req);
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const APP_ID = "DEBACU_EVAL";
const APP_CODE = "DEBACU_EVAL";
const STORAGE_BUCKET = "customer-exports";

function readSessionToken(req: Request) {
  return (req.headers.get("x-session-token") ?? "").trim();
}

async function requireEvalSession(token: string) {
  const { data: session, error } = await admin
    .from("debacu_eval_sessions")
    .select("customer_id, app_code, expires_at, revoked_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !session) throw new Error("SESSION_INVALID");
  if (session.app_code !== APP_CODE) throw new Error("SESSION_INVALID_APP");
  if (session.revoked_at) throw new Error("SESSION_REVOKED");
  if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) throw new Error("SESSION_EXPIRED");
  return session.customer_id as string;
}

async function requireOrgMember(customer_id: string, user_id: string) {
  const { data: org, error: orgErr } = await admin
    .from("debacu_eval_organizations")
    .select("id")
    .eq("customer_id", customer_id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (orgErr) throw new Error(`ORG_LOOKUP_FAILED:${orgErr.message}`);
  if (!org?.id) throw new Error("FORBIDDEN_NO_ORG");

  const { data: mem, error: memErr } = await admin
    .from("debacu_eval_org_members")
    .select("id, role")
    .eq("org_id", org.id)
    .eq("user_id", user_id)
    .maybeSingle();

  if (memErr) throw new Error(`MEMBERSHIP_FAILED:${memErr.message}`);
  if (!mem?.id) throw new Error("FORBIDDEN");

  return { org_id: org.id as string, role: mem.role ?? null };
}

type ReqBody = {
  export_type: "PDF" | "CSV";
  export_scope: string; // aquí SOLO "AUDIT_LOG"
  period_from: string; // yyyy-mm-dd
  period_to: string;   // yyyy-mm-dd
  filters?: any;       // opcional: { q?, event_type? }
};

function assertDate(s: string, name: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`BAD_${name.toUpperCase()}`);
}

/** rango por created_at: [from 00:00:00, to+1 00:00:00) */
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
    } catch {}
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
  const { width, height } = page.getSize();

  let y = height - 50;
  page.drawText(title, { x: 50, y, size: 14, font });
  y -= 24;

  page.drawText(`Filas: ${rows.length}`, { x: 50, y, size: 10, font });
  y -= 18;

  // tabla simple (no perfecta, pero usable)
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

export default Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(origin, 405, { ok: false, error: "method_not_allowed" });

  try {
    const user = await requireJwtUser(req);

    const sessionToken = readSessionToken(req);
    if (!sessionToken) return json(origin, 401, { ok: false, error: "missing_session_token" });

    const customer_id = await requireEvalSession(sessionToken);
    const { org_id, role } = await requireOrgMember(customer_id, user.id);

    const body = (await req.json()) as ReqBody;

    if (!body?.export_type || !body?.export_scope) throw new Error("BAD_REQUEST");
    assertDate(body.period_from, "period_from");
    assertDate(body.period_to, "period_to");
    if (body.period_from > body.period_to) throw new Error("BAD_RANGE");

    const export_scope = String(body.export_scope).trim();

    // ✅ Solo implementamos AUDIT_LOG aquí.
    if (export_scope !== "AUDIT_LOG") {
      return json(origin, 501, { ok: false, error: "not_implemented", detail: `scope:${export_scope}` });
    }

    const filters = normalizeFilters(body.filters);
    const { fromIso, toIso } = toIsoRange(body.period_from, body.period_to);

    // ------------------------------------------------------------------
    // Query audit log por created_at, y sin perder eventos con customer_id null
    // (los de access_request_approved, etc, que llevan meta.org_id)
    //
    // Nota: supabase-js no deja OR complejo muy fino, pero sí .or(...) con string
    // ------------------------------------------------------------------
    let q = admin
      .from("debacu_eval_audit_log")
      .select(
        "id,created_at,actor_user_id,action,entity,entity_id,meta,customer_id,app_id,event_type,evaluation_id,search_kind,search_value_masked,search_value_hash,result_count"
      )
      .eq("app_id", APP_ID)
      .gte("created_at", fromIso)
      .lt("created_at", toIso)
      // OR: customer_id = X  OR  (customer_id is null AND meta->>org_id = org_id)
      .or(`customer_id.eq.${customer_id},and(customer_id.is.null,meta->>org_id.eq.${org_id})`)
      .order("created_at", { ascending: true });

    // filtros opcionales
    const eventType = (filters as any)?.event_type;
    if (eventType) q = q.eq("event_type", String(eventType));

    // (opcional) búsqueda simple por texto en action/entity/search_value_masked (si quieres)
    const qText = (filters as any)?.q;
    if (qText && String(qText).trim()) {
      const t = String(qText).trim();
      q = q.or(
        `action.ilike.%${t}%,entity.ilike.%${t}%,search_value_masked.ilike.%${t}%`
      );
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(`AUDIT_LOG_QUERY_FAILED:${error.message}`);

    const auditRows = (rows ?? []) as AuditLogRow[];

    // 1) crear registro export (READY al final)
    const { data: created, error: insErr } = await admin
      .from("customer_audit_exports")
      .insert({
        org_id,
        app_id: APP_ID,
        requested_by_user_id: user.id,
        requested_by_role: role,
        requested_by_email: user.email ?? null,
        export_type: body.export_type,
        export_scope: export_scope,
        period_from: body.period_from,
        period_to: body.period_to,
        filters,
        status: "PENDING",
        storage_bucket: STORAGE_BUCKET,
        storage_path: "",
      })
      .select("id")
      .single();

    if (insErr || !created?.id) throw new Error(`CREATE_FAILED:${insErr?.message ?? "NO_ID"}`);
    const export_id = created.id as string;

    // 2) generar fichero
    let fileBytes: Uint8Array;
    let ext: "csv" | "pdf";
    let contentType: string;

    if (body.export_type === "CSV") {
      const csv = await buildCsv(auditRows);
      fileBytes = new TextEncoder().encode(csv);
      ext = "csv";
      contentType = "text/csv; charset=utf-8";
    } else {
      const pdfBytes = await buildPdf(
        auditRows,
        `Debacu Evaluation360 — AUDIT_LOG (${body.period_from} a ${body.period_to})`
      );
      fileBytes = new Uint8Array(pdfBytes);
      ext = "pdf";
      contentType = "application/pdf";
    }

    const hash = await sha256Hex(fileBytes);
    const size = fileBytes.byteLength;

    const storage_path =
      `debacu_eval/org/${org_id}/exports/${export_id}.${ext}`;

    // 3) upload
    const up = await admin.storage
      .from(STORAGE_BUCKET)
      .upload(storage_path, fileBytes, { contentType, upsert: true });

    if (up.error) throw new Error(`UPLOAD_FAILED:${up.error.message}`);

    // 4) update READY
    const { error: updErr } = await admin
      .from("customer_audit_exports")
      .update({
        status: "READY",
        row_count: auditRows.length,
        sha256: hash,
        file_size_bytes: size,
        storage_path,
        error_code: null,
        error_message: null,
      })
      .eq("id", export_id);

    if (updErr) throw new Error(`UPDATE_FAILED:${updErr.message}`);

    // 5) signed url
    const signed = await admin.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(storage_path, 60 * 10); // 10 min

    if (signed.error || !signed.data?.signedUrl) throw new Error(`SIGNED_URL_FAILED:${signed.error?.message ?? "NO_URL"}`);

    return json(origin, 200, {
      ok: true,
      export_id,
      status: "READY",
      row_count: auditRows.length,
      storage_bucket: STORAGE_BUCKET,
      storage_path,
      signed_url: signed.data.signedUrl,
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const code =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg.startsWith("SESSION_")
        ? 401
        : msg.startsWith("FORBIDDEN")
        ? 403
        : msg.startsWith("BAD_") || msg === "BAD_REQUEST"
        ? 400
        : msg.includes("NOT_IMPLEMENTED")
        ? 501
        : 500;

    console.error("customer_audit_export_run error:", e);
    return json(origin, code, { ok: false, error: "request_failed", detail: msg });
  }
});
