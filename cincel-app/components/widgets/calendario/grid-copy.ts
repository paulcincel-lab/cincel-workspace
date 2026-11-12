/** Spanish copy of the Mes and Semana grids (FE §4.1, §11, §13). Sentence case. */
import { dayAndNumber, longDayLabel } from "@/lib/calendario/move";

export const MONTH_HINT = "Clic en un número de día para abrir ese día";
export const OPEN_DAY_LABEL = (date: string): string => `Abrir el ${dayAndNumber(date)}`;
export const MORE_LABEL = (n: number): string => `+${n} más`;
export const ASSISTANT_LABEL = "Asistente";
export const ASK_ASSISTANT_LABEL = (date: string): string => `Pedir al asistente para el ${dayAndNumber(date)}`;
export const WEEK_SCROLL_HINT = "Desliza para ver más días";
export const EMPTY_RANGE = "No hay nada en este rango.";
export const EMPTY_DAY_NEW_TASK = "Nueva tarea";
export const MOVE_TO_OTHER_DAY = "Mover a otro día…";
export const MOVE_DIALOG_TITLE = (title: string): string => `Mover «${title}»`;
export const MOVE_DIALOG_FIELD = "Nueva fecha";
export const MOVE_DIALOG_CONFIRM = "Mover";
export const MOVE_DIALOG_CANCEL = "Cancelar";
export const OVERDUE_TAG = "vencida";
export const COMPLETED_TAG = "completada";
export const ITEM_ACTIONS_LABEL = (title: string): string => `Acciones de «${title}»`;

export const MOVED_TOAST = (title: string, date: string): string => `Moví «${title}» al ${longDayLabel(date)}.`;
export const MOVED_ANNOUNCEMENT = (title: string, date: string): string =>
  `Moviste ${title} al ${dayAndNumber(date)}. Deshacer disponible.`;
export const UNDONE_ANNOUNCEMENT = (title: string, date: string): string => `${title} volvió al ${dayAndNumber(date)}.`;
