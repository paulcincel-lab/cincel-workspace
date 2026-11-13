/**
 * Calendario types (BE §5–§6, §9–§10, §11; FE §2.4, §9). Client-safe: no server imports.
 * Later issues may add optional fields only.
 */
import type { TaskPriority, TaskStatus } from "@/lib/types/core";

// ── Views, filters, input (BE §5.1) ─────────────────────────────────────────
export type CalView = "dia" | "semana" | "mes";
export type CalMostrar = "todo" | "tareas" | "reuniones";
export type CalendarioFilters = {
  mostrar: CalMostrar;
  /** `todos` needs `canViewTeamCalendar`, else it is forced to `yo`. */
  quien: "yo" | "todos";
  /** Project ids, [] = all. */
  proyectos: string[];
  /** Workflow id, "none" = sin etapa. */
  etapa: string | null;
  /** Staff id, only with `quien = "todos"`. */
  responsable: string | null;
  /** Include tasks where the person is support (default true). */
  apoyo: boolean;
  ocultarCompletadas: boolean;
};
export type CalendarioRangeInput = { view: CalView; from: string; to: string; filters: CalendarioFilters };

// ── URL query (FE §2.4) ─────────────────────────────────────────────────────
export type CalendarioQuery = {
  vista: CalView;
  /** YYYY-MM-DD anchor inside the range. */
  fecha: string;
  filters: CalendarioFilters;
  modo: "planear" | null;
  /** "e:<uuid>" or "t:<uuid>". */
  evento: string | null;
  tarea: string | null;
  propuesta: string | null;
  nueva: "reunion" | null;
};

// ── Range output (BE §5.2) ──────────────────────────────────────────────────
export type AttendeeResponse = "pendiente" | "acepta" | "rechaza" | "tentativo";
export type LoadLabel = "libre" | "bien" | "casi_lleno" | "sobrecargado";
export type MinutesState = "ninguna" | "borrador" | "lista" | "enviada";

/** `google_sync_error` values the UI reads (BE §7.5; D1, D13). */
export type GoogleSyncError =
  | "NO_GRANT"
  | "ACCESS_DENIED"
  | "UNAVAILABLE"
  | "RATE_LIMITED"
  | "REAUTH"
  | "GONE"
  | "NOT_ORGANIZER";
export type InvitesVia = "google" | "cincel";

export type CalEtapaRef = { id: string; key: string | null; name: string; colorSlot: 1 | 2 | 3 | 4 | 5 | null };
export type CalPersonRef = { id: string; name: string };
export type CalTaskItem = {
  kind: "task";
  /** "t:" + taskId */
  id: string;
  taskId: string;
  title: string;
  /** Due date shown: commitment_date ?? delivery_date. */
  date: string;
  dateField: "commitmentDate" | "deliveryDate";
  project: { id: string; name: string } | null;
  etapa: CalEtapaRef | null;
  phase: { id: string; name: string } | null;
  status: TaskStatus;
  statusLabel: string;
  priority: TaskPriority;
  manager: CalPersonRef | null;
  support: CalPersonRef[];
  overdue: boolean;
  completed: boolean;
  blocked: boolean;
  hours: number;
  hoursSource: "task" | "template" | "default";
  parentTaskId: string | null;
  /** The viewer may change its date. */
  canEdit: boolean;
};
export type CalEventAttendee = { name: string; staffId: string | null; response: AttendeeResponse };
export type CalEventItem = {
  kind: "event";
  /** "e:" + eventId */
  id: string;
  eventId: string;
  source: "cincel" | "google";
  title: string;
  date: string;
  /** ISO with offset. */
  start: string;
  end: string;
  allDay: boolean;
  project: { id: string; name: string } | null;
  etapa: CalEtapaRef | null;
  location: string | null;
  meetUrl: string | null;
  attendees: CalEventAttendee[];
  attendeeCount: number;
  organizer: CalPersonRef | null;
  googleHtmlLink: string | null;
  syncedAt: string | null;
  syncError: string | null;
  minutes: MinutesState;
  /** Organizer, or admin on a Cincel meeting. */
  canEdit: boolean;
  /** How the attendees were invited (BE §7.6); null for cached Google events. */
  invitesVia?: InvitesVia | null;
};
export type CalItem = CalTaskItem | CalEventItem;
export type CalDay = {
  date: string;
  tasks: number;
  events: number;
  overdue: number;
  completed: number;
  /** Items returned for the day (<= perDayLimit). */
  shown: number;
  /** Planned hours of the viewer (quien = yo); null when quien = todos. */
  hours: number | null;
  workday: number | null;
  loadLabel: LoadLabel | null;
  overlaps: number;
};
export type CalKpis = {
  tasks: number;
  meetings: number;
  meetingHours: number;
  overdue: number;
  overduePct: number;
  unassigned: number;
};
export type CalendarioRange = {
  from: string;
  to: string;
  today: string;
  days: CalDay[];
  items: CalItem[];
  kpis: CalKpis;
  /** Some day has more than perDayLimit. */
  truncated: boolean;
  google: { connected: boolean; eventsGrant: boolean; syncedAt: string | null; error: string | null };
};

