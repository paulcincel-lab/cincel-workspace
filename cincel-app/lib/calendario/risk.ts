/** Risk and blocking lists for the summaries (BE §10.1). Pure and client-safe. */
import { dayLead, greeting, weekLead } from "@/lib/calendario/copy";
import { firstNameOf } from "@/lib/inicio/header";
import type { CalEventItem, DaySummary, SummaryAction, SummaryItem, SummaryTile, WeekSummary } from "@/lib/types/calendario";
import type { TaskStatus } from "@/lib/types/core";

/** An open task that waits on the task it hangs from: a successor in `task_dependencies` or a waiting subtask. */
export type SummaryDependent = {
  taskId: string;
  title: string;
  date: string | null;
  managerId: string | null;
  managerName: string | null;
  via: "dependency" | "subtask";
};

/** The slice of a task the summaries read. A `CalTaskItem` with `blockedSince` and `dependents` fits. */
export type SummaryTask = {
  taskId: string;
  title: string;
  /** Due date shown: commitment date, else delivery date. */
  date: string;
  project: { id: string; name: string } | null;
  manager: { id: string; name: string } | null;
  status: TaskStatus;
  /** Org-local date of the last change to `bloqueado`, when known. */
  blockedSince: string | null;
  dependents: SummaryDependent[];
};

export type RiskInput = {
  viewerId: string;
  today: string;
  from: string;
  to: string;
  /** Open tasks only. */
  tasks: SummaryTask[];
  /** The viewer's meetings from `from` to 7 days after `to` (the risk rule looks ahead). */
  meetings: CalEventItem[];
};

const DAY_MS = 86_400_000;

/** Whole days from `a` to `b` (YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

/** "12 nov" for a YYYY-MM-DD date. */
export function shortDate(isoDate: string): string {
  const parts = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" }).formatToParts(
    new Date(`${isoDate}T00:00:00Z`),
  );
  const get = (type: string) => (parts.find((p) => p.type === type)?.value ?? "").replace(/\.$/, "");
  return `${get("day")} ${get("month")}`;
}

const daysText = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;
const dueText = (date: string | null) => (date ? ` (${shortDate(date)})` : "");
const byDateThenTitle = <T extends { date: string | null; title: string }>(a: T, b: T) =>
  (a.date ?? "9999-12-31").localeCompare(b.date ?? "9999-12-31") || a.title.localeCompare(b.title, "es");

/** Tell the manager, assign when nobody has it, or propose a new date when it is the viewer's own. */
function ownerAction(task: SummaryTask, viewerId: string): SummaryAction {
  if (task.manager === null) return { kind: "assign", taskId: task.taskId, label: "Asignar", tool: "assign_task" };
  if (task.manager.id !== viewerId) {
    return {
      kind: "notify",
      taskId: task.taskId,
      staffId: task.manager.id,
      label: `Avisa a ${firstNameOf(task.manager.name)}`,
      tool: "notify_people",
    };
  }
  return { kind: "propose_date", taskId: task.taskId, label: "Propón fecha", tool: "move_tasks" };
}

/** The earliest meeting of the project from the range start on. */
function nextMeetingOf(projectId: string, meetings: CalEventItem[], from: string): CalEventItem | null {
  const found = meetings.filter((m) => m.project?.id === projectId && m.date >= from).sort((a, b) => a.start.localeCompare(b.start));
  return found[0] ?? null;
}

type RiskEntry = { item: SummaryItem; rank: 1 | 2; sortKey: string; daysLate: number; lead: string };

