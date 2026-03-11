// supabase/functions/_shared/csv.ts

export type ParsedCsv = {
  delimiter: string;
  headerRowIndex: number;
  headers: string[];
  rows: Record<string, string>[];
  skippedTopLines: string[];
};

type ParseCsvOptions = {
  maxScanLines?: number;
};

function normalizeLineBreaks(input: string): string {
  return input.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function stripBom(input: string): string {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  result.push(current);
  return result.map((v) => v.trim());
}

function countColumns(line: string, delimiter: string): number {
  return splitCsvLine(line, delimiter).length;
}

function scoreHeaderCandidate(line: string, delimiter: string): number {
  const cells = splitCsvLine(line, delimiter)
    .map((v) => v.trim())
    .filter((v) => v !== "");

  if (cells.length < 3) return -100;

  let score = 0;

  const headerHints = [
    "id",
    "reserva",
    "reservation",
    "booking",
    "hotel",
    "alojamiento",
    "llegada",
    "salida",
    "entrada",
    "estado",
    "canal",
    "segmento",
    "nombre",
    "email",
    "telefono",
    "documento",
    "moneda",
    "tarifa",
    "total",
    "importe",
    "rooms",
    "habitaciones",
    "checkin",
    "checkout",
  ];

  for (const cell of cells) {
    const lower = cell
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

    if (lower.length > 0) score += 1;
    if (/[a-záéíóúñ]/i.test(lower)) score += 1;
    if (headerHints.some((hint) => lower.includes(hint))) score += 4;
    if (/^[^0-9]+$/.test(lower)) score += 1;
    if (lower.length <= 40) score += 1;
  }

  return score;
}

function detectDelimiter(lines: string[]): string {
  const candidates = [";", ",", "\t"];

  let bestDelimiter = ";";
  let bestScore = -Infinity;

  for (const delimiter of candidates) {
    let score = 0;
    const sample = lines.slice(0, Math.min(lines.length, 10));

    for (const line of sample) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const cols = countColumns(trimmed, delimiter);

      if (cols >= 3) score += cols * 2;
      else if (cols === 2) score += 1;
      else score -= 2;

      if (trimmed.includes(delimiter)) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestDelimiter = delimiter;
    }
  }

  return bestDelimiter;
}

function detectHeaderRow(lines: string[], delimiter: string, maxScanLines = 20): number {
  let bestIndex = -1;
  let bestScore = -Infinity;

  const limit = Math.min(lines.length, maxScanLines);

  for (let i = 0; i < limit; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    const score = scoreHeaderCandidate(line, delimiter);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  if (bestIndex === -1) {
    throw new Error("Could not detect CSV header row");
  }

  return bestIndex;
}

function sanitizeHeaders(rawHeaders: string[]): string[] {
  const seen = new Map<string, number>();

  return rawHeaders.map((h, idx) => {
    let header = String(h ?? "").trim();

    if (!header) {
      header = `column_${idx + 1}`;
    }

    const current = seen.get(header) ?? 0;
    seen.set(header, current + 1);

    if (current > 0) {
      return `${header}__${current + 1}`;
    }

    return header;
  });
}

function shouldSkipDataLine(cells: string[]): boolean {
  if (cells.length === 0) return true;

  const nonEmpty = cells.filter((c) => c.trim() !== "");
  if (nonEmpty.length === 0) return true;

  return false;
}

export async function parseCsv(
  rawText: string,
  options: ParseCsvOptions = {},
): Promise<ParsedCsv> {
  const text = stripBom(normalizeLineBreaks(rawText));
  const allLines = text.split("\n");

  const nonEmptyLines = allLines.filter((line) => line.trim() !== "");

  if (nonEmptyLines.length === 0) {
    throw new Error("CSV is empty");
  }

  const delimiter = detectDelimiter(nonEmptyLines);
  const headerRowIndex = detectHeaderRow(
    nonEmptyLines,
    delimiter,
    options.maxScanLines ?? 20,
  );

  const skippedTopLines = nonEmptyLines.slice(0, headerRowIndex);
  const headerLine = nonEmptyLines[headerRowIndex];

  const headers = sanitizeHeaders(splitCsvLine(headerLine, delimiter));

  const rows: Record<string, string>[] = [];

  for (let i = headerRowIndex + 1; i < nonEmptyLines.length; i++) {
    const line = nonEmptyLines[i];
    const cells = splitCsvLine(line, delimiter);

    if (shouldSkipDataLine(cells)) continue;

    const row: Record<string, string> = {};

    for (let c = 0; c < headers.length; c++) {
      row[headers[c]] = String(cells[c] ?? "").trim();
    }

    rows.push(row);
  }

  return {
    delimiter,
    headerRowIndex,
    headers,
    rows,
    skippedTopLines,
  };
}