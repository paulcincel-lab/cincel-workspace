import type { CalItem, CalTaskItem, DetailAction } from "@/lib/types/calendario";

/** Copy and derived text shared by the three event detail presentations (FE §5, §13). */
export const DETAIL_COPY = {
  close: "Cerrar detalle",
  unassigned: "Sin asignar",
  taskKind: "Tarea",
  meetingKind: "Reunión",
  noTramo: "Sin etapa",
  noProject: "Sin proyecto",
  history: "HISTORIAL",
  historyEmpty: "Todavía no hay movimientos.",
  noSubtasks: "Sin subtareas",
  changeDatePicker: "Nueva fecha compromiso",
  overdueNote: "Lleva días de retraso. Reprográmala o pide al asistente que proponga una fecha.",
  dueNote: "Fecha compromiso. Arrastra la tarea a otro día para cambiarla.",
} as const;

export const TASK_ACTION = {
  complete: "complete",
  reopen: "reopen",
  open: "open",
  changeDate: "change-date",
  propose: "propose",
} as const;

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "11 nov" for a YYYY-MM-DD day. */
export function shortDate(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  if (!m || !d) return date;
  return `${d} ${MONTHS[m - 1]}`;
}

/** "Vence el 11 nov" / "Vencía el 11 nov" (overdue). */
export function taskWhen(item: CalTaskItem): string {
  return `${item.overdue ? "Vencía el" : "Vence el"} ${shortDate(item.date)}`;
}

export function taskNote(item: CalTaskItem): string {
  return item.overdue ? DETAIL_COPY.overdueNote : DETAIL_COPY.dueNote;
}

export function tramoName(item: CalItem): string {
  return item.tramo?.name ?? DETAIL_COPY.noTramo;
}

/** "Tarea · Diseño" / "Reunión · Diseño". */
export function kindChip(item: CalItem): string {
  return `${item.kind === "task" ? DETAIL_COPY.taskKind : DETAIL_COPY.meetingKind} · ${tramoName(item)}`;
}

/** "Ana García · Pendiente". */
export function responsableLine(item: CalTaskItem): string {
  return `${item.manager?.name ?? DETAIL_COPY.unassigned} · ${item.statusLabel}`;
}

/** "Casa Madrid 22 · Diseño". */
export function projectTramoLine(item: CalItem): string {
  return `${item.project?.name ?? DETAIL_COPY.noProject} · ${tramoName(item)}`;
}

export function findAction(actions: readonly DetailAction[], ...keys: string[]): DetailAction | undefined {
  return actions.find((a) => keys.includes(a.key));
}

/** The task actions a presentation shows, in its order; a meeting shows every action it was given. */
export function actionsFor(item: CalItem, actions: readonly DetailAction[], order: readonly string[]): DetailAction[] {
  if (item.kind !== "task") return [...actions];
  return order.flatMap((key) => {
    const found = actions.find((a) => a.key === key);
    return found ? [found] : [];
  });
}
