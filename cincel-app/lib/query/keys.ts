/**
 * The TanStack Query key factory (Query Migration plan §4.2). Frozen in
 * Phase 1a: a later phase only adds keys inside its own domain section, and
 * renames go through a 1a follow-up. `tests/unit/query/keys.test.ts`
 * snapshots every shape so a change shows up in review.
 *
 * Rules:
 * - `tareas.page(q)` never carries `cursor` or `limit`; the cursor is the
 *   `useInfiniteQuery` page param.
 * - `estilo` is part of `tareas.page(q)` only (it picks what the bundle seeds); no other key carries it.
 * - Ajustes keys are always `qk.ajustes.page('<seg>', input?)`.
 *
 * Client-safe: type-only imports.
 */
import type { AjustesAdminSegment } from "@/lib/auth/ajustes-segments";
import type { PersonasContactsTab } from "@/lib/personas/contacts";
import type { ImportDataEntity } from "@/lib/repositories/import-repository";
import type { TareasMostrar } from "@/lib/tareas/query";
import type { TaskStatus } from "@/lib/types/core";
import type { PresentationStyle } from "@/lib/types/redesign";

/** The filters every Tareas view shares (the URL filters). */
export type TareasListFilters = {
  tramo: string | null;
  proyecto: string | null;
  responsable: "yo" | string | null;
  estado: TaskStatus | null;
  q: string | null;
  /** Left out for "todas", so the keys of the other filters stay as they were. */
  mostrar?: TareasMostrar;
  /** "Incluir apoyo" off (#1038): a responsable matches the Responsable only. Left out when on. */
  apoyo?: false;
  /** `tareas.list` only: "retraso" for the Analítico tramo groups (overdue first); left out for the default order. */
  orderBy?: "retraso";
};

/** `TareasPageInput` (plan §4.3) without `cursor` and `limit`: the input part of `qk.tareas.page`. */
export type TareasPageKeyInput = TareasListFilters & {
  /** The resolved presentation style: it picks what the bundle seeds (Visual: the board). */
  estilo: PresentationStyle;
};

/** Every Ajustes segment: the personal ones and the organization ones. */
export type AjustesSegment = "apariencia" | "integraciones" | "notificaciones" | "perfil" | AjustesAdminSegment;

