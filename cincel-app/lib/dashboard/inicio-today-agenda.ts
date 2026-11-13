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
import type { CalEventItem } from "@/lib/types/calendario";
import type { CalendarEventType } from "@/lib/types/calendar";
import type { TaskListItem } from "@/lib/types/core";
import type { InicioAgendaItem } from "@/lib/types/redesign";

/** Calendar event types that are events of the day (the rest are task dates). */
const EVENT_TYPES: ReadonlySet<CalendarEventType> = new Set<CalendarEventType>(["Reunion", "Visita de obra"]);

/** Calendar etapa keys that aren't `workflows.key`. */
const NON_ETAPA_KEYS = new Set(["sin-etapa", "admin"]);

type AgendaTask = Omit<TaskListItem, "notes">;

function assigneeOf(task: Pick<AgendaTask, "manager">): InicioAgendaItem["assignee"] {
  return task.manager ? { id: task.manager.id, name: task.manager.name, initials: initialsOf(task.manager.name) } : null;
}

/** A meeting of `calendar_events` as an Inicio agenda row (Calendario BE §5.2). */
export function meetingAgendaItem(meeting: CalEventItem): InicioAgendaItem {
  const item: InicioAgendaItem = {
    id: meeting.id,
    title: meeting.title,
    start: meeting.start,
    end: meeting.end,
    allDay: meeting.allDay,
    project: meeting.project?.name,
    etapa: (meeting.etapa?.key as InicioAgendaItem["etapa"]) ?? null,
    attendees: meeting.attendees.map((a) => a.name).filter(Boolean),
    href: `/calendario?vista=dia&fecha=${meeting.date}&evento=${meeting.id}`,
    kind: "evento",
    assignee: meeting.organizer
      ? { id: meeting.organizer.id, name: meeting.organizer.name, initials: initialsOf(meeting.organizer.name) }
      : null,
  };
  if (meeting.meetUrl) item.meetUrl = meeting.meetUrl;
  return item;
}

/**
 * With `meetings` (today's rows of `calendar_events`, the Calendario source) the events of the day are the
 * real meetings; without it they are the meetings and site visits inferred from the tasks.
 */
export function todayAgendaItems(tasks: AgendaTask[], today: string, meetings?: CalEventItem[]): InicioAgendaItem[] {
  const open = tasks.filter((t) => !t.archived && !isTaskClosed(t));
  const byId = new Map(open.map((t) => [t.id, t]));

  const todayEvents = meetings ? [] : buildCalendarEvents(open).filter((event) => event.date === today && EVENT_TYPES.has(event.type));
  const withEvent = new Set(todayEvents.map((event) => event.taskId));
  const real: InicioAgendaItem[] = (meetings ?? []).filter((m) => m.date === today).map(meetingAgendaItem);
  const events: InicioAgendaItem[] = todayEvents
    .map((event): InicioAgendaItem => {
      const task = byId.get(event.taskId);
      return {
        id: event.id,
        title: event.title,
        start: `${event.date}T${event.time}`,
        estimated: true,
        project: event.project,
        etapa: NON_ETAPA_KEYS.has(event.etapa) ? null : event.etapa,
        href: taskHref(event.taskId),
        kind: "evento" as const,
        assignee: task ? assigneeOf(task) : null,
      };
    })
    .concat(real)
    .sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title, "es"));

  const deliveries: InicioAgendaItem[] = open
    .filter((t) => t.commitmentDate === today && !withEvent.has(t.id))
    .map((task) => ({
      id: `entrega-${task.id}`,
      title: task.title,
      start: today,
      allDay: true,
      project: task.project.name,
      etapa: task.workflow?.key ?? null,
      href: taskHref(task.id),
      kind: "entrega" as const,
      assignee: assigneeOf(task),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "es"));

  return [...events, ...deliveries];
}
