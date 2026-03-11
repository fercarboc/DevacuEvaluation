// supabase/functions/debacu_eval_csv_unified_import/_shared/headers.ts

export function normalizeHeader(header: string): string {
  return String(header ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[()]/g, "")
    .replace(/[\.\-\/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeHeaders(headers: string[]): string[] {
  return headers.map(normalizeHeader);
}