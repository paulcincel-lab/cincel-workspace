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

// ── Mi espacio y jornada (BE §10.3) ─────────────────────────────────────────

function curlyQuoted(text: string | undefined, max = 60): string {
  const t = (text ?? "").trim().replace(/\s+/g, " ");
  return t.length > max ? `“${t.slice(0, max - 1)}…”` : `“${t}”`;
}

export function summarizeCreateNote(input: { title?: string; body?: string; noteId?: string; append?: string }): string {
  if (input?.noteId) return `Agregar a una nota: ${curlyQuoted(input.append)}`;
  return input?.title?.trim() ? `Crear la nota ${curlyQuoted(input.title)}` : `Crear una nota: ${curlyQuoted(input?.body)}`;
}

export function summarizeCreateChecklist(input: { title?: string; items?: string[] }): string {
  const n = input?.items?.length ?? 0;
  return `Crear el checklist ${curlyQuoted(input?.title)} con ${n} ${n === 1 ? "elemento" : "elementos"}`;
}

export function summarizeClockIn(input?: unknown): string {
  void input;
  return "Registrar tu entrada";
}

export function summarizePauseOrClockOut(input: { action?: "pausa" | "salida" }): string {
  return input?.action === "salida" ? "Registrar tu salida" : "Pausar tu jornada";
}

export function summarizeGetMyHours(input: { range?: "hoy" | "semana" }): string {
  return input?.range === "semana" ? "Consultar tus horas de la semana" : "Consultar tus horas de hoy";
}

export function summarizeTeamHoursReport(input: { weekStart?: string; people?: string[] }): string {
  const week = input?.weekStart ? `de la semana del ${input.weekStart}` : "de esta semana";
  const people = input?.people?.length ? ` (${input.people.join(", ")})` : "";
  return `Reporte de horas del equipo ${week}${people}`;
}

Object.assign(toolSummaries, {
  create_note: (input) => summarizeCreateNote((input ?? {}) as Parameters<typeof summarizeCreateNote>[0]),
  create_checklist: (input) => summarizeCreateChecklist((input ?? {}) as Parameters<typeof summarizeCreateChecklist>[0]),
  clock_in: (input) => summarizeClockIn(input),
  pause_or_clock_out: (input) =>
    summarizePauseOrClockOut((input ?? {}) as Parameters<typeof summarizePauseOrClockOut>[0]),
  get_my_hours: (input) => summarizeGetMyHours((input ?? {}) as Parameters<typeof summarizeGetMyHours>[0]),
  team_hours_report: (input) =>
    summarizeTeamHoursReport((input ?? {}) as Parameters<typeof summarizeTeamHoursReport>[0]),
} satisfies Record<string, ToolSummary>);

// ── Correo / Gmail (BE §10.3) ───────────────────────────────────────────────

function mailText(text: unknown, max = 60): string {
  const t = (typeof text === "string" ? text : "").trim().replace(/\s+/g, " ");
  return t.length > max ? `“${t.slice(0, max - 1)}…”` : `“${t}”`;
}

export function summarizeSearchEmail(input: { query?: string; from?: string; since?: string }): string {
  const query = input?.query?.trim() ? ` ${mailText(input.query)}` : "";
  const from = input?.from?.trim() ? ` de ${input.from.trim()}` : "";
  const since = input?.since?.trim() ? ` desde el ${input.since.trim()}` : "";
  return `Buscar en tu Gmail${query}${from}${since}`;
}

export function summarizeSummarizeEmailThread(input?: { threadId?: string }): string {
  void input;
  return "Leer y resumir un hilo de tu Gmail";
}

export function summarizeDraftEmail(input: { to?: string[]; subject?: string; replyToThreadId?: string }): string {
  const to = Array.isArray(input?.to) && input.to.length ? input.to.join(", ") : "sin destinatario";
  const kind = input?.replyToThreadId ? "Guardar un borrador de respuesta" : "Guardar un borrador";
  return `${kind} para ${to}: ${mailText(input?.subject)}`;
}

export function summarizeSendEmail(input: { draftId?: string }): string {
  const id = input?.draftId?.trim() ? ` (${input.draftId.trim()})` : "";
  return `Enviar desde tu Gmail el borrador guardado${id}`;
}

export function summarizeLinkEmailToProject(input: { threadId?: string; project?: string }): string {
  return input?.project?.trim()
    ? `Vincular un correo al proyecto ${input.project.trim()}`
    : "Vincular un correo al proyecto de esta página";
}

