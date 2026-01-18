// src/services/evalApi.ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
    // ⬇️ esto es lo que NECESITAS ver
    console.error("LOGIN 500 BODY:", text);
    throw new Error(json?.error || text || "Login error");
  }

  return json as { token: string; user: any };
}
