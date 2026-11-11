/**
 * Redesign contracts (BE §6, FE §7.1): the canonical types shared by the
 * server actions and the UI. Re-exported from `lib/types/core.ts`. Widget data
 * shapes live in `lib/types/widgets.ts`.
 */
import type { CalendarEvent } from "@/lib/types/calendar";
import type { AssistantCalendarContext } from "@/lib/types/calendario";
import type { HistoryEntity, Staff, TaskListItem, TaskStatus } from "@/lib/types/core";
import type {
  AgendaItem,
  Availability,
  AttentionItem,
  DistributionSegment,
  KpiDatum,
  PersonDatum,
  ProgressItem,
  TramoKey,
} from "@/lib/types/widgets";

// ── Appearance ──────────────────────────────────────────────────────────────
export type ThemeId = "azul" | "calido" | "grafito";
export type ColorMode = "light" | "dark" | "system";
export type PresentationStyle = "visual" | "esencial" | "analitico";
export type Density = "comoda" | "compacta";
export type TextSize = 13 | 13.5 | 14 | 14.5 | 15 | 15.5 | 16;

export type UserPreferences = {
  /** null = organization theme. */
  theme: ThemeId | null;
  mode: ColorMode;
  /** null = organization default style. */
  style: PresentationStyle | null;
  density: Density;
  textSize: TextSize;
  /** "HH:MM" pair. */
  quietHours: { from: string; to: string } | null;
  /**
   * "Ocultar completadas" in the task tables (#1039), server-persisted per
   * user. Missing means `DEFAULT_HIDE_COMPLETED_TASKS`.
   */
  hideCompletedTasks?: boolean;
};

export type TokenName =
  | "background" | "foreground" | "card" | "card-foreground" | "popover" | "popover-foreground"
  | "primary" | "primary-foreground" | "secondary" | "secondary-foreground" | "muted" | "muted-foreground"
  | "accent" | "accent-foreground" | "destructive" | "warning" | "warning-ink" | "success"
  | "border" | "border-strong" | "input" | "ring"
  | "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5"
  | "chart-1-ink" | "chart-2-ink" | "chart-3-ink" | "chart-4-ink" | "chart-5-ink"
  | "tint-primary" | "tint-violet" | "tint-warning" | "tint-cyan" | "tint-destructive" | "tint-success"
  | "destructive-ink" | "foreground-soft"
  | "sidebar" | "sidebar-foreground" | "sidebar-primary" | "sidebar-primary-foreground"
  | "sidebar-accent" | "sidebar-accent-foreground" | "sidebar-border" | "sidebar-ring";

export type TypeRole = "pageTitle" | "sectionTitle" | "cardTitle" | "body" | "label" | "kpi";
export type FontWeight = 400 | 500 | 600;
export type FontFamily = "Geist" | "Inter" | "DM Sans";
export type ShadowLevel = "none" | "suave" | "marcada";

export type OrgAppearance = {
  baseTheme: ThemeId;
  tokens: Record<TokenName, { light: string; dark: string }>;
  typeScale: Record<TypeRole, { size: number; weight: FontWeight }>;
  fontFamily: FontFamily;
  shape: { radius: number; cardPadding: number; gap: number; shadow: ShadowLevel };
  styleDefault: PresentationStyle;
  allowUserOverride: boolean;
};

/**
 * What `app_settings('appearance.theme')` stores inside `{ version: 1, data }`:
 * the org appearance plus the integer `v` bumped on every save (review B2).
 */
export type StoredOrgAppearance = OrgAppearance & { v: number };

export type ResolvedAppearance = {
  theme: ThemeId;
  mode: ColorMode;
  style: PresentationStyle;
  density: Density;
  textSize: TextSize;
  /** Review B2. */
  cssVars: { light: Record<string, string>; dark: Record<string, string> };
  /** Appearance version `v` (bumped on every org save). */
  version: number;
};