Object.assign(toolSummaries, {
  search_email: (input) => summarizeSearchEmail((input ?? {}) as Parameters<typeof summarizeSearchEmail>[0]),
  summarize_email_thread: (input) =>
    summarizeSummarizeEmailThread((input ?? {}) as Parameters<typeof summarizeSummarizeEmailThread>[0]),
  draft_email: (input) => summarizeDraftEmail((input ?? {}) as Parameters<typeof summarizeDraftEmail>[0]),
  send_email: (input) => summarizeSendEmail((input ?? {}) as Parameters<typeof summarizeSendEmail>[0]),
  link_email_to_project: (input) =>
    summarizeLinkEmailToProject((input ?? {}) as Parameters<typeof summarizeLinkEmailToProject>[0]),
} satisfies Record<string, ToolSummary>);

// ── Personas, clientes y proveedores (BE §10.3) ─────────────────────────────

function personasText(text: unknown, max = 60): string {
  const t = (typeof text === "string" ? text : "").trim().replace(/\s+/g, " ");
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

function personasList(items: unknown, max = 5): string {
  const names = (Array.isArray(items) ? items : [])
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
  if (names.length === 0) return "";
  const shown = names.slice(0, max).join(", ");
  return names.length > max ? `${shown} y ${names.length - max} más` : shown;
}

export function summarizeGetPerson(input: { name?: string }): string {
  const name = personasText(input?.name);
  return name ? `Consultar la ficha de ${name}` : "Consultar la ficha de una persona del equipo";
}

export function summarizeInviteClientToPortal(input: { client?: string; project?: string }): string {
  const client = personasText(input?.client) || "el cliente";
  const project = personasText(input?.project);
  return project
    ? `Invitar a ${client} al portal del proyecto ${project}`
    : `Invitar a ${client} al portal del proyecto de esta página`;
}

export function summarizeRequestClientApproval(input: { project?: string; fileId?: string; message?: string }): string {
  const project = personasText(input?.project);
  const where = project ? `del proyecto ${project}` : "del proyecto de esta página";
  const message = personasText(input?.message);
  return `Pedir al cliente ${where} que apruebe un archivo${message ? `: “${message}”` : ""}`;
}

export function summarizeRequestQuotes(input: {
  item?: string;
  quantity?: number | string;
  suppliers?: string[];
  deadline?: string;
}): string {
  const item = personasText(input?.item) || "un material";
  const quantity =
    typeof input?.quantity === "number" || (typeof input?.quantity === "string" && input.quantity.trim())
      ? `${String(input.quantity).trim()} de `
      : "";
  const suppliers = personasList(input?.suppliers);
  const deadline = personasText(input?.deadline);
  return (
    `Pedir cotización de ${quantity}${item}` +
    (suppliers ? ` a ${suppliers}` : "") +
    (deadline ? `, con respuesta antes del ${deadline}` : "")
  );
}

export function summarizeCompareQuotes(input: { requestId?: string; item?: string }): string {
  const requestId = personasText(input?.requestId);
  if (requestId) return `Comparar las cotizaciones de la solicitud ${requestId}`;
  const item = personasText(input?.item);
  return item ? `Comparar las cotizaciones de ${item}` : "Comparar las cotizaciones recibidas";
}

Object.assign(toolSummaries, {
  get_person: (input) => summarizeGetPerson((input ?? {}) as Parameters<typeof summarizeGetPerson>[0]),
  invite_client_to_portal: (input) =>
    summarizeInviteClientToPortal((input ?? {}) as Parameters<typeof summarizeInviteClientToPortal>[0]),
  request_client_approval: (input) =>
    summarizeRequestClientApproval((input ?? {}) as Parameters<typeof summarizeRequestClientApproval>[0]),
  request_quotes: (input) => summarizeRequestQuotes((input ?? {}) as Parameters<typeof summarizeRequestQuotes>[0]),
  compare_quotes: (input) => summarizeCompareQuotes((input ?? {}) as Parameters<typeof summarizeCompareQuotes>[0]),
} satisfies Record<string, ToolSummary>);

// ── Widgets de respuesta and Cutto (BE §10.3) ───────────────────────────────

function summaryFields(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? (input as Record<string, unknown>) : {};
}

function summaryText(value: unknown, max = 60): string {
  const t = (typeof value === "string" ? value : "").trim().replace(/\s+/g, " ");
  return t.length > max ? `“${t.slice(0, max - 1)}…”` : `“${t}”`;
}

function summaryNames(value: unknown): string {
  const names = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim())
    : [];
  return names.join(", ");
}

