// src/services/edge.ts
import { supabase } from "@/services/supabaseClient";

async function getAccessToken(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data.session?.access_token;
  if (!token) throw new Error("No session token");
  return token;
}

export async function edgeCall<T = unknown>(
  fn: string,
  body?: unknown,
  method: "POST" | "GET" = "POST"
): Promise<T> {
  const token = await getAccessToken();

  const { data, error } = await supabase.functions.invoke(fn, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    // ✅ evita null: algunas functions hacen req.json() y si no hay body, petan
    body: body ?? {},
  });

  if (error) throw error;

  // Convención: { ok, data, error/detail }
  if (data && typeof data === "object" && "ok" in (data as any)) {
    const d = data as any;
    if (!d.ok) {
      const msg = d.detail ?? d.error ?? d.message ?? "Edge function failed";
      throw new Error(String(msg));
    }
    return d.data as T;
  }

  // fallback si alguna edge aún no devuelve {ok,data}
  return data as T;
}