// ── List (BE §5.4) ──────────────────────────────────────────────────────────
export type CalendarioListInput = {
  from: string;
  to: string;
  filters: CalendarioFilters;
  cursor?: string | null;
  limit?: number;
  orderDir?: "asc" | "desc";
};
export type CalendarioListPage = { rows: CalItem[]; nextCursor: string | null; total: number };

// ── Load (BE §9) ────────────────────────────────────────────────────────────
export type DayLoad = {
  date: string;
  staffId: string;
  hours: number;
  workday: number;
  label: LoadLabel;
  tasks: { taskId: string; hours: number }[];
  meetings: { eventId: string; hours: number }[];
  overlaps: [string, string][];
};

// ── Proposals (BE §6.2, ADR 0007) ───────────────────────────────────────────
export type ProposalKind =
  | "mover_tareas"
  | "crear_reunion"
  | "editar_reunion"
  | "cancelar_reunion"
  | "repartir"
  | "resolver_traslape"
  | "pasar_a_manana"
  | "planear_semana"
  | "crear_tareas_minuta";
export type ProposalStatus = "propuesta" | "aplicada" | "parcial" | "cancelada" | "expirada" | "deshecha";

export type MeetingDraft = {
  title: string;
  start: string;
  end: string;
  projectId: string | null;
  location: string | null;
  meet: boolean;
  attendees: { staffId?: string; contactId?: string; email: string; name: string }[];
  description?: string;
};
export type MeetingPatch = Partial<Pick<MeetingDraft, "title" | "start" | "end" | "location" | "attendees">>;

export type ProposalChange =
  | {
      changeId: string;
      type: "task_date";
      taskId: string;
      title: string;
      projectName: string | null;
      before: { date: string | null; field: "commitmentDate" | "deliveryDate" };
      after: { date: string };
      reason?: string;
      staffId: string | null;
    }
  | { changeId: string; type: "event_create"; draft: MeetingDraft }
  | { changeId: string; type: "event_update"; eventId: string; before: MeetingPatch; after: MeetingPatch; notify: boolean }
  | { changeId: string; type: "event_cancel"; eventId: string; notify: boolean }
  | {
      changeId: string;
      type: "task_create";
      draft: {
        title: string;
        projectId: string;
        managerId: string | null;
        commitmentDate: string | null;
        etapaId: string | null;
        /** Compatibility: proposals saved before the rename carry `tramoId` instead of `etapaId`. */
        tramoId?: string | null;
        sourceText: string;
      };
    }
  | { changeId: string; type: "decision"; minutesId: string; text: string };

/** What did not fit, with the reason ("Jorge ya está al 100 %"). */
export type DeferredItem = { taskId: string; title: string; reason: string };
export type Proposal = {
  id: string;
  kind: ProposalKind;
  status: ProposalStatus;
  title: string;
  line: string;
  rangeFrom: string | null;
  rangeTo: string | null;
  changes: ProposalChange[];
  deferred: DeferredItem[];
  createdAt: string;
  expiresAt: string;
};
export type AppliedChange = { changeId: string; entity: "task" | "event" | "decision"; entityId: string; undo: unknown };
export type ApplyProposalResult = {
  proposalId: string;
  applied: string[];
  skipped: { changeId: string; reason: string }[];
  undoToken: string | null;
  undoExpiresAt: string | null;
  toast: string;
};
export type UndoProposalResult = { restored: string[]; skipped: { changeId: string; reason: string }[]; toast: string };

