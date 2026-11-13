import { qk } from "@/lib/query/keys";

/**
 * What each Etapas y fases write makes stale (plan §3, Workflows / etapas).
 * Ajustes › Etapas y fases creates, renames, recolors, reorders and deletes
 * etapas (`ETAPA_INVALIDATIONS`); the sidebar list is read per request on the
 * server, so the page refresh after those writes picks it up.
 */

/** Templates (create, update, deactivate, reorder): this page and the etapa catalog. */
export const TEMPLATE_INVALIDATIONS = [qk.ajustes.page("etapas"), qk.catalog.workflows()] as const;

/**
 * Fases (create, update, reorder): also Ajustes › Puestos (the candidate
 * fases), the Tareas views and every Proyectos key (fase names and order).
 */
export const PHASE_INVALIDATIONS = [
  qk.ajustes.page("etapas"),
  qk.catalog.workflows(),
  qk.ajustes.page("puestos"),
  qk.tareas.all,
  qk.proyectos.all,
] as const;

/** "Iniciar automáticamente": this page, the catalog and the Proyectos list ("Listos para iniciar"). */
export const AUTO_START_INVALIDATIONS = [
  qk.ajustes.page("etapas"),
  qk.catalog.workflows(),
  qk.proyectos.list(),
] as const;

/**
 * An etapa itself (create, rename, color, reorder, delete): this page, both
 * etapa catalogs, Ajustes › Puestos (fases grouped by etapa), the Tareas
 * views and every Proyectos key (etapa names, order and colors).
 */
export const ETAPA_INVALIDATIONS = [
  qk.ajustes.page("etapas"),
  qk.catalog.workflows(),
  qk.catalog.etapas(),
  qk.ajustes.page("puestos"),
  qk.tareas.all,
  qk.proyectos.all,
] as const;
