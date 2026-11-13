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
 * - `create_event`, `update_event` and `cancel_event` only create a proposal
 *   (Calendario BE §11.2, ADR 0007): nothing changes until the person applies
 *   it, and they work without the Google grant. `schedule_site_visit` still
 *   writes to the caller's primary Google calendar (it needs the
 *   `calendar.events` grant and is registered disabled without it).
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
  createSubtaskAction,
  createUserTaskAction,
  fetchCalendarAction,
  listSubtasksAction,
} from "@/lib/actions/tasks-actions";
import { fetchTimeTrackingSettingsAction } from "@/lib/actions/time-tracking-actions";
import { IMPLEMENTED as TIME_TRACKING } from "@/lib/actions/time-tracking-actions.flags";
import { IMPLEMENTED as VACATIONS } from "@/lib/actions/vacations-actions.flags";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import { listViewerProjects, listViewerTasks } from "@/lib/assistant/reads";
import {
  addDaysToDate,
  eachDate,
  findFreeSlots,
  localDateOf,
  localTimeOf,
  zonedTimeToUtc,
} from "@/lib/assistant/agenda/free-slots";
import {
  calendarEventsGrantAvailable,
  CalendarScopeMissingError,
  deletePrimaryEvent,
  insertPrimaryEvent,
  type GoogleCalendarEvent,
} from "@/lib/assistant/agenda/google-calendar";
import { defineTool, type DefinedTool } from "@/lib/assistant/define-tool";
import { byNameIlike, resolveProject, type Resolved } from "@/lib/assistant/resolvers";
import { summarizeScheduleSiteVisit, toolSummaries } from "@/lib/assistant/tool-summaries";
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
import { resolveCalendarCapabilities } from "@/lib/auth/permissions";
import { freeBusy } from "@/lib/google/calendar-events-sync";
import { createEvent, getEventItem, setGoogleSyncState } from "@/lib/repositories/calendar-events-repository";
import { busyWindowsOf, listEventItemsForTools } from "@/lib/repositories/calendario-events-range";
import type { CalEventItem } from "@/lib/types/calendario";
import { defaultMeetingEnd } from "@/lib/calendario/propose-context";
import {
  defaultAttendees,
  googleConnected,
  meetingIdOf,
  proposalResult,
  proposeCancelEvent,
  proposeCreateEvent,
  proposeUpdateEvent,
} from "@/lib/calendario/propose";
import type { MeetingDraft, MeetingPatch } from "@/lib/types/calendario";

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
const EventIdSchema = z.string().trim().min(1).max(1024).describe("Id de la reunión (el que devuelve list_events)");

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
  end: DateTimeSchema.optional().describe("Fin; sin él la reunión dura 60 minutos"),
  attendees: PeopleSchema.default([]).describe("Nombres de personas del equipo o correos; vacío usa los invitados por defecto del proyecto"),
  project: ProjectNameSchema.optional(),
  projectId: z.uuid().optional().describe("Id del proyecto, si ya se conoce"),
  location: z.string().trim().max(300).optional(),
  meet: z.boolean().optional().describe("Enlace de Meet (por defecto sí, si Google está conectado)"),
  inviteProjectTeam: z.boolean().optional().describe("Además de los invitados dados, invitar al equipo del proyecto"),
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
    .describe("Título de una tarea del proyecto cuyas subtareas se copian"),
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

