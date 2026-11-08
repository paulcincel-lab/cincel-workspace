/**
 * Assistant tool group "Agenda y calendario (6)" (redesign BE §10.3, §11.1;
 * Phase 7): list_events, find_free_slots; create_event, update_event,
 * cancel_event, schedule_site_visit.
 *
 * Each tool is a `defineTool` with capability, `confirm`, `summarize(input)`
 * (from the client-safe `lib/assistant/tool-summaries.ts`) and `available(ctx)`
 * reading only the flags modules of the actions it calls (Rule 3).
 *
 * - Reads use Cincel data (task dates through `fetchCalendarAction`, the
 *   jornada of Control de horario, approved vacations) plus the caller's own
 *   Google events when Calendar is granted. Another person's Google calendar
 *   is never read (owner-only data, BE §9.1).
 * - The four event writes go to the caller's primary Google calendar with
 *   attendees, which needs the `calendar.events` grant (Annex C3, out of
 *   scope). While the staff OAuth flow cannot grant it they are registered
 *   disabled: `available()` is false, so the model is never offered them, and
 *   `list_events` tells the model to answer "Aún no puedo crear eventos en tu
 *   calendario" and offer a reminder or a task instead.
 *
 * Audit (BE §9.9): a Google event is the caller's own data, so event writes
 * write `history_events` only on the shared entities they touch: the project
 * an event is linked to, and the task `schedule_site_visit` creates.
 */
import "server-only";

import { z } from "zod";

import { unwrapActionResult } from "@/lib/actions/action-result";
import { fetchStaffAction } from "@/lib/actions/staff-actions";
import {
  addChecklistItemAction,
  createUserTaskAction,
  fetchCalendarAction,
  fetchTaskAction,
  fetchTasksAction,
} from "@/lib/actions/tasks-actions";
import { fetchTimeTrackingSettingsAction } from "@/lib/actions/time-tracking-actions";
import { IMPLEMENTED as TIME_TRACKING } from "@/lib/actions/time-tracking-actions.flags";
import { IMPLEMENTED as VACATIONS } from "@/lib/actions/vacations-actions.flags";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import {
  addDaysToDate,
  eachDate,
  findFreeSlots,
  localDateOf,
  localTimeOf,
  zonedTimeToUtc,
} from "@/lib/assistant/agenda/free-slots";
import {
  busyIntervalsOf,
  calendarEventsGrantAvailable,
  CalendarScopeMissingError,
  deletePrimaryEvent,
  getPrimaryEvent,
  insertPrimaryEvent,
  listOwnGoogleEvents,
  patchPrimaryEvent,
  type GoogleCalendarEvent,
  type GoogleEventWrite,
} from "@/lib/assistant/agenda/google-calendar";
import { defineTool, type DefinedTool } from "@/lib/assistant/define-tool";
import { byNameIlike, resolveProject, type Resolved } from "@/lib/assistant/resolvers";
import { summarizeCreateEvent, summarizeScheduleSiteVisit, toolSummaries } from "@/lib/assistant/tool-summaries";
import { recordViaAsistente } from "@/lib/assistant/via-asistente";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { getAppOrigin } from "@/lib/auth/safe-return-to";
import { db } from "@/lib/db/client";
import { actionErrorText } from "@/lib/errors";
import { TIME_TRACKING_TIME_ZONE } from "@/lib/time-tracking/settings";
import { canSeeAdminData } from "@/lib/tramos/compat";
import type { ProjectListItem, TaskFilters, TaskListItem } from "@/lib/types/core";
import type { AgendaItem } from "@/lib/types/widgets";
import { approvedAbsences } from "@/lib/vacations/approved-absences";

// ── Constants and copy ──────────────────────────────────────────────────────

const TIME_ZONE = TIME_TRACKING_TIME_ZONE;

/** FE §3.9: what the assistant says while event writes are disabled. */
export const CALENDAR_WRITES_DISABLED_COPY =
  "Aún no puedo crear eventos en tu calendario. Puedo crearte un recordatorio o una tarea en su lugar.";

