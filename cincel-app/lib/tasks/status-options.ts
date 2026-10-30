import type { TaskStatus, TaskStatusOption } from "@/lib/types/core";

export const BASE_STATUS_LABEL: Record<TaskStatus, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  completado: "Completado",
  bloqueado: "Bloqueado",
};

/** Theme token that colors each base status (dots, badges, chart slices). */
export type StatusColorToken = "chart-1" | "chart-2" | "chart-3" | "destructive";

/**
 * The one status → color mapping for the app. Red (destructive) only for
 * Bloqueado; the rest use the categorical chart tokens.
 */
export const BASE_STATUS_COLOR: Record<TaskStatus, StatusColorToken> = {
  completado: "chart-1",
  en_proceso: "chart-2",
  pendiente: "chart-3",
  bloqueado: "destructive",
};

// Full class names (never built from strings) so Tailwind picks them up.
const STATUS_DOT_CLASS: Record<StatusColorToken, string> = {
  "chart-1": "bg-chart-1",
  "chart-2": "bg-chart-2",
  "chart-3": "bg-chart-3",
  destructive: "bg-destructive",
};

const STATUS_TINT_CLASS: Record<StatusColorToken, string> = {
  "chart-1": "bg-chart-1/10",
  "chart-2": "bg-chart-2/10",
  "chart-3": "bg-chart-3/10",
  destructive: "bg-destructive/10",
};

const STATUS_BORDER_CLASS: Record<StatusColorToken, string> = {
  "chart-1": "border-chart-1",
  "chart-2": "border-chart-2",
  "chart-3": "border-chart-3",
  destructive: "border-destructive",
};

export const BASE_STATUSES: TaskStatus[] = ["pendiente", "en_proceso", "completado", "bloqueado"];

const CUSTOM_PREFIX = "custom:";

/**
 * Base status a custom status reads as when no task is attached (e.g. the
 * Configuración list): finished ones read as Completado, the rest as En proceso.
 */
export function customStatusBase(status: { closes: boolean }): TaskStatus {
  return status.closes ? "completado" : "en_proceso";
}

/**
 * Color token for a task's status. A custom status takes the color of the base
 * status stored underneath it; a closing custom status always reads as Completado.
 */
export function statusColorToken(task: {
  status: TaskStatus;
  customStatus?: { closes: boolean } | null;
}): StatusColorToken {
  if (task.customStatus?.closes) return BASE_STATUS_COLOR.completado;
  return BASE_STATUS_COLOR[task.status];
}

/** Background class for a status dot or legend swatch. */
export function statusDotClass(token: StatusColorToken): string {
  return STATUS_DOT_CLASS[token];
}

/** Light tint background for a status badge. */
export function statusTintClass(token: StatusColorToken): string {
  return STATUS_TINT_CLASS[token];
}

/** Border class for a status ring (e.g. the cronograma status toggle). */
export function statusBorderClass(token: StatusColorToken): string {
  return STATUS_BORDER_CLASS[token];
}

/** CSS color for chart fills (SVG / recharts), e.g. a status donut slice. */
export function statusColorVar(token: StatusColorToken): string {
  return `var(--${token})`;
}

/** Classes for a change badge ("+12", "−4"): success when positive, destructive when negative. */
export function changeToneClass(delta: number): string {
  if (delta > 0) return "bg-success text-success-foreground";
  if (delta < 0) return "bg-destructive/10 text-destructive";
  return "bg-muted text-muted-foreground";
}

/** Select value (and Tablero column key) for a custom status. */
export function customStatusValue(id: string): string {
  return CUSTOM_PREFIX + id;
}

/** Select value for a task: its custom status when set, else its base status. */
export function statusSelectValue(task: {
  status: TaskStatus;
  customStatus?: { id: string } | null;
}): string {
  return task.customStatus ? customStatusValue(task.customStatus.id) : task.status;
}

export type ParsedStatusValue =
  | { kind: "base"; status: TaskStatus }
  | { kind: "custom"; id: string };

export function parseStatusValue(value: string): ParsedStatusValue {
  return value.startsWith(CUSTOM_PREFIX)
    ? { kind: "custom", id: value.slice(CUSTOM_PREFIX.length) }
    : { kind: "base", status: value as TaskStatus };
}

/** Label shown for a task's status: custom name wins over the base label. */
export function taskStatusLabel(task: { status: TaskStatus; customStatus?: { name: string } | null }): string {
  return task.customStatus?.name ?? BASE_STATUS_LABEL[task.status];
}

/**
 * Whether a task counts as finished: base Completado or a custom status that
 * closes. (A closing custom status already stores `completado` underneath;
 * checking both keeps this true for rows built without that mapping.)
 */
export function isTaskClosed(task: { status: TaskStatus; customStatus?: { closes: boolean } | null }): boolean {
  return task.status === "completado" || Boolean(task.customStatus?.closes);
}

/**
 * Whether a due date (YYYY-MM-DD) is late: before today while the task is
 * still open. Late dates render with `text-destructive`.
 */
export function isDueDateLate(
  date: string | null | undefined,
  today: string,
  task: { status: TaskStatus; customStatus?: { closes: boolean } | null }
): boolean {
  return !!date && date < today && !isTaskClosed(task);
}

/** Select items (value -> label) for base + custom statuses. */
export function statusSelectItems(custom: TaskStatusOption[]): Array<{ value: string; label: string }> {
  return [
    ...BASE_STATUSES.map((s) => ({ value: s, label: BASE_STATUS_LABEL[s] })),
    ...custom.map((c) => ({ value: customStatusValue(c.id), label: c.name })),
  ];
}
