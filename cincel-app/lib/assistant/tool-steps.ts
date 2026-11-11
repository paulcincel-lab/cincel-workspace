/**
 * Tool steps of an assistant message (Asistente): every tool part becomes a
 * `ToolStep` with its state, a label built from the input, its parameters,
 * row count, duration (`AssistantMessageMeta.toolMs`) and link. Consecutive
 * approval-gated calls of the same tool form one approval group with a row
 * preview. Client-safe: no server imports, so every Asistente style renders
 * from it.
 */
import type { UIMessage } from "ai";
import {
  Ban,
  Bell,
  BellRing,
  Building2,
  Calculator,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  CalendarX,
  Camera,
  ChartColumn,
  ClipboardList,
  Clock,
  Coins,
  Copy,
  FileText,
  FolderOpen,
  GitMerge,
  GitPullRequest,
  Hash,
  Inbox,
  Link,
  ListChecks,
  ListTodo,
  LogIn,
  LogOut,
  Mail,
  MailOpen,
  MapPin,
  MessageSquare,
  MessagesSquare,
  Mic,
  Palette,
  Phone,
  Receipt,
  Reply,
  Ruler,
  Scale,
  Search,
  Send,
  Shuffle,
  SquareCheck,
  StickyNote,
  Table,
  Trash2,
  TrendingUp,
  UserCog,
  UserPlus,
  UserRound,
  Users,
  Video,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import {
  formatDueDate,
  previewToolCall,
  summarizeToolCall,
  taskStatusLabel,
  toolPreviews,
  type ToolPreviewRow,
} from "@/lib/assistant/tool-summaries";
import { actionErrorText } from "@/lib/errors";
import type { AssistantMessageMeta, AssistantUIMessage } from "@/lib/types/asistente";

export type { ToolPreviewRow };

export type ToolStepState = "running" | "needs-confirmation" | "confirmed" | "done" | "error" | "denied";

/** Tramo / chart slot tint of the step dot. */
export type ToolStepTone = 1 | 2 | 3 | 4 | 5 | "warning";

/** One parameter chip, Spanish key ("proyecto", "estado", "al", "responsable"). */
export type ToolStepParam = { key: string; value: string };

export type ToolStep = {
  toolCallId: string;
  toolName: string;
  state: ToolStepState;
  /** Dynamic, from the input: "Buscó tus tareas vencidas". */
  label: string;
  /** Static: "Tus tareas" (Analítico "Qué hizo"). */
  short: string;
  /** Static, while the tool runs: "Buscando tus tareas…". */
  running: string;
  icon: LucideIcon;
  tone: ToolStepTone;
  params: ToolStepParam[];
  rows: number | null;
  durationMs: number | null;
  output?: unknown;
  errorText?: string;
  approvalId?: string;
  /** "Ver en Tareas →". */
  href?: string;
};

export type ToolStepGroup =
  | { kind: "steps"; steps: ToolStep[]; totalMs: number | null }
  | { kind: "approval"; toolName: string; steps: ToolStep[]; preview: ToolPreviewRow[] };

export type ToolApprovalGroup = Extract<ToolStepGroup, { kind: "approval" }>;

export type ToolStepDef = {
  icon: LucideIcon;
  tone: ToolStepTone;
  running: string;
  short: string;
  label(input: unknown): string;
  params(input: unknown): ToolStepParam[];
  rows?(output: unknown): number | null;
  href?(input: unknown, output: unknown): string | null;
  preview?(input: unknown): ToolPreviewRow;
  /** Row count wording, singular and plural: ["encontrada", "encontradas"]. */
  rowsNoun?: [string, string];
};

/** Tools that render a rich result in the conversation; they are not steps. */
export const RENDER_WIDGET_TOOLS: ReadonlySet<string> = new Set([
  "render_chart",
  "render_card",
  "render_stat_grid",
  "render_list",
  "render_table",
  "render_timeline",
]);

// ── Input helpers ───────────────────────────────────────────────────────────

function field(input: unknown, key: string): unknown {
  return input && typeof input === "object" && !Array.isArray(input) ? (input as Record<string, unknown>)[key] : undefined;
}

function str(input: unknown, key: string): string {
  const value = field(input, key);
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function clip(value: string, max = 60): string {
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

function quoted(value: string): string {
  return `«${clip(value)}»`;
}

const WORKFLOW_NAMES: Record<string, string> = {
  presale: "Presale",
  diseno: "Diseño",
  construccion: "Construcción",
  decoracion: "Decoración",
};

const DUE_WORDS: Record<string, string> = { hoy: "para hoy", semana: "de esta semana", vencidas: "vencidas" };

/** Spanish chip keys for the input fields the tools share. Ids are never shown. */
const PARAM_KEYS: Record<string, string> = {
  project: "proyecto",
  projectName: "proyecto",
  status: "estado",
  due: "vence",
  dueDate: "al",
  commitmentDate: "entrega",
  reviewDate: "revisión",
  deadline: "límite",
  manager: "responsable",
  memberName: "responsable",
  people: "personas",
  attendees: "invitados",
  query: "búsqueda",
  descriptionContains: "tarea",
  description: "tarea",
  title: "título",
  name: "nombre",
  client: "cliente",
  workflow: "tramo",
  tramo: "tramo",
  stage: "etapa",
  priority: "prioridad",
  range: "periodo",
  period: "periodo",
  from: "de",
  since: "desde",
  to: "para",
  start: "inicio",
  end: "fin",
  when: "cuándo",
  location: "lugar",
  item: "punto",
  text: "texto",
  note: "nota",
  reason: "motivo",
  types: "tipos",
  unreadOnly: "solo no leídas",
  activeOnly: "solo activos",
  onlyBlocked: "solo bloqueadas",
  withinDays: "días",
  duration: "minutos",
  limit: "límite",
  area: "m²",
  material: "material",
  use: "uso",
  scale: "escala",
  template: "plantilla",
  channel: "canal",
  subject: "asunto",
  action: "acción",
  kind: "tipo",
  repeat: "repite",
  urgency: "urgencia",
};

const ID_KEY = /(^id$|Id$|^ids$|Ids$)/;

function paramValue(key: string, value: unknown): string | null {
  if (typeof value === "string") {
    const clean = value.replace(/\s+/g, " ").trim();
    if (!clean) return null;
    if (key === "workflow" || key === "tramo") return WORKFLOW_NAMES[clean] ?? clean;
    if (key === "status") return taskStatusLabel(clean).toLowerCase();
    if (key === "due") return DUE_WORDS[clean] ?? clean;
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return formatDueDate(clean);
    return clip(clean, 40);
  }
  if (typeof value === "number" && Number.isFinite(value)) return value.toLocaleString("es-MX");
  if (typeof value === "boolean") return value ? "sí" : "no";
  if (Array.isArray(value)) {
    const items = value.filter((v): v is string | number => typeof v === "string" || typeof v === "number").map(String);
    if (items.length === 0) return null;
    return items.length > 3 ? `${items.slice(0, 3).join(", ")} y ${items.length - 3} más` : items.join(", ");
  }
  return null;
}

/** Parameter chips of an input: known fields with Spanish keys, ids and nested objects left out. */
export function paramsOf(input: unknown): ToolStepParam[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  const params: ToolStepParam[] = [];
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (ID_KEY.test(key)) continue;
    const label = PARAM_KEYS[key];
    if (!label) continue;
    // A boolean flag reads as its key alone ("solo bloqueadas"); false says nothing.
    if (typeof value === "boolean") {
      if (value && label.startsWith("solo")) params.push({ key: label, value: "sí" });
      continue;
    }
    const text = paramValue(key, value);
    if (text) params.push({ key: label, value: text });
  }
  return params;
}

/** Raw `key=value` chips for a tool without a step definition. */
export function rawParamsOf(input: unknown): ToolStepParam[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [];
  const params: ToolStepParam[] = [];
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (value === undefined || value === null) continue;
    const text = typeof value === "object" ? JSON.stringify(value) : String(value);
    params.push({ key, value: clip(text, 40) });
  }
  return params;
}

// ── Output helpers ──────────────────────────────────────────────────────────

/** A third-party result is stored as `{ untrusted: true, content }`; the step shows the content. */
export function unwrapOutput(output: unknown): unknown {
  if (output && typeof output === "object" && (output as { untrusted?: unknown }).untrusted === true) {
    return (output as { content?: unknown }).content;
  }
  return output;
}

/** `{ ok: false, error, message }`: how every `defineTool` reports an error. */
export function toolFailureOf(output: unknown): { error: string; message: string } | null {
  const value = unwrapOutput(output);
  if (!value || typeof value !== "object" || (value as { ok?: unknown }).ok !== false) return null;
  const { error, message } = value as { error?: unknown; message?: unknown };
  const code = typeof error === "string" ? error : "";
  const text = typeof message === "string" && message.trim() ? message.trim() : actionErrorText(code);
  return { error: code, message: text };
}

const LIST_KEYS = [
  "tasks",
  "items",
  "results",
  "rows",
  "projects",
  "events",
  "slots",
  "notifications",
  "reminders",
  "people",
  "members",
  "messages",
  "threads",
  "meetings",
  "conversations",
  "rooms",
  "duplicates",
  "groups",
  "quotes",
  "entries",
  "created",
];

/** Rows a result carries: an array's length, the first known list, or `count` / `total`. */
export function rowsOf(output: unknown): number | null {
  const value = unwrapOutput(output);
  if (toolFailureOf(value)) return null;
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  for (const key of LIST_KEYS) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).length;
  }
  for (const key of ["count", "total"]) {
    if (typeof record[key] === "number") return record[key] as number;
  }
  return null;
}