function taskUrl(taskId: string): string {
  const path = `/tareas?tarea=${taskId}`;
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

/** Meetings of `calendar_events` as agenda items (id prefixed with "e-"), linked to the Calendario. */
export function eventAgendaItems(events: CalEventItem[]): AgendaItem[] {
  return events.map((event) => {
    const item: AgendaItem = {
      id: `e-${event.eventId}`,
      title: event.title,
      start: event.start,
      end: event.end,
      allDay: event.allDay,
      attendees: event.attendees.map((a) => a.name).filter(Boolean),
      href: `/calendario?vista=dia&fecha=${event.date}&evento=${event.id}`,
    };
    if (event.project) item.project = event.project.name;
    if (event.tramo?.key) item.tramo = event.tramo.key as AgendaItem["tramo"];
    if (event.meetUrl) item.meetUrl = event.meetUrl;
    return item;
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


// ── list_events ─────────────────────────────────────────────────────────────

export const list_events = defineTool({
  name: "list_events",
  description:
    "Agenda de un rango de fechas: fechas de compromiso, revisión y entrega de las tareas (de todos, de ciertas personas o de un proyecto) y las reuniones del calendario de Cincel (las que organiza o a las que asiste el usuario y sus eventos de Google ya sincronizados; las de otras personas solo si puede ver el calendario del equipo). " +
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

      // Meetings come from calendar_events, the same rows the Calendario shows (never live Google).
      const canViewTeam = resolveCalendarCapabilities(user).canViewTeamCalendar;
      const meetings = await listEventItemsForTools(
        user,
        { from: input.from, to: input.to },
        { canViewTeam, project: project?.id ?? null, staffIds: people.map((p) => p.id).filter(Boolean) },
      );
      items.push(...eventAgendaItems(meetings));
      const google = {
        included: meetings.some((m) => m.source === "google"),
        syncedAt: meetings.map((m) => m.syncedAt).filter((v): v is string => !!v).sort().at(-1) ?? null,
      };

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
    "Horarios libres en común para una o varias personas en un rango de fechas: la jornada laboral de Control de horario en los días laborables, sin los días con vacaciones aprobadas y sin las reuniones del calendario de Cincel ni los eventos ocupados del propio usuario; la ocupación de los demás se consulta en Google (libre/ocupado) cuando hay permiso y, si no, solo con sus reuniones de Cincel.",
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
      const { timeMin, timeMax } = rangeInstants(input.from, input.to);
      const includesSelf = people.some((p) => p.self);
      // Cincel meetings of everyone named, plus the caller's own cached Google events.
      const busy: { start: string; end: string }[] = await busyWindowsOf(user.member.id, staffIds, { timeMin, timeMax }, {
        includeOwnGoogle: includesSelf,
      });

      // Other people: free/busy from Google whenever the caller has the grant; else Cincel data only.
      const others = people.filter((p) => !p.self);
      if (others.length > 0) {
        const withEmail = others.filter((p) => p.email);
        let unknown = others.length - withEmail.length;
        if (withEmail.length > 0) {
          try {
            const fb = await freeBusy(user.member.id, withEmail.map((p) => p.email as string), timeMin, timeMax);
            const unseen = new Set(fb.unknown.map((e) => e.toLowerCase()));
            for (const p of withEmail) {
              const email = (p.email as string).toLowerCase();
              if (unseen.has(email)) {
                unknown += 1;
                continue;
              }
              busy.push(...(fb.busy[p.email as string] ?? fb.busy[email] ?? []));
            }
          } catch {
            unknown += withEmail.length;
          }
        }
        if (unknown > 0) notes.push(`No pude ver la agenda de ${unknown} persona(s).`);
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

// ── create_event / update_event / cancel_event (proposals) ──────────────────
//
// These three no longer write: each creates a proposal (ADR 0007) that the
// person applies or cancels, so they do not depend on the Google grant (a
// Cincel-only meeting works) and need no approval card of their own.

/** Meeting attendees from resolved people: staff keep their id, outside guests only an email. */
function draftAttendees(people: AgendaPerson[], organizerId: string): MeetingDraft["attendees"] {
  const out: MeetingDraft["attendees"] = [];
  for (const person of people) {
    if (person.self || person.id === organizerId || !person.email) continue;
    out.push(person.id ? { staffId: person.id, email: person.email, name: person.name } : { email: person.email, name: person.email });
  }
  return out;
}

function mergeAttendees(...lists: MeetingDraft["attendees"][]): MeetingDraft["attendees"] {
  const seen = new Set<string>();
  const out: MeetingDraft["attendees"] = [];
  for (const list of lists) {
    for (const attendee of list) {
      const key = attendee.email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(attendee);
    }
  }
  return out;
}

function notFound(message: string) {
  return { ok: false as const, error: "NOT_FOUND", message };
}

export const create_event = defineTool({
  name: "create_event",
  description:
    "Propone una reunión nueva en el calendario (no la crea hasta que la persona aplique la propuesta). Dura 60 minutos si no se indica el fin. Con un proyecto y sin invitados, invita a su responsable, su coordinación y al cliente si tiene correo; con Google conectado lleva enlace de Meet. Las horas sin zona son de Ciudad de México.",
  schema: CreateEventSchema,
  capability: everyone,
  available: () => true,
  confirm: false,
  write: false,
  summarize: toolSummaries.create_event,
  async run(ctx, input) {
    const { user } = ctx;
    try {
      const start = toInstant(input.start);
      const end = input.end ? toInstant(input.end) : defaultMeetingEnd(start);
      if (end <= start) return { ok: false as const, error: "INVALID", message: END_BEFORE_START_COPY };

      let project: Pick<ProjectListItem, "id" | "name" | "manager" | "coordinator" | "clientId"> | null = null;
      if (input.projectId) {
        const found = (await listViewerProjects()).find((p) => p.id === input.projectId);
        if (!found) return notFound("No encontré ese proyecto o no tienes acceso a él.");
        project = found;
      } else if (input.project) {
        const resolved = await resolveProject(input.project);
        if (!resolved.ok) return unresolved(resolved);
        project = resolved.value;
      }

      const resolved = await resolvePeople(user, input.attendees, { allowEmails: true });
      if (!resolved.ok) return { ok: false as const, error: "INVALID", message: resolved.error };
      const missing = resolved.people.find((p) => !p.self && !p.email);
      if (missing) return { ok: false as const, error: "INVALID", message: `${missing.name} no tiene correo registrado.` };
      const named = draftAttendees(resolved.people, user.member.id);
      const defaults =
        project && (input.inviteProjectTeam || named.length === 0)
          ? (await defaultAttendees(user, project)).attendees
          : [];
      const attendees = mergeAttendees(named, defaults);

      const meet = (input.meet ?? true) && (await googleConnected(user.member.id));
      const draft: MeetingDraft = {
        title: input.title,
        start: start.toISOString(),
        end: end.toISOString(),
        projectId: project?.id ?? null,
        location: input.location ?? null,
        meet,
        attendees,
        ...(project ? { description: `Proyecto ${project.name}: ${projectUrl(project)}` } : {}),
      };
      const proposal = await proposeCreateEvent({ user, threadId: ctx.threadId }, draft, {
        names: attendees.filter((a) => !a.contactId).map((a) => a.name),
        withClient: attendees.some((a) => a.contactId),
      });
      return proposalResult(proposal);
    } catch (err) {
      return failure(err);
    }
  },
});

/** The meeting the caller organizes, or the failure to return. */
async function organizedMeeting(user: AuthenticatedUser, eventId: string) {
  const id = meetingIdOf(eventId);
  const item = id ? await getEventItem(user, id) : null;
  if (!item) return { ok: false as const, failed: notFound(EVENT_GONE_COPY) };
  if (item.organizer?.id !== user.member.id) {
    return { ok: false as const, failed: { ok: false as const, error: "NOT_ORGANIZER", message: ORGANIZER_ONLY_COPY } };
  }
  return { ok: true as const, item };
}

export const update_event = defineTool({
  name: "update_event",
  description:
    "Propone cambiar título, horario, lugar o invitados de una reunión que el usuario organiza (no la cambia hasta que la persona aplique la propuesta). Usa el id que devolvió list_events.",
  schema: UpdateEventSchema,
  capability: everyone,
  available: () => true,
  confirm: false,
  write: false,
  summarize: toolSummaries.update_event,
  async run(ctx, input) {
    const { user } = ctx;
    try {
      const owned = await organizedMeeting(user, input.eventId);
      if (!owned.ok) return owned.failed;

      const patch: MeetingPatch = {};
      if (input.patch.title) patch.title = input.patch.title;
      if (input.patch.location !== undefined) patch.location = input.patch.location;
      if (input.patch.start) patch.start = toInstant(input.patch.start).toISOString();
      if (input.patch.end) patch.end = toInstant(input.patch.end).toISOString();
      const nextStart = Date.parse(patch.start ?? owned.item.start);
      // A new start alone moves the meeting: the length stays.
      const length = Date.parse(owned.item.end) - Date.parse(owned.item.start);
      const nextEnd = patch.end ? Date.parse(patch.end) : patch.start ? nextStart + length : Date.parse(owned.item.end);
      if (nextEnd <= nextStart) return { ok: false as const, error: "INVALID", message: END_BEFORE_START_COPY };
      if (input.patch.attendees) {
        const resolved = await resolvePeople(user, input.patch.attendees, { allowEmails: true });
        if (!resolved.ok) return { ok: false as const, error: "INVALID", message: resolved.error };
        const missing = resolved.people.find((p) => !p.self && !p.email);
        if (missing) return { ok: false as const, error: "INVALID", message: `${missing.name} no tiene correo registrado.` };
        patch.attendees = draftAttendees(resolved.people, user.member.id);
      }
      return proposalResult(await proposeUpdateEvent({ user, threadId: ctx.threadId }, owned.item, patch));
    } catch (err) {
      return failure(err);
    }
  },
});

export const cancel_event = defineTool({
  name: "cancel_event",
  description:
    "Propone cancelar una reunión que el usuario organiza y avisar a los invitados (no la cancela hasta que la persona aplique la propuesta).",
  schema: CancelEventSchema,
  capability: everyone,
  available: () => true,
  confirm: false,
  write: false,
  summarize: toolSummaries.cancel_event,
  async run(ctx, input) {
    try {
      const owned = await organizedMeeting(ctx.user, input.eventId);
      if (!owned.ok) return owned.failed;
      return proposalResult(await proposeCancelEvent({ user: ctx.user, threadId: ctx.threadId }, owned.item));
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
  const tasks = await listViewerTasks({ projectId, search: template, archived: false });
  const resolved = byNameIlike(
    tasks.map((t) => ({ id: t.id, name: t.title })),
    template,
  );
  if (!resolved.ok) return resolved;
  const subtasks = await listSubtasksAction(resolved.value.id);
  const items = subtasks.map((s) => s.title.trim()).filter(Boolean);
  if (items.length === 0) return { ok: false, error: `La tarea «${resolved.value.name}» no tiene subtareas que copiar.` };
  return { ok: true, items };
}

export const schedule_site_visit = defineTool({
  name: "schedule_site_visit",
  description: `Programa una visita de obra: crea el evento en el calendario de Google del usuario con las personas que van (${SITE_VISIT_MINUTES / 60} h) y una tarea en el proyecto con el checklist de la visita como subtareas (las subtareas de otra tarea del proyecto si se indica checklistTemplate).`,
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
        return { ok: false as const, error: `El proyecto «${project.name}» no tiene una etapa para la tarea de la visita.` };
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
        unwrapActionResult(await createSubtaskAction(task.id, { title: item }));
      }

      // The Cincel meeting that shows on the Calendario, pointing at the Google event and the task.
      let meeting: { eventId: string; href: string } | null = null;
      let meetingError: string | null = null;
      try {
        const row = await createEvent(
          user,
          {
            title: `Visita de obra: ${project.name}`,
            start: start.toISOString(),
            end: end.toISOString(),
            projectId: project.id,
            location: null,
            meet: false,
            attendees: people.map((p) => ({ staffId: p.id, email: p.email ?? "", name: p.name })).filter((p) => p.email),
            description: `Tarea: ${taskUrl(task.id)}`,
          },
          { invitesVia: "google" },
        );
        await setGoogleSyncState(row.eventId, { googleEventId: event.id, htmlLink: event.htmlLink ?? null, error: null });
        meeting = { eventId: row.eventId, href: `/calendario?vista=dia&fecha=${localDate}&evento=${row.id}` };
      } catch (err) {
        meetingError = actionErrorText(err);
      }

      const summary = summarizeScheduleSiteVisit(input);
      await recordViaAsistente({ entity: "task", entityId: task.id, actorId: user.member.id, summary });
      await recordViaAsistente({ entity: "project", entityId: project.id, actorId: user.member.id, summary });

      return {
        ok: true as const,
        ...eventResult(event),
        task: { id: task.id, title: task.title, href: `/tareas?tarea=${task.id}`, checklist: checklist.items },
        meeting,
        ...(meetingError ? { meetingError } : {}),
        href: meeting?.href ?? `/calendario?vista=dia&fecha=${localDate}`,
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
