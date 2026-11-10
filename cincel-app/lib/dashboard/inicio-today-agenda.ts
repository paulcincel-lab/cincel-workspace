/**
 * `InicioData.todayAgenda` (Inicio Visual and Analítico "Agenda de hoy"):
 * the day's events of the scoped tasks (calendar meetings and site visits,
 * the same task calendar source as `myDay`) plus the open tasks due today as
 * deliveries (a task that is already an event of the day is not repeated).
 * Events come first by time; deliveries have no time and come last, by
 * title. Pure and client-safe.
 */
import { buildCalendarEvents } from "@/lib/calendar/calendar-service";
import { initialsOf, taskHref } from "@/lib/metrics/widgets";
import { isTaskClosed } from "@/lib/tasks/status-options";
import type { CalendarEventType } from "@/lib/types/calendar";
import type { TaskListItem } from "@/lib/types/core";
import type { InicioAgendaItem } from "@/lib/types/redesign";

/** Calendar event types that are events of the day (the rest are task dates). */
const EVENT_TYPES: ReadonlySet<CalendarEventType> = new Set<CalendarEventType>(["Reunion", "Visita de obra"]);

/** Calendar tramo keys that aren't `workflows.key`. */
const NON_TRAMO_KEYS = new Set(["sin-tramo", "admin"]);

type AgendaTask = Omit<TaskListItem, "notes">;

function assigneeOf(task: Pick<AgendaTask, "manager">): InicioAgendaItem["assignee"] {
  return task.manager ? { id: task.manager.id, name: task.manager.name, initials: initialsOf(task.manager.name) } : null;
}

export function todayAgendaItems(tasks: AgendaTask[], today: string): InicioAgendaItem[] {
  const open = tasks.filter((t) => !t.archived && !isTaskClosed(t));
  const byId = new Map(open.map((t) => [t.id, t]));

  const todayEvents = buildCalendarEvents(open).filter((event) => event.date === today && EVENT_TYPES.has(event.type));
  const withEvent = new Set(todayEvents.map((event) => event.taskId));
  const events: InicioAgendaItem[] = todayEvents
    .map((event) => {
      const task = byId.get(event.taskId);
      return {
        id: event.id,
        title: event.title,
        start: `${event.date}T${event.time}`,
        estimated: true,
        project: event.project,
        tramo: NON_TRAMO_KEYS.has(event.tramo) ? null : event.tramo,
        href: taskHref(event.taskId),
        kind: "evento" as const,
        assignee: task ? assigneeOf(task) : null,
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title, "es"));

  const deliveries: InicioAgendaItem[] = open
    .filter((t) => t.commitmentDate === today && !withEvent.has(t.id))
    .map((task) => ({
      id: `entrega-${task.id}`,
      title: task.title,
      start: today,
      allDay: true,
      project: task.project.name,
      tramo: task.workflow?.key ?? null,
      href: taskHref(task.id),
      kind: "entrega" as const,
      assignee: assigneeOf(task),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "es"));

  return [...events, ...deliveries];
}
