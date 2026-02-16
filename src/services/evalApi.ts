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

export class EvalApiError extends Error {
  error_obj?: any;
  status?: number;
  constructor(message: string, opts?: { error_obj?: any; status?: number }) {
    super(message);
    this.name = "EvalApiError";
    this.error_obj = opts?.error_obj;
    this.status = opts?.status;
  }
}

export function normalizeEmailOrThrow(v: string) {
  const email = String(v ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new EvalApiError("Introduce un email válido.", {
      status: 400,
      error_obj: { code: "INVALID_EMAIL" },
    });
  }
  return email;
}

export async function evalPostLogin(accessToken: string) {
  const res = await fetch(fnUrl("debacu_eval_auth_postlogin"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ appCode: APP_CODE }),
  });

  const { json, text } = await readJsonSafe(res);

  if (!res.ok || !json?.ok) {
    console.error("POSTLOGIN ERROR BODY:", text);
    throw new EvalApiError(
      json?.error_obj?.message || json?.error || json?.detail || text || "PostLogin error",
      { error_obj: json?.error_obj, status: res.status },
    );
  }

  return json.data as {
    user: { id: string; email: string | null };
    customer?: { id: string; email?: string | null };
    membership: { org_id: string; role: string; status: string };
    entitlement: {
      customer_id: string;
      plan_code: string;
      subscription_status: string;
      seats_used: number;
      max_users: number;
    };
  };
}
