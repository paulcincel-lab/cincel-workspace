/**
 * Minutes → proposal (BE §11.2, Decisions D1 and the "Sin responsable" rule). Pure and client-safe:
 * turns what the model extracted from the notes into the changes of a `crear_tareas_minuta`
 * proposal. Owners and dates are resolved here, never by the model.
 */
import { formatQuickAddDate, parseQuickAdd } from "@/lib/quick-add/parse";
import { ORG_TIME_ZONE, zonedTimeToUtc } from "@/lib/my-space/zoned-time";
import type { MeetingDraft, ProposalChange } from "@/lib/types/calendario";

export type ExtractedMinutes = {
  decisions: string[];
  tasks: { title: string; owner: string; due: string | null }[];
  followUp: { date: string; time?: string } | null;
  openPoints: string[];
};

export type MinutesMeeting = {
  title: string;
  /** Meeting day, `YYYY-MM-DD` in org time. */
  date: string;
  /** Wall time of the start in org time. */
  hour: number;
  minute: number;
  durationMinutes: number;
  projectId: string | null;
  hasMeetLink: boolean;
  attendees: MeetingDraft["attendees"];
};

export type BuildMinutesInput = {
  minutesId: string;
  meeting: MinutesMeeting;
  extracted: ExtractedMinutes;
  /** Name → staff id among the attendees, or `null` when it matches none or several. */
  resolveOwner: (name: string) => string | null;
  viewerId: string;
  canChangeResponsible: boolean;
};

export type BuiltMinutes = {
  title: string;
  line: string;
  changes: ProposalChange[];
  openPoints: string[];
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MINUTES_ID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const SELF_NAMES = new Set(["yo", "mi", "mí", "me la asigno"]);

/** The minutes row a proposal belongs to: a decision change, a task's source text or the follow-up description. */
export function minutesIdOfChanges(changes: ProposalChange[]): string | null {
  for (const change of changes) {
    if (change.type === "decision") return change.minutesId;
    if (change.type === "task_create") {
      const found = MINUTES_ID.exec(change.draft.sourceText);
      if (found) return found[0];
    }
    if (change.type === "event_create") {
      const found = MINUTES_ID.exec(change.draft.description ?? "");
      if (found) return found[0];
    }
  }
  return null;
}

function validIso(date: string): boolean {
  const match = ISO_DATE.exec(date);
  if (!match) return false;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return d.getUTCFullYear() === Number(match[1]) && d.getUTCMonth() === Number(match[2]) - 1 && d.getUTCDate() === Number(match[3]);
}

/** `YYYY-MM-DD` from the model's ISO date or a Spanish expression ("viernes", "25 nov"), relative to the meeting day. */
export function resolveDue(due: string | null, meetingDate: string): string | null {
  const text = (due ?? "").trim();
  if (!text) return null;
  if (validIso(text)) return text;
  const parsed = parseQuickAdd(text, { today: meetingDate, people: [], etapas: [], meId: null });
  return parsed.dueDate && validIso(parsed.dueDate) ? parsed.dueDate : null;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function followUpDraft(meeting: MinutesMeeting, followUp: { date: string; time?: string }, minutesId: string): MeetingDraft | null {
  const match = ISO_DATE.exec(followUp.date);
  if (!match || !validIso(followUp.date)) return null;
  const time = /^(\d{1,2}):(\d{2})/.exec(followUp.time ?? "");
  const hour = time ? Math.min(23, Number(time[1])) : meeting.hour;
  const minute = time ? Math.min(59, Number(time[2])) : meeting.minute;
  const date = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const start = zonedTimeToUtc(date, hour, minute, ORG_TIME_ZONE);
  const end = new Date(start.getTime() + meeting.durationMinutes * 60_000);
  return {
    title: `Seguimiento · ${meeting.title}`.slice(0, 200),
    start: start.toISOString(),
    end: end.toISOString(),
    projectId: meeting.projectId,
    location: null,
    meet: meeting.hasMeetLink,
    attendees: meeting.attendees,
    description: `Junta de seguimiento (minuta ${minutesId})`,
  };
}

export function buildMinutesProposal(input: BuildMinutesInput): BuiltMinutes {
  const { meeting, extracted, minutesId } = input;
  const changes: ProposalChange[] = [];

  const decisions = extracted.decisions.map((d) => d.trim().slice(0, 500)).filter(Boolean).slice(0, 10);
  decisions.forEach((text, i) => changes.push({ changeId: `decision-${i + 1}`, type: "decision", minutesId, text }));

  const tasks = extracted.tasks.filter((t) => t.title.trim()).slice(0, 20);
  let taskCount = 0;
  if (meeting.projectId) {
    tasks.forEach((task, i) => {
      const owner = task.owner.trim();
      let managerId: string | null = null;
      const notes: string[] = [];
      if (SELF_NAMES.has(owner.toLowerCase())) managerId = input.viewerId;
      else if (owner) managerId = input.resolveOwner(owner);
      if (!managerId && owner) notes.push(`Responsable en la nota: ${owner}`);
      if (managerId && managerId !== input.viewerId && !input.canChangeResponsible) {
        managerId = input.viewerId;
        notes.push("Te la asigno a ti");
      }
      if (!managerId) notes.unshift("Sin responsable");
      changes.push({
        changeId: `task-${i + 1}`,
        type: "task_create",
        draft: {
          title: task.title.trim().slice(0, 200),
          projectId: meeting.projectId as string,
          managerId,
          commitmentDate: resolveDue(task.due, meeting.date),
          etapaId: null,
          sourceText: `Minuta "${meeting.title}" (${minutesId})${notes.length ? ` · ${notes.join(" · ")}` : ""}`.slice(0, 2000),
        },
      });
      taskCount += 1;
    });
  }

  let followUpDate: string | null = null;
  if (extracted.followUp) {
    const draft = followUpDraft(meeting, extracted.followUp, minutesId);
    if (draft) {
      changes.push({ changeId: "followup", type: "event_create", draft });
      followUpDate = extracted.followUp.date;
    }
  }

  const parts: string[] = [];
  if (decisions.length) parts.push(plural(decisions.length, "decisión", "decisiones"));
  if (taskCount) parts.push(plural(taskCount, "tarea", "tareas"));
  if (followUpDate) parts.push(`una junta de seguimiento el ${formatQuickAddDate(followUpDate)}`);
  let line = parts.length === 0 ? "No encontré decisiones ni tareas en las notas" : "";
  if (parts.length === 1) line = parts[0];
  if (parts.length > 1) line = `${parts.slice(0, -1).join(", ")} y ${parts[parts.length - 1]}`;
  line = line ? line.charAt(0).toUpperCase() + line.slice(1) : line;
  if (!meeting.projectId && tasks.length > 0) line += ". Vincula la reunión a un proyecto para crear las tareas";

  return {
    title: `Minuta de ${meeting.title}`.slice(0, 200),
    line: line ? `${line}.` : "",
    changes,
    openPoints: extracted.openPoints.map((p) => p.trim().slice(0, 300)).filter(Boolean).slice(0, 20),
  };
}
