// supabase/functions/client_audit_export_generate/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { PDFDocument, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

const APP_ID = "DEBACU_EVAL";
const EXPORT_BUCKET_DEFAULT = "customer-exports";

/** ======================================================
 *  Service client
 * ====================================================== */
function supabaseServiceClient() {
  const SUPABASE_URL = requireEnv("SUPABASE_URL");
  const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

/** ======================================================
 *  ORG + ENTITLEMENTS
 * ====================================================== */
async function resolveOrgIdForUserOrThrow(sb: ReturnType<typeof supabaseServiceClient>, user_id: string, org_id?: string | null) {
  // Si viene org_id, validar membership
  if (org_id) {
    const { data: mem, error: memErr } = await sb
      .from("debacu_eval_org_members")
      .select("org_id, status")
      .eq("org_id", org_id)
      .eq("user_id", user_id)
      .maybeSingle();

    if (memErr) throw new Error(`MEMBERSHIP_FAILED:${memErr.message}`);
    if (!mem?.org_id) throw new Error("FORBIDDEN");
    if ((mem as any).status && String((mem as any).status) !== "ACTIVE") throw new Error("FORBIDDEN");
    return { org_id: String(mem.org_id), role: null as string | null };
  }

  // Si NO viene org_id: primera membresía ACTIVE (determinista, pero si estás en varios hoteles mejor pasar org_id desde UI)
  const { data, error } = await sb
    .from("debacu_eval_org_members")
    .select("org_id, role, status, created_at")
    .eq("user_id", user_id)
    .order("created_at", { ascending: true })
    .limit(50);

  if (error) throw new Error(`MEMBERSHIP_LOOKUP_FAILED:${error.message}`);

  const active = (data ?? []).find((m: any) => !m?.status || String(m.status) === "ACTIVE");
  if (!active?.org_id) throw new Error("FORBIDDEN_NO_ORG");

  return { org_id: String((active as any).org_id), role: ((active as any).role ?? null) as string | null };
}

type EntitlementsRow = {
  org_id: string;
  customer_id: string | null;
  subscription_status: string | null;
  plan_code: string | null;
  max_users: number | null;
  seats_used: number;
  org_name?: string | null;
};

async function loadEntitlementsOrThrow(sb: ReturnType<typeof supabaseServiceClient>, org_id: string) {
  // Intento con org_name; si no existe, reintento sin él.
  const first = await sb
    .from("debacu_eval_org_entitlements_v")
    .select("org_id, customer_id, subscription_status, plan_code, max_users, seats_used, org_name")
    .eq("org_id", org_id)
    .maybeSingle();

  if (first.error) {
    const msg = String(first.error.message ?? "");
    if (msg.toLowerCase().includes("org_name")) {
      const second = await sb
        .from("debacu_eval_org_entitlements_v")
        .select("org_id, customer_id, subscription_status, plan_code, max_users, seats_used")
        .eq("org_id", org_id)
        .maybeSingle();

      if (second.error) throw new Error(`ENTITLEMENTS_FAILED:${second.error.message}`);
      if (!second.data) throw new Error("FORBIDDEN_NO_ENTITLEMENTS");
      return { ...(second.data as any), org_name: null } as EntitlementsRow;
    }
    throw new Error(`ENTITLEMENTS_FAILED:${first.error.message}`);
  }

  if (!first.data) throw new Error("FORBIDDEN_NO_ENTITLEMENTS");
  return first.data as EntitlementsRow;
}

function assertOrgActiveOrThrow(ent: EntitlementsRow) {
  if (ent.subscription_status !== "ACTIVE") throw new Error("PLAN_NOT_ACTIVE");
  if (!ent.customer_id) throw new Error("NO_CUSTOMER_ON_ORG");
}

/** ======================================================
 *  Utils
 * ====================================================== */
function mustYmd(s: unknown): string {
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
    .replaceAll("\u00A0", " ");
}

function clampInt(v: any, def: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  const i = Math.trunc(n);
  return Math.max(min, Math.min(max, i));
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
  org_id?: string | null; // ✅ muy recomendable si el user está en varios hoteles
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  const sb = supabaseServiceClient();
  let export_id: string | null = null;
  let storage_bucket: string | null = null;
  let storage_path: string | null = null;

  try {
    // 1) JWT user (shared)
    const user = await requireUser(req); // { id, email }
    const user_id = user.id;
    const user_email = user.email ?? null;

    // 2) org + entitlements
    const body = (await req.json().catch(() => ({}))) as ReqBody;

    const { org_id, role } = await resolveOrgIdForUserOrThrow(sb, user_id, body?.org_id ?? null);
    const ent = await loadEntitlementsOrThrow(sb, org_id);
    assertOrgActiveOrThrow(ent);

    const customer_id = String(ent.customer_id);
    const org_name = (ent as any).org_name ?? null;

    // 3) body fields
    const export_type = (body.export_type ?? "PDF") as "PDF" | "CSV";
    const export_scope = (body.export_scope ?? "AUDIT_LOG") as string;
    const period_from = mustYmd(body.period_from);
    const period_to = mustYmd(body.period_to);
    const filters = (body.filters ?? {}) as any;
    const source_audit_id = (body.source_audit_id ?? null) as string | null;

    if (export_type !== "PDF" && export_type !== "CSV") {
      return json(req, 400, { ok: false, error: "invalid_export_type" });
    }

    const q = typeof filters?.q === "string" ? String(filters.q).trim() : "";
    const event_type_filter = typeof filters?.event_type === "string" ? String(filters.event_type).trim() : "";

    // 4) fetch rows (service role) — LIMIT duro para no morir con 25 hoteles / 250 sesiones/día
    let query = sb
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

    // 5) build bytes
    export_id = crypto.randomUUID();
    const ext = export_type === "PDF" ? "pdf" : "csv";
    storage_bucket = EXPORT_BUCKET_DEFAULT;
    storage_path = `debacu_eval/org/${org_id}/exports/${export_id}.${ext}`;

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

    // 7) upload (NO upsert: el path es único)
    const { error: upErr } = await sb.storage
      .from(storage_bucket)
      .upload(storage_path, fileU8, { contentType, upsert: false });

    if (upErr) throw new Error(`UPLOAD_FAILED:${upErr.message}`);

    // 8) insert export row (si falla, limpiamos storage)
    const { data: inserted, error: insErr } = await sb
      .from("customer_audit_exports")
      .insert({
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

        row_count,
        sha256: hash,
        file_size_bytes,
        storage_bucket,
        storage_path,
        status: "READY",
        error_code: null,
        error_message: null,
      })
      .select("id, created_at")
      .maybeSingle();

    if (insErr) {
      // cleanup best-effort
      try {
        await sb.storage.from(storage_bucket).remove([storage_path]);
      } catch {
        // ignore
      }
      throw new Error(`EXPORT_INSERT_FAILED:${insErr.message}`);
    }

    // 9) signed url (para descargar YA)
    const { data: signed, error: sErr } = await sb.storage
      .from(storage_bucket)
      .createSignedUrl(storage_path, 60 * 30);

    if (sErr) throw new Error(`SIGNED_URL_FAILED:${sErr.message}`);

    // 10) audit log (best effort)
    try {
      await sb.from("debacu_eval_audit_log").insert({
        actor_user_id: user_id,
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
          org_id,
        },
        customer_id,
        app_id: APP_ID,
        event_type: "AUDIT_EXPORT",
        evaluation_id: null,
        search_kind: null,
        search_value_masked: null,
        search_value_hash: null,
        result_count: null,
      } as any);
    } catch {
      // ignore
    }

    return json(req, 200, {
      ok: true,
      data: {
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
        created_at: inserted?.created_at ?? new Date().toISOString(),
      },
    });
  } catch (e: any) {
    const msg = String(e?.message ?? e);

    const code =
      msg === "UNAUTHORIZED" || msg === "UNAUTHENTICATED" ? 401
      : msg.startsWith("FORBIDDEN") ? 403
      : msg === "PLAN_NOT_ACTIVE" ? 402
      : msg === "INVALID_DATE" || msg.startsWith("INVALID_") ? 400
      : 500;

    console.error("client_audit_export_generate error:", e);

    return json(req, code, {
      ok: false,
      error: "request_failed",
      detail: msg,
      export_id,
      storage_bucket,
      storage_path,
    });
  }
});
