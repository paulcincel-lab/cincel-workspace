/**
 * Proposal builders behind the proposing tools (Calendario BE §6.3, §11.2,
 * ADR 0007). Server-only. Nothing here changes a task or an event: each
 * builder only writes an `assistant_proposals` row through `createProposal`,
 * which reads the `before` values in the same call.
 */
import "server-only";

import { randomUUID } from "node:crypto";

import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { fetchStaffAction } from "@/lib/actions/staff-actions";
import {
  calendarEventsGrantAvailable,
  CALENDAR_EVENTS_GRANT,
} from "@/lib/assistant/agenda/google-calendar";
import type { ToolFailure } from "@/lib/assistant/define-tool";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { viewerScopeOf } from "@/lib/auth/viewer-scope";
import {
  clockOf,
  inviteLine,
  longDate,
  type PromptTask,
  PROMPT_TASK_LIMIT,
} from "@/lib/calendario/propose-context";
import { db } from "@/lib/db/client";
import { contacts, projects, tasks } from "@/lib/db/schema";
import { actionErrorText } from "@/lib/errors";
import { getStaffAccessToken } from "@/lib/google/staff-token";
import type { StaffOauthScope } from "@/lib/google/staff-oauth";
import { busyWindowsOf } from "@/lib/repositories/calendario-events-range";
import { createProposal } from "@/lib/repositories/proposals-repository";
import { TIME_TRACKING_TIME_ZONE } from "@/lib/time-tracking/settings";
import type {
  CalEventItem,
  DeferredItem,
  MeetingDraft,
  MeetingPatch,
  Proposal,
  ProposalChange,
} from "@/lib/types/calendario";
import type { ProjectListItem } from "@/lib/types/core";

export const NO_PERMISSION_REASON = "Sin permiso";

/** Where a proposal comes from: the chat (a thread) or a button on the page (no thread). */
export type ProposalSource = { user: AuthenticatedUser; threadId: string | null; toolCallId?: string };

export type MoveTasksInput = {
  moves?: { taskId: string; toDate: string }[];
  taskIds?: string[];
  toDate?: string;
  reason?: string;
};

export function failure(error: string, message?: string): ToolFailure {
  return { ok: false, error, message: message ?? actionErrorText(error) };
}

/** What every proposing tool returns (BE §11.2). */
export function proposalResult(proposal: Proposal) {
  return {
    ok: true as const,
    proposalId: proposal.id,
    kind: proposal.kind,
    title: proposal.title,
    line: proposal.line,
    changes: proposal.changes,
    deferred: proposal.deferred,
  };
}

function threadOpts(source: ProposalSource) {
  return {
    ...(source.threadId ? { threadId: source.threadId } : {}),
    ...(source.toolCallId ? { toolCallId: source.toolCallId } : {}),
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ── move_tasks ──────────────────────────────────────────────────────────────

/** The moves of a `move_tasks` input, one per task (the last date wins). */
export function normalizeMoves(input: MoveTasksInput): { taskId: string; toDate: string }[] {
  const raw = input.moves ?? (input.taskIds ?? []).map((taskId) => ({ taskId, toDate: input.toDate as string }));
  const byTask = new Map<string, string>();
  for (const move of raw) byTask.set(move.taskId, move.toDate);
  return [...byTask].map(([taskId, toDate]) => ({ taskId, toDate }));
}

type TaskRow = {
  id: string;
  title: string;
  kind: string;
  commitmentDate: string | null;
  deliveryDate: string | null;
  projectName: string | null;
  managerId: string | null;
};

async function loadTaskRows(ids: string[]): Promise<Map<string, TaskRow>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      kind: tasks.kind,
      commitmentDate: tasks.commitmentDate,
      deliveryDate: tasks.deliveryDate,
      projectName: projects.name,
      managerId: tasks.managerId,
    })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(and(inArray(tasks.id, ids), isNull(tasks.deletedAt), eq(tasks.archived, false)));
  return new Map(rows.map((row) => [row.id, row as TaskRow]));
}

/**
 * `mover_tareas` proposal (BE §11.2): one `task_date` change per task whose
 * date really changes. Tasks the viewer can't see are dropped without a trace;
 * tasks the viewer can see but not change go to `deferred` as "Sin permiso".
 */
