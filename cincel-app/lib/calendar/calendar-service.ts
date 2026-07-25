import { disenoTasks } from "@/lib/data/diseno";
import { operativasTasks } from "@/lib/data/operativas";
import { presaleTasks } from "@/lib/data/presale";
import type { CalendarEvent, CalendarEventType, CalendarFilterOptions, CalendarFilters, CalendarTypeSummaryRow } from "@/lib/types/calendar";
import type { Task, WorkflowType } from "@/lib/types/task";

const DEFAULT_FILTERS: CalendarFilters = {
  project: "Todos",
  responsible: "Todos",
  type: "Todos",
  stage: "Todas",
};

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

function workflowHref(workflow: WorkflowType): string {
  if (workflow === "Presale") {
    return "/tareas/presale";
  }

  if (workflow === "Diseño") {
    return "/tareas/diseno";
  }

  return "/tareas/construccion";
}

export function formatStageLabel(workflow: WorkflowType): string {
  if (workflow === "Diseño") {
    return "Taller de Diseño";
  }

  return workflow;
}

function defaultTimeByType(type: CalendarEventType): string {
  if (type === "Compromiso") return "09:00";
  if (type === "Proxima revision") return "11:00";
  if (type === "Fecha de entrega") return "17:00";
  if (type === "Reunion") return "10:00";
  return "08:00";
}

function inferAdditionalType(task: Task): CalendarEventType | null {
  const phase = (task.phase || "").toLowerCase();

  if (phase.includes("reuni")) {
    return "Reunion";
  }

  if (phase.includes("obra")) {
    return "Visita de obra";
  }

  return null;
}

function eventTitle(task: Task, type: CalendarEventType): string {
  if (type === "Reunion") {
    return `Reunion: ${task.description}`;
  }

  if (type === "Visita de obra") {
    return `Visita de obra: ${task.description}`;
  }

  return task.description;
}

export function buildCalendarEvents(tasks: Task[]): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  for (const task of tasks) {
    const baseHref = `${workflowHref(task.workflow)}?project=${encodeURIComponent(task.project)}`;

    const pushEvent = ({ date, type, suffix }: { date: string; type: CalendarEventType; suffix: string }) => {
      if (!date) {
        return;
      }

      events.push({
        id: `${suffix}-${task.id}-${date}`,
        taskId: task.id,
        date,
        time: defaultTimeByType(type),
        title: eventTitle(task, type),
        project: task.project,
        responsible: task.manager || "Sin responsable",
        stage: task.workflow,
        stageLabel: formatStageLabel(task.workflow),
        phase: task.phase,
        type,
        href: baseHref,
      });
    };

    pushEvent({ date: task.commitmentDate, type: "Compromiso", suffix: "c" });
    pushEvent({ date: task.reviewDate, type: "Proxima revision", suffix: "r" });
    pushEvent({ date: task.deliveryDate || "", type: "Fecha de entrega", suffix: "e" });

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
  const stages = new Set<string>();

  for (const event of events) {
    if (event.project) projects.add(event.project);
    if (event.responsible) responsibles.add(event.responsible);
    if (event.type) types.add(event.type);
    if (event.stageLabel) stages.add(event.stageLabel);
  }

  return {
    projects: ["Todos", ...Array.from(projects).sort((a, b) => a.localeCompare(b))],
    responsibles: ["Todos", ...Array.from(responsibles).sort((a, b) => a.localeCompare(b))],
    types: ["Todos", ...Array.from(types).sort((a, b) => a.localeCompare(b))],
    stages: ["Todas", ...Array.from(stages).sort((a, b) => a.localeCompare(b))],
  };
}

export function applyCalendarFilters(events: CalendarEvent[], filters: Partial<CalendarFilters>): CalendarEvent[] {
  const safeFilters: CalendarFilters = {
    ...DEFAULT_FILTERS,
    ...filters,
  };

  return events.filter((event) => {
    const matchesProject = safeFilters.project === "Todos" || event.project === safeFilters.project;
    const matchesResponsible = safeFilters.responsible === "Todos" || event.responsible === safeFilters.responsible;
    const matchesType = safeFilters.type === "Todos" || event.type === safeFilters.type;
    const matchesStage = safeFilters.stage === "Todas" || event.stageLabel === safeFilters.stage;

    return matchesProject && matchesResponsible && matchesType && matchesStage;
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

function tasksStorageKey(workflow: WorkflowType): string {
  return `cincel.actividades.${workflow}.tasks.v1`;
}

function readWorkflowTasks(workflow: WorkflowType, fallback: Task[]): Task[] {
  if (typeof window === "undefined") {
    return fallback;
  }

  const stored = window.localStorage.getItem(tasksStorageKey(workflow));

  if (!stored) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(stored) as Task[];
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function loadCalendarTasksFromSource(): Task[] {
  const presale = readWorkflowTasks("Presale", presaleTasks);
  const diseno = readWorkflowTasks("Diseño", disenoTasks);
  const operativas = readWorkflowTasks("Construcción", operativasTasks);

  return [...presale, ...diseno, ...operativas].filter((task) => !task.archived);
}
