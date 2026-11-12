/**
 * Copy of the task tables' support column, "Ocultar completadas", bulk
 * actions and row delete (#1038–#1041). Spanish, sentence case. The generic
 * table copy (selection, row menu) is in `components/widgets/table-rows.ts`.
 */

// #1038 Apoyo
export const SUPPORT_COLUMN_LABEL = "Apoyo";
/** Toggle beside the Responsable filter: also match tasks where the person is support (on by default). */
export const INCLUDE_SUPPORT_LABEL = "Incluir apoyo";
/** Option of the people editor that is the task's Responsable (can't be picked). */
export const SUPPORT_IS_RESPONSIBLE = "Ya es responsable";

// #1039 Ocultar completadas
export const HIDE_COMPLETED_LABEL = "Ocultar completadas";
/** The line at the end of a group: "3 completadas ocultas · Mostrar". */
export const HIDDEN_COMPLETED_COUNT = (n: number): string => (n === 1 ? "1 completada oculta" : `${n} completadas ocultas`);
export const SHOW_HIDDEN_COMPLETED = "Mostrar";

// #1040 Bulk actions
export const BULK_STATUS_LABEL = "Estatus";
export const BULK_RESPONSIBLE_LABEL = "Responsable";
export const BULK_SUPPORT_LABEL = "Apoyo";
export const BULK_PHASE_LABEL = "Fase";
export const BULK_DUE_LABEL = "Vence";
export const BULK_UPDATED_TOAST = (n: number): string => (n === 1 ? "1 tarea actualizada." : `${n} tareas actualizadas.`);
/** Appended when some rows were skipped for permission. */
export const BULK_SKIPPED_TOAST = (n: number): string =>
  n === 1 ? "1 tarea no se cambió por permisos." : `${n} tareas no se cambiaron por permisos.`;
export const BULK_DELETE_CONFIRM = (n: number): string =>
  n === 1 ? "¿Eliminar 1 tarea? Se eliminan también sus subtareas." : `¿Eliminar ${n} tareas? Se eliminan también sus subtareas.`;
export const BULK_DELETED_TOAST = (n: number): string => (n === 1 ? "1 tarea eliminada." : `${n} tareas eliminadas.`);

// #1041 Delete
export const TASK_DELETE_CONFIRM = (title: string): string => `¿Eliminar «${title}»? Se eliminan también sus subtareas.`;
export const TASK_DELETED_TOAST = "Tarea eliminada";
export const TASK_RESTORED_TOAST = "Tarea restaurada.";
/** How long the delete toast offers Deshacer, in ms (same as a cell save). */
export const TASK_DELETE_UNDO_MS = 5000;

// #1084 Horas estimadas
export const HOURS_FIELD_LABEL = "Horas estimadas";
export const HOURS_COLUMN_LABEL = "Horas";
export const BULK_HOURS_LABEL = "Horas estimadas";
export const HOURS_RANGE_ERROR = "Escribe un valor entre 0.5 y 80 horas.";
/** Hint under the sheet field while the task has no hours and no template applies. */
export const HOURS_DEFAULT_HINT = "Sin estimar: el calendario cuenta 1 h.";
/** Label of the switch that shows the Horas column in Tareas · Analítico. */
export const SHOW_HOURS_COLUMN_LABEL = "Mostrar horas";