function riskEntries(input: RiskInput): RiskEntry[] {
  const entries: RiskEntry[] = [];
  const seen = new Set<string>();
  for (const task of input.tasks) {
    const successors = task.dependents.filter((d) => d.via === "dependency").sort(byDateThenTitle);
    const first = successors[0];
    if (task.status !== "bloqueado" || !first) continue;
    const since = task.blockedSince ? Math.max(0, daysBetween(task.blockedSince, input.today)) : null;
    const head = since === null ? "Bloqueada" : since === 0 ? "Bloqueada hoy" : `Bloqueada hace ${daysText(since)}`;
    const more = successors.length > 1 ? ` y ${successors.length - 1} más` : "";
    seen.add(task.taskId);
    entries.push({
      item: {
        id: `t:${task.taskId}`,
        title: task.title,
        line: `${head} · frena "${first.title}"${dueText(first.date)}${more}`,
        action: ownerAction(task, input.viewerId),
      },
      rank: 1,
      sortKey: first.date ?? "9999-12-31",
      daysLate: since ?? 0,
      lead: `"${task.title}" está bloqueada y frena "${first.title}"`,
    });
  }
  for (const task of input.tasks) {
    if (seen.has(task.taskId) || task.date >= input.today || !task.project) continue;
    const meeting = nextMeetingOf(task.project.id, input.meetings, input.from);
    if (!meeting) continue;
    const late = daysBetween(task.date, input.today);
    const when = meeting.date === input.today ? "la reunión de hoy" : `la reunión del ${shortDate(meeting.date)}`;
    seen.add(task.taskId);
    entries.push({
      item: {
        id: `t:${task.taskId}`,
        title: task.title,
        line: `Vencida ${daysText(late)} · ${when} depende de ella`,
        action: ownerAction(task, input.viewerId),
      },
      rank: 2,
      sortKey: meeting.start,
      daysLate: late,
      lead: `"${task.title}" está vencida y ${when} depende de ella`,
    });
  }
  return entries.sort(
    (a, b) =>
      a.rank - b.rank ||
      (a.rank === 1 ? a.sortKey.localeCompare(b.sortKey) : b.daysLate - a.daysLate) ||
      a.item.title.localeCompare(b.item.title, "es"),
  );
}

/** Blocked tasks with open successors, and overdue tasks a nearby meeting depends on. */
export function riskItems(input: RiskInput): SummaryItem[] {
  return riskEntries(input).map((e) => e.item);
}

/** Open tasks of the viewer that another person's open task waits for. */
export function blockingItems(input: RiskInput): SummaryItem[] {
  const items: SummaryItem[] = [];
  for (const task of input.tasks) {
    if (task.manager?.id !== input.viewerId) continue;
    const waiting = task.dependents.filter((d) => d.managerId !== null && d.managerId !== input.viewerId).sort(byDateThenTitle);
    const first = waiting[0];
    if (!first) continue;
    const who = first.managerName ?? "Alguien";
    const more = waiting.length > 1 ? ` y ${waiting.length - 1} más` : "";
    items.push({
      id: `t:${task.taskId}`,
      title: task.title,
      line: `${who} la necesita para "${first.title}"${dueText(first.date)}${more}`,
      action: { kind: "notify", taskId: task.taskId, staffId: first.managerId!, label: `Avisa a ${firstNameOf(who)}`, tool: "notify_people" },
    });
  }
  return items.sort((a, b) => a.title.localeCompare(b.title, "es"));
}

/** Meetings that start inside the range (the input also carries the look-ahead of the risk rule). */
export function meetingsInRange(input: Pick<RiskInput, "meetings" | "from" | "to">): CalEventItem[] {
  return input.meetings.filter((m) => m.date >= input.from && m.date <= input.to);
}

/** Pairs of meeting ids whose time ranges overlap, earlier first; all-day events never overlap. */
function overlapPairs(meetings: CalEventItem[]): [string, string][] {
  const timed = meetings.filter((m) => !m.allDay).sort((a, b) => a.start.localeCompare(b.start));
  const pairs: [string, string][] = [];
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      if (timed[j]!.start >= timed[i]!.end) break;
      pairs.push([timed[i]!.eventId, timed[j]!.eventId]);
    }
  }
  return pairs;
}

const timeOf = (iso: string) => iso.slice(11, 16);

/** Reuniones tile items: time, project, prep hint, and Resolver on the later of two overlapping meetings. */
export function meetingItems(meetings: CalEventItem[], oldestOverdue: Map<string, { title: string; date: string }>): SummaryItem[] {
  const pairs = overlapPairs(meetings);
  const titles = new Map(meetings.map((m) => [m.eventId, m.title]));
  return [...meetings]
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((m): SummaryItem => {
      const overlap = pairs.find(([, later]) => later === m.eventId);
      const parts = [m.allDay ? "Todo el día" : `${timeOf(m.start)}–${timeOf(m.end)}`];
      if (m.project) parts.push(m.project.name);
      const hint = m.project ? oldestOverdue.get(m.project.id) : undefined;
      if (hint) parts.push(`${hint.title} pendiente desde el ${shortDate(hint.date)}`);
      if (overlap) parts.push(`Se traslapa con "${titles.get(overlap[0]) ?? ""}"`);
      return {
        id: m.id,
        title: m.title,
        line: parts.join(" · "),
        action: overlap
          ? { kind: "resolve", eventIds: [overlap[0], overlap[1]], label: "Resolver", tool: "resolve_overlap" }
          : { kind: "prepare", eventId: m.eventId, label: "Prepárame", tool: "meeting_prep" },
      };
    });
}