export async function proposeMoveTasks(
  source: ProposalSource,
  input: MoveTasksInput,
): Promise<{ ok: true; proposal: Proposal } | ToolFailure> {
  const moves = normalizeMoves(input);
  if (moves.length === 0) return failure("INVALID", "Indica las tareas y la fecha a la que se mueven.");

  const viewer = viewerScopeOf(source.user);
  const canChange = resolveActivitiesCapabilities(source.user).canCreateActivity;
  const rows = await loadTaskRows(moves.map((m) => m.taskId));

  const changes: ProposalChange[] = [];
  const deferred: DeferredItem[] = [];
  let unchanged = 0;
  for (const move of moves) {
    const row = rows.get(move.taskId);
    // Missing, or an admin task the viewer can't see: nothing to say about it.
    if (!row || (row.kind === "admin" && !viewer.isAdmin)) continue;
    if (!canChange) {
      deferred.push({ taskId: row.id, title: row.title, reason: NO_PERMISSION_REASON });
      continue;
    }
    const field = row.commitmentDate ? "commitmentDate" : "deliveryDate";
    const current = row[field];
    if (current === move.toDate) {
      unchanged += 1;
      continue;
    }
    changes.push({
      changeId: randomUUID(),
      type: "task_date",
      taskId: row.id,
      title: row.title,
      projectName: row.projectName,
      before: { date: current, field },
      after: { date: move.toDate },
      ...(input.reason ? { reason: input.reason } : {}),
      staffId: row.managerId,
    });
  }

  if (changes.length === 0) {
    if (deferred.length > 0) return failure("FORBIDDEN", "No puedes cambiar la fecha de esas tareas.");
    if (unchanged > 0) return failure("INVALID", "Esas tareas ya tienen esa fecha.");
    return failure("NOT_FOUND", "No encontré esas tareas o no tienes acceso a ellas.");
  }

  const dates = changes.map((c) => (c.type === "task_date" ? c.after.date : "")).sort();
  const targets = [...new Set(dates)];
  const where = targets.length === 1 ? `al ${longDate(targets[0])}` : "a nuevas fechas";
  const lineParts = [`Paso ${plural(changes.length, "tarea", "tareas")} ${where}`];
  if (deferred.length > 0) lineParts.push(`${plural(deferred.length, "queda fuera", "quedan fuera")}: sin permiso`);
  const line = `${lineParts.map((part) => part.replace(/\.$/, "")).join(". ")}.`;

  const proposal = await createProposal(
    source.user,
    "mover_tareas",
    {
      title: `Mover ${plural(changes.length, "tarea", "tareas")} ${where}`,
      line,
      changes,
      deferred,
      range: { from: dates[0], to: dates[dates.length - 1] },
    },
    threadOpts(source),
  );
  return { ok: true, proposal };
}

// ── Meetings ────────────────────────────────────────────────────────────────

/** True when the caller's Google Calendar grant works now (D12: Meet only then). */
export async function googleConnected(staffId: string): Promise<boolean> {
  if (!calendarEventsGrantAvailable()) return false;
  try {
    const result = await getStaffAccessToken(staffId, CALENDAR_EVENTS_GRANT as string as StaffOauthScope);
    return result.status === "ok";
  } catch {
    return false;
  }
}

export type DefaultAttendees = { attendees: MeetingDraft["attendees"]; names: string[]; withClient: boolean };

/** D12: the project's manager and coordinator, plus its client contact when it has an email. The organizer is left out. */
export async function defaultAttendees(
  user: AuthenticatedUser,
  project: Pick<ProjectListItem, "manager" | "coordinator" | "clientId">,
): Promise<DefaultAttendees> {
  const attendees: MeetingDraft["attendees"] = [];
  const names: string[] = [];
  const staffRows = await fetchStaffAction();
  const seen = new Set<string>([user.member.id]);
  for (const ref of [project.manager, project.coordinator]) {
    if (!ref || seen.has(ref.id)) continue;
    seen.add(ref.id);
    const email = staffRows.find((s) => s.id === ref.id)?.email;
    if (!email) continue;
    attendees.push({ staffId: ref.id, email, name: ref.name });
    names.push(ref.name);
  }
  let withClient = false;
  if (project.clientId) {
    const [client] = await db
      .select({ id: contacts.id, name: contacts.name, email: contacts.email })
      .from(contacts)
      .where(and(eq(contacts.id, project.clientId), isNull(contacts.deletedAt)))
      .limit(1);
    if (client?.email) {
      attendees.push({ contactId: client.id, email: client.email, name: client.name });
      withClient = true;
    }
  }
  return { attendees, names, withClient };
}

/** Whether the draft overlaps a meeting of the organizer or of an invited teammate (noted in the proposal line). */
async function hasConflict(user: AuthenticatedUser, draft: MeetingDraft): Promise<boolean> {
  try {
    const staffIds = draft.attendees.map((a) => a.staffId).filter((id): id is string => !!id);
    const busy = await busyWindowsOf(
      user.member.id,
      [user.member.id, ...staffIds],
      { timeMin: draft.start, timeMax: draft.end },
      { includeOwnGoogle: true },
    );
    const start = Date.parse(draft.start);
    const end = Date.parse(draft.end);
    return busy.some((b) => Date.parse(b.start) < end && Date.parse(b.end) > start);
  } catch {
    // The conflict note is a nicety; a failed lookup must not block the proposal.
    return false;
  }
}

