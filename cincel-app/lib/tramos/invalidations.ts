import { qk } from "@/lib/query/keys";

/**
 * What each Tramos y fases write makes stale (plan §3, Workflows / tramos).
 * The sidebar tramo list never changes here: no UI creates, renames or
 * deletes a tramo.
 */

/** Templates (create, update, deactivate, reorder): this page and the tramo catalog. */
export const TEMPLATE_INVALIDATIONS = [qk.ajustes.page("tramos"), qk.catalog.workflows()] as const;

/**
 * Fases (create, update, reorder): also Ajustes › Puestos (the candidate
 * fases), the Tareas views and every Proyectos key (fase names and order).
 */
export const PHASE_INVALIDATIONS = [
  qk.ajustes.page("tramos"),
  qk.catalog.workflows(),
  qk.ajustes.page("puestos"),
  qk.tareas.all,
  qk.proyectos.all,
] as const;

/** "Iniciar automáticamente": this page, the catalog and the Proyectos list ("Listos para iniciar"). */
export const AUTO_START_INVALIDATIONS = [
  qk.ajustes.page("tramos"),
  qk.catalog.workflows(),
  qk.proyectos.list(),
] as const;
