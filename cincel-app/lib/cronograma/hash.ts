/**
 * Stable task identity: djb2 hash of the task text, base36-encoded, matching
 * the reference Madrid 22 dashboard bit-for-bit (`h = ((h*33) ^ code) >>> 0`,
 * seed 5381). A task keeps its status across Excel re-imports because its id
 * is derived from its text, not its row position.
 */
export function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(h, 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h.toString(36);
}

export function stableKey(planta: string, tarea: string): string {
  return `${planta}-${djb2(tarea)}`;
}