const ORGANIZER_ONLY_COPY = "Solo quien organizó el evento puede modificarlo o cancelarlo.";
const EVENT_GONE_COPY = "Ese evento ya no existe en tu calendario.";
const END_BEFORE_START_COPY = "La hora de fin debe ser posterior a la de inicio.";

/** Longest `list_events` range, in days. */
const LIST_RANGE_DAYS = 92;
/** Longest `find_free_slots` range, in days. */
const SLOTS_RANGE_DAYS = 31;
const MAX_ITEMS = 200;
/** Length of the calendar event `schedule_site_visit` creates. */
export const SITE_VISIT_MINUTES = 120;

/** Checklist of a site visit when no template task is named. */
export const DEFAULT_SITE_VISIT_CHECKLIST = [
  "Revisar avance contra el cronograma",
  "Tomar fotos de cada frente de trabajo",
  "Verificar calidad de acabados e instalaciones",
  "Revisar seguridad y limpieza de la obra",
  "Anotar pendientes y responsables",
] as const;

const SELF_NAMES = new Set(["yo", "mí", "mi", "me", "conmigo"]);
const LEAD_ROLES: readonly string[] = ["Jefe de Taller", "Jefe de Construcción"];

// ── Capabilities and availability ───────────────────────────────────────────

const everyone = () => true;

/** **lead** (BE §10.1): access Administrador or Dirección, or role Jefe de Taller / Jefe de Construcción. */
export function isAgendaLead(user: AuthenticatedUser): boolean {
  if (user.access === "Administrador" || user.access === "Dirección") return true;
  return LEAD_ROLES.includes(user.access) || LEAD_ROLES.includes(user.member.role);
}

/** Event writes: only once the `calendar.events` grant exists (Annex C3). */
const eventWritesAvailable = () => calendarEventsGrantAvailable();

// ── Schemas ─────────────────────────────────────────────────────────────────

const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/;

const DateSchema = z.iso.date().describe("Fecha YYYY-MM-DD");
const DateTimeSchema = z
  .string()
  .trim()
  .regex(DATE_TIME_RE)
  .describe("Fecha y hora ISO (YYYY-MM-DDTHH:MM); sin zona se toma la hora de Ciudad de México");
const NameSchema = z.string().trim().min(1).max(160);
const PeopleSchema = z.array(NameSchema).max(20);
const ProjectNameSchema = z.string().trim().min(1).max(200).describe("Nombre del proyecto");
const EventIdSchema = z.string().trim().min(1).max(1024).describe("Id del evento de Google Calendar");

export const ListEventsSchema = z.object({
  from: DateSchema,
  to: DateSchema,
  people: PeopleSchema.optional().describe('Nombres de personas; "yo" para el usuario'),
  project: ProjectNameSchema.optional(),
});

export const FindFreeSlotsSchema = z.object({
  people: PeopleSchema.min(1).describe('Nombres de personas; "yo" para el usuario'),
  duration: z.number().int().min(5).max(720).describe("Duración en minutos"),
  from: DateSchema,
  to: DateSchema,
  workingHoursOnly: z.boolean().optional().describe("Solo dentro de la jornada (por defecto sí)"),
});

export const CreateEventSchema = z.object({
  title: z.string().trim().min(1).max(200),
  start: DateTimeSchema,
  end: DateTimeSchema,
  attendees: PeopleSchema.describe("Nombres de personas del equipo o correos"),
  project: ProjectNameSchema.optional(),
  location: z.string().trim().max(300).optional(),
});

export const UpdateEventSchema = z.object({
  eventId: EventIdSchema,
  patch: z
    .object({
      title: z.string().trim().min(1).max(200).optional(),
      start: DateTimeSchema.optional(),
      end: DateTimeSchema.optional(),
      location: z.string().trim().max(300).optional(),
      attendees: PeopleSchema.optional().describe("Lista completa de invitados (reemplaza la actual)"),
    })
    .refine((patch) => Object.values(patch).some((v) => v !== undefined), { message: "Nada que cambiar" }),
});