/** A task-list result as cards: title, tramo, person, due date and days late. */
export type ToolTaskCard = {
  title: string;
  tramo: { key: string; name: string; sortOrder: number } | null;
  person: string | null;
  dueDate: string | null;
  daysLate: number | null;
};

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Today as `YYYY-MM-DD` in the firm's timezone. */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * The task cards of a task-list result (`list_my_tasks` `{ tasks }`,
 * `list_activities_due` rows); null when the result isn't a task list.
 */
export function taskCardsOf(output: unknown, today: string = todayIso()): ToolTaskCard[] | null {
  const value = unwrapOutput(output);
  const list = Array.isArray(value) ? value : Array.isArray(field(value, "tasks")) ? (field(value, "tasks") as unknown[]) : null;
  if (!list) return null;
  const cards: ToolTaskCard[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") return null;
    if (!("commitmentDate" in item)) return null;
    const title = str(item, "title") || str(item, "description");
    if (!title) return null;
    const tramoName = str(item, "tramo") || str(item, "workflow");
    const key = fold(tramoName);
    const dueDate = str(item, "commitmentDate") || null;
    const late = dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate) ? daysBetween(dueDate, today) : null;
    cards.push({
      title,
      tramo: tramoName ? { key, name: tramoName, sortOrder: 0 } : null,
      person: str(item, "manager") || null,
      dueDate,
      daysLate: late !== null && late > 0 ? late : null,
    });
  }
  return cards;
}