export const qk = {
  shell: { badges: () => ["shell", "badges"] as const },
  org: { general: () => ["org", "general"] as const },
  me: {
    today: () => ["me", "today"] as const,
    /** One week of my hours; the no-arg form is the prefix of every week (the clock writes invalidate it). */
    weekHours: (weekStart?: string) =>
      weekStart ? (["me", "week-hours", weekStart] as const) : (["me", "week-hours"] as const),
    /** My open tasks (Mi espacio). */
    tasks: () => ["me", "tasks"] as const,
    preferences: () => ["me", "preferences"] as const,
    profile: () => ["me", "profile"] as const,
    notifications: (f: { unreadOnly?: boolean; kinds?: string[] }) => ["me", "notifications", f] as const,
    /** Unread and total per kind (Mi espacio Analítico); not under the `me.notifications` prefix. */
    notificationsSummary: () => ["me", "notifications-summary"] as const,
    gmail: {
      all: ["me", "gmail"] as const,
      status: () => ["me", "gmail", "status"] as const,
      threads: (q = "") => ["me", "gmail", "threads", { q }] as const,
      thread: (id: string) => ["me", "gmail", "thread", id] as const,
    },
    reminders: (range: "today-tomorrow") => ["me", "reminders", range] as const,
    /** The reminder dialog's natural-language parse of one text. */
    reminderParse: (text: string) => ["me", "reminder-parse", text] as const,
    checklists: () => ["me", "checklists"] as const,
    notes: () => ["me", "notes"] as const,
    vacations: () => ["me", "vacations"] as const,
    notificationPrefs: () => ["me", "notification-prefs"] as const,
  },
  inicio: () => ["inicio"] as const,
  tareas: {
    all: ["tareas"] as const,
    page: (q: TareasPageKeyInput) => ["tareas", "page", q] as const,
    list: (f: TareasListFilters) => ["tareas", "list", f] as const,
    facets: (f: TareasListFilters) => ["tareas", "facets", f] as const,
    /** Analítico counts per project and tramo (one grouping-sets query). */
    summary: (f: TareasListFilters) => ["tareas", "summary", f] as const,
    board: (f: TareasListFilters, columnId?: string) =>
      (columnId ? ["tareas", "board", f, columnId] : ["tareas", "board", f]) as readonly unknown[],
    /** Visual summary: the KPI 7-day series and deltas, people at work and the tasks due per day this week. */
    trend: (f: TareasListFilters) => ["tareas", "trend", f] as const,
    /** Esencial: the cards per project (counts and open rows, cap 200); `f` comes resolved (null responsable = everyone). */
    byProject: (f: TareasListFilters) => ["tareas", "by-project", f] as const,
    startSlot: (tramoId: string | null) => ["tareas", "start-slot", tramoId] as const,
    startPreview: (projectId: string, workflowId: string) => ["tareas", "start-preview", projectId, workflowId] as const,
  },
  tasks: {
    detail: (id: string) => ["tasks", id] as const,
    subtasks: (id: string) => ["tasks", id, "subtasks"] as const,
    dependencies: (id: string) => ["tasks", id, "dependencies"] as const,
    options: (projectId: string, q: string) => ["tasks", "options", projectId, q] as const,
  },
  importData: (entity: ImportDataEntity, id: string) => ["import-data", entity, id] as const,
  proyectos: {
    all: ["proyectos"] as const,
    list: () => ["proyectos", "list"] as const,
    /** The create dialog's "Tramo inicial" options (#1034). */
    createStart: () => ["proyectos", "create-start"] as const,
    detail: (id: string) => ["proyectos", id] as const,
    shell: (id: string) => ["proyectos", id, "shell"] as const,
    resumen: (id: string) => ["proyectos", id, "resumen"] as const,
    tab: (id: string, tab: "tareas" | "ficha" | "clientes") => ["proyectos", id, tab] as const,
    archivos: (id: string, folder: string | null) => ["proyectos", id, "archivos", folder ?? "root"] as const,
    cronograma: (id: string) => ["proyectos", id, "cronograma"] as const,
    history: (id: string) => ["proyectos", id, "history"] as const,
    clientesActivity: (id: string) => ["proyectos", id, "clientes", "activity"] as const,
    /** The ficha's "Reacomodar importación" state (5b), under `detail(id)`. */
    remap: (id: string) => ["proyectos", id, "remap"] as const,
    /** Resumen Analítico quick-add hint: who could take a task instead of `staffId` in `phaseId`. */
    assigneeSuggestion: (id: string, phaseId: string, staffId: string) =>
      ["proyectos", id, "assignee-suggestion", phaseId, staffId] as const,
  },
  personas: {
    equipo: () => ["personas", "equipo"] as const,
    counts: () => ["personas", "counts"] as const,
    contacts: (tab: PersonasContactsTab, tipo: string | null) => ["personas", "contacts", tab, tipo] as const,
    detail: (staffId: string) => ["personas", "detail", staffId] as const,
    /** The puestos catalog the collaborator editor reads when it opens. */
    positions: () => ["personas", "positions"] as const,
  },
  contacts: {
    detail: (id: string) => ["contacts", id] as const,
    history: (id: string) => ["contacts", id, "history"] as const,
  },
  biblioteca: { links: (section: string | null) => ["biblioteca", "links", section] as const },
  vacations: {
    absences: (month: string) => ["vacations", "absences", month] as const,
    pending: () => ["vacations", "pending"] as const,
    settings: () => ["vacations", "settings"] as const,
  },
  asistente: {
    threads: () => ["asistente", "threads"] as const,
    thread: (id: string) => ["asistente", "thread", id] as const,
    context: (c: { projectId?: string; taskId?: string; personId?: string }) => ["asistente", "context", c] as const,
  },
  ajustes: { page: (seg: AjustesSegment, input?: object) => ["ajustes", seg, input ?? {}] as const },
  monday: {
    run: (id: string) => ["monday", "run", id] as const,
    history: () => ["monday", "history"] as const,
    choices: () => ["monday", "choices"] as const,
    /** Run-scoped reads of the import wizard. */
    source: (runId: string) => ["monday", "source", runId] as const,
    options: (runId: string) => ["monday", "options", runId] as const,
    imported: (runId: string) => ["monday", "imported", runId] as const,
    rollbackCheck: (runId: string) => ["monday", "rollback-check", runId] as const,
    positionSuggestion: (runId: string, mondayUserId: string) =>
      ["monday", "position-suggestion", runId, mondayUserId] as const,
  },
  google: {
    driveStatus: () => ["google", "drive-status"] as const,
    /** One Drive browser listing: a folder (null = the server's root) or a search. */
    driveList: (folderId: string | null, q: string) => ["google", "drive-list", folderId, q] as const,
  },
  catalog: {
    tramos: () => ["catalog", "tramos"] as const,
    workflows: () => ["catalog", "workflows"] as const,
    taskStatuses: () => ["catalog", "task-statuses"] as const,
    staff: () => ["catalog", "staff"] as const,
    assignableStaff: (workflowId: string | null) => ["catalog", "assignable-staff", workflowId] as const,
    projectOptions: () => ["catalog", "project-options"] as const,
    projectSpaces: (pid: string) => ["catalog", "spaces", pid] as const,
    contacts: (type?: string) => ["catalog", "contacts", type ?? null] as const,
  },
  search: (q: string, types?: string[]) => ["search", q, types ?? null] as const,
  portal: {
    projects: () => ["portal", "projects"] as const,
    project: (id: string, tab: string) => ["portal", "project", id, tab] as const,
    files: (id: string, folder: string | null) => ["portal", "files", id, folder] as const,
    uploads: (id: string) => ["portal", "uploads", id] as const,
  },
} as const;

/** staleTime defaults per key family (plan §4.2). Queries pass these; the client default is 30 s. */
export const STALE = {
  catalog: 5 * 60_000,
  orgGeneral: 5 * 60_000,
  screen: 30_000,
  meToday: 60_000,
  shellBadges: 30_000,
  meNotifications: 30_000,
  meProfile: 5 * 60_000,
  meNotes: 5 * 60_000,
  asistenteThread: Infinity,
  ajustes: 5 * 60_000,
  ajustesGoogleHealth: 30_000,
  mondayRun: 0,
  search: 30_000,
  portal: 60_000,
} as const;
