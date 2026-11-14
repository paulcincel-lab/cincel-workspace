/**
 * Soporte types (plan `docs/phases/soporte-milestones.md`). Client-safe: no
 * server imports. Later issues may add optional fields only.
 */

export const TICKET_KINDS = ["error", "mejora", "pregunta"] as const;
export type TicketKind = (typeof TICKET_KINDS)[number];

export const TICKET_STATUSES = ["nuevo", "en_revision", "planeado", "en_progreso", "resuelto", "descartado"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ["baja", "media", "alta"] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

/** Route group a solicitud was filed from. */
export const TICKET_AREAS = [
  "inicio",
  "tareas",
  "calendario",
  "proyectos",
  "personas",
  "mi-espacio",
  "biblioteca",
  "asistente",
  "ajustes",
  "otro",
] as const;
export type TicketArea = (typeof TICKET_AREAS)[number];

export const TICKET_EVENT_TYPES = [
  "created",
  "status",
  "priority",
  "assignee",
  "reply",
  "note",
  "published",
  "synced",
  "duplicate",
] as const;
export type TicketEventType = (typeof TICKET_EVENT_TYPES)[number];

/** `internal` events are for admins only; the author never sees them. */
export const TICKET_VISIBILITIES = ["public", "internal"] as const;
export type TicketVisibility = (typeof TICKET_VISIBILITIES)[number];

/** Status groups of the "Abiertas / Cerradas" filter in Mis solicitudes. */
export const OPEN_STATUSES: readonly TicketStatus[] = ["nuevo", "en_revision", "planeado", "en_progreso"];
export const CLOSED_STATUSES: readonly TicketStatus[] = ["resuelto", "descartado"];

export const KIND_LABEL: Record<TicketKind, string> = {
  error: "Algo falla",
  mejora: "Una mejora",
  pregunta: "Una pregunta",
};

export const STATUS_LABEL: Record<TicketStatus, string> = {
  nuevo: "Nueva",
  en_revision: "En revisión",
  planeado: "Planeada",
  en_progreso: "En progreso",
  resuelto: "Resuelta",
  descartado: "Descartada",
};

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
};

export const AREA_LABEL: Record<TicketArea, string> = {
  inicio: "Inicio",
  tareas: "Tareas",
  calendario: "Calendario",
  proyectos: "Proyectos",
  personas: "Personas",
  "mi-espacio": "Mi espacio",
  biblioteca: "Biblioteca",
  asistente: "Asistente",
  ajustes: "Ajustes",
  otro: "Otro",
};

/** What the client sends about where the solicitud was filed from. */
export type TicketClientContext = {
  path: string;
  estilo: string;
  theme: string;
  viewport: string;
  userAgent: string;
};

/** Stored `support_tickets.context`: the client part plus what the server adds. */
export type TicketContext = TicketClientContext & {
  appVersion: string;
  /** ISO timestamp. */
  occurredAt: string;
};

/** The form values of "Reportar o sugerir". */
export type TicketDraft = {
  kind: TicketKind;
  title: string;
  description: string;
  /** Only for `error`. */
  steps?: string | null;
};

/** Input of `createTicketAction`: the draft plus the captured client context. */
export type CreateTicketInput = TicketDraft & { context: TicketClientContext };

export type TicketPerson = { id: string; name: string; photoUrl: string | null };

/** `support_ticket_events.payload`: before/after for changes, `text` for messages, GitHub data for `published` and `synced`. */
export type TicketEventPayload = {
  text?: string;
  from?: string | null;
  to?: string | null;
  duplicateOf?: { id: string; code: string };
  github?: { number: number; url: string };
};

export type TicketListRow = {
  id: string;
  /** `SOL-0001`. */
  code: string;
  kind: TicketKind;
  title: string;
  area: TicketArea;
  status: TicketStatus;
  priority: TicketPriority | null;
  author: TicketPerson;
  assignee: TicketPerson | null;
  githubIssueNumber: number | null;
  githubIssueUrl: string | null;
  attachmentCount: number;
  /** ISO timestamps. */
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
};

export type TicketEvent = {
  id: string;
  ticketId: string;
  type: TicketEventType;
  visibility: TicketVisibility;
  /** Null = the system or the GitHub sync. */
  actor: TicketPerson | null;
  payload: TicketEventPayload;
  createdAt: string;
};

export type TicketAttachment = { id: string; name: string; mime: string; size: number };

export type TicketDetail = TicketListRow & {
  description: string;
  steps: string | null;
  context: TicketContext;
  duplicateOf: { id: string; code: string } | null;
  githubSyncedAt: string | null;
  /** The author gets `public` events only. */
  events: TicketEvent[];
  attachments: TicketAttachment[];
};

export type TicketSort = "updated" | "created" | "priority";

/** Filters of Mis solicitudes (`status` only) and of Mejoras (all). */
export type TicketFilters = {
  /** `abiertas` / `cerradas` group the statuses; Mis solicitudes uses them. */
  status?: TicketStatus | "abiertas" | "cerradas";
  kind?: TicketKind;
  area?: TicketArea;
  priority?: TicketPriority;
  assigneeId?: string;
  /** "Sin asignar". */
  unassigned?: true;
  authorId?: string;
  /** Text search on title, description and code. */
  q?: string;
  sort?: TicketSort;
};

export type TicketsPage = { rows: TicketListRow[]; nextCursor: string | null };

/** Counts per status over the whole table and the `nuevo` count for the nav badge. */
export type MejorasCounts = {
  byStatus: Record<TicketStatus, number>;
  nuevo: number;
  total: number;
  /** Solicitudes resolved in the current month (header stat of Mejoras). */
  resolvedThisMonth?: number;
  /** Mean hours from creation to the first public reply or status change; null while there is none. */
  firstResponseHours?: number | null;
};

/** `updateTicketAction` patch; `message` is the public text required to close as `descartado`. */
export type TicketPatch = {
  status?: TicketStatus;
  priority?: TicketPriority | null;
  assigneeId?: string | null;
  message?: string;
};

export type TicketMessageInput = { text: string; visibility: TicketVisibility };

export type PublishTicketInput = {
  title: string;
  body: string;
  labels: string[];
  /** The admin ticked "Sin nombres de clientes, personas, correos ni datos internos"; the action refuses without it. */
  confirmedRedaction?: boolean;
};

/** What "Publicar en GitHub…" shows: the redacted template and whether publishing is possible. */
export type PublishDraftData = {
  code: string;
  title: string;
  body: string;
  labels: string[];
  /** The redaction changed something in the draft. */
  redacted: boolean;
  /** `GITHUB_PAT` and `GITHUB_REPO` are set. */
  configured: boolean;
  /** Set when the solicitud already has an issue. */
  published: { number: number; url: string } | null;
};
