/**
 * Widget builders (redesign BE §8.0.2): pure, isomorphic functions mapping
 * existing DTOs to the shared shapes of `lib/types/widgets.ts`. Extends
 * `lib/dashboard/donut-groups.ts`. Every aggregate action, page and assistant
 * widget uses these; none builds shapes by hand. Nothing here may import
 * `server-only` code.
 */
import { buildCalendarEvents } from "@/lib/calendar/calendar-service";
import { NO_TRAMO_LABEL } from "@/lib/dashboard/donut-groups";
import { localIsoDate, TASK_TREND_TIME_ZONE } from "@/lib/dashboard/task-trend";
import { isTaskClosed } from "@/lib/tasks/status-options";
import { tramoColorVar } from "@/lib/tramos/tramo-color";
import type { CalendarEvent } from "@/lib/types/calendar";
import type { ProjectListItem, Staff, TaskListItem } from "@/lib/types/core";
import type { PeopleOverviewRow, PortfolioRow, Reminder, TeamAbsence } from "@/lib/types/redesign";
import type {
  AgendaItem,
  AttentionItem,
  DistributionSegment,
  EntityCard,
  PersonDatum,
  ProgressItem,
  RecordColumn,
  RecordTableData,
  Tone,
} from "@/lib/types/widgets";

const DAY_MS = 86_400_000;

/** Attention reasons (FE §9 copy). */
export const ATTENTION_REASON = {
  vencida: "Vencida",
  bloqueada: "Bloqueada",
  sinResponsable: "Sin responsable",
  porVencer: "Por vencer",
} as const;

/** Days ahead (inclusive) a commitment counts as "Por vencer". */
export const DUE_SOON_DAYS = 2;

/** Absence titles per kind. */
export const ABSENCE_LABEL: Record<TeamAbsence["kind"], string> = {
  vacaciones: "Vacaciones",
  personal: "Día personal",
  enfermedad: "Incapacidad",
  ausencia: "Ausencia",
};

export const TOTAL_LABEL = "Total";

/** Canonical links (BE §7.3, FE §2). */
export const taskHref = (taskId: string) => `/tareas?tarea=${encodeURIComponent(taskId)}`;
export const projectHref = (projectId: string) => `/proyectos/${encodeURIComponent(projectId)}`;
export const personHref = (staffId: string) => `/personas/equipo/${encodeURIComponent(staffId)}`;
const MY_SPACE_HREF = "/mi-espacio";

/** Up to two initials of a name ("?" when empty). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length > 1 ? [words[0][0], words[words.length - 1][0]] : [...words[0].slice(0, 2)];
  return letters.join("").toUpperCase();
}

/** Whole days from ISO date `a` to ISO date `b` (b − a). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

function clampPct(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/**
 * Generalizes `tasksByBaseStatus` / `projectsByTramo`: one segment per key in
 * first-seen order, `value` = item count, `secondary` = sum of `secondaryOf`,
 * `extra` = numeric fields summed, text fields from the first item. Label and
 * color come from the first item of each key.
 */
export function toDistribution<T>(
  items: T[],
  opts: {
    keyOf: (item: T) => string;
    labelOf: (item: T) => string;
    colorVarOf: (item: T) => string;
    secondaryOf?: (item: T) => number;
    extraOf?: (item: T) => Record<string, number | string>;
  },
): DistributionSegment[] {
  const segments = new Map<string, DistributionSegment>();
  for (const item of items) {
    const key = opts.keyOf(item);
    let segment = segments.get(key);
    if (!segment) {
      segment = { key, label: opts.labelOf(item), value: 0, colorVar: opts.colorVarOf(item) };
      if (opts.secondaryOf) segment.secondary = 0;
      if (opts.extraOf) segment.extra = {};
      segments.set(key, segment);
    }
    segment.value += 1;
    if (opts.secondaryOf) segment.secondary = (segment.secondary ?? 0) + opts.secondaryOf(item);
    if (opts.extraOf) {
      const extra = (segment.extra ??= {});
      for (const [field, v] of Object.entries(opts.extraOf(item))) {
        const current = extra[field];
        if (typeof v === "number") extra[field] = (typeof current === "number" ? current : 0) + v;
        else if (current === undefined) extra[field] = v;
      }
    }
  }
  return [...segments.values()];
}

