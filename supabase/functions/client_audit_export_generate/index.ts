// supabase/functions/client_audit_export_generate/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { PDFDocument, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    // ✅ JWT-only: fuera x-session-token
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(origin: string | null, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8" },
  });
}

/** ======================================================
 *  Clients
 * ====================================================== */
function userClient(req: Request) {
  const auth = req.headers.get("Authorization") ?? "";
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: auth } },
  });
}

function adminClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** ======================================================
 *  Auth helpers (JWT-only)
 * ====================================================== */
async function requireJwtUser(req: Request) {
  const sb = userClient(req);
  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) throw new Error("UNAUTHENTICATED");
  return data.user;
}

/** ======================================================
 *  ORG + ENTITLEMENTS (JWT-only)
 * ====================================================== */
async function resolveOrgIdForUserOrThrow(admin: ReturnType<typeof adminClient>, userId: string) {
  const { data, error } = await admin
    .from("debacu_eval_org_members")
    .select("org_id, role, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`MEMBERSHIP_LOOKUP_FAILED:${error.message}`);
  if (!data?.org_id) throw new Error("FORBIDDEN_NO_ORG");

  return { org_id: String(data.org_id), role: (data.role ?? null) as string | null };
}

type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  subscription_status: string | null; // en tu view hoy: ACTIVE o null
  plan_code: string | null;
  max_users: number | null;
  seats_used: number;
  org_name: string | null; // si tu view lo tiene; si no, se ignora
};

async function loadEntitlementsOrThrow(admin: ReturnType<typeof adminClient>, orgId: string) {
  // Nota: si tu view NO tiene org_name, quita del select.
  const { data, error } = await admin
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, subscription_status, plan_code, max_users, seats_used, org_name")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    // fallback si org_name no existe en la view
    const msg = String(error.message ?? "");
    if (msg.toLowerCase().includes("org_name")) {
      const { data: d2, error: e2 } = await admin
        .from("debacu_eval_org_entitlements_v")
        .select("org_id, customer_id, subscription_status, plan_code, max_users, seats_used")
        .eq("org_id", orgId)
        .maybeSingle();
      if (e2) throw new Error(`ENTITLEMENTS_FAILED:${e2.message}`);
      if (!d2) throw new Error("FORBIDDEN_NO_ENTITLEMENTS");
      return { ...(d2 as any), org_name: null } as EntitlementsRow;
    }
    throw new Error(`ENTITLEMENTS_FAILED:${error.message}`);
  }

  if (!data) throw new Error("FORBIDDEN_NO_ENTITLEMENTS");
  return data as EntitlementsRow;
}