/** `crear_reunion` proposal: one `event_create` change with the draft. */
export async function proposeCreateEvent(
  source: ProposalSource,
  draft: MeetingDraft,
  extra: { names?: string[]; withClient?: boolean } = {},
): Promise<Proposal> {
  const start = new Date(draft.start);
  const end = new Date(draft.end);
  const day = localDateOfInstant(start);
  const parts = [`${longDate(day)}, ${clockOf(start, TIME_TRACKING_TIME_ZONE)}–${clockOf(end, TIME_TRACKING_TIME_ZONE)}.`];
  const invites = inviteLine(extra.names ?? draft.attendees.map((a) => a.name), extra.withClient ?? false);
  if (invites) parts.push(invites);
  if (draft.meet) parts.push("Con enlace de Meet.");
  if (await hasConflict(source.user, draft)) parts.push("Se traslapa con otra reunión.");

  return createProposal(
    source.user,
    "crear_reunion",
    {
      title: `Nueva reunión: ${draft.title}`,
      line: parts.join(" "),
      changes: [{ changeId: randomUUID(), type: "event_create", draft }],
      deferred: [],
      range: { from: day, to: day },
    },
    threadOpts(source),
  );
}

function localDateOfInstant(instant: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: TIME_TRACKING_TIME_ZONE,
  }).format(instant);
}

/** The id of a Cincel meeting from what the model passes: a bare uuid or the "e-<uuid>" of `list_events`. */
export function meetingIdOf(value: string): string | null {
  const id = value.trim().replace(/^e[-:]/, "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id : null;
}

/** `editar_reunion` proposal; organizer only (checked by the caller with `item.canEdit`). */
export async function proposeUpdateEvent(
  source: ProposalSource,
  item: CalEventItem,
  requested: MeetingPatch,
): Promise<Proposal> {
  // A new start alone moves the meeting: the length stays.
  const patch: MeetingPatch =
    requested.start !== undefined && requested.end === undefined
      ? { ...requested, end: new Date(Date.parse(requested.start) + (Date.parse(item.end) - Date.parse(item.start))).toISOString() }
      : requested;
  const before: MeetingPatch = {};
  if (patch.title !== undefined) before.title = item.title;
  if (patch.start !== undefined) before.start = item.start;
  if (patch.end !== undefined) before.end = item.end;
  if (patch.location !== undefined) before.location = item.location;
  const notify = item.attendees.some((a) => a.staffId !== source.user.member.id);

  const start = new Date(patch.start ?? item.start);
  const end = new Date(patch.end ?? item.end);
  const day = localDateOfInstant(start);
  const parts: string[] = [];
  if (patch.start || patch.end) parts.push(`Pasa al ${longDate(day)}, ${clockOf(start, TIME_TRACKING_TIME_ZONE)}–${clockOf(end, TIME_TRACKING_TIME_ZONE)}.`);
  if (patch.title) parts.push(`Nuevo título: ${patch.title}.`);
  if (patch.location !== undefined && patch.location !== null) parts.push(`Lugar: ${patch.location}.`);
  if (patch.attendees) parts.push(`Quedan ${plural(patch.attendees.length, "invitado", "invitados")}.`);
  if (parts.length === 0) parts.push("Cambia la reunión.");

  return createProposal(
    source.user,
    "editar_reunion",
    {
      title: `Editar reunión: ${patch.title ?? item.title}`,
      line: parts.join(" "),
      changes: [{ changeId: randomUUID(), type: "event_update", eventId: item.eventId, before, after: patch, notify }],
      deferred: [],
      range: { from: item.date, to: patch.start ? day : item.date },
    },
    threadOpts(source),
  );
}

/** `cancelar_reunion` proposal; "Aplicar y avisar" when there are other attendees. */
export async function proposeCancelEvent(source: ProposalSource, item: CalEventItem): Promise<Proposal> {
  const notify = item.attendees.some((a) => a.staffId !== source.user.member.id);
  return createProposal(
    source.user,
    "cancelar_reunion",
    {
      title: `Cancelar reunión: ${item.title}`,
      line: `${longDate(item.date)}, ${clockOf(new Date(item.start), TIME_TRACKING_TIME_ZONE)}.${notify ? " Se avisa a los invitados." : ""}`,
      changes: [{ changeId: randomUUID(), type: "event_cancel", eventId: item.eventId, notify }],
      deferred: [],
      range: { from: item.date, to: item.date },
    },
    threadOpts(source),
  );
}

// ── Prompt data for propose_from_text ───────────────────────────────────────

/** The caller's own open tasks dated on or before `to`, oldest first: what "lo vencido" can mean. */
export async function loadPromptTasks(user: AuthenticatedUser, to: string): Promise<PromptTask[]> {
  const due = sql<string>`coalesce(${tasks.commitmentDate}, ${tasks.deliveryDate})`;
  const rows = await db
    .select({ id: tasks.id, title: tasks.title, project: projects.name, date: due })
    .from(tasks)
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(
      and(
        eq(tasks.managerId, user.member.id),
        isNull(tasks.deletedAt),
        eq(tasks.archived, false),
        ne(tasks.status, "completado"),
        sql`${due} is not null and ${due} <= ${to}::date`,
      ),
    )
    .orderBy(asc(due))
    .limit(PROMPT_TASK_LIMIT);
  return rows.map((r) => ({ id: r.id, title: r.title, project: r.project, date: String(r.date).slice(0, 10) }));
}