/**
 * Projects → progress rows, in input order. With a portfolio row: `real`,
 * `plan`, `budgetPct` (admins only, else null) and the next delivery from it;
 * without one: `projects.progress` and nulls.
 */
export function toProgressItems(projects: ProjectListItem[], portfolio?: PortfolioRow[]): ProgressItem[] {
  const rows = new Map((portfolio ?? []).map((row) => [row.projectId, row]));
  return projects.map((project) => {
    const row = rows.get(project.id);
    return {
      id: project.id,
      label: project.name,
      sublabel: project.currentWorkflow?.name ?? NO_TRAMO_LABEL,
      real: clampPct(row ? row.real : project.progress),
      plan: row?.plan ?? null,
      budgetPct: row?.budgetSpentPct ?? null,
      colorVar: tramoColorVar(project.currentWorkflow),
      href: projectHref(project.id),
      next: row?.nextDelivery ?? null,
    };
  });
}

const TONE_RANK: Record<Tone, number> = { critical: 0, warn: 1, default: 2, ok: 3 };

/**
 * Open, unarchived tasks that need attention, by the first rule that applies
 * (due = commitment date, compared in the app's time zone):
 * vencida → critical (with `daysLate`), bloqueada / sin responsable → warn,
 * por vencer (today … +2 días) → default. Others are left out. Ordered by
 * tone, then most days late, then soonest due.
 */
export function toAttentionItems(tasks: Omit<TaskListItem, "notes">[], now: Date): AttentionItem[] {
  const today = localIsoDate(now, TASK_TREND_TIME_ZONE);
  const items: AttentionItem[] = [];

  for (const task of tasks) {
    if (task.archived || isTaskClosed(task)) continue;
    const due = task.commitmentDate;
    const untilDue = due ? daysBetween(today, due) : null;

    let reason: string;
    let tone: Tone;
    let daysLate: number | null = null;
    if (untilDue !== null && untilDue < 0) {
      reason = ATTENTION_REASON.vencida;
      tone = "critical";
      daysLate = -untilDue;
    } else if (task.status === "bloqueado") {
      reason = ATTENTION_REASON.bloqueada;
      tone = "warn";
    } else if (!task.managerId) {
      reason = ATTENTION_REASON.sinResponsable;
      tone = "warn";
    } else if (untilDue !== null && untilDue <= DUE_SOON_DAYS) {
      reason = ATTENTION_REASON.porVencer;
      tone = "default";
    } else {
      continue;
    }

    items.push({
      id: task.id,
      title: task.title,
      href: taskHref(task.id),
      project: task.project.name,
      tramo: task.workflow?.key ?? null,
      reason,
      tone,
      assignee: task.manager
        ? { id: task.manager.id, name: task.manager.name, initials: initialsOf(task.manager.name) }
        : null,
      due,
      daysLate,
    });
  }

  return items.sort(
    (a, b) =>
      TONE_RANK[a.tone] - TONE_RANK[b.tone] ||
      (b.daysLate ?? 0) - (a.daysLate ?? 0) ||
      (a.due ?? "9999-12-31").localeCompare(b.due ?? "9999-12-31") ||
      a.title.localeCompare(b.title),
  );
}

/** Calendar tramo keys that aren't `workflows.key`. */
const NON_TRAMO_KEYS = new Set(["sin-tramo", "admin"]);

/** Task events only store a date; their time is synthesized, so it is estimated. */
function eventToAgendaItem(event: CalendarEvent): AgendaItem {
  const item: AgendaItem = {
    id: event.id,
    title: event.title,
    start: `${event.date}T${event.time}`,
    estimated: true,
    project: event.project,
    tramo: NON_TRAMO_KEYS.has(event.tramo) ? null : event.tramo,
    href: taskHref(event.taskId),
  };
  if (event.responsible && event.responsible !== "Sin responsable") item.attendees = [event.responsible];
  return item;
}