/** JSON in the `cincel-appearance` cookie (BE §8.2). Unsigned; the server re-validates every value. */
export type AppearanceCookie = {
  theme: ThemeId;
  mode: ColorMode;
  style: PresentationStyle;
  density: Density;
  textSize: TextSize;
  v: number;
};

// ── Notifications ───────────────────────────────────────────────────────────
export type NotificationKind =
  | "asignacion" | "mencion" | "vencimiento" | "comentario" | "aprobacion_cliente" | "recordatorio" | "sistema" | "reunion";

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  entity: HistoryEntity | null;
  entityId: string | null;
  url: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationPreferenceRow = { kind: NotificationKind; inApp: boolean; email: boolean; digest: boolean };

export type NotificationPreferences = {
  rows: NotificationPreferenceRow[];
  quietHours: { from: string; to: string } | null;
};

export type NotificationsPage = { items: NotificationItem[]; nextCursor: string | null; unreadCount: number };

/** Bandeja counts of one kind (`fetchNotificationsSummaryAction`); `latestAt` is ISO, null without rows. */
export type NotificationKindSummary = { kind: NotificationKind; unread: number; total: number; latestAt: string | null };

// ── Mi espacio ──────────────────────────────────────────────────────────────
export type NoteColor = "neutral" | "blue" | "amber" | "violet" | "cyan";

export type Note = {
  id: string;
  title: string;
  body: string;
  color: NoteColor;
  pinned: boolean;
  projectId: string | null;
  updatedAt: string;
};

export type ChecklistItem = { id: string; text: string; done: boolean; sortOrder: number };
/**
 * `projectName`: the linked project's name, null without one. `updatedAt`
 * (ISO): the latest change of the checklist or any of its items.
 */
export type Checklist = {
  id: string;
  title: string;
  projectId: string | null;
  projectName: string | null;
  updatedAt: string;
  items: ChecklistItem[];
};

export type ReminderRepeat = "none" | "daily" | "weekly" | "monthly";
export type ReminderChannel = "app" | "email";

export type Reminder = {
  id: string;
  text: string;
  dueAt: string;
  repeat: ReminderRepeat;
  channels: ReminderChannel[];
  taskId: string | null;
  projectId: string | null;
  firedAt: string | null;
  cancelledAt: string | null;
};

/** Output of `parseReminderTextAction` / `parseReminderText` (BE §8.4). */
export type ParsedReminder = { cleanText: string; dueAt: string | null; repeat: ReminderRepeat };

// ── Gmail ───────────────────────────────────────────────────────────────────
export type GmailThreadSummary = {
  id: string;
  subject: string;
  /** "<name> <email>" rendered from `from_name` / `from_email`. */
  from: string;
  snippet: string;
  receivedAt: string;
  unread: boolean;
  projectId: string | null;
  suggestedProjectId: string | null;
};

export type GmailMessage = {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  date: string;
  /** Sanitized server-side. */
  html: string;
  text: string;
};

export type GmailAttachment = { messageId: string; attachmentId: string; name: string; mime: string; size: number };

export type GmailStatus = { connected: boolean; scopeOk: boolean; lastSyncedAt: string | null; lastError: string | null };

export type GmailDraft = { draftId: string; confirmToken: string; expiresAt: string };

// ── Control de horario ──────────────────────────────────────────────────────
export type TimeTrackingSettings = {
  enabled: boolean;
  requiredFrom: string | null;
  dayStart: string;
  dayEnd: string;
  hoursPerDay: number;
  lateToleranceMin: number;
  workDays: number[];
  promptAtLogin: boolean;
  autoCloseAt: string | null;
  lunchMinutes: number;
  exemptRoles: string[];
};

export type TodayStatus = {
  state: "off" | "on" | "pausa" | "done";
  startedAt: string | null;
  workedSeconds: number;
  required: boolean;
  promptAtLogin: boolean;
  enabled: boolean;
  /** For the sidebar TimeClock (one call from the layout). */
  requiredFrom: string | null;
  hoursPerDay: number;
};

