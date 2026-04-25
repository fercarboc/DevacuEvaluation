// supabase/functions/admin_abuse_api/index.ts
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json, preflight } from "../_shared/cors.ts";

function requireEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

const SUPABASE_URL = requireEnv("SUPABASE_URL");
const ANON_KEY = requireEnv("SUPABASE_ANON_KEY");
const SRV_KEY = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

function getBearer(req: Request) {
  const h = req.headers.get("authorization") ?? req.headers.get("Authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] ?? null;
}

function parseAllowedEmails(csv: string | null) {
  const raw = (csv ?? "").trim();
  if (!raw) return ["admin@debacu.com"];
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

function getIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? null;
  return req.headers.get("x-real-ip") ?? null;
}

async function requireAdmin(req: Request) {
  const token = getBearer(req);
  if (!token) return { ok: false as const, status: 401, error: "missing_bearer" };

  const sbUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: u, error: uErr } = await sbUser.auth.getUser();
  if (uErr || !u?.user) return { ok: false as const, status: 401, error: "invalid_token" };

  const allowed = parseAllowedEmails(Deno.env.get("ADMIN_EMAILS"));
  const email = (u.user.email ?? "").toLowerCase().trim();
  if (!allowed.includes(email)) return { ok: false as const, status: 403, error: "forbidden" };

  return { ok: true as const, user: u.user, token };
}

type Body = {
  action: string;
  payload?: any;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") return json(req, 405, { ok: false, error: "method_not_allowed" });

  const admin = await requireAdmin(req);
  if (!admin.ok) return json(req, admin.status, { ok: false, error: admin.error });

  try {
    const body = (await req.json().catch(() => ({}))) as Body;
    const action = String(body.action ?? "").trim();
    const payload = body.payload ?? {};

    const sb = createClient(SUPABASE_URL, SRV_KEY, { auth: { persistSession: false } });

    const ip = getIp(req);
    const ua = req.headers.get("user-agent") ?? null;

    switch (action) {
      case "list_alerts": {
        const { data, error } = await (sb as any).rpc("admin_list_usage_alerts", {
          p_status: payload?.status ?? "OPEN",
          p_limit: payload?.limit ?? 200,
          p_offset: payload?.offset ?? 0,
        });
        if (error) return json(req, 400, { ok: false, error: "rpc_error", detail: error.message });
        return json(req, 200, { ok: true, data: data ?? [] });
      }

      case "get_alert": {
        const id = String(payload?.id ?? "");
        if (!id) return json(req, 400, { ok: false, error: "id_required" });

        const { data, error } = await (sb as any).rpc("admin_get_usage_alert", { p_id: id });
        if (error) return json(req, 400, { ok: false, error: "rpc_error", detail: error.message });

        const row = Array.isArray(data) ? data[0] : data;
        return json(req, 200, { ok: true, data: row ?? null });
      }

      case "list_actions": {
        const id = String(payload?.id ?? "");
        if (!id) return json(req, 400, { ok: false, error: "id_required" });

        const { data, error } = await (sb as any).rpc("admin_list_usage_alert_actions", {
          p_alert_id: id,
          p_limit: payload?.limit ?? 200,
          p_offset: payload?.offset ?? 0,
        });
        if (error) return json(req, 400, { ok: false, error: "rpc_error", detail: error.message });
        return json(req, 200, { ok: true, data: data ?? [] });
      }

      case "ack": {
        const id = String(payload?.id ?? "");
        if (!id) return json(req, 400, { ok: false, error: "id_required" });

        const { error } = await (sb as any).rpc("admin_ack_usage_alert", {
          p_id: id,
          p_note: payload?.note ?? null,
          p_ip: ip,
          p_user_agent: ua,
        });
        if (error) return json(req, 400, { ok: false, error: "rpc_error", detail: error.message });
        return json(req, 200, { ok: true, data: true });
      }

      case "resolve": {
        const id = String(payload?.id ?? "");
        if (!id) return json(req, 400, { ok: false, error: "id_required" });

        const { error } = await (sb as any).rpc("admin_resolve_usage_alert", {
          p_id: id,
          p_note: payload?.note ?? null,
          p_ip: ip,
          p_user_agent: ua,
        });
        if (error) return json(req, 400, { ok: false, error: "rpc_error", detail: error.message });
        return json(req, 200, { ok: true, data: true });
      }

      case "reopen": {
        const id = String(payload?.id ?? "");
        if (!id) return json(req, 400, { ok: false, error: "id_required" });

        const { error } = await (sb as any).rpc("admin_reopen_usage_alert", {
          p_id: id,
          p_note: payload?.note ?? null,
          p_ip: ip,
          p_user_agent: ua,
        });
        if (error) return json(req, 400, { ok: false, error: "rpc_error", detail: error.message });
        return json(req, 200, { ok: true, data: true });
      }

      case "add_note": {
        const id = String(payload?.id ?? "");
        const note = String(payload?.note ?? "").trim();
        if (!id) return json(req, 400, { ok: false, error: "id_required" });
        if (!note) return json(req, 400, { ok: false, error: "note_required" });

        const { error } = await (sb as any).rpc("admin_add_usage_alert_note", {
          p_id: id,
          p_note: note,
          p_ip: ip,
          p_user_agent: ua,
        });
        if (error) return json(req, 400, { ok: false, error: "rpc_error", detail: error.message });
        return json(req, 200, { ok: true, data: true });
      }

      case "metrics": {
        const from = String(payload?.from ?? "");
        const to = String(payload?.to ?? "");
        if (!from || !to) return json(req, 400, { ok: false, error: "from_to_required" });

        const { data, error } = await (sb as any).rpc("admin_usage_alert_metrics_sla", {
          p_from: from,
          p_to: to,
        });
        if (error) return json(req, 400, { ok: false, error: "rpc_error", detail: error.message });

        const row = Array.isArray(data) ? data[0] : data;
        return json(req, 200, { ok: true, data: row ?? null });
      }

      case "get_settings": {
        const { data, error } = await (sb as any).rpc("admin_get_abuse_settings");
        if (error) return json(req, 400, { ok: false, error: "rpc_error", detail: error.message });
        const row = Array.isArray(data) ? data[0] : data;
        return json(req, 200, { ok: true, data: row ?? null });
      }

      case "update_settings": {
        const aw = Number(payload?.ack_warning_minutes);
        const ac = Number(payload?.ack_critical_minutes);
        const rw = Number(payload?.resolve_warning_minutes);
        const rc = Number(payload?.resolve_critical_minutes);

        if ([aw, ac, rw, rc].some((n) => !Number.isFinite(n) || n <= 0)) {
          return json(req, 400, { ok: false, error: "invalid_numbers" });
        }
        if (!(aw < ac)) return json(req, 400, { ok: false, error: "ack_warning_must_be_lt_critical" });
        if (!(rw < rc)) return json(req, 400, { ok: false, error: "resolve_warning_must_be_lt_critical" });

        const { data, error } = await (sb as any).rpc("admin_update_abuse_settings", {
          p_ack_warning_minutes: aw,
          p_ack_critical_minutes: ac,
          p_resolve_warning_minutes: rw,
          p_resolve_critical_minutes: rc,
        });

        if (error) return json(req, 400, { ok: false, error: "rpc_error", detail: error.message });
        return json(req, 200, { ok: true, data: data ?? true });
      }

      default:
        return json(req, 400, { ok: false, error: "unknown_action", detail: action });
    }
  } catch (e: any) {
    return json(req, 500, { ok: false, error: "unexpected", detail: e?.message ?? String(e) });
  }
});
