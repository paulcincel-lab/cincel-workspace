/**
 * Name comparison key: lower case, no accents, collapsed spaces (BE §3.3,
 * §9.9). "Ejecutivo" and "Ejécutivo" give the same key. Used by the fase,
 * puesto and espacio NAME_TAKEN pre-checks and by the monday importer.
 */
export function nameKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Leading monday numbering: 1-3 digits, optional spaces, a separator, optional spaces. */
const MONDAY_NUMBERING = /^\s*\d{1,3}\s*[.,:)\-–—]\s*/;

/**
 * Removes monday numbering from an item title (BE §10.3): "1. Planos" →
 * "Planos", "01 - Fachadas" → "Fachadas", "24, Renders" → "Renders",
 * "8.Producción" → "Producción"; "1.5 m de muro" and "3 recámaras" stay.
 * The prefix only goes when the rest is non-empty and doesn't start with a
 * digit.
 */
export function stripMondayNumbering(title: string): string {
  const match = MONDAY_NUMBERING.exec(title);
  if (!match) return title;
  const rest = title.slice(match[0].length);
  if (rest.trim() === "" || /^\d/.test(rest)) return title;
  return rest;
}
