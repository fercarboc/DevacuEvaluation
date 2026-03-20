// src/utils.ts

/** Combina clases CSS filtrando valores falsy */
export function cn(...classes: (string | undefined | null | false | 0)[]): string {
  return classes.filter(Boolean).join(" ");
}