const isMine = (t: SummaryTask, viewerId: string) => t.manager?.id === viewerId;

/** Vence tile items: the viewer's open tasks due in the range. */
export function dueItems(input: RiskInput): SummaryItem[] {
  return input.tasks
    .filter((t) => isMine(t, input.viewerId) && t.date >= input.from && t.date <= input.to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "es"))
    .map((t) => {
      const when = t.date < input.today ? `Vencida ${daysText(daysBetween(t.date, input.today))}` : t.date === input.today ? "Vence hoy" : `Vence el ${shortDate(t.date)}`;
      return {
        id: `t:${t.taskId}`,
        title: t.title,
        line: [t.project?.name, when].filter(Boolean).join(" · "),
        action: { kind: "defer", taskId: t.taskId, label: "Pasar a mañana", tool: "move_tasks" },
      };
    });
}

export type SummaryInput = RiskInput & {
  /** Org-time hour of the request, 0-23. */
  hour: number;
  viewerName: string;
  /** Oldest overdue open task per project id, for the meeting prep hint. */
  oldestOverdue: Map<string, { title: string; date: string }>;
  /** Days of the range over their workday (BE §9); empty for the day summary. */
  overloaded: { date: string; hours: number; workday: number }[];
};

function tilesOf(input: SummaryInput, dueLabel: string): SummaryTile[] {
  const meetings = meetingItems(meetingsInRange(input), input.oldestOverdue);
  const due = dueItems(input);
  const risk = riskItems(input);
  const blocking = blockingItems(input);
  return [
    { key: "reuniones", label: "Reuniones", count: meetings.length, items: meetings },
    { key: "vence", label: dueLabel, count: due.length, items: due },
    { key: "riesgo", label: "En riesgo", count: risk.length, items: risk },
    { key: "bloqueas", label: "Bloqueas a otros", count: blocking.length, items: blocking },
  ];
}

/** Open tasks of the viewer past due, oldest first. */
function overdueOf(input: RiskInput): SummaryTask[] {
  return input.tasks.filter((t) => isMine(t, input.viewerId) && t.date < input.today).sort((a, b) => a.date.localeCompare(b.date));
}

/** Day summary: greeting, urgency-ordered lead and the four tiles (BE §10.1). */
export function buildDaySummary(input: SummaryInput): DaySummary {
  const oldest = overdueOf(input)[0];
  const dueToday = dueItems(input).find((i) => i.line.endsWith("Vence hoy"));
  const firstRisk =
    riskEntries(input)[0]?.lead ??
    (oldest ? `"${oldest.title}" venció hace ${daysText(daysBetween(oldest.date, input.today))}` : null) ??
    (dueToday ? `"${dueToday.title}" vence hoy` : null);
  const tiles = tilesOf(input, "Vence hoy");
  return {
    date: input.from,
    greeting: greeting(input.hour, firstNameOf(input.viewerName)),
    lead: dayLead({ meetings: tiles[0]!.count, due: tiles[1]!.count, firstRisk }),
    tiles,
    primary: { kind: "redistribute", date: input.from, label: "Reparte esto", tool: "propose_redistribution" },
  };
}

/** Week summary: adds the overloaded days and the planning primary action (BE §10.1). */
export function buildWeekSummary(input: SummaryInput): WeekSummary {
  const tiles = tilesOf(input, "Vence esta semana");
  return {
    from: input.from,
    greeting: greeting(input.hour, firstNameOf(input.viewerName)),
    lead: weekLead({
      meetings: tiles[0]!.count,
      due: tiles[1]!.count,
      overloaded: input.overloaded,
      overdueLastWeek: overdueOf(input).filter((t) => t.date < input.from).length,
    }),
    tiles,
    overloadedDays: input.overloaded,
    primary: { kind: "plan_week", label: "Planea mi semana", tool: "plan_week" },
  };
}
