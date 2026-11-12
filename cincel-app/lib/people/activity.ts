/**
 * "Actividad reciente" of Persona detalle (redesign BE §7.11): turns a
 * person's history events on tasks and projects into short Spanish rows.
 * No I/O; `fetchPersonaDetailAction` feeds it the rows of
 * `peopleRepository.listRecentActivity`.
 */
import { zonedHourMinute } from "@/lib/dates/zoned-formatters";
import { addIsoDays, localIsoDate } from "@/lib/people/aggregates";
import { BASE_STATUS_LABEL } from "@/lib/tasks/status-options";
import type { TaskStatus } from "@/lib/types/core";
import type { PersonaActivityItem } from "@/lib/types/redesign";

/** How many rows Persona detalle shows. */
export const RECENT_ACTIVITY_LIMIT = 10;

/** One history event by the person, with the title of what it is on. */
export type ActivityEventRow = {
  id: string;
  entity: "task" | "project";
  entityId: string;
  kind: "comentario" | "cambio";
  field: string | null;
  afterValue: string | null;
  comment: string | null;
  eventAt: Date;
  /** Task title or project name. */
  title: string;
  /** The task is an admin task (`kind = 'admin'`); always false for projects. */
  adminTask: boolean;
};

/** Project fields only `canSeeAdminData` viewers see (client, origin, contract amount). */
export const ADMIN_PROJECT_ACTIVITY_FIELDS: ReadonlySet<string> = new Set([
  "clientId",
  "origin",
  "originStaffId",
  "contractAmountMxn",
]);

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** Whether a viewer with (or without) `canSeeAdminData` may see the event. */
export function isActivityVisible(row: ActivityEventRow, includeAdmin: boolean): boolean {
  if (includeAdmin) return true;
  if (row.adminTask) return false;
  return !(row.entity === "project" && row.field !== null && ADMIN_PROJECT_ACTIVITY_FIELDS.has(row.field));
}

const quote = (title: string) => `“${title}”`;

/** System notes written as comments ("Adjuntó un archivo: x.pdf") keep their verb. */
const SYSTEM_COMMENT = /^(Adjuntó [^:]+|Agregó un enlace [^:]+|Quitó un enlace [^:]+):/;

function commentText(row: ActivityEventRow): string {
  const system = row.comment ? SYSTEM_COMMENT.exec(row.comment) : null;
  if (system) return `${system[1]} en ${quote(row.title)}`;
  return `Comentó en ${quote(row.title)}`;
}

function taskChangeText(row: ActivityEventRow, customStatusNames: ReadonlyMap<string, string>): string {
  const t = quote(row.title);
  switch (row.field) {
    case "created":
      return `Creó la tarea ${t}`;
    case "status": {
      const label = BASE_STATUS_LABEL[row.afterValue as TaskStatus];
      return label ? `Movió ${t} a ${label}` : `Cambió el estatus de ${t}`;
    }
    case "customStatusId": {
      const name = row.afterValue ? customStatusNames.get(row.afterValue) : undefined;
      return name ? `Movió ${t} a ${name}` : `Cambió el estatus de ${t}`;
    }
    case "title":
      return `Renombró la tarea ${t}`;
    case "managerId":
      return `Reasignó ${t}`;
    case "support":
      return `Cambió el apoyo de ${t}`;
    case "priority":
      return `Cambió la prioridad de ${t}`;
    case "commitmentDate":
    case "reviewDate":
    case "deliveryDate":
      return `Cambió las fechas de ${t}`;
    case "estimatedHours":
      return `Cambió las horas estimadas de ${t}`;
    case "archived":
      return row.afterValue === "true" ? `Archivó ${t}` : `Desarchivó ${t}`;
    default:
      return `Editó ${t}`;
  }
}

function projectChangeText(row: ActivityEventRow): string {
  const t = quote(row.title);
  switch (row.field) {
    case "created":
      return `Creó el proyecto ${t}`;
    case "progress":
      return row.afterValue !== null ? `Movió ${t} a ${row.afterValue}%` : `Editó ${t}`;
    case "status":
      return `Cambió el estado de ${t}`;
    case "startDate":
    case "endDate":
      return `Cambió las fechas de ${t}`;
    default:
      return `Editó ${t}`;
  }
}

/** The row's sentence, e.g. "Movió “Casa Lomas” a 90%". */
export function activityText(row: ActivityEventRow, customStatusNames: ReadonlyMap<string, string> = new Map()): string {
  if (row.kind === "comentario") return commentText(row);
  return row.entity === "task" ? taskChangeText(row, customStatusNames) : projectChangeText(row);
}

/** "hoy 10:12", "ayer 17:40" or "4 nov 9:30", in `timeZone`. */
export function activityWhen(at: Date, now: Date, timeZone: string): string {
  const day = localIsoDate(at, timeZone);
  const today = localIsoDate(now, timeZone);
  const time = zonedHourMinute(at, timeZone);
  if (day === today) return `hoy ${time}`;
  if (day === addIsoDays(today, -1)) return `ayer ${time}`;
  const [, month, date] = day.split("-").map(Number);
  return `${date} ${MONTHS[month! - 1]} ${time}`;
}

function activityHref(row: ActivityEventRow): string {
  return row.entity === "task" ? `/tareas?tarea=${row.entityId}` : `/proyectos/${row.entityId}`;
}

/**
 * The visible rows, newest first, at most `limit`. One edit writes one event
 * per changed field: events on the same entity at the same instant that read
 * the same collapse into one row.
 */
export function toRecentActivity(
  rows: readonly ActivityEventRow[],
  options: {
    includeAdmin: boolean;
    now: Date;
    timeZone: string;
    customStatusNames?: ReadonlyMap<string, string>;
    limit?: number;
  },
): PersonaActivityItem[] {
  const limit = options.limit ?? RECENT_ACTIVITY_LIMIT;
  const sorted = [...rows].sort((a, b) => b.eventAt.getTime() - a.eventAt.getTime());
  const out: PersonaActivityItem[] = [];
  const seen = new Set<string>();
  for (const row of sorted) {
    if (out.length >= limit) break;
    if (!isActivityVisible(row, options.includeAdmin)) continue;
    const text = activityText(row, options.customStatusNames);
    const key = `${row.entity}:${row.entityId}:${row.eventAt.getTime()}:${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: row.id,
      text,
      at: row.eventAt.toISOString(),
      when: activityWhen(row.eventAt, options.now, options.timeZone),
      href: activityHref(row),
    });
  }
  return out;
}