function summaryString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function summarizeRenderTable(input: unknown): string {
  const { title, rows } = summaryFields(input);
  const n = Array.isArray(rows) ? rows.length : 0;
  const what = summaryString(title) ? `la tabla ${summaryText(title)}` : "una tabla";
  return `Mostrar ${what} (${n} ${n === 1 ? "fila" : "filas"})`;
}

export function summarizeRenderTimeline(input: unknown): string {
  const { title, items } = summaryFields(input);
  const n = Array.isArray(items) ? items.length : 0;
  const what = summaryString(title) ? `la línea de tiempo ${summaryText(title)}` : "una línea de tiempo";
  return `Mostrar ${what} (${n} ${n === 1 ? "elemento" : "elementos"})`;
}

export function summarizeCreateMeeting(input: unknown): string {
  const { title, start, duration, attendees, project } = summaryFields(input);
  const when = summaryString(start) ? ` el ${summaryString(start)}` : "";
  const length = typeof duration === "number" ? ` (${duration} min)` : "";
  const people = summaryNames(attendees);
  const withPeople = people ? ` con ${people}` : "";
  const inProject = summaryString(project) ? ` del proyecto ${summaryString(project)}` : "";
  return `Crear en Cutto la reunión ${summaryText(title)}${inProject}${when}${length}${withPeople}`;
}

export function summarizeStartCall(input: unknown): string {
  const { people, channel, video } = summaryFields(input);
  const kind = video === true ? "una videollamada" : "una llamada";
  const names = summaryNames(people);
  if (names) return `Iniciar ${kind} en Cutto con ${names}`;
  if (summaryString(channel)) return `Iniciar ${kind} en Cutto en el canal ${summaryString(channel)}`;
  return `Iniciar ${kind} en Cutto`;
}

export function summarizeListMeetings(input: unknown): string {
  const { date, project } = summaryFields(input);
  const day = summaryString(date) ? ` del ${summaryString(date)}` : "";
  const inProject = summaryString(project) ? ` del proyecto ${summaryString(project)}` : "";
  return `Consultar tus reuniones de Cutto${day}${inProject}`;
}

export function summarizeInviteToMeeting(input: unknown): string {
  const names = summaryNames(summaryFields(input).people);
  return `Invitar a ${names || "más personas"} a una reunión de Cutto`;
}

export function summarizeGetMeetingNotes(input: unknown): string {
  void input;
  return "Leer las notas de una reunión de Cutto";
}

export function summarizeMeetingToTasks(input: unknown): string {
  const project = summaryString(summaryFields(input).project);
  return project
    ? `Crear tareas en el proyecto ${project} a partir de una reunión de Cutto`
    : "Crear tareas a partir de una reunión de Cutto";
}

export function summarizeListVoiceRooms(input: unknown): string {
  const project = summaryString(summaryFields(input).project);
  return project ? `Consultar las salas de voz de Cutto del proyecto ${project}` : "Consultar las salas de voz de Cutto";
}

export function summarizeJoinVoiceRoom(input: unknown): string {
  void input;
  return "Abrir una sala de voz de Cutto";
}

export function summarizeListConversations(input: unknown): string {
  return summaryFields(input).unreadOnly === true
    ? "Consultar tus conversaciones de Cutto sin leer"
    : "Consultar tus conversaciones de Cutto";
}

export function summarizeReadConversation(input: unknown): string {
  void input;
  return "Leer una conversación de Cutto";
}

export function summarizeSummarizeChannel(input: unknown): string {
  const { channel, since } = summaryFields(input);
  const from = summaryString(since) ? ` desde el ${summaryString(since)}` : "";
  return `Resumir el canal ${summaryString(channel) || "de Cutto"} de Cutto${from}`;
}

export function summarizeSendMessage(input: unknown): string {
  const { to, text } = summaryFields(input);
  return `Enviar en Cutto a ${summaryNames(to) || "sin destinatario"}: ${summaryText(text)}`;
}

export function summarizePostToProjectChannel(input: unknown): string {
  const { project, text } = summaryFields(input);
  const where = summaryString(project) ? `el canal del proyecto ${summaryString(project)}` : "el canal del proyecto";
  return `Publicar en ${where} en Cutto: ${summaryText(text)}`;
}

export function summarizeReplyInThread(input: unknown): string {
  return `Responder en un hilo de Cutto: ${summaryText(summaryFields(input).text)}`;
}

export function summarizeCreateProjectChannel(input: unknown): string {
  const { project, members } = summaryFields(input);
  const names = summaryNames(members);
  const withMembers = names ? ` con ${names}` : "";
  return `Crear en Cutto el canal del proyecto ${summaryString(project) || "de esta página"}${withMembers}`;
}