export type TimeEntrySource = "sidebar" | "login" | "assistant";

export type DayHours = { date: string; hours: number };

export type WeekHours = { days: DayHours[]; total: number; target: number };

/**
 * Ajustes › Perfil page data (`qk.ajustes.page('perfil')`): the caller's own
 * profile only. The photo is not here: it comes from `qk.me.profile()`.
 */
export type PerfilData = {
  staffId: string;
  name: string;
  phone: string;
  /** Read-only: from Google. */
  email: string;
  /** Read-only: the person's puestos in Equipo ("" = none). */
  puesto: string;
  emailSignature: string;
  /** null = time tracking off for this person (only shown when tracking is enabled for them). */
  week: WeekHours | null;
};

export type TeamHoursRow = {
  staffId: string;
  name: string;
  days: DayHours[];
  total: number;
  target: number;
  lateCount: number;
  status: "completo" | "incompleto" | "sin_registro";
  /** A day of the week was closed automatically (`time_entries.closed_by = 'auto_close'`): "Salida sin registrar". */
  needsReview: boolean;
};

// ── Vacations ───────────────────────────────────────────────────────────────
export type VacationKind = "vacaciones" | "personal" | "enfermedad";
export type VacationStatus = "pendiente" | "aprobada" | "rechazada" | "cancelada";

export type VacationRequest = {
  id: string;
  from: string;
  to: string;
  kind: VacationKind;
  comment: string;
  status: VacationStatus;
};

export type VacationBalance = { entitled: number; taken: number; pending: number; available: number };

export type PendingVacationRequest = VacationRequest & { staffId: string; name: string; days: number };

export type TeamAbsence = { staffId: string; name: string; from: string; to: string; kind: VacationKind | "ausencia" };

export type VacationSettingsView = {
  daysPerYear: number;
  overrides: { staffId: string; name: string; days: number | null }[];
};

export type VacationSettings = { daysPerYear: number };

// ── Search ──────────────────────────────────────────────────────────────────
export type SearchResultType = "proyecto" | "tarea" | "persona" | "archivo" | "nota";

export type SearchResult = {
  /** "Acciones" is a static frontend group; the backend never returns it. */
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string;
  url: string;
};

// ── Assistant ───────────────────────────────────────────────────────────────
export type AssistantContext = {
  route: string;
  projectId?: string;
  taskId?: string;
  personId?: string;
  /** Present on /calendario (Calendario BE §6.1): dates, ids and enums only. */
  calendar?: AssistantCalendarContext;
};

export type AssistantActionStatus = "proposed" | "confirmed" | "cancelled" | "done" | "failed";

/** Audit of approval-gated tool calls (review B9). */
export type AssistantActionRecord = {
  id: string;
  threadId: string;
  toolCallId: string;
  tool: string;
  summary: string;
  input: unknown;
  status: AssistantActionStatus;
  result: unknown | null;
  error: string | null;
  createdAt: string;
  decidedAt: string | null;
};

export type AssistantThreadSummary = {
  id: string;
  title: string;
  updatedAt: string;
  /** ISO; `assistant_threads.pinned_at`, null when not pinned. */
  pinnedAt: string | null;
  /** `assistant_actions` rows of the thread still `proposed`. */
  pendingApprovals: number;
  /** The last assistant message is newer than `last_read_at`. */
  unread: boolean;
  /** Non-widget tool calls of the thread (`assistant_threads.tool_call_count`). */
  toolCalls: number;
};

