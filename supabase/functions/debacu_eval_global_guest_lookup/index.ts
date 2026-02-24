// supabase/functions/debacu_eval_global_guest_lookup/index.ts

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/http.ts";
import {
  supabaseAdmin,
  supabaseUser,
  getAuthUserOrThrow,
  getCustomerIdForUserOrThrow,
  getCurrentSubscriptionOrThrow,
  assertAppEnabledOrThrow,
} from "../_shared/plan.ts";

const GLOBAL_PEPPER = Deno.env.get("DEBACU_GLOBAL_PEPPER")!;

function normalize(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");
}

async function generateIdentityKey(
  document: string,
  email: string,
  phone: string
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${document}|${email}|${phone}`);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(GLOBAL_PEPPER),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", key, data);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const sbUser = supabaseUser(req);
    const sbAdmin = supabaseAdmin(req);

    // 1️⃣ Auth
    const user = await getAuthUserOrThrow(sbUser);
    const customerId = await getCustomerIdForUserOrThrow(sbAdmin, user.id);

    const sub = await getCurrentSubscriptionOrThrow(sbAdmin, customerId);
    await assertAppEnabledOrThrow(sub);

    const body = await req.json();

    const document = normalize(body.document);
    const email = normalize(body.email);
    const phone = normalize(body.phone);

    if (!document && !email && !phone) {
      return json(req, 400, {
        ok: false,
        error: "AT_LEAST_ONE_IDENTIFIER_REQUIRED",
      });
    }

    const identityKey = await generateIdentityKey(
      document,
      email,
      phone
    );

    const { data, error } = await sbAdmin
      .from("debacu_eval_import_guest_index")
      .select(
        `
        risk_band,
        stays_count,
        incidents_count,
        total_net_loss,
        last_seen_date,
        last_incident_date
      `
      )
      .eq("identity_key", identityKey)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return json(req, 200, {
        exists: false,
      });
    }

    return json(req, 200, {
      exists: true,
      risk_band: data.risk_band,
      stays_count: data.stays_count,
      incidents_count: data.incidents_count,
      total_net_loss: data.total_net_loss,
      last_seen_date: data.last_seen_date,
      last_incident_date: data.last_incident_date,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "UNKNOWN_ERROR";
    return json(req, 400, {
      ok: false,
      error: msg,
    });
  }
});