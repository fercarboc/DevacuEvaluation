// supabase/functions/client_audit_export_generate/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { PDFDocument, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_ID = "DEBACU_EVAL";
const EXPORT_BUCKET_DEFAULT = "customer-exports";

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

function hexFromBuffer(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return hexFromBuffer(digest);
}

function mustISODate(s: unknown): string {
  if (typeof s !== "string") throw new Error("INVALID_DATE");
  // esperamos YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("INVALID_DATE");
  return s;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("Origin");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders(origin) });

  try {
    if (req.method !== "POST") return json(origin, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
    });

    // Auth
    const { data: userData, error: userErr } = await sb.auth.getUser();
    if (userErr || !userData?.user) return json(origin, 401, { ok: false, error: "UNAUTHENTICATED" });
    const user_id = userData.user.id;
    const user_email = userData.user.email ?? null;

    // Input snake_case
    const body = await req.json().catch(() => ({} as any));
    const export_type = (body?.export_type ?? "PDF") as string; // 'PDF' | 'CSV'
    const export_scope = (body?.export_scope ?? "AUDIT_LOG") as string; // ej: 'AUDIT_LOG'
    const period_from = mustISODate(body?.period_from);
    const period_to = mustISODate(body?.period_to);
    const filters = (body?.filters ?? {}) as Record<string, unknown>;

    // (opcional) si quieres export de un audit concreto:
    const source_audit_id = (body?.source_audit_id ?? null) as string | null;

    if (export_type !== "PDF" && export_type !== "CSV") {
      return json(origin, 400, { ok: false, error: "INVALID_EXPORT_TYPE" });
    }

    // Resolve org membership (1ª org del usuario)
    const { data: member, error: memErr } = await sb
      .from("debacu_eval_org_members")
      .select("org_id, role")
      .eq("user_id", user_id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memErr) throw memErr;
    if (!member?.org_id) return json(origin, 403, { ok: false, error: "NO_ORG_MEMBERSHIP" });

    const org_id = member.org_id as string;
    const role = (member.role ?? null) as string | null;

    // Load org to get customer_id
    const { data: org, error: orgErr } = await sb
      .from("debacu_eval_organizations")
      .select("id, customer_id, name")
      .eq("id", org_id)
      .maybeSingle();

    if (orgErr) throw orgErr;
    if (!org?.customer_id) return json(origin, 500, { ok: false, error: "ORG_MISSING_CUSTOMER_ID" });

    const customer_id_text = String(org.customer_id); // audit_log.customer_id es text

    // Generate export_id now (para storage_path)
    const export_id = crypto.randomUUID();

    // storage settings (tu tabla obliga storage_path NOT NULL)
    const storage_bucket = EXPORT_BUCKET_DEFAULT;
    const storage_path = `debacu_eval/org/${org_id}/exports/${export_id}.pdf`;

    // 1) Generar PDF (MVP)
    // Si export_type = CSV, aquí luego haremos CSV. Hoy cerramos PDF real.
    if (export_type !== "PDF") {
      return json(origin, 400, { ok: false, error: "CSV_NOT_IMPLEMENTED_YET" });
    }

    // (Opcional) si quieres incluir datos del audit_log en el PDF:
    let auditRow: any = null;
    if (source_audit_id) {
      const { data: arow, error: aerr } = await sb
        .from("debacu_eval_audit_log")
        .select("*")
        .eq("id", source_audit_id)
        .maybeSingle();
      if (aerr) throw aerr;
      auditRow = arow ?? null;
    }

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]); // A4
    const font = await pdf.embedFont(StandardFonts.Helvetica);

    const lines: string[] = [
      "Debacu Evaluation — Audit Export",
      `export_id: ${export_id}`,
      `org_id: ${org_id}`,
      `org_name: ${org.name ?? ""}`,
      `customer_id: ${customer_id_text}`,
      `export_type: ${export_type}`,
      `export_scope: ${export_scope}`,
      `period_from: ${period_from}`,
      `period_to: ${period_to}`,
      `requested_by_user_id: ${user_id}`,
      `requested_by_email: ${user_email ?? ""}`,
      `requested_by_role: ${role ?? ""}`,
      "",
      "filters:",
      JSON.stringify(filters, null, 2),
    ];

    if (auditRow) {
      lines.push("", "source_audit:", JSON.stringify(auditRow, null, 2));
    }

    let y = 820;
    for (const line of lines) {
      const txt = line.length > 110 ? line.slice(0, 110) + "…" : line;
      page.drawText(txt, { x: 40, y, size: 10, font });
      y -= 14;
      if (y < 40) break;
    }

    const pdfBytes = await pdf.save();
    const pdfU8 = new Uint8Array(pdfBytes);
    const hash = await sha256(pdfU8);

    // 2) Subir a Storage
    const { error: upErr } = await sb.storage
      .from(storage_bucket)
      .upload(storage_path, pdfU8, { contentType: "application/pdf", upsert: true });

    if (upErr) {
      // Insert FAILED export row
      await sb.from("customer_audit_exports").insert({
        id: export_id,
        org_id,
        app_id: APP_ID,
        requested_by_user_id: user_id,
        requested_by_role: role,
        requested_by_email: user_email,
        export_type,
        export_scope,
        period_from,
        period_to,
        filters,
        row_count: null,
        sha256: null,
        file_size_bytes: null,
        storage_bucket,
        storage_path,
        status: "FAILED",
        error_code: "UPLOAD_FAILED",
        error_message: upErr.message,
      });

      return json(origin, 500, { ok: false, error: "UPLOAD_FAILED" });
    }

    // 3) Insert READY export row
    // row_count: por ahora 1 (PDF “resumen”). Si luego exportas N filas, lo calculas real.
    const file_size_bytes = pdfU8.byteLength;

    const { error: insErr } = await sb.from("customer_audit_exports").insert({
      id: export_id,
      org_id,
      app_id: APP_ID,
      requested_by_user_id: user_id,
      requested_by_role: role,
      requested_by_email: user_email,
      export_type,
      export_scope,
      period_from,
      period_to,
      filters,
      row_count: 1,
      sha256: hash,
      file_size_bytes,
      storage_bucket,
      storage_path,
      status: "READY",
      error_code: null,
      error_message: null,
    });

    if (insErr) {
      // Si falla insertar export row, no podemos “des-subir” fácilmente.
      // Devuelve error para que lo veas y lo arregles.
      return json(origin, 500, { ok: false, error: `EXPORT_INSERT_FAILED: ${insErr.message}` });
    }

    // 4) Insert audit_log event apuntando al export_id
    // Tu audit_log customer_id es text: guardamos el customer_id_text (uuid string)
    await sb.from("debacu_eval_audit_log").insert({
      actor_user_id: user_id,
      action: "PDF_ISSUED",
      entity: "AUDIT_EXPORT",
      entity_id: export_id,
      meta: {
        export_type,
        export_scope,
        period_from,
        period_to,
        filters,
        sha256: hash,
        file_size_bytes,
        storage_bucket,
        storage_path,
      },
      customer_id: customer_id_text,
      app_id: APP_ID,
      event_type: "AUDIT_EXPORT",
      evaluation_id: null,
      search_kind: null,
      search_value_masked: null,
      search_value_hash: null,
      result_count: null,
    });

    // 5) Return (snake_case)
    return json(origin, 200, {
      export_id,
      status: "READY",
      org_id,
      app_id: APP_ID,
      export_type,
      export_scope,
      period_from,
      period_to,
      storage_bucket,
      storage_path,
      sha256: hash,
      file_size_bytes,
      row_count: 1,
      created_at: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "UNKNOWN";
    return json(origin, 500, { ok: false, error: msg });
  }
});
