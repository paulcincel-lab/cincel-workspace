import type { TaskStatus, TaskStatusOption } from "@/lib/types/core";

export const BASE_STATUS_LABEL: Record<TaskStatus, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  completado: "Completado",
  bloqueado: "Bloqueado",
};

export const BASE_STATUS_VARIANT: Record<TaskStatus, "outline" | "secondary" | "success" | "destructive"> = {
  pendiente: "outline",
  en_proceso: "secondary",
  completado: "success",
  bloqueado: "destructive",
};

export const BASE_STATUSES: TaskStatus[] = ["pendiente", "en_proceso", "completado", "bloqueado"];

const CUSTOM_PREFIX = "custom:";

/** Badge variant for a custom status: finished ones read as done, the rest as in progress. */
export function customStatusVariant(status: { closes: boolean }): "success" | "secondary" {
  return status.closes ? "success" : "secondary";
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

/** Select items (value -> label) for base + custom statuses. */
export function statusSelectItems(custom: TaskStatusOption[]): Array<{ value: string; label: string }> {
  return [
    ...BASE_STATUSES.map((s) => ({ value: s, label: BASE_STATUS_LABEL[s] })),
    ...custom.map((c) => ({ value: customStatusValue(c.id), label: c.name })),
  ];
}
