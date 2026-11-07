/**
 * Approval summaries (redesign BE §8.10, §10.1; review R2-3): tool name →
 * `summarize(input)`, the same pure functions `defineTool` registers.
 * Client-safe (no server imports); `ConfirmationCard` renders from it.
 *
 * Each tool group adds its summaries here and its tool definitions take them
 * with `summaryOf(name)`, so the server registration and the client card
 * always share one function per tool.
 */

import { extractTaskTitles } from "@/lib/assistant/notes-to-tasks";

export type ToolSummary = (input: unknown) => string;

/** Filled by the tool domain files' summaries. */
export const toolSummaries: Record<string, ToolSummary> = {};

/**
 * The registered summary of a tool, for its `defineTool({ summarize })`.
 * Throws when the tool has no entry in `toolSummaries`, so a tool can't be
 * registered with a summary the client doesn't know.
 */
export function summaryOf<I = unknown>(toolName: string): (input: I) => string {
  const summarize = toolSummaries[toolName];
  if (!summarize) throw new Error(`NOT_FOUND: no summary for assistant tool "${toolName}"`);
  return summarize as (input: I) => string;
}

/**
 * The summary line for an approval card; falls back to the tool name when
 * the tool has no summary or the input doesn't fit it.
 */
export function summarizeToolCall(toolName: string, input: unknown): string {
  const summarize = toolSummaries[toolName];
  if (!summarize) return toolName;
  try {
    const line = summarize(input);
    return typeof line === "string" && line.trim() ? line : toolName;
  } catch {
    return toolName;
  }
}

// ── Consulta y búsqueda (4) and Tareas (6) (BE §10.3) ───────────────────────

function field(input: unknown, key: string): unknown {
  return input && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
}

function text(input: unknown, key: string): string {
  const value = field(input, key);
  return typeof value === "string" ? value.trim() : "";
}

function quoted(value: string, max = 80): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return `«${clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean}»`;
}

const BASE_STATUS_LABELS: Record<string, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  completado: "Completado",
  bloqueado: "Bloqueado",
};

/** A base status key as its label; a custom status name as typed. */
export function taskStatusLabel(status: string): string {
  return BASE_STATUS_LABELS[status.trim().toLowerCase()] ?? status.trim();
}

/** `YYYY-MM-DD` as "20 nov 2026"; anything else as typed. */
export function formatDueDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return value.trim();
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(date)
    .replace(/\./g, "");
}

const DUE_LABELS: Record<string, string> = { hoy: "para hoy", semana: "de esta semana", vencidas: "vencidas" };

export function summarizeSearchWorkspace(input: unknown): string {
  const query = text(input, "query");
  return query ? `Buscar ${quoted(query)} en Cincel` : "Buscar en Cincel";
}

export function summarizeGetProject(input: unknown): string {
  const project = text(input, "project");
  return project ? `Ver el proyecto ${quoted(project)}` : "Ver el proyecto actual";
}

export function summarizeGetTask(input: unknown): string {
  const title = text(input, "title");
  const project = text(input, "project");
  if (title) return `Ver la tarea ${quoted(title)}${project ? ` de ${quoted(project)}` : ""}`;
  return "Ver la tarea";
}

export function summarizeListMyTasks(input: unknown): string {
  const due = DUE_LABELS[text(input, "due")];
  return due ? `Ver mis tareas ${due}` : "Ver mis tareas";
}

export function summarizeUpdateTaskStatus(input: unknown): string {
  const status = text(input, "status");
  const note = text(input, "note");
  const base = status ? `Cambiar el estatus de la tarea a ${quoted(taskStatusLabel(status))}` : "Cambiar el estatus de la tarea";
  return note ? `${base}: ${note}` : base;
}

export function summarizeRescheduleTask(input: unknown): string {
  const dueDate = text(input, "dueDate");
  const reason = text(input, "reason");
  const base = dueDate ? `Mover la entrega de la tarea al ${formatDueDate(dueDate)}` : "Mover la entrega de la tarea";
  return reason ? `${base}: ${reason}` : base;
}

export function summarizeAddTaskComment(input: unknown): string {
  const comment = text(input, "text");
  const mentions = field(input, "mentions");
  const names = Array.isArray(mentions) ? mentions.filter((m): m is string => typeof m === "string" && !!m.trim()) : [];
  const base = comment ? `Comentar en la tarea: ${quoted(comment, 120)}` : "Comentar en la tarea";
  return names.length ? `${base} (menciona a ${names.join(", ")})` : base;
}

export function summarizeAddChecklistItem(input: unknown): string {
  const item = text(input, "item");
  const done = field(input, "done") === true;
  const base = item ? `Agregar ${quoted(item)} al checklist de la tarea` : "Agregar un punto al checklist de la tarea";
  return done ? `${base}, ya marcado como hecho` : base;
}

