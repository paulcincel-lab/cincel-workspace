import { notImplemented } from "./not-implemented";

/**
 * Name comparison key: lower case, no accents, collapsed spaces (BE §3.3,
 * §9.9). "Ejecutivo" and "Ejécutivo" give the same key. Used by the fase,
 * puesto and espacio NAME_TAKEN pre-checks and by the monday importer.
 */
export function nameKey(value: string): string {
  return notImplemented("nameKey", value);
}

/**
 * Removes monday numbering from an item title (BE §10.3): "1. Planos" →
 * "Planos", "01 - Fachadas" → "Fachadas", "24, Renders" → "Renders",
 * "8.Producción" → "Producción"; "1.5 m de muro" and "3 recámaras" stay.
 */
export function stripMondayNumbering(title: string): string {
  return notImplemented("stripMondayNumbering", title);
}