/** Key / value rows of a plain object result (scalars only, at most `max`); null when there are none. */
export function outputEntriesOf(output: unknown, max = 8): { key: string; value: string }[] | null {
  const value = unwrapOutput(output);
  if (Array.isArray(value)) {
    const names = value
      .map((item) => str(item, "name") || str(item, "title") || str(item, "description"))
      .filter(Boolean);
    if (names.length === 0 || names.length !== value.length) return null;
    return names.slice(0, max).map((name, index) => ({ key: String(index + 1), value: clip(name, 80) }));
  }
  if (!value || typeof value !== "object") return null;
  const entries: { key: string; value: string }[] = [];
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (key === "ok" || ID_KEY.test(key)) continue;
    if (typeof raw === "string" && raw.trim()) entries.push({ key, value: clip(raw.trim(), 80) });
    else if (typeof raw === "number" && Number.isFinite(raw)) entries.push({ key, value: raw.toLocaleString("es-MX") });
    else if (typeof raw === "boolean") entries.push({ key, value: raw ? "sí" : "no" });
    if (entries.length >= max) break;
  }
  return entries.length > 0 ? entries : null;
}

const HREF_LABELS: Record<string, string> = {
  tareas: "Ver en Tareas",
  proyectos: "Ver en Proyectos",
  personas: "Ver en Personas",
  "mi-espacio": "Ver en Mi espacio",
  inicio: "Ver en Inicio",
  biblioteca: "Ver en Biblioteca",
  calendario: "Ver en Calendario",
};

