/**
 * Copy of the project delete flow (#1050): the confirmation, the toasts and
 * the "Proyectos eliminados" list. Spanish, sentence case. Pure.
 */

export const PROJECT_DELETE_LABEL = "Eliminar proyecto";
export const PROJECT_DELETE_CONFIRM = (name: string): string =>
  `¿Eliminar «${name}»?`;

/** "Se eliminan también sus {n} tareas y se quita el acceso al portal de sus clientes." */
export function projectDeleteDescription(taskCount: number | null): string {
  const portal = "se quita el acceso al portal de sus clientes.";
  if (taskCount === null) return `Se eliminan también sus tareas y ${portal}`;
  if (taskCount === 0) return "Se quita el acceso al portal de sus clientes.";
  if (taskCount === 1) return `Se elimina también su tarea y ${portal}`;
  return `Se eliminan también sus ${taskCount} tareas y ${portal}`;
}

export const PROJECT_DELETE_DRIVE_NOTE = "La carpeta de Drive no se borra.";
/** The typed-name prompt; `open` null when the counts didn't load. */
export function PROJECT_DELETE_TYPE_NAME(
  name: string,
  open: number | null,
): string {
  const confirm = `Escribe «${name}» para confirmar.`;
  if (open === null || open <= 0) return confirm;
  return `Tiene ${open === 1 ? "1 tarea abierta" : `${open} tareas abiertas`}. ${confirm}`;
}
export const PROJECT_DELETE_NAME_INPUT_LABEL = "Nombre del proyecto";

export const PROJECT_DELETED_TOAST = "Proyecto eliminado";
export const PROJECT_RESTORED_TOAST =
  "Proyecto restaurado. Vuelve a invitar a sus clientes al portal.";
export const PROJECT_RESTORE_EXPIRED =
  "Ya pasaron 30 días; este proyecto ya no se puede restaurar.";
/** Undo window of the "Deshacer" toast, ms. */
export const PROJECT_DELETE_UNDO_MS = 5_000;

export const DELETED_PROJECTS_TITLE = "Proyectos eliminados";
export const DELETED_PROJECTS_DESCRIPTION =
  "Los proyectos eliminados en los últimos 30 días, con sus tareas. El acceso al portal no se restaura.";
export const DELETED_PROJECTS_EMPTY =
  "No hay proyectos eliminados en los últimos 30 días.";
export const DELETED_PROJECTS_ERROR =
  "No se pudieron cargar los proyectos eliminados";
export const RESTORE_LABEL = "Restaurar";
export const RESTORE_PROJECT_LABEL = (name: string): string =>
  `Restaurar «${name}»`;

/** Whether the typed text names the project (trimmed, case and accents ignored). */
export function typedNameMatches(typed: string, name: string): boolean {
  const fold = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLocaleLowerCase("es");
  return fold(typed) !== "" && fold(typed) === fold(name);
}