// ── Aggregates (BE §7.10–§7.12, FE §7.1) ────────────────────────────────────
export type InicioData = {
  /** proyectos_activos, vencidas, bloqueadas, revisiones_7d, completadas_semana (visibleIn: ["analitico"]). */
  kpis: KpiDatum[];
  /** value = open, secondary = overdue, extra = { diasProm }. */
  tasksByTramo: DistributionSegment[];
  /** 12 weeks, oldest first: a fixed window; the client shows the last 4 / 8 / 12 (`sliceToRange`). */
  weeklyPace: { weekStart: string; created: number; completed: number }[];
  attention: AttentionItem[];
  /** Events, tasks due today, the caller's reminders. */
  myDay: AgendaItem[];
  /**
   * The caller's week (Inicio Esencial): `today` is `myDay`; `week` holds the
   * caller's agenda items from tomorrow to the week's Sunday (Mexico City),
   * by date then time; `total` counts the distinct tasks of both (events and
   * reminders left out).
   */
  myWeek: { today: AgendaItem[]; week: AgendaItem[]; total: number };
  /** Attention items that involve the caller (responsable or support), today. */
  myAttention: number;
  /** Whose tasks `weeklyPace` counts: "mine" for `dataScope` `assigned_tasks`, else "team" (omitted = "team"). */
  paceScope?: "mine" | "team";
  projectsProgress: ProgressItem[];
  workload: PersonDatum[];
  /** Inicio Visual greeting hero (#989). */
  hero: InicioHero;
  /** Staff of the dashboard scope with an open time entry today; null without `showTeamWorkload`. */
  openShifts: InicioOpenShifts | null;
  /** Today's scoped events plus the open tasks due today (`entrega`), by time (Inicio Visual and Analítico). */
  todayAgenda: InicioAgendaItem[];
  /** Open tasks per tramo and responsable (Inicio Analítico filters on Tramos and Carga). */
  tasksByTramoAssignee?: InicioTramoAssigneeRow[];
  /** The caller's Inicio sections (`resolveDashboardCapabilities(user).sections`). */
  sections?: { showTeamWorkload: boolean; showProjectRisk: boolean };
};

/** Hero counts: open tasks due today, overdue tasks, their distinct projects, the project with most overdue. */
export type InicioHero = {
  dueToday: number;
  overdue: number;
  overdueProjects: number;
  focusProject: { id: string; name: string; href: string } | null;
};

export type InicioOpenShifts = {
  count: number;
  people: { id: string; initials: string; tramo: TramoKey | null }[];
};

/** One "Agenda de hoy" row: an event or a delivery (open task due today) with its responsable. */
export type InicioAgendaItem = AgendaItem & {
  kind: "evento" | "entrega";
  assignee: { id: string; name: string; initials: string } | null;
};

/** Open tasks of one tramo and one responsable (null = sin responsable); `ageDays` sums creation → today. */
export type InicioTramoAssigneeRow = {
  tramo: TramoKey;
  assigneeId: string | null;
  open: number;
  overdue: number;
  ageDays: number;
};

export type PersonaDetail = {
  staff: Staff;
  person: PersonDatum;
  /** abiertas, vencidas, horas_semana (viewer/self), proyectos_activos. */
  stats: KpiDatum[];
  /** sublabel = role: responsable | coordinador | miembro. */
  projects: ProgressItem[];
  /** Open assigned tasks, overdue first. */
  tasks: AttentionItem[];
  weekHours: DayHours[] | null;
  /** Mon–Fri. */
  availability: Availability[];
  /**
   * The person's last 10 actions (their history events on tasks and
   * projects), newest first. Admin-task events and admin-only project fields
   * (client, origin, contract amount) only with `canSeeAdminData`.
   */
  recentActivity: PersonaActivityItem[];
};

/** One "Actividad reciente" row of Persona detalle (BE §7.11). */
export type PersonaActivityItem = {
  id: string;
  /** Spanish sentence, e.g. "Movió “Casa Lomas” a 90%" or "Comentó en “Plano de acabados”". */
  text: string;
  /** ISO timestamp of the event. */
  at: string;
  /** "hoy 10:12", "ayer 17:40", "4 nov 9:30" in the org time zone. */
  when: string;
  /** The task or project the event is on. */
  href: string;
};