function assertOrgActiveOrThrow(ent: EntitlementsRow) {
  if (ent.subscription_status !== "ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
  if (!ent.customer_id) throw new Error("NO_CUSTOMER_ON_ORG");
}

/** ======================================================
 *  Utils
 * ====================================================== */
function mustISODate(s: unknown): string {
  if (typeof s !== "string") throw new Error("INVALID_DATE");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("INVALID_DATE");
  return s;
}

function startOfDayISO(d: string) {
  return `${d}T00:00:00.000Z`;
}
function endOfDayISO(d: string) {
  return `${d}T23:59:59.999Z`;
}

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  return `"${s.replaceAll(`"`, `""`)}"`;
}

function safeString(v: unknown, max = 140) {
  const s = String(v ?? "");
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
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

function winAnsiSafe(s: string) {
  return (s ?? "")
    .replaceAll("→", "->")
    .replaceAll("—", "-")
    .replaceAll("–", "-")
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replaceAll("’", "'")
    .replaceAll("…", "...")
    .replaceAll("\u00A0", " "); // NBSP
}

/** ======================================================
 *  Types
 * ====================================================== */
type ReqBody = {
  export_type?: "PDF" | "CSV";
  export_scope?: string; // default AUDIT_LOG
  period_from?: string; // YYYY-MM-DD
  period_to?: string; // YYYY-MM-DD
  filters?: { q?: string; event_type?: string };
  source_audit_id?: string | null;
};

export default Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const admin = adminClient();

  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders(origin) });
  if (req.method !== "POST") return json(origin, 405, { ok: false, error: "method_not_allowed" });

  let export_id: string | null = null;

  try {
    // 1) JWT user
    const user = await requireJwtUser(req);

    // 2) org + entitlements (JWT-only)
    const { org_id, role } = await resolveOrgIdForUserOrThrow(admin, user.id);
    const ent = await loadEntitlementsOrThrow(admin, org_id);
    assertOrgActiveOrThrow(ent);

    const customer_id = String(ent.customer_id);
    const org_name = ent.org_name ?? null;

    // 3) body
    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const export_type = (body.export_type ?? "PDF") as "PDF" | "CSV";
    const export_scope = (body.export_scope ?? "AUDIT_LOG") as string;
    const period_from = mustISODate(body.period_from);
    const period_to = mustISODate(body.period_to);
    const filters = (body.filters ?? {}) as any;
    const source_audit_id = (body.source_audit_id ?? null) as string | null;

    if (export_type !== "PDF" && export_type !== "CSV") {
      return json(origin, 400, { ok: false, error: "invalid_export_type" });
    }

    const q = typeof filters?.q === "string" ? String(filters.q).trim() : "";
    const event_type_filter = typeof filters?.event_type === "string" ? String(filters.event_type).trim() : "";

    // 4) fetch rows (admin)
    let query = admin
      .from("debacu_eval_audit_log")
      .select("id, created_at, event_type, search_value_masked, result_count, meta, actor_user_id, action, entity")
      .eq("customer_id", customer_id)
      .eq("app_id", APP_ID)
      .gte("created_at", startOfDayISO(period_from))
      .lte("created_at", endOfDayISO(period_to))
      .order("created_at", { ascending: false })
      .limit(5000);

    if (event_type_filter) query = query.eq("event_type", event_type_filter);
    if (q) query = query.ilike("search_value_masked", `%${q}%`);

    const { data: rows, error: rowsErr } = await query;
    if (rowsErr) throw new Error(`AUDIT_ROWS_QUERY_FAILED:${rowsErr.message}`);

    const row_count = Array.isArray(rows) ? rows.length : 0;

    // 5) Build bytes
    export_id = crypto.randomUUID();
    const ext = export_type === "PDF" ? "pdf" : "csv";
    const storage_bucket = EXPORT_BUCKET_DEFAULT;
    const storage_path = `debacu_eval/org/${org_id}/exports/${export_id}.${ext}`;

    let fileU8: Uint8Array;
    let contentType: string;

    if (export_type === "CSV") {
      const header = [
        "created_at",
        "event_type",
        "action",
        "entity",
        "search_value_masked",
        "result_count",
        "risk_level",
        "match_strength",
        "actor_user_id",
      ];
      const csvLines: string[] = [];
      csvLines.push(header.map(csvEscape).join(","));

      for (const r of rows ?? []) {
        const meta = (r as any)?.meta ?? {};
        const risk_level = meta?.risk_level ?? meta?.risk ?? "";
        const match_strength = meta?.match_strength ?? meta?.matchStrength ?? "";

        csvLines.push(
          [
            (r as any).created_at ?? "",
            (r as any).event_type ?? "",
            (r as any).action ?? "",
            (r as any).entity ?? "",
            (r as any).search_value_masked ?? "",
            (r as any).result_count ?? "",
            risk_level ?? "",
            match_strength ?? "",
            (r as any).actor_user_id ?? "",
          ]
            .map(csvEscape)
            .join(","),
        );
      }

      fileU8 = new TextEncoder().encode(csvLines.join("\n"));
      contentType = "text/csv";
    } else {
      const pdf = await PDFDocument.create();
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

      const page = pdf.addPage([595.28, 841.89]); // A4
      let y = 805;

      const draw = (txt: string, opts?: { bold?: boolean; size?: number }) => {
        const size = opts?.size ?? 11;
        const f = opts?.bold ? fontBold : font;
        page.drawText(winAnsiSafe(txt), { x: 40, y, size, font: f });
        y -= size + 6;
      };

      draw("Debacu Evaluation360 - Exportación de Auditoría", { bold: true, size: 16 });

      draw(`Org: ${safeString(org_name ?? "", 60)} (${org_id})`, { size: 10 });
      draw(`Customer: ${customer_id}`, { size: 10 });
      draw(`Periodo: ${period_from} -> ${period_to}`, { size: 10 });
      draw(`Filtro: event_type=${event_type_filter || "-"} | q=${q || "-"}`, { size: 10 });

      draw(`Export ID: ${export_id}`, { size: 10 });
      draw("");

      draw("Resumen", { bold: true, size: 12 });
      draw(`Registros incluidos: ${row_count}`, { size: 10 });
      draw("");

      draw("Últimos registros (máx 40)", { bold: true, size: 12 });
      y -= 4;

      const slice = (rows ?? []).slice(0, 40);
      for (const r of slice) {
        const meta = (r as any)?.meta ?? {};
        const risk = meta?.risk_level ?? meta?.risk ?? "-";
        const ms = meta?.match_strength ?? meta?.matchStrength ?? "-";

        const line1 = `${safeString((r as any).created_at ?? "", 24)} | ${safeString(
          (r as any).event_type ?? "",
          18,
        )} | riesgo=${safeString(risk, 12)} | match=${safeString(ms, 12)}`;

        const line2 = `contacto=${safeString((r as any).search_value_masked ?? "-", 44)} | result_count=${safeString(
          (r as any).result_count ?? "-",
          8,
        )}`;

        if (y < 80) break;
        page.drawText(winAnsiSafe(line1), { x: 40, y, size: 9, font });
        y -= 12;
        page.drawText(winAnsiSafe(line2), { x: 40, y, size: 9, font });
        y -= 14;
      }

      if (source_audit_id) {
        y -= 6;
        draw(`Vinculado a audit_id: ${source_audit_id}`, { size: 9 });
      }

      fileU8 = new Uint8Array(await pdf.save());
      contentType = "application/pdf";
    }

    // 6) hash
    const hash = await sha256(fileU8);
    const file_size_bytes = fileU8.byteLength;

    // 7) upload (admin)
    const { error: upErr } = await admin.storage
      .from(storage_bucket)
      .upload(storage_path, fileU8, { contentType, upsert: true });

    if (upErr) throw new Error(`UPLOAD_FAILED:${upErr.message}`);

    // 8) insert export row
    const { error: insErr } = await admin.from("customer_audit_exports").insert({
      id: export_id,
      org_id,
      app_id: APP_ID,
      requested_by_user_id: user.id,
      requested_by_role: role,
      requested_by_email: user.email ?? null,
      export_type,
      export_scope,
      period_from,
      period_to,
      filters,
      row_count,
      sha256: hash,
      file_size_bytes,
      storage_bucket,
      storage_path,
      status: "READY",
      error_code: null,
      error_message: null,
    });

    if (insErr) throw new Error(`EXPORT_INSERT_FAILED:${insErr.message}`);

    // 9) signed url (para descargar YA)
    const { data: signed, error: sErr } = await admin.storage
      .from(storage_bucket)
      .createSignedUrl(storage_path, 60 * 30);

    if (sErr) throw new Error(`SIGNED_URL_FAILED:${sErr.message}`);

    // 10) audit log (no tumbes todo si falla)
    await admin.from("debacu_eval_audit_log").insert({
      actor_user_id: user.id,
      action: export_type === "PDF" ? "PDF_ISSUED" : "CSV_ISSUED",
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
        row_count,
        source_audit_id,
      },
      customer_id: String(customer_id),
      app_id: APP_ID,
      event_type: "AUDIT_EXPORT",
      evaluation_id: null,
      search_kind: null,
      search_value_masked: null,
      search_value_hash: null,
      result_count: null,
    });

    return json(origin, 200, {
      ok: true,
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
      row_count,
      signed_url: signed?.signedUrl ?? null,
      created_at: new Date().toISOString(),
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    const code =
      msg === "UNAUTHENTICATED"
        ? 401
        : msg.startsWith("FORBIDDEN")
        ? 403
        : msg.startsWith("PLAN_NOT_ACTIVE")
        ? 402
        : msg.startsWith("INVALID_") || msg === "INVALID_DATE"
        ? 400
        : 500;

    console.error("client_audit_export_generate error:", e);
    return json(origin, code, {
      ok: false,
      error: "request_failed",
      detail: msg,
      export_id,
    });
  }
});