export function summarizeCreateTasksFromNotes(input: unknown): string {
  const project = text(input, "project");
  const where = project ? ` en ${quoted(project)}` : " en el proyecto actual";
  const notes = text(input, "text");
  if (notes) {
    const count = extractTaskTitles(notes).length;
    return `Crear ${count} ${count === 1 ? "tarea" : "tareas"}${where} a partir de las notas`;
  }
  if (text(input, "emailThreadId")) return `Crear tareas${where} a partir de un correo`;
  return `Crear tareas${where}`;
}

export function summarizeRebalanceWorkload(input: unknown): string {
  const tramo = text(input, "tramo");
  const max = field(input, "maxPerPerson");
  const scope = tramo ? ` de ${quoted(tramo)}` : "";
  const limit = typeof max === "number" && Number.isFinite(max) ? ` (máximo ${max} por persona)` : " según la capacidad de cada persona";
  return `Repartir las tareas abiertas${scope}${limit}`;
}

Object.assign(toolSummaries, {
  search_workspace: summarizeSearchWorkspace,
  get_project: summarizeGetProject,
  get_task: summarizeGetTask,
  list_my_tasks: summarizeListMyTasks,
  update_task_status: summarizeUpdateTaskStatus,
  reschedule_task: summarizeRescheduleTask,
  add_task_comment: summarizeAddTaskComment,
  add_checklist_item: summarizeAddChecklistItem,
  create_tasks_from_notes: summarizeCreateTasksFromNotes,
  rebalance_workload: summarizeRebalanceWorkload,
} satisfies Record<string, ToolSummary>);

// ── Notificaciones y recordatorios (7) (BE §10.3) ───────────────────────────

const NOTIFICATION_KIND_LABELS: Record<string, string> = {
  asignacion: "asignaciones",
  mencion: "menciones",
  vencimiento: "vencimientos",
  comentario: "comentarios",
  aprobacion_cliente: "aprobaciones del cliente",
  recordatorio: "recordatorios",
  sistema: "avisos del sistema",
};

function stringList(input: unknown, key: string): string[] {
  const value = field(input, key);
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && !!v.trim()).map((v) => v.trim()) : [];
}

export function summarizeListNotifications(input: unknown): string {
  const kinds = stringList(input, "types").map((kind) => NOTIFICATION_KIND_LABELS[kind] ?? kind);
  const base = field(input, "unreadOnly") === true ? "Ver mis notificaciones sin leer" : "Ver mis notificaciones";
  return kinds.length ? `${base} (${kinds.join(", ")})` : base;
}

export function summarizeMarkNotificationsRead(input: unknown): string {
  if (field(input, "all") === true) return "Marcar todas mis notificaciones como leídas";
  const count = stringList(input, "ids").length;
  return count === 1 ? "Marcar 1 notificación como leída" : `Marcar ${count} notificaciones como leídas`;
}

const REPEAT_LABELS: Record<string, string> = { daily: "cada día", weekly: "cada semana", monthly: "cada mes" };

export function summarizeCreateReminder(input: unknown): string {
  const what = text(input, "text");
  const when = text(input, "when");
  const repeat = REPEAT_LABELS[text(input, "repeat")];
  let line = what ? `Crear el recordatorio ${quoted(what)}` : "Crear un recordatorio";
  if (when) line += ` para ${when}`;
  if (repeat) line += `, ${repeat}`;
  return line;
}

export function summarizeListReminders(input: unknown): string {
  void input;
  return "Ver mis recordatorios";
}

export function summarizeCancelReminder(input: unknown): string {
  const until = text(input, "snoozeUntil");
  return until ? `Posponer el recordatorio hasta ${until}` : "Cancelar el recordatorio";
}

export function summarizeNotifyPeople(input: unknown): string {
  const people = stringList(input, "people");
  const message = text(input, "text");
  const who = people.length ? people.join(", ") : "el equipo";
  const urgent = text(input, "urgency") === "alta" ? " (urgente)" : "";
  return message ? `Notificar a ${who}${urgent}: ${quoted(message, 120)}` : `Notificar a ${who}${urgent}`;
}

export function summarizeScheduleDigest(input: unknown): string {
  const time = text(input, "time");
  return time ? `Activar mi resumen diario a las ${time}` : "Activar mi resumen diario";
}

Object.assign(toolSummaries, {
  list_notifications: summarizeListNotifications,
  mark_notifications_read: summarizeMarkNotificationsRead,
  create_reminder: summarizeCreateReminder,
  list_reminders: summarizeListReminders,
  cancel_reminder: summarizeCancelReminder,
  notify_people: summarizeNotifyPeople,
  schedule_digest: summarizeScheduleDigest,
} satisfies Record<string, ToolSummary>);

