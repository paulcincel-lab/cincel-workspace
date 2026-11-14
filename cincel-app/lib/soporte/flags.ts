/**
 * Soporte flags. Each phase flips its own; Phase 4 removes them. Plain
 * constants, client-safe. All off: nothing user-visible changes.
 */

/** Phase 1: Reportar o sugerir and Mis solicitudes. */
export const SOPORTE_ENABLED = false;

/** Phase 2: the Mejoras admin view. */
export const MEJORAS_ENABLED = false;

/** Phase 3: publishing to GitHub, the status sync and the asistente tools. */
export const SOPORTE_GITHUB_ENABLED = false;
