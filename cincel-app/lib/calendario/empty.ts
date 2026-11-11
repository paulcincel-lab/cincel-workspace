/** Safe defaults of the Calendario reads while their loaders are stubs (never throw). Pure and client-safe. */
import { addDays } from "@/lib/time-tracking/local-time";
import type {
  CalDay,
  CalendarioListPage,
  CalendarioRange,
  CalendarioRangeInput,
  DaySummary,
  MeetingMinutes,
  PlanWeekData,
  WeekSummary,
} from "@/lib/types/calendario";

function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 92; d = addDays(d, 1)) out.push(d);
  return out;
}

export function emptyDay(date: string): CalDay {
  return { date, tasks: 0, events: 0, overdue: 0, completed: 0, shown: 0, hours: null, workday: null, loadLabel: null, overlaps: 0 };
}

export function emptyCalendarioRange(input: Pick<CalendarioRangeInput, "from" | "to">, today?: string): CalendarioRange {
  return {
    from: input.from,
    to: input.to,
    today: today ?? input.from,
    days: datesBetween(input.from, input.to).map(emptyDay),
    items: [],
    kpis: { tasks: 0, meetings: 0, meetingHours: 0, overdue: 0, overduePct: 0, unassigned: 0 },
    truncated: false,
    google: { connected: false, eventsGrant: false, syncedAt: null, error: null },
  };
}

export const EMPTY_CALENDARIO_LIST: CalendarioListPage = { rows: [], nextCursor: null, total: 0 };

export function emptyDaySummary(date: string): DaySummary {
  return {
    date,
    greeting: "",
    lead: "",
    tiles: [],
    primary: { kind: "defer", taskId: "", label: "Pasar a mañana", tool: "move_tasks" },
  };
}

export function emptyWeekSummary(from: string): WeekSummary {
  return {
    from,
    greeting: "",
    lead: "",
    tiles: [],
    overloadedDays: [],
    primary: { kind: "plan_week", label: "Planea mi semana", tool: "plan_week" },
  };
}

export function emptyPlanWeek(weekStart: string): PlanWeekData {
  return { weekStart, days: [], backlog: [], people: [], cells: [] };
}

export function emptyMinutes(eventId: string): MeetingMinutes {
  return { minutesId: null, eventId, notes: "", status: "borrador", openPoints: [], decisions: [], tasks: [], sentAt: null, updatedAt: null };
}