// ── Agenda y calendario (6) (BE §10.3) ──────────────────────────────────────

const AGENDA_TIME_ZONE = "America/Mexico_City";
const LOCAL_DATE_TIME_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/;

function agendaNames(input: unknown, key: string): string[] {
  const value = field(input, key);
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && !!v.trim()).map((v) => v.trim()) : [];
}

function withPeople(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length <= 3) return ` con ${names.join(", ")}`;
  return ` con ${names.slice(0, 3).join(", ")} y ${names.length - 3} más`;
}

/** An ISO date-time as "12 nov 2026, 10:00" (org time zone; no zone = already local). */
export function formatEventDateTime(value: string): string {
  const clean = value.trim();
  const local = LOCAL_DATE_TIME_RE.exec(clean);
  if (local) return `${formatDueDate(`${local[1]}-${local[2]}-${local[3]}`)}, ${local[4]}:${local[5]}`;
  const date = new Date(clean);
  if (!clean || Number.isNaN(date.getTime())) return clean;
  const day = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric", timeZone: AGENDA_TIME_ZONE })
    .format(date)
    .replace(/\./g, "");
  const time = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: AGENDA_TIME_ZONE }).format(date);
  return `${day}, ${time}`;
}

function agendaRange(input: unknown): string {
  const from = text(input, "from");
  const to = text(input, "to");
  if (from && to) return from === to ? ` del ${formatDueDate(from)}` : ` del ${formatDueDate(from)} al ${formatDueDate(to)}`;
  return "";
}

export function summarizeListEvents(input: unknown): string {
  const project = text(input, "project");
  const people = agendaNames(input, "people");
  const scope = project ? ` de ${quoted(project)}` : "";
  const who = people.length ? ` de ${people.join(", ")}` : "";
  return `Ver la agenda${scope}${who}${agendaRange(input)}`;
}

export function summarizeFindFreeSlots(input: unknown): string {
  const duration = field(input, "duration");
  const minutes = typeof duration === "number" && Number.isFinite(duration) ? ` de ${duration} min` : "";
  const people = agendaNames(input, "people");
  const whom = people.length ? ` para ${people.join(", ")}` : "";
  return `Buscar horarios libres${minutes}${whom}${agendaRange(input)}`;
}

export function summarizeCreateEvent(input: unknown): string {
  const title = text(input, "title");
  const start = text(input, "start");
  const project = text(input, "project");
  const base = title ? `Crear el evento ${quoted(title)}` : "Crear un evento";
  const when = start ? ` el ${formatEventDateTime(start)}` : "";
  const where = project ? ` en ${quoted(project)}` : "";
  return `${base}${when}${withPeople(agendaNames(input, "attendees"))}${where} y enviar las invitaciones`;
}

export function summarizeUpdateEvent(input: unknown): string {
  const patch = field(input, "patch");
  const title = text(patch, "title");
  const start = text(patch, "start");
  const changes: string[] = [];
  if (title) changes.push(`título ${quoted(title)}`);
  if (start) changes.push(`inicio ${formatEventDateTime(start)}`);
  if (text(patch, "end")) changes.push(`fin ${formatEventDateTime(text(patch, "end"))}`);
  if (text(patch, "location")) changes.push(`lugar ${quoted(text(patch, "location"))}`);
  const attendees = agendaNames(patch, "attendees");
  if (attendees.length) changes.push(`invitados ${attendees.join(", ")}`);
  return changes.length ? `Modificar el evento (${changes.join("; ")}) y avisar a los invitados` : "Modificar el evento y avisar a los invitados";
}

export function summarizeCancelEvent(input: unknown): string {
  const message = text(input, "message");
  return message ? `Cancelar el evento y avisar a los invitados: ${quoted(message, 120)}` : "Cancelar el evento y avisar a los invitados";
}

export function summarizeScheduleSiteVisit(input: unknown): string {
  const project = text(input, "project");
  const date = text(input, "date");
  const template = text(input, "checklistTemplate");
  const base = project ? `Programar una visita de obra a ${quoted(project)}` : "Programar una visita de obra";
  const when = date ? ` el ${formatEventDateTime(date)}` : "";
  const checklist = template ? ` con el checklist de ${quoted(template)}` : " con su checklist";
  return `${base}${when}${withPeople(agendaNames(input, "people"))}: evento en el calendario y tarea${checklist}`;
}

Object.assign(toolSummaries, {
  list_events: summarizeListEvents,
  find_free_slots: summarizeFindFreeSlots,
  create_event: summarizeCreateEvent,
  update_event: summarizeUpdateEvent,
  cancel_event: summarizeCancelEvent,
  schedule_site_visit: summarizeScheduleSiteVisit,
} satisfies Record<string, ToolSummary>);
