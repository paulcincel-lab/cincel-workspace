/**
 * "borrador guardado {hace}" of the Importar de monday header: the time since
 * the run's draft was last saved (`MondayImportRunState.updatedAt`), in
 * Spanish. Pure: `now` is passed in.
 */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "hace un momento", "hace 1 min", "hace 2 h", "ayer", "hace 3 días"; "" for an unreadable date. */
export function draftSavedAgo(updatedAt: string | null | undefined, now: number = Date.now()): string {
  if (!updatedAt) return "";
  const at = Date.parse(updatedAt);
  if (!Number.isFinite(at)) return "";
  const elapsed = Math.max(0, now - at);
  if (elapsed < MINUTE) return "hace un momento";
  if (elapsed < HOUR) return `hace ${Math.floor(elapsed / MINUTE)} min`;
  if (elapsed < DAY) return `hace ${Math.floor(elapsed / HOUR)} h`;
  const days = Math.floor(elapsed / DAY);
  return days === 1 ? "ayer" : `hace ${days} días`;
}

/** "Paso 3 de 7 · borrador guardado hace 1 min" (without the draft part when the time is unknown). */
export function draftHeaderLine(stepNumber: number, totalSteps: number, updatedAt: string | null | undefined, now?: number): string {
  const ago = draftSavedAgo(updatedAt, now);
  const step = `Paso ${stepNumber} de ${totalSteps}`;
  return ago ? `${step} · borrador guardado ${ago}` : step;
}