function reminderToAgendaItem(reminder: Reminder): AgendaItem {
  return {
    id: reminder.id,
    title: reminder.text,
    start: reminder.dueAt,
    href: reminder.taskId
      ? taskHref(reminder.taskId)
      : reminder.projectId
        ? projectHref(reminder.projectId)
        : MY_SPACE_HREF,
  };
}

function absenceToAgendaItem(absence: TeamAbsence): AgendaItem {
  return {
    id: `ausencia-${absence.staffId}-${absence.from}`,
    title: `${absence.name} · ${ABSENCE_LABEL[absence.kind]}`,
    start: absence.from,
    end: absence.to,
    allDay: true,
    attendees: [absence.name],
    href: personHref(absence.staffId),
  };
}

/**
 * Calendar events, reminders, tasks or absences → agenda items, by start.
 * Tasks go through `buildCalendarEvents` (one item per dated event);
 * cancelled reminders are left out. `meetingUrl` is never set: no event
 * stores a Cutto URL yet (BE §11.2).
 */
export function toAgendaItems(
  source:
    | { kind: "events"; items: CalendarEvent[] }
    | { kind: "reminders"; items: Reminder[] }
    | { kind: "tasks"; items: Omit<TaskListItem, "notes">[] }
    | { kind: "absences"; items: TeamAbsence[] },
): AgendaItem[] {
  let items: AgendaItem[];
  switch (source.kind) {
    case "events":
      items = source.items.map(eventToAgendaItem);
      break;
    case "tasks":
      items = buildCalendarEvents(source.items).map(eventToAgendaItem);
      break;
    case "reminders":
      items = source.items.filter((r) => r.cancelledAt === null).map(reminderToAgendaItem);
      break;
    case "absences":
      items = source.items.map(absenceToAgendaItem);
      break;
  }
  return items.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

/**
 * Staff + overview row → person. Puesto is the first Project Flow position
 * (never the access role); counts are zero without an overview row.
 */
export function toPersonDatum(staff: Staff, overviewRow: PeopleOverviewRow | null): PersonDatum {
  const name = [staff.name, staff.lastName].filter((part) => part && part.trim()).join(" ").trim() || staff.name;
  return {
    id: staff.id,
    name,
    initials: initialsOf(name),
    puesto: staff.positions[0]?.name ?? null,
    tramo: null,
    open: overviewRow?.open ?? 0,
    overdue: overviewRow?.overdue ?? 0,
    activeProjects: overviewRow?.activeProjects ?? 0,
    occupancyPct: overviewRow?.occupancyPct ?? 0,
    weekHours: overviewRow?.weekHours ?? null,
    availability: overviewRow?.availability ?? [],
    href: personHref(staff.id),
  };
}

export function toEntityCards<T>(items: T[], map: (item: T) => EntityCard): EntityCard[] {
  return items.map((item) => map(item));
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Table data. `"auto"` totals sum the numeric columns (every non-empty cell a
 * number, at least one), labelled "Total" in the first non-numeric column;
 * no rows → no totals row.
 */
export function toRecordTable(
  columns: RecordColumn[],
  rows: Record<string, unknown>[],
  totals?: RecordTableData["totals"],
): RecordTableData {
  const data: RecordTableData = { columns, rows };
  if (totals === undefined) return data;
  if (totals !== "auto") {
    data.totals = totals;
    return data;
  }
  if (rows.length === 0) return data;

  const sums: Record<string, string | number> = {};
  let labelColumn: string | null = null;
  for (const column of columns) {
    const cells = rows.map((row) => row[column.key]).filter((v) => v !== null && v !== undefined && v !== "");
    if (cells.length > 0 && cells.every(isNumber)) {
      sums[column.key] = cells.reduce((sum: number, v) => sum + (v as number), 0);
    } else if (labelColumn === null) {
      labelColumn = column.key;
    }
  }
  if (labelColumn !== null) sums[labelColumn] = TOTAL_LABEL;
  data.totals = sums;
  return data;
}
