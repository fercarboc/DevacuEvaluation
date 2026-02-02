// supabase/functions/debacu-eval-my-ratings-search/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// (mismo corsHeaders / json que arriba)
const ALLOWED_ORIGINS = new Set([
  "http://localhost:3000",
  "http://localhost:5173",
  "https://debacu.com",
  "https://www.debacu.com",
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : "*";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
    "Access-Control-Max-Age": "86400",
  };
}

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json" },
  });
}

export default Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders(req) });

  try {
    const sessionToken = req.headers.get("x-session-token") ?? "";
    if (!sessionToken) return json(req, 401, { ok: false, error: "missing_session_token" });

    const { q, authorId, limit } = await req.json();
    const query = String(q ?? "").trim();
    const creatorId = String(authorId ?? "").trim();
    const lim = Math.min(100, Math.max(1, Number(limit ?? 50)));

    if (!query || !creatorId) return json(req, 200, { ok: true, data: [] });

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // ilike con OR (igual que hacías en frontend)
    const { data, error } = await sb
      .from("debacu_evaluations")
      .select(
        [
          "id",
          "document",
          "full_name",
          "nationality",
          "phone",
          "email",
          "rating",
          "comment",
          "creator_customer_id",
          "creator_customer_name",
          "platform",
          "evaluation_date",
          "created_at",
          "updated_at",
        ].join(",")
      )
      .eq("creator_customer_id", creatorId)
      .or(
        [
          `document.ilike.%${query}%`,
          `phone.ilike.%${query}%`,
          `email.ilike.%${query}%`,
          `full_name.ilike.%${query}%`,
        ].join(",")
      )
      .order("evaluation_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(lim);

    if (error) return json(req, 500, { ok: false, error: error.message });

    return json(req, 200, { ok: true, data: data ?? [] });
  } catch (e) {
    return json(req, 500, { ok: false, error: String(e?.message ?? e) });
  }
});
