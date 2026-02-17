// supabase/functions/admin_list_config_changes/index.ts
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/auth.ts";

function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function isYmd(s: any) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function supabaseServiceClient() {
  const SUPABASE_URL = requireEnv("SUPABASE_URL");
  const SERVICE_ROLE_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

const IGNORE_KEYS = new Set(["updated_at", "created_at", "updated_by", "id"]);

function normalizeObj(v: any) {
  if (!v || typeof v !== "object") return {};
  return v;
}

function buildDiffSummary(oldValues: any, newValues: any) {
  const oldObj = normalizeObj(oldValues);
  const newObj = normalizeObj(newValues);

  const keys = new Set<string>([...Object.keys(oldObj), ...Object.keys(newObj)]);
  const changes: Array<{ key: string; from: any; to: any }> = [];

  for (const k of keys) {
    if (IGNORE_KEYS.has(k)) continue;

    const a = oldObj[k];
    const b = newObj[k];

    if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ key: k, from: a, to: b });
  }

  const parts = changes.slice(0, 6).map((c) => `${c.key}: ${c.from} -> ${c.to}`);
  const summary =
    parts.join(" · ") + (changes.length > 6 ? ` · +${changes.length - 6} más` : "");

  return { changes, summary, count: changes.length };
}

type RowOut = {
  audit_id: string;
  abuse_settings_id: string | null;
  created_at: string;
  actor_name: string | null;
  changes_count: number;
  changes_summary: string;
  changes?: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  try {
    await requireAdmin(req);

    const body = await req.json().catch(() => ({}));
    const from = isYmd(body?.from) ? String(body.from) : null;
    const to = isYmd(body?.to) ? String(body.to) : null;
    const limit = Math.min(Math.max(Number(body?.limit ?? 500), 1), 500);

    const sb = supabaseServiceClient();

    let q = sb
      .from("settings_audit_log")
      .select("id, table_name, record_id, action, old_values, new_values, changed_by, changed_at")
      .eq("table_name", "abuse_settings")
      .eq("action", "UPDATE")
      .order("changed_at", { ascending: false })
      .limit(limit);

    if (from) q = q.gte("changed_at", `${from}T00:00:00.000Z`);

    if (to) {
      // [to, to+1) para incluir todo el día
      const d = new Date(`${to}T00:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      q = q.lt("changed_at", d.toISOString());
    }

    const { data, error } = await q;
    if (error) return json(req, 500, { ok: false, error: "db_error", detail: error.message });

    const rows: RowOut[] = (data ?? []).map((r: any) => {
      const diff = buildDiffSummary(r.old_values ?? {}, r.new_values ?? {});
      const actorName = r.changed_by ? String(r.changed_by) : null;

      return {
        audit_id: String(r.id),
        abuse_settings_id: r.record_id ? String(r.record_id) : null,
        created_at: String(r.changed_at),
        actor_name: actorName,
        changes_count: diff.count,
        changes_summary: diff.summary || "Sin cambios relevantes",
        changes: diff.count ? JSON.stringify(diff.changes) : null,
      };
    });

    return json(req, 200, { ok: true, rows });
  } catch (e: any) {
    const msg = e?.message ?? String(e);

    if (msg === "UNAUTHORIZED" || msg === "missing_bearer" || msg === "invalid_token") {
      return json(req, 401, { ok: false, error: "unauthorized" });
    }
    if (msg === "FORBIDDEN" || msg === "forbidden_admin_only") {
      return json(req, 403, { ok: false, error: "forbidden" });
    }

    return json(req, 500, { ok: false, error: "unexpected", detail: msg });
  }
});
