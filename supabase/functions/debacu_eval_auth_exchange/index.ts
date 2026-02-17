// supabase/functions/debacu_eval_whoami/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

import { json, preflight } from "../_shared/cors.ts";
import { requireUser, requireAdmin, supabaseServiceClient } from "../_shared/auth.ts";

type Body = {
  org_id?: string | null;
};

function safeStr(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

async function readJsonSafe<T>(req: Request): Promise<T | null> {
  try {
    const text = await req.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return preflight(req);
  if (req.method !== "POST") {
    return json(req, 405, { ok: false, error: "request_failed", detail: "METHOD_NOT_ALLOWED" });
  }

  // ✅ JWT-only user
  let user: any;
  try {
    user = await requireUser(req); // debe validar Authorization: Bearer <jwt>
  } catch (e: any) {
    const msg = e?.message ?? "";
    const status = msg === "UNAUTHENTICATED" ? 401 : 401;
    return json(req, status, { ok: false, error: "request_failed", detail: "UNAUTHENTICATED" });
  }

  // ✅ is_admin por tabla (no por email)
  let is_admin = false;
  try {
    await requireAdmin(req);
    is_admin = true;
  } catch {
    is_admin = false;
  }

  const body = await readJsonSafe<Body>(req);
  const requestedOrgId = safeStr(body?.org_id ?? "");

  const sb = supabaseServiceClient();

  // 1) Resolver org_id: preferimos body.org_id
  let org_id: string | null = requestedOrgId || null;
  let role: string | null = null;

  if (org_id) {
    const { data: mem, error: memErr } = await sb
      .from("debacu_eval_org_members")
      .select("org_id, role, status")
      .eq("org_id", org_id)
      .eq("user_id", user.id)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (memErr) {
      return json(req, 500, { ok: false, error: "request_failed", detail: "DB_MEMBERSHIP_FAILED" });
    }
    if (!mem?.org_id) {
      return json(req, 403, { ok: false, error: "request_failed", detail: "FORBIDDEN" });
    }
    role = mem.role ?? null;
  } else {
    // Fallback determinista: primera membership ACTIVE por created_at asc
    const { data: mem, error: memErr } = await sb
      .from("debacu_eval_org_members")
      .select("org_id, role, created_at")
      .eq("user_id", user.id)
      .eq("status", "ACTIVE")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memErr) {
      return json(req, 500, { ok: false, error: "request_failed", detail: "DB_MEMBERSHIP_FAILED" });
    }
    if (!mem?.org_id) {
      return json(req, 403, { ok: false, error: "request_failed", detail: "FORBIDDEN" });
    }
    org_id = String(mem.org_id);
    role = mem.role ?? null;
  }

  // 2) Resolver customer_id (si tu org lo tiene)
  let customer_id: string | null = null;
  const { data: orgRow, error: orgErr } = await sb
    .from("debacu_eval_organizations")
    .select("customer_id")
    .eq("id", org_id)
    .maybeSingle();

  if (orgErr) {
    return json(req, 500, { ok: false, error: "request_failed", detail: "DB_ORG_FAILED" });
  }
  customer_id = orgRow?.customer_id ? String(orgRow.customer_id) : null;

  return json(req, 200, {
    ok: true,
    user: {
      id: user.id,
      email: (user.email ?? "").toLowerCase(),
      is_admin,
    },
    org: {
      org_id,
      role,
      customer_id,
    },
  });
});