/** One week of a person's load (Personas, Estilos Phase 5). */
export type WeekLoad = {
  /** ISO Monday, org time zone. */
  weekStart: string;
  /** Open tasks counted in that week (week 1: overdue + undated + due this week). */
  open: number;
  /** round(open ÷ effectiveCapacity × 100), effectiveCapacity = capacity × (5 − absentDays) ÷ 5; 0 when that is 0. */
  occupancyPct: number;
  /** Approved absence days Mon–Fri, 0–5. */
  absentDays: number;
};

/**
 * An approved absence (ISO dates, inclusive). `kind` is the stored kind only
 * for the person themself and `canDecideVacations`; everyone else gets
 * "ausencia" (BE §8.8).
 */
export type AbsenceRange = { from: string; to: string; kind: VacationKind | "ausencia" };

/** A person's open tasks in one project (Personas Analítico). */
export type PersonProjectLoad = {
  projectId: string;
  name: string;
  tramo: TramoKey | null;
  open: number;
  overdue: number;
  /** Open tasks per week, same weeks as `weeks`. */
  weeks: [number, number, number, number];
};

export type PeopleOverviewRow = {
  staffId: string;
  open: number;
  overdue: number;
  activeProjects: number;
  /** open / capacity × 100 (capacity 0 → 0). */
  occupancyPct: number;
  /** canViewTeamHours or self, else null. */
  weekHours: number | null;
  /** Mon–Fri. */
  availability: Availability[];
  /** Length 4, this Monday first. */
  weeks: WeekLoad[];
  /** Approved absences overlapping the 4 weeks. */
  absences: AbsenceRange[];
  /** Sorted overdue desc, then open desc. */
  projects: PersonProjectLoad[];
  /** The person shares at least one active project with the viewer (the viewer's own row: true). */
  sharesProjectWithViewer: boolean;
};

export type PortfolioRow = {
  projectId: string;
  /** 0–100 (Cronograma progress when a schedule exists, else projects.progress). */
  real: number;
  /** Schedule planned % today. */
  plan: number | null;
  /** real − plan (points). */
  deviation: number | null;
  /** canSeeAdminData only, else null. */
  budgetSpentPct: number | null;
  /** Admin tasks excluded unless canSeeAdminData. */
  open: number;
  overdue: number;
  /** Mean days late of open overdue tasks today (1 decimal); null when none. */
  avgDelayDays: number | null;
  /** Overdue open tasks as of today − 7 (current commitment dates). */
  overdueWeekAgo: number;
  /** avgDelayDays as of today − 7; null when none. */
  avgDelayWeekAgo: number | null;
  /** To projects.end_date. */
  daysToDelivery: number | null;
  /** Next open non-admin task by commitment date. */
  nextDelivery: { title: string; date: string } | null;
  /** Open tasks per day, last 7 days. */
  series7: number[];
};

// ── Existing DTOs under the names FE §4 props use ───────────────────────────
// FE §4.5–§4.6 and §4.10.1 name these without defining them; they are the
// return shapes of the existing actions the pages already load.

/** A board grouped by base status (`TaskBoardWidget`; built from `tareas.board(f)` columns). */
export type TaskBoard = Record<TaskStatus, TaskListItem[]>;

/** `fetchCalendarAction` result for the selected range. */
export type CalendarData = TaskListItem[];

/** `fetchAssignableStaffAction` row. */
export type StaffOption = Staff & { suggested: boolean };

/** One calendar event as the calendar views render it. */
export type CalendarItem = CalendarEvent;

/** A project reference (same pattern as `StaffRef`). */
export type ProjectRef = { id: string; name: string };

/** What `StatusChip` maps to `StatusBadge` `{ label, token }`: the base status and the custom status, if any. */
export type TaskStatusRef = { status: TaskStatus; customStatus: TaskListItem["customStatus"] };
