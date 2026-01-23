// src/services/evalApi.ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const APP_CODE = "DEBACU_EVAL";

function fnUrl(name: string) {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}

async function readJsonSafe(res: Response) {
  const text = await res.text();
  try {
    return { json: JSON.parse(text), text };
  } catch {
    return { json: null as any, text };
  }
}

export async function evalLogin(username: string, password: string) {
  const res = await fetch(fnUrl("debacu-eval-login"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ username, password, appCode: APP_CODE }),
  });

  const { json, text } = await readJsonSafe(res);

  if (!res.ok) {
    console.error("LOGIN ERROR BODY:", text);
    throw new Error(json?.error || json?.detail || text || "Login error");
  }

  // Debe devolver: { authEmail, session_token, user }
  return json as { authEmail: string; session_token: string; user: any };
}
