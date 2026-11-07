import type { CalendarEvent, CalendarEventType, CalendarFilterOptions, CalendarFilters, CalendarTypeSummaryRow } from "@/lib/types/calendar";
import type { TaskListItem } from "@/lib/types/core";

const DEFAULT_FILTERS: CalendarFilters = {
  project: "Todos",
  responsible: "Todos",
  type: "Todos",
  tramo: "Todos",
  phase: "Todas",
};

export const NO_TRAMO_LABEL = "Sin tramo";
export const ADMIN_TRAMO_LABEL = "Administración";

export function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function toDate(value: string): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function workflowHref(workflowKey: string | null): string {
  if (!workflowKey) {
    return "/actividades";
  }

  return `/actividades/${workflowKey}`;
}

/** Tramo key and label of a task's calendar events. */
export function calendarTramo(task: Pick<TaskListItem, "kind" | "workflow">): { tramo: string; tramoLabel: string } {
  if (task.workflow) return { tramo: task.workflow.key, tramoLabel: task.workflow.name };
  if (task.kind === "admin") return { tramo: "admin", tramoLabel: ADMIN_TRAMO_LABEL };
  return { tramo: "sin-tramo", tramoLabel: NO_TRAMO_LABEL };
}

function defaultTimeByType(type: CalendarEventType): string {
  if (type === "Compromiso") return "09:00";
  if (type === "Proxima revision") return "11:00";
  if (type === "Fecha de entrega") return "17:00";
  if (type === "Reunion") return "10:00";
  return "08:00";
}

/**
 * Tasks only store dates, not times, so the calendar has always had to
 * synthesize one for display/sorting. A fixed hour per event type (e.g.
 * every Compromiso always at 09:00) doesn't reflect when the task was
 * actually created and clusters unrelated tasks at the same arbitrary slot —
 * use the task's own creation time instead, falling back to the old
 * per-type constant only if that timestamp is somehow unparseable.
 */