/** Page context for the asistente (BE §6.1). */
export type AssistantCalendarContext = {
  view: CalView;
  from: string;
  to: string;
  filters: Pick<CalendarioFilters, "mostrar" | "quien" | "proyectos" | "ocultarCompletadas">;
  selectedDate?: string;
  /** "t:<uuid>" | "e:<uuid>" */
  selectedItemId?: string;
  openProposalId?: string;
};

// ── Summaries (BE §10.1) ────────────────────────────────────────────────────
export type SummaryAction =
  | { kind: "prepare"; eventId: string; label: "Prepárame"; tool: "meeting_prep" }
  | { kind: "defer"; taskId: string; label: "Pasar a mañana"; tool: "move_tasks" }
  | { kind: "assign"; taskId: string; label: "Asignar"; tool: "assign_task" }
  | { kind: "notify"; taskId: string; staffId: string; label: string; tool: "notify_people" }
  | { kind: "propose_date"; taskId: string; label: "Propón fecha"; tool: "move_tasks" }
  | { kind: "resolve"; eventIds: [string, string]; label: "Resolver"; tool: "resolve_overlap" }
  | { kind: "redistribute"; date: string; label: "Reparte esto"; tool: "propose_redistribution" };
export type SummaryItem = { id: string; title: string; line: string; action: SummaryAction | null };
export type SummaryTile = { key: "reuniones" | "vence" | "riesgo" | "bloqueas"; label: string; count: number; items: SummaryItem[] };
export type DaySummary = {
  date: string;
  greeting: string;
  lead: string;
  tiles: SummaryTile[];
  primary: SummaryAction;
};
export type WeekSummary = {
  from: string;
  greeting: string;
  lead: string;
  tiles: SummaryTile[];
  overloadedDays: { date: string; hours: number; workday: number }[];
  primary: { kind: "plan_week"; label: "Planea mi semana"; tool: "plan_week" };
};

// ── Meetings (BE §8, §10.2) ─────────────────────────────────────────────────
export type MeetingDetail = {
  item: CalEventItem;
  /** Open tasks of the project due before the meeting. */
  relatedOverdue: { taskId: string; title: string; date: string; daysLate: number; managerName: string | null }[];
  history: { id: string; at: string; text: string }[];
};
export type MeetingPrep = {
  eventId: string;
  kpis: {
    progressVsPlan: number | null;
    etapa: { name: string; phase: string | null } | null;
    overdue: number;
    open: number;
    lastMeeting: { date: string; decisions: number; open: number } | null;
  };
  overdue: { taskId: string; title: string; managerName: string | null; date: string; daysLate: number }[];
  agenda: string[];
  summary: string;
};
export type MeetingMinutes = {
  minutesId: string | null;
  eventId: string;
  notes: string;
  status: "borrador" | "lista" | "enviada";
  openPoints: string[];
  decisions: { id: string; text: string }[];
  tasks: { taskId: string; title: string }[];
  sentAt: string | null;
  updatedAt: string | null;
};

// ── Plan week (BE §10.4) ────────────────────────────────────────────────────
export type PlanWeekData = {
  weekStart: string;
  days: string[];
  backlog: { taskId: string; title: string; projectName: string | null; hours: number; priority: TaskPriority; managerId: string | null }[];
  people: { staffId: string; name: string; workday: number; absent: string[] }[];
  cells: { staffId: string; date: string; before: number; after: number; workday: number }[];
};

// ── Query-layer shapes ──────────────────────────────────────────────────────
export type DetailAction = {
  key: string;
  label: string;
  primary?: boolean;
  href?: string;
  onSelect?(): void;
  /** "Cambiar fecha": the date picker of the Esencial sheet hands the picked day here. */
  onPickDate?(date: string): void;
  disabled?: boolean;
};
