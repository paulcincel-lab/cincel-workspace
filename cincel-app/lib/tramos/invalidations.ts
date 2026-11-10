import { qk } from "@/lib/query/keys";

/**
 * What each Tramos y fases write makes stale (plan §3, Workflows / tramos).
 * Ajustes › Tramos y fases creates, renames, recolors, reorders and deletes
 * tramos (`TRAMO_INVALIDATIONS`); the sidebar list is read per request on the
 * server, so the page refresh after those writes picks it up.
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

/**
 * A tramo itself (create, rename, color, reorder, delete): this page, both
 * tramo catalogs, Ajustes › Puestos (fases grouped by tramo), the Tareas
 * views and every Proyectos key (tramo names, order and colors).
 */
export const TRAMO_INVALIDATIONS = [
  qk.ajustes.page("tramos"),
  qk.catalog.workflows(),
  qk.catalog.tramos(),
  qk.ajustes.page("puestos"),
  qk.tareas.all,
  qk.proyectos.all,
] as const;