function defaultTimeFor(task: TaskListItem, type: CalendarEventType): string {
  const created = new Date(task.createdAt);
  if (Number.isNaN(created.getTime())) {
    return defaultTimeByType(type);
  }

  const hours = String(created.getHours()).padStart(2, "0");
  const minutes = String(created.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function inferAdditionalType(task: TaskListItem): CalendarEventType | null {
  const phase = (task.phaseRef?.name ?? "").toLowerCase();

  if (phase.includes("reuni")) {
    return "Reunion";
  }

  if (phase.includes("obra")) {
    return "Visita de obra";
  }

  return null;
}

function eventTitle(task: TaskListItem, type: CalendarEventType): string {
  if (type === "Reunion") {
    return `Reunion: ${task.title}`;
  }

  if (type === "Visita de obra") {
    return `Visita de obra: ${task.title}`;
  }

  return task.title;
}

/**
 * Maps real `core.tasks` rows (as returned by `fetchCalendarAction` /
 * `tasksRepository.listCalendar`) into the calendar's own `CalendarEvent`
 * shape. Every task can surface up to three dated events (commitment,
 * review, delivery) plus an inferred meeting/site-visit event, mirroring
 * the mapping the legacy mock-data version used.
 */
export function buildCalendarEvents(tasks: TaskListItem[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const task of tasks) {
    const workflowKey = task.workflow?.key ?? null;
    const baseHref = `${workflowHref(workflowKey)}?project=${encodeURIComponent(task.project.name)}`;
    const { tramo, tramoLabel } = calendarTramo(task);

    const pushEvent = ({ date, type, suffix }: { date: string | null; type: CalendarEventType; suffix: string }) => {
      if (!date) {
        return;
      }

      events.push({
        id: `${suffix}-${tramo}-${task.id}-${date}`,
        taskId: task.id,
        date,
        time: defaultTimeFor(task, type),
        title: eventTitle(task, type),
        project: task.project.name,
        responsible: task.manager?.name || "Sin responsable",
        tramo,
        tramoLabel,
        phaseId: task.phaseRef?.id ?? null,
        phaseLabel: task.phaseRef?.name ?? "",
        type,
        href: baseHref,
      });
    };

    pushEvent({ date: task.commitmentDate, type: "Compromiso", suffix: "c" });
    pushEvent({ date: task.reviewDate, type: "Proxima revision", suffix: "r" });
    pushEvent({ date: task.deliveryDate, type: "Fecha de entrega", suffix: "e" });

    const inferred = inferAdditionalType(task);
    if (inferred && task.commitmentDate) {
      pushEvent({ date: task.commitmentDate, type: inferred, suffix: "x" });
    }
  }

  return events.sort((a, b) => {
    const dateDiff = a.date.localeCompare(b.date);
    if (dateDiff !== 0) {
      return dateDiff;
    }

    const timeDiff = a.time.localeCompare(b.time);
    if (timeDiff !== 0) {
      return timeDiff;
    }

    const projectDiff = a.project.localeCompare(b.project);
    if (projectDiff !== 0) {
      return projectDiff;
    }

    return a.title.localeCompare(b.title);
  });
}

export function buildCalendarFilterOptions(events: CalendarEvent[]): CalendarFilterOptions {
  const projects = new Set<string>();
  const responsibles = new Set<string>();
  const types = new Set<string>();
  const phasesByTramo = new Map<string, Set<string>>();

  for (const event of events) {
    if (event.project) projects.add(event.project);
    if (event.responsible) responsibles.add(event.responsible);
    if (event.type) types.add(event.type);
    if (event.tramoLabel) {
      const phases = phasesByTramo.get(event.tramoLabel) ?? new Set<string>();
      if (event.phaseLabel) phases.add(event.phaseLabel);
      phasesByTramo.set(event.tramoLabel, phases);
    }
  }

  const sorted = (values: Iterable<string>) => Array.from(values).sort((a, b) => a.localeCompare(b));
  return {
    projects: ["Todos", ...sorted(projects)],
    responsibles: ["Todos", ...sorted(responsibles)],
    types: ["Todos", ...sorted(types)],
    tramos: ["Todos", ...sorted(phasesByTramo.keys())],
    phasesByTramo: Object.fromEntries(
      Array.from(phasesByTramo.entries()).map(([tramo, phases]) => [tramo, ["Todas", ...sorted(phases)]])
    ),
  };
}

export function applyCalendarFilters(events: CalendarEvent[], filters: Partial<CalendarFilters>): CalendarEvent[] {
  const safeFilters: CalendarFilters = {
    ...DEFAULT_FILTERS,
    ...filters,
  };
  const anyTramo = safeFilters.tramo === "Todos";

  return events.filter((event) => {
    const matchesProject = safeFilters.project === "Todos" || event.project === safeFilters.project;
    const matchesResponsible = safeFilters.responsible === "Todos" || event.responsible === safeFilters.responsible;
    const matchesType = safeFilters.type === "Todos" || event.type === safeFilters.type;
    const matchesTramo = anyTramo || event.tramoLabel === safeFilters.tramo;
    // The fase filter only applies once a tramo is picked (FE §3.9).
    const matchesPhase = anyTramo || safeFilters.phase === "Todas" || event.phaseLabel === safeFilters.phase;

    return matchesProject && matchesResponsible && matchesType && matchesTramo && matchesPhase;
  });
}

export function groupEventsByDate(events: CalendarEvent[]): Map<string, CalendarEvent[]> {
  const grouped = new Map<string, CalendarEvent[]>();

  for (const event of events) {
    const list = grouped.get(event.date) ?? [];
    list.push(event);
    grouped.set(event.date, list);
  }

  for (const list of grouped.values()) {
    list.sort((a, b) => {
      const timeDiff = a.time.localeCompare(b.time);
      if (timeDiff !== 0) {
        return timeDiff;
      }

      return a.title.localeCompare(b.title);
    });
  }

  return grouped;
}

export function buildTypeSummary(events: CalendarEvent[]): CalendarTypeSummaryRow[] {
  const counts = new Map<CalendarEventType, number>();

  for (const event of events) {
    counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([type, total]) => ({ type, total }))
    .sort((a, b) => b.total - a.total || a.type.localeCompare(b.type));
}

export function startOfWeek(date: Date): Date {
  const copy = new Date(date);
  const weekday = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - weekday);
  return new Date(copy.getFullYear(), copy.getMonth(), copy.getDate());
}

export function addDays(date: Date, amount: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

export function getWeekdayLabels(): string[] {
  return ["lun.", "mar.", "mie.", "jue.", "vie.", "sab.", "dom."];
}