/** "Ver en Tareas" for `/tareas?…`; "Abrir" for any other path. */
export function hrefLabel(href: string): string {
  const segment = href.replace(/^\/+/, "").split(/[/?#]/)[0] ?? "";
  return HREF_LABELS[segment] ?? "Abrir";
}

// ── Step definitions ────────────────────────────────────────────────────────

type Entry = {
  icon: LucideIcon;
  tone: ToolStepTone;
  running: string;
  short: string;
  label?(input: unknown): string;
  params?(input: unknown): ToolStepParam[];
  rows?(output: unknown): number | null;
  href?(input: unknown, output: unknown): string | null;
  rowsNoun?: [string, string];
};

const TASKS_NOUN: [string, string] = ["encontrada", "encontradas"];
const toTareas = () => "/tareas";
const toCalendario = () => "/calendario";

function urlOf(output: unknown): string | null {
  const url = str(unwrapOutput(output), "url");
  return url.startsWith("/") ? url : null;
}

const ENTRIES: Record<string, Entry> = {
  // Consulta y búsqueda
  search_workspace: {
    icon: Search,
    tone: 1,
    running: "Buscando en Cincel…",
    short: "Búsqueda en Cincel",
    label: (input) => (str(input, "query") ? `Buscó ${quoted(str(input, "query"))} en Cincel` : "Buscó en Cincel"),
  },
  get_project: {
    icon: FolderOpen,
    tone: 1,
    running: "Abriendo el proyecto…",
    short: "Ficha del proyecto",
    label: (input) => (str(input, "project") ? `Abrió el proyecto ${str(input, "project")}` : "Abrió el proyecto actual"),
    href: (_input, output) => {
      const id = str(unwrapOutput(output), "id");
      return id ? `/proyectos/${id}` : "/proyectos";
    },
  },
  get_task: {
    icon: SquareCheck,
    tone: 2,
    running: "Abriendo la tarea…",
    short: "Ficha de la tarea",
    label: (input) => (str(input, "title") ? `Abrió la tarea ${quoted(str(input, "title"))}` : "Abrió la tarea"),
    href: (_input, output) => urlOf(output) ?? "/tareas",
  },
  list_my_tasks: {
    icon: ListChecks,
    tone: 2,
    running: "Buscando tus tareas…",
    short: "Tus tareas",
    label: (input) => {
      const due = DUE_WORDS[str(input, "due")];
      return due ? `Buscó tus tareas ${due}` : "Buscó tus tareas abiertas";
    },
    href: toTareas,
    rowsNoun: TASKS_NOUN,
  },
  list_projects: {
    icon: FolderOpen,
    tone: 1,
    running: "Consultando los proyectos…",
    short: "Proyectos y riesgo",
    label: (input) => (field(input, "activeOnly") === false ? "Revisó todos los proyectos" : "Revisó los proyectos activos"),
    href: () => "/proyectos",
    rowsNoun: ["encontrado", "encontrados"],
  },
  list_activities_due: {
    icon: CalendarClock,
    tone: 2,
    running: "Buscando tareas por vencer…",
    short: "Tareas por vencer",
    label: (input) => {
      const project = str(input, "projectName");
      const member = str(input, "memberName");
      if (field(input, "onlyBlocked") === true) return `Buscó las tareas bloqueadas${project ? ` de ${project}` : ""}`;
      if (project) return `Buscó las tareas de ${project}${member ? ` de ${member}` : ""}`;
      const days = typeof field(input, "withinDays") === "number" ? (field(input, "withinDays") as number) : 7;
      return `Buscó las tareas que vencen en ${days} días${member ? ` de ${member}` : ""}`;
    },
    href: toTareas,
    rowsNoun: TASKS_NOUN,
  },
  team_workload_summary: {
    icon: Users,
    tone: 4,
    running: "Revisando la carga del equipo…",
    short: "Carga del equipo",
    label: () => "Revisó la carga del equipo",
    href: () => "/personas",
    rowsNoun: ["persona", "personas"],
  },
  find_duplicates: {
    icon: Copy,
    tone: 1,
    running: "Buscando duplicados…",
    short: "Duplicados",
    label: () => "Buscó clientes y tareas duplicados",
  },

  // Escritura heredada
  create_task: {
    icon: ListTodo,
    tone: 2,
    running: "Creando la tarea…",
    short: "Tarea nueva",
    label: (input) => (str(input, "description") ? `Crear la tarea ${quoted(str(input, "description"))}` : "Crear una tarea"),
    href: toTareas,
  },
  assign_task: {
    icon: UserCog,
    tone: 2,
    running: "Reasignando el responsable…",
    short: "Cambio de responsable",
    label: (input) =>
      `Reasignar ${str(input, "descriptionContains") ? quoted(str(input, "descriptionContains")) : "la tarea"}${str(input, "manager") ? ` a ${str(input, "manager")}` : ""}`,
    href: toTareas,
  },
  create_client: {
    icon: Building2,
    tone: 4,
    running: "Dando de alta al cliente…",
    short: "Cliente nuevo",
    label: (input) => (str(input, "name") ? `Dar de alta a ${str(input, "name")}` : "Dar de alta un cliente"),
  },
  onboard_client: {
    icon: UserPlus,
    tone: 4,
    running: "Arrancando cliente y tareas…",
    short: "Arranque de cliente",
    label: (input) => (str(input, "name") ? `Arrancar a ${str(input, "name")} con sus tareas` : "Arrancar un cliente"),
    href: toTareas,
  },
  create_rfc: {
    icon: GitPullRequest,
    tone: 1,
    running: "Creando la RFC…",
    short: "RFC nueva",
    label: (input) => (str(input, "title") ? `Crear la RFC ${quoted(str(input, "title"))}` : "Crear una RFC"),
  },
  merge_duplicate_clients: {
    icon: GitMerge,
    tone: "warning",
    running: "Fusionando clientes duplicados…",
    short: "Fusión de clientes",
    label: (input) => (str(input, "name") ? `Fusionar los duplicados de ${str(input, "name")}` : "Fusionar clientes duplicados"),
  },
  merge_duplicate_activities: {
    icon: GitMerge,
    tone: "warning",
    running: "Fusionando tareas duplicadas…",
    short: "Fusión de tareas",
    label: () => "Fusionar tareas duplicadas",
  },
  discard_project: {
    icon: Trash2,
    tone: "warning",
    running: "Eliminando el proyecto y sus tareas…",
    short: "Proyecto eliminado",
    label: (input) => (str(input, "projectName") ? `Eliminar ${str(input, "projectName")}` : "Eliminar el proyecto"),
  },

  // Tareas
  update_task_status: { icon: SquareCheck, tone: 2, running: "Cambiando el estatus…", short: "Cambio de estatus", href: toTareas },
  reschedule_task: { icon: CalendarRange, tone: 2, running: "Moviendo la entrega…", short: "Cambio de entrega", href: toTareas },
  add_task_comment: { icon: MessageSquare, tone: 2, running: "Comentando la tarea…", short: "Comentario", href: toTareas },
  add_subtask: { icon: ClipboardList, tone: 2, running: "Agregando la subtarea…", short: "Subtarea", href: toTareas },
  create_tasks_from_notes: { icon: ListTodo, tone: 2, running: "Sacando tareas de las notas…", short: "Tareas desde notas", href: toTareas },
  rebalance_workload: { icon: Shuffle, tone: 4, running: "Repartiendo la carga…", short: "Reparto de carga", href: () => "/personas" },

  // Agenda
  list_events: { icon: CalendarDays, tone: 3, running: "Revisando la agenda…", short: "Agenda", label: () => "Revisó la agenda" },
  find_free_slots: { icon: CalendarClock, tone: 3, running: "Buscando horarios libres…", short: "Horarios libres", label: () => "Buscó horarios libres" },
  create_event: { icon: CalendarPlus, tone: 3, running: "Creando el evento…", short: "Evento nuevo" },
  update_event: { icon: CalendarRange, tone: 3, running: "Cambiando el evento…", short: "Cambio de evento" },
  cancel_event: { icon: CalendarX, tone: "warning", running: "Cancelando el evento…", short: "Evento cancelado" },
  schedule_site_visit: { icon: MapPin, tone: 3, running: "Agendando la visita de obra…", short: "Visita de obra" },

  // Calendario y planeación
  calendar_range: { icon: CalendarDays, tone: 3, running: "Revisando el calendario…", short: "Calendario", label: () => "Revisó el calendario", href: toCalendario },
  summarize_day: { icon: ListChecks, tone: 3, running: "Resumiendo tu día…", short: "Resumen del día", label: () => "Resumió tu día", href: toCalendario },
  summarize_week: { icon: ListChecks, tone: 3, running: "Resumiendo tu semana…", short: "Resumen de la semana", label: () => "Resumió tu semana", href: toCalendario },
  day_load: { icon: ChartColumn, tone: 3, running: "Calculando la carga…", short: "Carga por día", label: () => "Calculó la carga por día", href: toCalendario },
  find_overloads: { icon: CalendarClock, tone: 4, running: "Buscando días sobrecargados…", short: "Días sobrecargados", label: () => "Buscó días sobrecargados", href: toCalendario },
  meeting_prep: { icon: ClipboardList, tone: 3, running: "Preparando la reunión…", short: "Preparación de reunión", href: toCalendario },
  move_tasks: { icon: CalendarRange, tone: 2, running: "Preparando los cambios de fecha…", short: "Cambios de fecha propuestos", href: toCalendario },
  propose_from_text: { icon: CalendarPlus, tone: 3, running: "Preparando la propuesta…", short: "Propuesta", href: toCalendario },
  propose_redistribution: { icon: Shuffle, tone: 4, running: "Repartiendo la carga…", short: "Reparto propuesto", href: toCalendario },
  resolve_overlap: { icon: GitMerge, tone: 4, running: "Buscando un horario sin traslape…", short: "Traslape resuelto", href: toCalendario },
  plan_week: { icon: CalendarRange, tone: 3, running: "Planeando la semana…", short: "Plan de la semana", href: toCalendario },
  extract_minutes: { icon: FileText, tone: 3, running: "Leyendo las notas de la reunión…", short: "Minuta propuesta", href: toCalendario },
  apply_proposal: { icon: SquareCheck, tone: 2, running: "Aplicando la propuesta…", short: "Propuesta aplicada", href: toCalendario },
  undo_proposal: { icon: Reply, tone: "warning", running: "Deshaciendo los cambios…", short: "Cambios deshechos", href: toCalendario },
  create_tasks_from_minutes: { icon: ListTodo, tone: 2, running: "Creando las tareas de la minuta…", short: "Tareas de la minuta", href: toCalendario },
  send_agenda: { icon: Send, tone: 4, running: "Enviando el orden del día…", short: "Orden del día enviado", href: toCalendario },
  send_minutes: { icon: Mail, tone: 4, running: "Enviando la minuta…", short: "Minuta enviada", href: toCalendario },

  // Notificaciones
  list_notifications: { icon: Bell, tone: 1, running: "Revisando tus notificaciones…", short: "Notificaciones", label: () => "Revisó tus notificaciones" },
  mark_notifications_read: { icon: Inbox, tone: 1, running: "Marcando como leídas…", short: "Notificaciones leídas" },
  create_reminder: { icon: BellRing, tone: 3, running: "Creando el recordatorio…", short: "Recordatorio nuevo", href: () => "/mi-espacio" },
  list_reminders: { icon: BellRing, tone: 3, running: "Revisando tus recordatorios…", short: "Recordatorios", label: () => "Revisó tus recordatorios" },
  cancel_reminder: { icon: Ban, tone: "warning", running: "Cancelando el recordatorio…", short: "Recordatorio cancelado" },
  notify_people: { icon: Send, tone: 4, running: "Avisando al equipo…", short: "Aviso al equipo" },
  schedule_digest: { icon: Mail, tone: 1, running: "Programando el resumen…", short: "Resumen diario" },

  // Correo
  search_email: { icon: Search, tone: 5, running: "Buscando en el correo…", short: "Búsqueda de correo" },
  summarize_email_thread: { icon: MailOpen, tone: 5, running: "Leyendo el hilo…", short: "Resumen del hilo" },
  draft_email: { icon: FileText, tone: 5, running: "Redactando el correo…", short: "Borrador de correo" },
  send_email: { icon: Send, tone: 5, running: "Enviando el correo…", short: "Correo enviado" },
  link_email_to_project: { icon: Link, tone: 5, running: "Vinculando el correo…", short: "Correo vinculado" },

  // Mi espacio
  create_note: { icon: StickyNote, tone: 3, running: "Guardando la nota…", short: "Nota", href: () => "/mi-espacio" },
  create_checklist: { icon: ClipboardList, tone: 3, running: "Creando el checklist…", short: "Checklist", href: () => "/mi-espacio" },
  clock_in: { icon: LogIn, tone: 5, running: "Registrando tu entrada…", short: "Entrada" },
  pause_or_clock_out: { icon: LogOut, tone: 5, running: "Registrando tu salida…", short: "Pausa o salida" },
  get_my_hours: {
    icon: Clock,
    tone: 5,
    running: "Sumando tus horas…",
    short: "Tus horas",
    label: (input) => (str(input, "range") === "semana" ? "Revisó tus horas de la semana" : "Revisó tus horas de hoy"),
    href: () => "/mi-espacio",
  },
  team_hours_report: {
    icon: Clock,
    tone: 4,
    running: "Preparando el reporte de horas…",
    short: "Horas del equipo",
    label: () => "Preparó el reporte de horas del equipo",
  },

  // Personas
  get_person: {
    icon: UserRound,
    tone: 4,
    running: "Abriendo la ficha…",
    short: "Ficha de la persona",
    label: (input) => (str(input, "name") ? `Abrió la ficha de ${str(input, "name")}` : "Abrió la ficha de la persona"),
    href: () => "/personas",
  },
  invite_client_to_portal: { icon: UserPlus, tone: 4, running: "Invitando al portal…", short: "Invitación al portal" },
  request_client_approval: { icon: SquareCheck, tone: 4, running: "Pidiendo la aprobación…", short: "Aprobación del cliente" },
  request_quotes: { icon: Receipt, tone: 4, running: "Pidiendo cotizaciones…", short: "Cotizaciones" },
  compare_quotes: { icon: Scale, tone: 4, running: "Comparando cotizaciones…", short: "Comparativo de cotizaciones" },

  // Arquitectura
  measure_areas_from_plan: { icon: Ruler, tone: 3, running: "Midiendo el plano…", short: "Áreas del plano" },
  quantity_takeoff: { icon: Calculator, tone: 3, running: "Calculando cantidades…", short: "Cuantificación" },
  parametric_cost_estimate: { icon: Coins, tone: 3, running: "Estimando el costo…", short: "Costo paramétrico" },
  zoning_check: { icon: Building2, tone: 3, running: "Revisando la normativa…", short: "Normativa" },
  site_photo_log: { icon: Camera, tone: 3, running: "Registrando las fotos…", short: "Bitácora de obra" },
  schedule_from_template: { icon: CalendarRange, tone: 3, running: "Programando la plantilla…", short: "Programa desde plantilla" },
  moodboard_from_references: { icon: Palette, tone: 3, running: "Armando la paleta…", short: "Paleta y materiales" },
  progress_report: { icon: TrendingUp, tone: 3, running: "Preparando el reporte de avance…", short: "Reporte de avance" },

  // Reuniones y mensajes
  create_meeting: { icon: Video, tone: 1, running: "Creando la reunión…", short: "Reunión nueva" },
  start_call: { icon: Phone, tone: 1, running: "Iniciando la llamada…", short: "Llamada" },
  list_meetings: { icon: CalendarDays, tone: 1, running: "Revisando las reuniones…", short: "Reuniones", label: () => "Revisó las reuniones" },
  invite_to_meeting: { icon: UserPlus, tone: 1, running: "Invitando a la reunión…", short: "Invitación a reunión" },
  get_meeting_notes: { icon: FileText, tone: 1, running: "Leyendo las notas de la reunión…", short: "Notas de la reunión" },
  meeting_to_tasks: { icon: ListTodo, tone: 2, running: "Sacando tareas de la reunión…", short: "Tareas de la reunión", href: toTareas },
  list_voice_rooms: { icon: Mic, tone: 1, running: "Revisando las salas de voz…", short: "Salas de voz", label: () => "Revisó las salas de voz" },
  join_voice_room: { icon: Mic, tone: 1, running: "Entrando a la sala…", short: "Sala de voz" },
  list_conversations: { icon: MessagesSquare, tone: 5, running: "Revisando las conversaciones…", short: "Conversaciones", label: () => "Revisó las conversaciones" },
  read_conversation: { icon: MessageSquare, tone: 5, running: "Leyendo la conversación…", short: "Conversación" },
  summarize_channel: { icon: Hash, tone: 5, running: "Resumiendo el canal…", short: "Resumen del canal" },
  send_message: { icon: Send, tone: 5, running: "Enviando el mensaje…", short: "Mensaje" },
  post_to_project_channel: { icon: Hash, tone: 5, running: "Publicando en el canal…", short: "Publicación en canal" },
  reply_in_thread: { icon: Reply, tone: 5, running: "Respondiendo en el hilo…", short: "Respuesta en hilo" },
  create_project_channel: { icon: Hash, tone: 5, running: "Creando el canal…", short: "Canal nuevo" },

  // Widgets: not steps, but every tool has a definition (running copy).
  render_chart: { icon: ChartColumn, tone: 1, running: "Generando gráfico…", short: "Gráfico" },
  render_card: { icon: FileText, tone: 1, running: "Generando tarjeta…", short: "Tarjeta" },
  render_stat_grid: { icon: ChartColumn, tone: 1, running: "Generando comparación…", short: "Comparación" },
  render_list: { icon: ListChecks, tone: 1, running: "Generando lista…", short: "Lista" },
  render_table: { icon: Table, tone: 1, running: "Generando tabla…", short: "Tabla" },
  render_timeline: { icon: CalendarDays, tone: 1, running: "Generando agenda…", short: "Agenda" },
};

/** Step definition per tool name: icon, tone, copy, parameters, rows, link and approval preview. */
export const TOOL_STEP_DEFS: Record<string, ToolStepDef> = Object.fromEntries(
  Object.entries(ENTRIES).map(([name, entry]) => {
    const preview = toolPreviews[name];
    const def: ToolStepDef = {
      icon: entry.icon,
      tone: entry.tone,
      running: entry.running,
      short: entry.short,
      label: entry.label ?? ((input) => summarizeToolCall(name, input)),
      params: entry.params ?? paramsOf,
      rows: entry.rows ?? rowsOf,
      ...(entry.href ? { href: entry.href } : {}),
      ...(preview ? { preview } : {}),
      ...(entry.rowsNoun ? { rowsNoun: entry.rowsNoun } : {}),
    };
    return [name, def];
  }),
);

// ── Parts → steps ───────────────────────────────────────────────────────────

type ToolPartLike = {
  type: string;
  toolName?: string;
  toolCallId: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
  preliminary?: boolean;
  approval?: { id: string; approved?: boolean; reason?: string; isAutomatic?: boolean };
};

/** A tool part (`tool-*` or `dynamic-tool`), or null for any other part. */
export function toolPartOf(part: unknown): ToolPartLike | null {
  if (!part || typeof part !== "object") return null;
  const candidate = part as Partial<ToolPartLike>;
  if (typeof candidate.type !== "string") return null;
  if (!candidate.type.startsWith("tool-") && candidate.type !== "dynamic-tool") return null;
  if (typeof candidate.toolCallId !== "string" || typeof candidate.state !== "string") return null;
  return candidate as ToolPartLike;
}

export function toolNameOfPart(part: { type: string; toolName?: string }): string {
  return part.type === "dynamic-tool" ? (part.toolName ?? "dynamic-tool") : part.type.slice("tool-".length);
}

/** A manual approval request (not one the server answered on its own). */
function isManualApproval(part: ToolPartLike): boolean {
  return !!part.approval && part.approval.isAutomatic !== true;
}

/** The step state of a tool part (see the state table in the Asistente tool steps issue). */
export function stepStateOf(part: ToolPartLike): { state: ToolStepState; errorText?: string } {
  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return { state: "running" };
    case "approval-requested":
      return { state: "needs-confirmation" };
    case "approval-responded":
      return { state: part.approval?.approved === false ? "denied" : "confirmed" };
    case "output-denied":
      return { state: "denied" };
    case "output-error":
      return { state: "error", errorText: actionErrorText(part.errorText ?? "") };
    case "output-available": {
      if (part.preliminary) return { state: "running" };
      const failure = toolFailureOf(part.output);
      return failure ? { state: "error", errorText: failure.message } : { state: "done" };
    }
    default:
      return { state: "running" };
  }
}

function safely<T>(run: () => T, fallback: T): T {
  try {
    return run();
  } catch {
    return fallback;
  }
}

/** One tool part as a step. Unknown tools fall back to their name and raw `key=value` parameters. */
export function toToolStep(part: ToolPartLike, meta?: AssistantMessageMeta): ToolStep {
  const toolName = toolNameOfPart(part);
  const def = TOOL_STEP_DEFS[toolName];
  const { state, errorText } = stepStateOf(part);
  const output = part.state === "output-available" ? unwrapOutput(part.output) : undefined;
  const duration = meta?.toolMs?.[part.toolCallId];
  const label = def ? safely(() => def.label(part.input), toolName) : toolName;
  const href = state === "done" && def?.href ? safely(() => def.href!(part.input, output), null) : null;
  return {
    toolCallId: part.toolCallId,
    toolName,
    state,
    label: label || toolName,
    short: def?.short ?? toolName,
    running: def?.running ?? `${toolName}…`,
    icon: def?.icon ?? Wrench,
    tone: def?.tone ?? 5,
    params: def ? safely(() => def.params(part.input), []) : rawParamsOf(part.input),
    rows: state === "done" ? safely(() => (def?.rows ?? rowsOf)(output), null) : null,
    durationMs: typeof duration === "number" && Number.isFinite(duration) ? duration : null,
    ...(output !== undefined ? { output } : {}),
    ...(errorText ? { errorText } : {}),
    ...(part.approval?.id ? { approvalId: part.approval.id } : {}),
    ...(href ? { href } : {}),
  };
}

function totalMsOf(steps: readonly ToolStep[]): number | null {
  const known = steps.map((step) => step.durationMs).filter((ms): ms is number => ms !== null);
  return known.length > 0 ? known.reduce((sum, ms) => sum + ms, 0) : null;
}

/**
 * The step groups of some message parts, in part order: consecutive tool
 * parts form a `steps` group (a text part ends it); consecutive manual
 * approvals of the same tool form one `approval` group with its row
 * preview. Widget tools (`render_*`) are skipped: they render as results.
 */
export function toolStepGroupsOf(parts: UIMessage["parts"], meta?: AssistantMessageMeta): ToolStepGroup[] {
  const groups: ToolStepGroup[] = [];
  let current: ToolStep[] = [];
  let openApproval: ToolApprovalGroup | null = null;

  const flush = () => {
    if (current.length > 0) groups.push({ kind: "steps", steps: current, totalMs: totalMsOf(current) });
    current = [];
  };

  for (const part of parts) {
    if (part.type === "text") {
      flush();
      openApproval = null;
      continue;
    }
    const tool = toolPartOf(part);
    if (!tool) continue;
    const toolName = toolNameOfPart(tool);
    if (RENDER_WIDGET_TOOLS.has(toolName)) continue;
    const step = toToolStep(tool, meta);

    if (isManualApproval(tool)) {
      flush();
      const row = previewToolCall(toolName, tool.input);
      if (openApproval && openApproval.toolName === toolName) {
        openApproval.steps.push(step);
        if (row && openApproval.preview.length === openApproval.steps.length - 1) openApproval.preview.push(row);
        else openApproval.preview = [];
      } else {
        openApproval = { kind: "approval", toolName, steps: [step], preview: row ? [row] : [] };
        groups.push(openApproval);
      }
      continue;
    }

    openApproval = null;
    current.push(step);
  }
  flush();
  return groups;
}

/** The step groups of a message, with the durations of its metadata. */
export function toToolSteps(message: AssistantUIMessage | UIMessage): ToolStepGroup[] {
  return toolStepGroupsOf(message.parts, message.metadata as AssistantMessageMeta | undefined);
}

// ── Formatting ──────────────────────────────────────────────────────────────

const SECONDS = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "0.6 s" (one decimal, es-MX); "<0.1 s" under 100 ms; "—" when unknown. */
export function formatStepDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 100) return "<0.1 s";
  return `${SECONDS.format(ms / 1000)} s`;
}

/** "1 herramienta usada" / "3 herramientas usadas". */
export function toolsUsedLabel(n: number): string {
  return n === 1 ? "1 herramienta usada" : `${n.toLocaleString("es-MX")} herramientas usadas`;
}

/** "12 encontradas" / "1 resultado". */
export function rowsLabel(step: Pick<ToolStep, "toolName" | "rows">): string | null {
  if (step.rows === null) return null;
  const noun = TOOL_STEP_DEFS[step.toolName]?.rowsNoun ?? ["resultado", "resultados"];
  return `${step.rows.toLocaleString("es-MX")} ${step.rows === 1 ? noun[0] : noun[1]}`;
}

/** The live-region line of a step state change; null for a state that isn't announced. */
export function stepAnnouncement(step: ToolStep): string | null {
  switch (step.state) {
    case "running":
      return step.running;
    case "done":
      return `Listo: ${step.label}`;
    case "needs-confirmation":
      return `Requiere confirmación: ${step.label}`;
    case "error":
      return `Error: ${step.errorText ?? actionErrorText("")}`;
    case "denied":
      return `Cancelado: ${step.label}`;
    default:
      return null;
  }
}
