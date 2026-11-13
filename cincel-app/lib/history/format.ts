import type { HistoryEvent } from "@/lib/types/core";
import { formatDateDMY } from "@/lib/utils/date";

/** Display name of each id the history may mention (staff, fases, espacios, tramos, estados, proyectos). */
export type HistoryNames = ReadonlyMap<string, string>;

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const UUID_ONLY = new RegExp(`^${UUID.source}$`, "i");
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY = "—";

/** Spanish label (lowercase, for "Cambió …") of each audited field. */
const FIELD_LABELS: Record<string, string> = {
  title: "título",
  name: "nombre",
  notes: "descripción",
  phaseId: "fase",
  spaceId: "espacio",
  workflowId: "tramo",
  managerId: "responsable",
  status: "estado",
  estado: "estado",
  customStatusId: "estado",
  priority: "prioridad",
  commitmentDate: "fecha de compromiso",
  reviewDate: "fecha de revisión",
  deliveryDate: "fecha de entrega",
  startDate: "fecha de inicio",
  endDate: "fecha de fin",
  dueDate: "fecha límite",
  estimatedHours: "horas estimadas",
  archived: "archivada",
  deleted: "eliminada",
  created: "creación",
  clientId: "cliente",
  projectId: "proyecto",
  currentWorkflowId: "etapa actual",
  email: "correo",
  phone: "teléfono",
  role: "rol",
  description: "descripción",
  autoStart: "inicio automático",
};

const STATUS_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  completado: "Completado",
  bloqueado: "Bloqueado",
};

const PRIORITY_LABELS: Record<string, string> = { alta: "Alta", media: "Media", baja: "Baja" };

/** "someColumnName" / "some_column" → "some column name": never the raw column name. */
function humanize(field: string): string {
  return field
    .replace(/Id$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
}

export function historyFieldLabel(field: string | null): string {
  if (!field) return "un campo";
  return FIELD_LABELS[field] ?? (humanize(field) || "un campo");
}

function resolveId(value: string, names: HistoryNames | undefined): string {
  return names?.get(value) ?? EMPTY;
}

/** Replaces every id inside free text by its name, or drops it. */
function scrubIds(value: string, names: HistoryNames | undefined): string {
  const parts = value
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (UUID_ONLY.test(p) ? names?.get(p) ?? "" : p.replace(new RegExp(UUID.source, "gi"), (id) => names?.get(id) ?? "")))
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : EMPTY;
}

/** One side (before or after) of a field change as readable text; empty → "—". */
export function historyValueText(field: string | null, value: string | null, names?: HistoryNames): string {
  if (value === null || value === undefined || value.trim() === "") return EMPTY;
  if (field === "status") return STATUS_LABELS[value] ?? scrubIds(value, names);
  if (field === "priority") return PRIORITY_LABELS[value] ?? scrubIds(value, names);
  if (field === "archived" || field === "deleted" || field === "autoStart") {
    if (value === "true") return "Sí";
    if (value === "false") return "No";
  }
  if (field !== null && field.endsWith("Id")) return resolveId(value, names);
  if (field === "estimatedHours") return `${value} h`;
  if (ISO_DATE.test(value)) return formatDateDMY(value);
  if (UUID_ONLY.test(value)) return resolveId(value, names);
  return scrubIds(value, names);
}

/** One-line text for a bitácora entry: the comment, or the field change. */
export function historyEventText(item: HistoryEvent, names?: HistoryNames): string {
  if (item.kind === "comentario") return item.comment ?? "";
  const before = historyValueText(item.field, item.beforeValue, names);
  const after = historyValueText(item.field, item.afterValue, names);
  // A task's tramo move stores the tramo names (`updateTask`, #1022).
  if (item.field === "tramo") return `Movió la tarea de ${before} a ${after}`;
  // The equipo de apoyo stores the names (`setTaskSupport`, #1038); "" is nobody.
  if (item.field === "support") return `Cambió el equipo de apoyo: ${before} → ${after}`;
  return `Cambió ${historyFieldLabel(item.field)}: ${before} → ${after}`;
}