Object.assign(toolSummaries, {
  render_table: summarizeRenderTable,
  render_timeline: summarizeRenderTimeline,
  create_meeting: summarizeCreateMeeting,
  start_call: summarizeStartCall,
  list_meetings: summarizeListMeetings,
  invite_to_meeting: summarizeInviteToMeeting,
  get_meeting_notes: summarizeGetMeetingNotes,
  meeting_to_tasks: summarizeMeetingToTasks,
  list_voice_rooms: summarizeListVoiceRooms,
  join_voice_room: summarizeJoinVoiceRoom,
  list_conversations: summarizeListConversations,
  read_conversation: summarizeReadConversation,
  summarize_channel: summarizeSummarizeChannel,
  send_message: summarizeSendMessage,
  post_to_project_channel: summarizePostToProjectChannel,
  reply_in_thread: summarizeReplyInThread,
  create_project_channel: summarizeCreateProjectChannel,
} satisfies Record<string, ToolSummary>);

// ── Herramientas de arquitectura (BE §10.3) ─────────────────────────────────

function arqField(input: unknown, key: string): unknown {
  return input && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
}

function arqText(input: unknown, key: string, max = 60): string {
  const value = arqField(input, key);
  if (typeof value !== "string") return "";
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

function arqNumber(input: unknown, key: string): number | null {
  const value = arqField(input, key);
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function arqCount(input: unknown, key: string): number {
  const value = arqField(input, key);
  return Array.isArray(value) ? value.length : 0;
}

function arqProject(input: unknown): string {
  const project = arqText(input, "project");
  return project ? `«${project}»` : "el proyecto de esta página";
}

function arqDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

const ARQ_FINISH: Record<string, string> = { economico: "económico", medio: "medio", alto: "alto" };

export function summarizeMeasureAreasFromPlan(input: unknown): string {
  const scale = arqText(input, "scale");
  return `Medir las áreas del plano${scale ? ` a escala ${scale}` : ""} (valores aproximados)`;
}

export function summarizeQuantityTakeoff(input: unknown): string {
  const material = arqText(input, "material") || "material";
  const area = arqNumber(input, "area");
  const format = arqText(input, "format");
  const waste = arqNumber(input, "wastePct") ?? 10;
  const where = area !== null ? ` para ${area} m²` : "";
  return `Calcular ${material}${where}${format ? ` (${format})` : ""} con ${waste} % de desperdicio`;
}

export function summarizeParametricCostEstimate(input: unknown): string {
  const area = arqNumber(input, "area");
  const use = arqText(input, "use") || "obra";
  const finish = ARQ_FINISH[arqText(input, "finishLevel")] ?? "";
  return `Estimar el costo paramétrico de ${area !== null ? `${area} m² de ` : ""}${use}${finish ? `, acabado ${finish}` : ""}`;
}

export function summarizeZoningCheck(input: unknown): string {
  return `Revisar la normativa de ${arqProject(input)} contra su ficha`;
}

export function summarizeSitePhotoLog(input: unknown): string {
  const n = arqCount(input, "photos");
  const notes = arqText(input, "notes", 80);
  const photos = `${n} ${n === 1 ? "foto" : "fotos"}`;
  return `Registrar ${photos} en la bitácora de obra de ${arqProject(input)}${notes ? `: ${notes}` : ""}`;
}

export function summarizeScheduleFromTemplate(input: unknown): string {
  const template = arqText(input, "template");
  const start = arqText(input, "startDate");
  return `Programar ${template ? `la plantilla «${template}»` : "una plantilla"} en ${arqProject(input)}${start ? ` a partir del ${arqDate(start)}` : ""}`;
}

export function summarizeMoodboardFromReferences(input: unknown): string {
  const n = arqCount(input, "images");
  return `Armar la paleta y los materiales de ${arqProject(input)} con ${n} ${n === 1 ? "referencia" : "referencias"}`;
}

export function summarizeProgressReport(input: unknown): string {
  const period = arqText(input, "period") === "mes" ? "mensual" : "semanal";
  return `Preparar el reporte de avance ${period} de ${arqProject(input)}`;
}

Object.assign(toolSummaries, {
  measure_areas_from_plan: summarizeMeasureAreasFromPlan,
  quantity_takeoff: summarizeQuantityTakeoff,
  parametric_cost_estimate: summarizeParametricCostEstimate,
  zoning_check: summarizeZoningCheck,
  site_photo_log: summarizeSitePhotoLog,
  schedule_from_template: summarizeScheduleFromTemplate,
  moodboard_from_references: summarizeMoodboardFromReferences,
  progress_report: summarizeProgressReport,
} satisfies Record<string, ToolSummary>);
