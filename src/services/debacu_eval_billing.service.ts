// src/services/debacu_eval_billing.service.ts
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

function fnUrl(name: string) {
  return `${SUPABASE_URL}/functions/v1/${name}`;
}

export async function createCheckoutForPlan(input: {
  username: string;
  password: string;
  plan_code: "BASIC"|"MEDIUM"|"PREMIUM";
}) {
  const res = await fetch(fnUrl("debacu-eval-subscription-checkout-create"), {
    method: "POST",
    headers: {
      "Content-Type":"application/json",
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ ...input, app_code: "DEBACU_EVAL" }),
  });

  const text = await res.text();
  let json:any = null;
  try { json = JSON.parse(text); } catch {}

  if (!res.ok) throw new Error(json?.error || json?.detail || text || "Checkout error");
  return json as { url: string };
}