export const CancelEventSchema = z.object({
  eventId: EventIdSchema,
  message: z.string().trim().max(500).optional().describe("Mensaje para los invitados"),
});

export const ScheduleSiteVisitSchema = z.object({
  project: ProjectNameSchema,
  date: DateTimeSchema,
  people: PeopleSchema.min(1).describe("Quién va; la primera persona queda como responsable de la tarea"),
  checklistTemplate: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .optional()
    .describe("Título de una tarea del proyecto cuyo checklist se copia"),
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function failure(err: unknown) {
  if (err instanceof CalendarScopeMissingError) return { ok: false as const, error: CALENDAR_WRITES_DISABLED_COPY };
  return { ok: false as const, error: actionErrorText(err) };
}

function unresolved<T>(resolved: Extract<Resolved<T>, { ok: false }>) {
  return { ok: false as const, error: resolved.error, candidates: resolved.candidates };
}

const writesDisabled = () => ({ ok: false as const, error: CALENDAR_WRITES_DISABLED_COPY });

/** An ISO date-time as an instant; no zone → local time in the org time zone. */
export function toInstant(value: string): Date {
  if (/(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new Error("INVALID");
    return date;
  }
  const [datePart, timePart = ""] = value.split("T");
  const [h, m] = timePart.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m) || h > 23 || m > 59) throw new Error("INVALID");
  return zonedTimeToUtc(datePart, h * 60 + m, TIME_ZONE);
}

function googleTime(instant: Date) {
  return { dateTime: instant.toISOString(), timeZone: TIME_ZONE };
}

export type AgendaPerson = { id: string; name: string; email: string | null; self: boolean };

type PeopleResult = { ok: true; people: AgendaPerson[] } | { ok: false; error: string; candidates?: string[] };

/**
 * Names → people. "yo" is the caller; anything with "@" is an outside
 * attendee by email (only when `allowEmails`); other names resolve against
 * the team (`fetchStaffAction`, viewer-scoped).
 */
async function resolvePeople(
  user: AuthenticatedUser,
  names: string[],
  options: { allowEmails?: boolean } = {},
): Promise<PeopleResult> {
  const people: AgendaPerson[] = [];
  let staffRows: Awaited<ReturnType<typeof fetchStaffAction>> | null = null;
  for (const raw of names) {
    const name = raw.trim();
    if (SELF_NAMES.has(name.toLowerCase())) {
      people.push({ id: user.member.id, name: user.member.name, email: user.email || null, self: true });
      continue;
    }
    if (name.includes("@")) {
      if (!options.allowEmails || !z.email().safeParse(name).success) {
        return { ok: false, error: `"${name}" no es una persona del equipo.` };
      }
      const email = name.toLowerCase();
      people.push({ id: "", name, email, self: email === user.email.toLowerCase() });
      continue;
    }
    staffRows ??= await fetchStaffAction();
    const resolved = byNameIlike(staffRows, name);
    if (!resolved.ok) return resolved;
    people.push({
      id: resolved.value.id,
      name: resolved.value.name,
      email: resolved.value.email,
      self: resolved.value.id === user.member.id,
    });
  }
  const seen = new Set<string>();
  return {
    ok: true,
    people: people.filter((p) => {
      const key = p.id || p.email || p.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  };
}

/** Attendee emails (the caller is the organizer, not an attendee); error when a team member has none. */
function attendeeEmails(people: AgendaPerson[]): { ok: true; emails: string[] } | { ok: false; error: string } {
  const missing = people.filter((p) => !p.email && !p.self);
  if (missing.length) {
    return { ok: false, error: `No tengo el correo de ${missing.map((p) => p.name).join(", ")}.` };
  }
  return { ok: true, emails: [...new Set(people.filter((p) => !p.self && p.email).map((p) => p.email as string))] };
}

function projectUrl(project: { id: string }): string {
  const path = `/proyectos/${project.id}`;
  const origin = getAppOrigin();
  return origin ? `${origin}${path}` : path;
}

const TASK_DATE_FIELDS = [
  { key: "commitmentDate", suffix: "c", label: "Compromiso" },
  { key: "reviewDate", suffix: "r", label: "Revisión" },
  { key: "deliveryDate", suffix: "e", label: "Entrega" },
] as const;

/** Task dates in `[from, to]` as all-day agenda items. */
export function taskAgendaItems(tasks: TaskListItem[], from: string, to: string): AgendaItem[] {
  const items: AgendaItem[] = [];
  for (const task of tasks) {
    const attendees = [task.manager?.name, ...task.support.map((s) => s.name)].filter((n): n is string => !!n);
    for (const field of TASK_DATE_FIELDS) {
      const date = task[field.key];
      if (!date || date < from || date > to) continue;
      items.push({
        id: `${field.suffix}-${task.id}-${date}`,
        title: `${field.label}: ${task.title}`,
        start: date,
        allDay: true,
        project: task.project.name,
        tramo: task.workflow?.key ?? null,
        attendees,
        href: `/tareas?tarea=${task.id}`,
      });
    }
  }
  return items;
}

/** The caller's Google events as agenda items (id prefixed with "g-"). */
export function googleAgendaItems(events: GoogleCalendarEvent[]): AgendaItem[] {
  return events.flatMap((event) => {
    const start = event.start?.dateTime ?? event.start?.date;
    if (!start) return [];
    const end = event.end?.dateTime ?? event.end?.date;
    const item: AgendaItem = {
      id: `g-${event.id}`,
      title: event.summary?.trim() || "(Sin título)",
      start,
      allDay: !event.start?.dateTime,
      attendees: (event.attendees ?? []).map((a) => a.displayName || a.email || "").filter(Boolean),
    };
    if (end) item.end = end;
    if (event.htmlLink) item.href = event.htmlLink;
    return [item];
  });
}

/** Admin tasks only for `canSeeAdminData` (BE §9.7); the reads already scope, this keeps it so. */
function visibleTasks(user: AuthenticatedUser, tasks: TaskListItem[]): TaskListItem[] {
  return canSeeAdminData(user) ? tasks : tasks.filter((t) => t.kind !== "admin");
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
}

function sortItems(items: AgendaItem[]): AgendaItem[] {
  return [...items].sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

/** `[from 00:00, to + 1 00:00)` of local dates as ISO instants. */
function rangeInstants(from: string, to: string) {
  return {
    timeMin: zonedTimeToUtc(from, 0, TIME_ZONE).toISOString(),
    timeMax: zonedTimeToUtc(addDaysToDate(to, 1), 0, TIME_ZONE).toISOString(),
  };
}

function validRange(from: string, to: string, maxDays: number): boolean {
  try {
    eachDate(from, to, maxDays);
    return true;
  } catch {
    return false;
  }
}

const rangeError = (maxDays: number) => ({
  ok: false as const,
  error: `El rango debe ir de la fecha inicial a la final y abarcar como máximo ${maxDays} días.`,
});

async function ensureOrganizer(staffId: string, eventId: string) {
  const event = await getPrimaryEvent(staffId, eventId);
  if (!event) return { ok: false as const, error: EVENT_GONE_COPY };
  if (event.organizer?.self !== true) return { ok: false as const, error: ORGANIZER_ONLY_COPY };
  return { ok: true as const, event };
}

function eventResult(event: GoogleCalendarEvent) {
  return {
    eventId: event.id,
    title: event.summary ?? null,
    start: event.start?.dateTime ?? event.start?.date ?? null,
    end: event.end?.dateTime ?? event.end?.date ?? null,
    link: event.htmlLink ?? null,
    attendees: (event.attendees ?? []).map((a) => a.email).filter((e): e is string => !!e),
  };
}

/** A `g-` prefixed agenda item id or a bare Google event id → the Google id. */
const googleEventId = (id: string) => id.replace(/^g-/, "");

// ── list_events ─────────────────────────────────────────────────────────────

export const list_events = defineTool({
  name: "list_events",
  description:
    "Agenda de un rango de fechas: fechas de compromiso, revisión y entrega de las tareas (de todos, de ciertas personas o de un proyecto) y, si el usuario conectó Google Calendar, sus propios eventos. " +
    `Si te piden crear, mover o cancelar un evento y no tienes una herramienta para hacerlo, responde «${CALENDAR_WRITES_DISABLED_COPY}» y ofrece create_reminder o create_task.`,
  schema: ListEventsSchema,
  capability: everyone,
  // fetchCalendarAction (tasks-actions) has no flags module: it is not a redesign stub.
  available: () => true,
  confirm: false,
  write: false,
  summarize: toolSummaries.list_events,
  async run({ user }, input) {
    if (!validRange(input.from, input.to, LIST_RANGE_DAYS)) return rangeError(LIST_RANGE_DAYS);
    try {
      let project: ProjectListItem | null = null;
      if (input.project) {
        const resolved = await resolveProject(input.project);
        if (!resolved.ok) return unresolved(resolved);
        project = resolved.value;
      }
      let people: AgendaPerson[] = [];
      if (input.people?.length) {
        const resolved = await resolvePeople(user, input.people);
        if (!resolved.ok) return resolved;
        people = resolved.people;
      }

      const filters: TaskFilters = { archived: false, ...(project ? { projectId: project.id } : {}) };
      const tasks = people.length
        ? (
            await Promise.all(
              people.map((p) => fetchCalendarAction(input.from, input.to, { ...filters, involvesStaffId: p.id })),
            )
          ).flat()
        : await fetchCalendarAction(input.from, input.to, filters);
      const items = taskAgendaItems(visibleTasks(user, dedupeById(tasks)), input.from, input.to);

      // Only the caller's own Google events, and only when the question is about them.
      const includeGoogle = !project && (people.length === 0 || people.some((p) => p.self));
      let google: { connected: boolean; included: boolean; error?: string } = { connected: false, included: false };
      if (includeGoogle) {
        const { timeMin, timeMax } = rangeInstants(input.from, input.to);
        const own = await listOwnGoogleEvents(user.member.id, timeMin, timeMax);
        items.push(...googleAgendaItems(own.events));
        google = { connected: own.connected, included: own.connected, ...(own.error ? { error: own.error } : {}) };
      }

      const sorted = sortItems(items);
      return {
        ok: true as const,
        from: input.from,
        to: input.to,
        project: project ? { id: project.id, name: project.name } : null,
        people: people.map((p) => p.name),
        items: sorted.slice(0, MAX_ITEMS),
        total: sorted.length,
        truncated: sorted.length > MAX_ITEMS,
        google,
        hint: "Para mostrarlo como agenda usa render_timeline con estos items.",
      };
    } catch (err) {
      return failure(err);
    }
  },
});

// ── find_free_slots ─────────────────────────────────────────────────────────

export const find_free_slots = defineTool({
  name: "find_free_slots",
  description:
    "Horarios libres en común para una o varias personas en un rango de fechas: la jornada laboral de Control de horario en los días laborables, sin los días con vacaciones aprobadas y sin los eventos ocupados del calendario de Google del propio usuario (el calendario de los demás no es visible).",
  schema: FindFreeSlotsSchema,
  capability: everyone,
  available: () => TIME_TRACKING.fetchTimeTrackingSettingsAction && VACATIONS.fetchTeamAbsencesAction,
  confirm: false,
  write: false,
  summarize: toolSummaries.find_free_slots,
  async run({ user }, input) {
    if (!validRange(input.from, input.to, SLOTS_RANGE_DAYS)) return rangeError(SLOTS_RANGE_DAYS);
    try {
      const resolved = await resolvePeople(user, input.people);
      if (!resolved.ok) return resolved;
      const people = resolved.people;
      const staffIds = people.map((p) => p.id).filter(Boolean);

      const settings = await fetchTimeTrackingSettingsAction();
      const absences = staffIds.length ? await approvedAbsences(db, { from: input.from, to: input.to, staffIds }) : [];

      const notes: string[] = [];
      let busy: { start: string; end: string }[] = [];
      if (people.some((p) => p.self)) {
        const { timeMin, timeMax } = rangeInstants(input.from, input.to);
        const own = await listOwnGoogleEvents(user.member.id, timeMin, timeMax);
        busy = busyIntervalsOf(own.events);
        if (!own.connected) notes.push("No conectaste Google Calendar: tus eventos no se descontaron.");
        if (own.error) notes.push(own.error);
      }
      if (people.some((p) => !p.self)) {
        notes.push(
          "La disponibilidad de los demás se basa en su jornada y sus vacaciones aprobadas; su calendario de Google no es visible.",
        );
      }

      const workingHoursOnly = input.workingHoursOnly ?? true;
      const result = findFreeSlots({
        from: input.from,
        to: input.to,
        durationMin: input.duration,
        workingHoursOnly,
        settings,
        timeZone: TIME_ZONE,
        staffIds,
        absences,
        busy,
        now: new Date(),
      });
      const nameOf = new Map(people.map((p) => [p.id, p.name]));

      return {
        ok: true as const,
        people: people.map((p) => p.name),
        duration: input.duration,
        jornada: workingHoursOnly
          ? { dayStart: settings.dayStart, dayEnd: settings.dayEnd, workDays: settings.workDays }
          : null,
        slots: result.slots.map((slot) => ({
          date: slot.date,
          from: localTimeOf(new Date(slot.start), TIME_ZONE),
          to: localTimeOf(new Date(slot.end), TIME_ZONE),
          start: slot.start,
          end: slot.end,
          minutes: slot.minutes,
        })),
        // Dates only: the absence kind stays private (BE §8.8).
        absentDays: result.absentDays.map((d) => ({
          date: d.date,
          people: d.staffIds.map((id) => nameOf.get(id) ?? id),
        })),
        truncated: result.truncated,
        notes,
      };
    } catch (err) {
      return failure(err);
    }
  },
});

// ── create_event (registered disabled) ──────────────────────────────────────

export const create_event = defineTool({
  name: "create_event",
  description:
    "Crea un evento en el calendario principal de Google del usuario e invita a las personas (les llega la invitación por correo). Confirma título, fecha, hora e invitados antes.",
  schema: CreateEventSchema,
  capability: everyone,
  available: eventWritesAvailable,
  confirm: true,
  write: true,
  summarize: toolSummaries.create_event,
  async run({ user }, input) {
    if (!calendarEventsGrantAvailable()) return writesDisabled();
    try {
      const start = toInstant(input.start);
      const end = toInstant(input.end);
      if (end <= start) return { ok: false as const, error: END_BEFORE_START_COPY };

      let project: ProjectListItem | null = null;
      if (input.project) {
        const resolved = await resolveProject(input.project);
        if (!resolved.ok) return unresolved(resolved);
        project = resolved.value;
      }
      const resolved = await resolvePeople(user, input.attendees, { allowEmails: true });
      if (!resolved.ok) return resolved;
      const emails = attendeeEmails(resolved.people);
      if (!emails.ok) return { ok: false as const, error: emails.error };

      const body: GoogleEventWrite = {
        summary: input.title,
        start: googleTime(start),
        end: googleTime(end),
        attendees: emails.emails.map((email) => ({ email })),
      };
      if (input.location) body.location = input.location;
      if (project) body.description = `Proyecto ${project.name}: ${projectUrl(project)}`;

      const event = await insertPrimaryEvent(user.member.id, body);
      if (project) {
        await recordViaAsistente({
          entity: "project",
          entityId: project.id,
          actorId: user.member.id,
          summary: summarizeCreateEvent(input),
        });
      }
      return { ok: true as const, ...eventResult(event), project: project ? { id: project.id, name: project.name } : null };
    } catch (err) {
      return failure(err);
    }
  },
});

// ── update_event (registered disabled) ──────────────────────────────────────

export const update_event = defineTool({
  name: "update_event",
  description:
    "Cambia título, horario, lugar o invitados de un evento que el usuario organizó en su calendario de Google (los invitados reciben el aviso). Usa el id que devolvió list_events o create_event.",
  schema: UpdateEventSchema,
  capability: everyone,
  available: eventWritesAvailable,
  confirm: true,
  write: true,
  summarize: toolSummaries.update_event,
  async run({ user }, input) {
    if (!calendarEventsGrantAvailable()) return writesDisabled();
    try {
      const eventId = googleEventId(input.eventId);
      const owned = await ensureOrganizer(user.member.id, eventId);
      if (!owned.ok) return owned;

      const patch: GoogleEventWrite = {};
      if (input.patch.title) patch.summary = input.patch.title;
      if (input.patch.location !== undefined) patch.location = input.patch.location;
      const start = input.patch.start ? toInstant(input.patch.start) : null;
      const end = input.patch.end ? toInstant(input.patch.end) : null;
      const nextStart = start ?? (owned.event.start?.dateTime ? new Date(owned.event.start.dateTime) : null);
      const nextEnd = end ?? (owned.event.end?.dateTime ? new Date(owned.event.end.dateTime) : null);
      if (nextStart && nextEnd && nextEnd <= nextStart) return { ok: false as const, error: END_BEFORE_START_COPY };
      if (start) patch.start = googleTime(start);
      if (end) patch.end = googleTime(end);
      if (input.patch.attendees) {
        const resolved = await resolvePeople(user, input.patch.attendees, { allowEmails: true });
        if (!resolved.ok) return resolved;
        const emails = attendeeEmails(resolved.people);
        if (!emails.ok) return { ok: false as const, error: emails.error };
        patch.attendees = emails.emails.map((email) => ({ email }));
      }

      const event = await patchPrimaryEvent(user.member.id, eventId, patch);
      return { ok: true as const, ...eventResult(event) };
    } catch (err) {
      return failure(err);
    }
  },
});

// ── cancel_event (registered disabled) ──────────────────────────────────────

export const cancel_event = defineTool({
  name: "cancel_event",
  description:
    "Cancela un evento que el usuario organizó en su calendario de Google y avisa a todos los invitados, opcionalmente con un mensaje.",
  schema: CancelEventSchema,
  capability: everyone,
  available: eventWritesAvailable,
  confirm: true,
  write: true,
  summarize: toolSummaries.cancel_event,
  async run({ user }, input) {
    if (!calendarEventsGrantAvailable()) return writesDisabled();
    try {
      const eventId = googleEventId(input.eventId);
      const owned = await ensureOrganizer(user.member.id, eventId);
      if (!owned.ok) return owned;
      if (input.message) {
        // The message travels in the description of the cancellation notice.
        const previous = owned.event.description?.trim();
        await patchPrimaryEvent(
          user.member.id,
          eventId,
          { description: previous ? `${input.message}\n\n${previous}` : input.message },
          "none",
        );
      }
      await deletePrimaryEvent(user.member.id, eventId);
      return { ok: true as const, eventId, title: owned.event.summary ?? null, cancelled: true };
    } catch (err) {
      return failure(err);
    }
  },
});

// ── schedule_site_visit (registered disabled) ───────────────────────────────

async function siteVisitWorkflowId(project: ProjectListItem): Promise<string | null> {
  if (project.currentWorkflow) return project.currentWorkflow.id;
  const workflows = await fetchWorkflowsAction();
  return workflows.find((w) => w.key === "construccion")?.id ?? null;
}

type ChecklistResult = { ok: true; items: string[] } | { ok: false; error: string; candidates?: string[] };

async function siteVisitChecklist(projectId: string, template: string | undefined): Promise<ChecklistResult> {
  if (!template) return { ok: true, items: [...DEFAULT_SITE_VISIT_CHECKLIST] };
  const tasks = await fetchTasksAction({ projectId, search: template, archived: false });
  const resolved = byNameIlike(
    tasks.map((t) => ({ id: t.id, name: t.title })),
    template,
  );
  if (!resolved.ok) return resolved;
  const detail = await fetchTaskAction(resolved.value.id);
  const items = (detail?.checklistItems ?? []).map((item) => item.title.trim()).filter(Boolean);
  if (items.length === 0) return { ok: false, error: `La tarea «${resolved.value.name}» no tiene checklist que copiar.` };
  return { ok: true, items };
}

export const schedule_site_visit = defineTool({
  name: "schedule_site_visit",
  description: `Programa una visita de obra: crea el evento en el calendario de Google del usuario con las personas que van (${SITE_VISIT_MINUTES / 60} h) y una tarea en el proyecto con el checklist de la visita (el de otra tarea del proyecto si se indica checklistTemplate).`,
  schema: ScheduleSiteVisitSchema,
  capability: isAgendaLead,
  available: eventWritesAvailable,
  confirm: true,
  write: true,
  summarize: toolSummaries.schedule_site_visit,
  async run({ user }, input) {
    if (!calendarEventsGrantAvailable()) return writesDisabled();
    try {
      const projectResolved = await resolveProject(input.project);
      if (!projectResolved.ok) return unresolved(projectResolved);
      const project = projectResolved.value;

      const resolved = await resolvePeople(user, input.people);
      if (!resolved.ok) return resolved;
      const people = resolved.people.filter((p) => p.id);
      const emails = attendeeEmails(people);
      if (!emails.ok) return { ok: false as const, error: emails.error };

      const workflowId = await siteVisitWorkflowId(project);
      if (!workflowId) {
        return { ok: false as const, error: `El proyecto «${project.name}» no tiene un tramo para la tarea de la visita.` };
      }
      const checklist = await siteVisitChecklist(project.id, input.checklistTemplate);
      if (!checklist.ok) return checklist;

      const start = toInstant(input.date);
      const end = new Date(start.getTime() + SITE_VISIT_MINUTES * 60_000);
      const localDate = localDateOf(start, TIME_ZONE);

      const event = await insertPrimaryEvent(user.member.id, {
        summary: `Visita de obra: ${project.name}`,
        start: googleTime(start),
        end: googleTime(end),
        attendees: emails.emails.map((email) => ({ email })),
        description: `Proyecto ${project.name}: ${projectUrl(project)}\n\nChecklist:\n${checklist.items.map((i) => `- ${i}`).join("\n")}`,
      });

      let task;
      try {
        task = unwrapActionResult(
          await createUserTaskAction({
            projectId: project.id,
            title: `Visita de obra ${localDate} ${localTimeOf(start, TIME_ZONE)}`,
            notes: event.htmlLink ? `Evento de calendario: ${event.htmlLink}` : null,
            workflowId,
            managerId: people[0]?.id ?? null,
            supportIds: people.slice(1).map((p) => p.id),
            commitmentDate: localDate,
          }),
        );
      } catch (err) {
        // No task, no invitation: nothing is left half done.
        await deletePrimaryEvent(user.member.id, event.id).catch(() => undefined);
        throw err;
      }
      for (const item of checklist.items) {
        unwrapActionResult(await addChecklistItemAction(task.id, item));
      }

      const summary = summarizeScheduleSiteVisit(input);
      await recordViaAsistente({ entity: "task", entityId: task.id, actorId: user.member.id, summary });
      await recordViaAsistente({ entity: "project", entityId: project.id, actorId: user.member.id, summary });

      return {
        ok: true as const,
        ...eventResult(event),
        task: { id: task.id, title: task.title, href: `/tareas?tarea=${task.id}`, checklist: checklist.items },
        project: { id: project.id, name: project.name },
      };
    } catch (err) {
      return failure(err);
    }
  },
});

export const tools: DefinedTool[] = [
  list_events,
  find_free_slots,
  create_event,
  update_event,
  cancel_event,
  schedule_site_visit,
];
