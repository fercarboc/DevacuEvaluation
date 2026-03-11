// supabase/functions/_shared/identity.ts
// deno-lint-ignore-file no-explicit-any

function mustEnv(name: string) {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}

const PEPPER = mustEnv("DEBACU_GLOBAL_PEPPER");

const te = new TextEncoder();

function bytesToHex(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < u8.length; i++) out += u8[i].toString(16).padStart(2, "0");
  return out;
}

async function hmacSha256Hex(keyText: string, msgText: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    te.encode(keyText),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, te.encode(msgText));
  return bytesToHex(sig);
}

/** ========== Normalizaciones (misma idea que tu clientService) ========== */

export function looksLikeEmail(q: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.trim());
}

export function looksLikePhone(q: string) {
  const p = q.replace(/\D/g, "");
  return p.length >= 7 && p.length <= 15;
}

export function looksLikeDoc(q: string) {
  const t = q.trim().toUpperCase().replace(/\s+/g, "");
  return /^[XYZ]?\d{5,10}[A-Z]?$/.test(t);
}

export function normalizeEmail(q: string) {
  return q.trim().toLowerCase();
}

export function normalizeDoc(q: string) {
  return q.trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizePhoneDigits(q: string) {
  return q.replace(/\D/g, "");
}

/**
 * Regla FINAL:
 * 1) document_norm
 * 2) email_norm
 * 3) phone_digits
 * Nunca combinar.
 */
export function pickNormalizedIdentifier(input: {
  document?: string | null;
  email?: string | null;
  phone?: string | null;
}): { kind: "DOC" | "EMAIL" | "PHONE"; normalized: string } | null {
  const docRaw = String(input.document ?? "").trim();
if (docRaw) {
  const d = normalizeDoc(docRaw);
  if (looksLikeDoc(d)) {
    return { kind: "DOC", normalized: `DOC:${d}` };
  }
}

  const emailRaw = String(input.email ?? "").trim();
  if (emailRaw && looksLikeEmail(emailRaw)) {
    const e = normalizeEmail(emailRaw);
    return { kind: "EMAIL", normalized: `EMAIL:${e}` };
  }

  const phoneRaw = String(input.phone ?? "").trim();
  if (phoneRaw) {
    const p = normalizePhoneDigits(phoneRaw);
    if (p.length >= 7) return { kind: "PHONE", normalized: `PHONE:${p}` };
  }

  return null;
}

export async function buildIdentityKey(input: {
  document?: string | null;
  email?: string | null;
  phone?: string | null;
}): Promise<{ identity_key: string; input_kind: "DOC" | "EMAIL" | "PHONE"; normalized_identifier: string }> {
  const picked = pickNormalizedIdentifier(input);
  if (!picked) throw new Error("NO_IDENTIFIER");

  // OJO: el doc dice HMAC(pepper, normalized_identifier). :contentReference[oaicite:1]{index=1}
  const identity_key = await hmacSha256Hex(PEPPER, picked.normalized);

  return {
    identity_key,
    input_kind: picked.kind,
    normalized_identifier: picked.normalized,
  };
}