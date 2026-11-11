/**
 * Proyecto · Resumen data (redesign FE §3.5, §4.10.2). Pure and client-safe:
 * turns what the page loads (project, portfolio row, tasks, schedule, files,
 * staff) into one data shape per library widget. The page passes the same
 * data to every style; the widgets decide how each style looks.
 *
 * Visibility (B8) is decided by the caller on the server: `showBudget` is
 * `canSeeAdminData`, and `showClientContacts` is `canSeeAdminData` or a
 * project member with `clients.canViewClients`. Without them the budget and
 * the client/contact rows are not built at all.
 */
import { cuttoLinks } from "@/lib/integrations/cutto-links";
import { ganttBySeccion, statusWeight } from "@/lib/cronograma/metrics";
import { dominantTramo, initialsOf } from "@/lib/people/aggregates";
import { READINESS } from "@/lib/project-flow/catalog";
import { zonedIsoDate } from "@/lib/dates/zoned-formatters";
import type { TramoStep } from "@/components/widgets/TramoStepperWidget";
import type { ProjectDetail, ProjectSpaceRef, ProjectStatus, TaskListItem, WorkflowPhaseRef, WorkflowRef } from "@/lib/types/core";
import type { HistoryEvent, StaffRef, TaskListRow, TaskStatus } from "@/lib/types/core";
import type { PortfolioRow } from "@/lib/types/redesign";
import type { PaymentRow, ScheduleTask } from "@/lib/types/schedule";
import type { EntityCard, KpiDatum, ProgressItem, RecordTableData } from "@/lib/types/widgets";
import type { StaffFileItem } from "@/lib/types/workspace-access";
import type { Group } from "@/components/widgets/GroupedTable";
import type { KpiStripItem } from "@/components/widgets/KpiStrip";
import { taskStatusLabel } from "@/lib/tasks/status-options";
import type { SCurvePoint } from "@/lib/types/schedule";

export type ProjectTaskStats = {
  total: number;
  done: number;
  open: number;
  overdue: number;
  /** Name of the first fase of the current tramo with open tasks; null when no task has a fase. */
  currentPhase: string | null;
  /** Id of that fase (the "fase i de n" index reads it, not the name). */
  currentPhaseId: string | null;
};

/**
 * A project team member as the Resumen sees them: only the project's own
 * staff (responsable, coordinación, miembros). `email` (the Cutto chat link)
 * is present only for administrators; `puesto` only with `team.canViewTeam`.
 */
export type ProjectStaffInfo = { id: string; name: string; email?: string; puesto?: string };

/** The task fields the Resumen counts (`TaskListRow` and `TaskListItem` both have them). */
export type ProjectStatsTask = Pick<TaskListItem, "archived" | "status" | "commitmentDate" | "workflowId" | "phase">;

export type ProjectSummaryInput = {
  project: ProjectDetail;
  portfolio: PortfolioRow | null;
  /** Every active tramo in order (Presale, Diseño, Construcción, …); empty = only the started ones. */
  tramoCatalog: WorkflowRef[];
  taskStats: ProjectTaskStats;
  schedule: { tasks: ScheduleTask[]; payments: PaymentRow[] } | null;
  /** Root items of the project's Drive folder; null when the folder can't be read. */
  files: StaffFileItem[] | null;
  spaces: ProjectSpaceRef[];
  /** By staff id, only the project's team: name, plus email (admins only, for the Cutto chat link) and puesto. */
  staff: Record<string, ProjectStaffInfo>;
  /** `canSeeAdminData`: budget bar and budget tables. */
  showBudget: boolean;
  /** "Cliente y contactos" (B8). */
  showClientContacts: boolean;
  /** YYYY-MM-DD (project timezone). */
  today: string;
  /** Active catalog fases per tramo (by workflow id), in `sortOrder`. */
  phasesByTramo: Record<string, WorkflowPhaseRef[]>;
  /** The project's Drive folder ("Abrir Drive"); null when it has none yet. */
  driveFolderUrl?: string | null;
  /** By staff id, only the project's team: open tasks across all projects against capacity. */
  teamLoad: TeamLoad;
};

export type ProjectSummaryData = {
  tramos: TramoStep[];
  avance: ProgressItem[];
  /** Admins only. */
  budget: ProgressItem[] | null;
  /** Admins only, and only with a payment calendar. */
  budgetTable: RecordTableData | null;
  kpis: KpiDatum[];
  partidas: ProgressItem[];
  recentFiles: { items: EntityCard[]; table: RecordTableData; total: number } | null;
  ficha: RecordTableData;
  /** "Cliente y contactos" (with the team) when allowed, else the team only under "Equipo". */
  contacts: { title: "Cliente y contactos" | "Equipo"; table: RecordTableData };
};

// ── Formatting (es-MX, lowercase, FE §13) ───────────────────────────────────

function isoToDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00Z`);
}

// One formatter per shape, built once: these run per Gantt bar and per file.
const SHORT_DATE = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });
const MONTH_YEAR = new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" });
const SHORT_MONTH = new Intl.DateTimeFormat("es-MX", { month: "short", timeZone: "UTC" });
const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });

/** "3 nov" */
export function shortDate(iso: string): string {
  return SHORT_DATE.format(isoToDate(iso)).replace(".", "").toLowerCase();
}

/** "abril 2026" */
export function monthYear(iso: string): string {
  return MONTH_YEAR.format(isoToDate(iso)).replace(" de ", " ").toLowerCase();
}

function shortMonth(iso: string): string {
  return SHORT_MONTH.format(isoToDate(iso)).replace(".", "").toLowerCase();
}

/** "abr – may"; one month when start and end share it; null without a start. */
export function monthRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const from = shortMonth(start);
  if (!end) return `desde ${from}`;
  const to = shortMonth(end);
  return from === to && start.slice(0, 7) === end.slice(0, 7) ? from : `${from} – ${to}`;
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((isoToDate(toIso).getTime() - isoToDate(fromIso).getTime()) / 86_400_000);
}

export function formatMxn(amount: number): string {
  return MXN.format(amount);
}

function contractAmount(project: ProjectDetail): number | null {
  if (!project.contractAmountMxn) return null;
  const n = Number(project.contractAmountMxn);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  activo: "Activo",
  pausado: "Pausado",
  completado: "Completado",
  cancelado: "Cancelado",
};

// ── Header ──────────────────────────────────────────────────────────────────

/** "{tipo} · {ciudad} · Responsable: {name}", leaving out what the project lacks. */
export function projectMetaLine(project: Pick<ProjectDetail, "projectType" | "addressCity" | "manager">): string {
  return [
    project.projectType?.trim() || null,
    project.addressCity?.trim() || null,
    project.manager ? `Responsable: ${project.manager.name}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

// ── Tasks ───────────────────────────────────────────────────────────────────

/** Counts for "Avance · n de m tareas" and the indicators; `tasks` already exclude admin tasks for non-admins. */
export function projectTaskStats(tasks: ProjectStatsTask[], today: string, currentWorkflowId: string | null): ProjectTaskStats {
  const live = tasks.filter((t) => !t.archived);
  const done = live.filter((t) => t.status === "completado").length;
  const openTasks = live.filter((t) => t.status !== "completado");
  const overdue = openTasks.filter((t) => t.commitmentDate !== null && t.commitmentDate.slice(0, 10) < today).length;
  const phased = openTasks
    .filter((t) => currentWorkflowId === null || t.workflowId === currentWorkflowId)
    .flatMap((t) => (t.phase ? [t.phase] : []))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    total: live.length,
    done,
    open: openTasks.length,
    overdue,
    currentPhase: phased[0]?.name ?? null,
    currentPhaseId: phased[0]?.id ?? null,
  };
}

// ── Tramos ──────────────────────────────────────────────────────────────────

/**
 * The tramos the Resumen shows: only the ones the project has started
 * (`project.tramos`, i.e. `project_stages`), in catalog order. A tramo it
 * never started is not shown, so a project with none shows no tramo at all.
 * Names and colors come from the catalog when it has the tramo.
 */
export function startedTramos(catalog: WorkflowRef[], project: Pick<ProjectDetail, "tramos">): WorkflowRef[] {
  const byId = new Map(catalog.map((t) => [t.id, t]));
  return project.tramos
    .map(({ id, key, name, sortOrder, colorSlot }): WorkflowRef => byId.get(id) ?? { id, key, name, sortOrder, colorSlot })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * The muted "Siguiente: {tramo}" hint after the current tramo (the last
 * started one when none is current): the first later catalog tramo, not
 * started, whose readiness rule (`READINESS`) waits on that tramo. Null
 * without a started tramo or without such a rule.
 */
export function nextTramoHint(catalog: WorkflowRef[], project: Pick<ProjectDetail, "tramos">): WorkflowRef | null {
  const started = startedTramos(catalog, project);
  const anchor = started.find((t) => project.tramos.some((run) => run.id === t.id && run.current)) ?? started.at(-1) ?? null;
  if (!anchor) return null;
  const startedIds = new Set(started.map((t) => t.id));
  return (
    [...catalog]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .find((t) => !startedIds.has(t.id) && t.sortOrder > anchor.sortOrder && READINESS[t.key]?.after === anchor.key) ?? null
  );
}

/** One step per started tramo (`startedTramos`): done, current or (started, not current, not closed) next. */
export function tramoSteps(project: ProjectDetail, catalog: WorkflowRef[], today: string): TramoStep[] {
  const started = new Map(project.tramos.map((t) => [t.id, t]));
  const ordered = startedTramos(catalog, project);
  const current = project.tramos.find((t) => t.current) ?? null;
  return ordered.map((tramo) => {
    const run = started.get(tramo.id) ?? null;
    let state: TramoStep["state"] = "next";
    if (run?.current) state = "current";
    else if (run && (run.closedAt !== null || (current !== null && tramo.sortOrder < current.sortOrder))) state = "done";
    const start = run?.startedAt?.slice(0, 10) ?? null;
    const end = run?.closedAt?.slice(0, 10) ?? null;
    return {
      key: tramo.key || tramo.id,
      label: tramo.name,
      range: monthRange(start, end),
      state,
      start,
      end,
      durationDays: start ? daysBetween(start, end ?? today) : null,
    };
  });
}

// ── Schedule ────────────────────────────────────────────────────────────────

/** One item per partida (cronograma sección): real by task status, plan by tasks due by today. */
export function partidaItems(tasks: ScheduleTask[], today: string): ProgressItem[] {
  return ganttBySeccion(tasks).map((bar) => {
    const inSection = tasks.filter((t) => t.seccion === bar.seccion);
    const real = Math.round((inSection.reduce((sum, t) => sum + statusWeight(t.status), 0) / inSection.length) * 100);
    const plan = Math.round((inSection.filter((t) => t.fin <= today).length / inSection.length) * 100);
    const owners = [...new Set(inSection.map((t) => t.responsable?.trim()).filter((r): r is string => Boolean(r)))];
    return {
      id: bar.seccion,
      label: bar.seccion,
      sublabel: [`${shortDate(bar.start)} – ${shortDate(bar.end)}`, owners.join(", ") || null].filter(Boolean).join(" · "),
      real,
      plan,
    };
  });
}

/** Payment calendar with amounts when the contract amount is known (admins only). */
export function budgetTable(payments: PaymentRow[], amount: number | null): RecordTableData | null {
  if (payments.length === 0) return null;
  const sorted = [...payments].sort((a, b) => a.fecha.localeCompare(b.fecha));
  return {
    columns: [
      { key: "fecha", label: "Fecha", format: "date" },
      { key: "pagado", label: "% ejercido", align: "right", mono: true, format: "percent" },
      ...(amount !== null
        ? [
            { key: "ejercido", label: "Ejercido", align: "right" as const, mono: true, format: "mxn" as const },
            { key: "pendiente", label: "Pendiente", align: "right" as const, mono: true, format: "mxn" as const },
          ]
        : []),
      { key: "avance", label: "Avance físico", align: "right", mono: true, format: "percent" },
    ],
    rows: sorted.map((row) => ({
      id: row.fecha,
      fecha: row.fecha,
      pagado: row.pagadoPct,
      ...(amount !== null
        ? {
            ejercido: Math.round((amount * row.pagadoPct) / 100),
            pendiente: Math.round(amount - (amount * row.pagadoPct) / 100),
          }
        : {}),
      avance: row.avancePct,
    })),
  };
}

// ── Files ───────────────────────────────────────────────────────────────────

function extensionOf(item: StaffFileItem): string {
  if (item.kind === "folder") return "Carpeta";
  const dot = item.name.lastIndexOf(".");
  if (dot > 0 && dot < item.name.length - 1) return item.name.slice(dot + 1).toUpperCase();
  if (item.mimeType.startsWith("image/")) return "Imagen";
  if (item.mimeType.includes("pdf")) return "PDF";
  return "Archivo";
}

function iconOf(item: StaffFileItem): string {
  if (item.kind === "folder") return "Folder";
  if (item.mimeType.startsWith("image/")) return "Image";
  if (item.mimeType.includes("pdf") || item.mimeType.includes("document")) return "FileText";
  if (item.mimeType.includes("sheet")) return "FileSpreadsheet";
  return "File";
}

const RECENT_FILES = 6;

export function recentFiles(
  items: StaffFileItem[],
  projectId: string,
): { items: EntityCard[]; table: RecordTableData; total: number } {
  const byRecency = [...items].sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
  const files = byRecency.filter((i) => i.kind === "file").slice(0, RECENT_FILES);
  const folders = byRecency.filter((i) => i.kind === "folder");
  const archivosHref = `/proyectos/${encodeURIComponent(projectId)}/archivos`;
  return {
    total: items.length,
    items: files.map((file) => ({
      id: file.id,
      title: file.name,
      subtitle: shortDate(file.modifiedAt),
      href: file.webViewLink ?? archivosHref,
      iconName: iconOf(file),
      meta: [{ label: "Tipo", value: extensionOf(file) }],
    })),
    table: {
      columns: [
        { key: "nombre", label: "Nombre" },
        { key: "tipo", label: "Tipo" },
        { key: "modificado", label: "Último cambio", format: "date" },
      ],
      rows: [...folders, ...files].map((item) => ({
        id: item.id,
        nombre: item.name,
        tipo: extensionOf(item),
        modificado: item.modifiedAt.slice(0, 10),
        href: item.kind === "folder" ? `${archivosHref}?folder=${encodeURIComponent(item.id)}` : (item.webViewLink ?? archivosHref),
      })),
    },
  };
}

// ── Ficha ───────────────────────────────────────────────────────────────────

export function fichaTable(input: Pick<ProjectSummaryInput, "project" | "spaces" | "taskStats" | "showBudget">): RecordTableData {
  const { project, spaces, taskStats, showBudget } = input;
  const address = [project.addressStreet, project.addressCity, project.addressState]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(", ");
  const amount = contractAmount(project);
  const entries: Array<[string, string | null]> = [
    ["Código", project.code],
    ["Tipo", project.projectType],
    ["Ubicación", address || null],
    ["Estado", PROJECT_STATUS_LABEL[project.status]],
    ["Fase actual", taskStats.currentPhase],
    ["Espacios", spaces.length > 0 ? spaces.map((s) => s.name).join(", ") : null],
    ["Inicio", project.startDate ? monthYear(project.startDate) : null],
    ["Entrega estimada", project.endDate ? monthYear(project.endDate) : null],
    ["Contrato", showBudget && amount !== null ? formatMxn(amount) : null],
    ["Origen", showBudget ? project.origin : null],
    [
      "Grupo de monday",
      showBudget && project.mondayImport && project.mondayImport.boards.length > 0
        ? project.mondayImport.boards.map((b) => b.name).join(", ")
        : null,
    ],
  ];
  return {
    columns: [
      { key: "campo", label: "Campo" },
      { key: "valor", label: "Valor" },
    ],
    rows: entries
      .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim() !== "")
      .map(([campo, valor]) => ({ id: campo, campo, valor })),
  };
}

// ── Contacts ────────────────────────────────────────────────────────────────

/** Row kind of the contacts table: staff rows carry the Cutto chat link. */
export type ContactRowKind = "cliente" | "contacto" | "equipo";

export function contactsTable(
  input: Pick<ProjectSummaryInput, "project" | "staff" | "showClientContacts">,
): ProjectSummaryData["contacts"] {
  const { project, staff, showClientContacts } = input;
  const team = new Map<string, { id: string; name: string; rol: string | null }>();
  const addStaff = (person: { id: string; name: string } | null, rol: string | null) => {
    if (!person || team.has(person.id)) return;
    team.set(person.id, { id: person.id, name: person.name, rol });
  };
  addStaff(project.manager, "Responsable");
  addStaff(project.coordinator, "Coordinación");
  for (const member of project.members) {
    if (member.active === false) continue;
    addStaff(member, member.role?.trim() || null);
  }

  const teamRows = [...team.values()].map((person) => {
    const info = staff[person.id];
    const email = info?.email?.trim() || null;
    return {
      id: `staff-${person.id}`,
      kind: "equipo" satisfies ContactRowKind,
      nombre: person.name,
      rol: person.rol ?? info?.puesto ?? "",
      puesto: info?.puesto ?? "",
      chatUrl: (email ? cuttoLinks.personChatUrl(email) : null) ?? "",
    };
  });

  const clientRows = showClientContacts
    ? [
        ...(project.client
          ? [{ id: `client-${project.client.id}`, kind: "cliente" satisfies ContactRowKind, nombre: project.client.name, rol: "Cliente", puesto: "", chatUrl: "" }]
          : []),
        ...project.contacts
          .filter((c) => c.id !== project.client?.id)
          .map((c) => ({
            id: `contact-${c.id}`,
            kind: "contacto" satisfies ContactRowKind,
            nombre: c.name,
            rol: c.role?.trim() || "",
            puesto: "",
            chatUrl: "",
          })),
      ]
    : [];

  const rows = [...clientRows, ...teamRows];
  const hasPuesto = rows.some((r) => r.puesto && r.puesto !== r.rol);
  const hasChat = rows.some((r) => r.chatUrl);
  return {
    title: showClientContacts ? "Cliente y contactos" : "Equipo",
    table: {
      columns: [
        { key: "nombre", label: "Contacto" },
        { key: "rol", label: "Rol" },
        ...(hasPuesto ? [{ key: "puesto", label: "Puesto" }] : []),
        ...(hasChat ? [{ key: "chat", label: "Cutto" }] : []),
      ],
      rows,
    },
  };
}

// ── Whole summary ───────────────────────────────────────────────────────────

export function buildProjectSummary(input: ProjectSummaryInput): ProjectSummaryData {
  const { project, portfolio, taskStats, schedule, files, showBudget, today } = input;
  const real = portfolio?.real ?? project.progress;
  const budgetPct = showBudget ? (portfolio?.budgetSpentPct ?? null) : null;
  const amount = showBudget ? contractAmount(project) : null;
  const daysToDelivery = portfolio?.daysToDelivery ?? null;

  const avance: ProgressItem[] = [
    {
      id: "avance",
      label: "Avance",
      sublabel: `${taskStats.done} de ${taskStats.total} tareas`,
      real,
      plan: portfolio?.plan ?? null,
      budgetPct,
      next: portfolio?.nextDelivery ?? null,
    },
  ];

  const budget: ProgressItem[] | null =
    showBudget && budgetPct !== null
      ? [
          {
            id: "presupuesto",
            label: "Ejercido",
            sublabel:
              amount !== null ? `${formatMxn(Math.round((amount * budgetPct) / 100))} de ${formatMxn(amount)}` : undefined,
            real: budgetPct,
            plan: real,
          },
        ]
      : null;

  const kpis: KpiDatum[] = [
    {
      key: "completadas",
      label: "Tareas completadas",
      value: taskStats.done,
      display: `${taskStats.done} / ${taskStats.total}`,
    },
    {
      key: "abiertas",
      label: "Tareas abiertas",
      value: taskStats.open,
      ...(portfolio && portfolio.series7.length === 7 ? { series7: portfolio.series7 } : {}),
    },
    { key: "vencidas", label: "Tareas vencidas", value: taskStats.overdue },
    ...(daysToDelivery !== null
      ? [
          {
            key: "dias-entrega",
            label: "Días a entrega",
            value: daysToDelivery,
            display: `${daysToDelivery} d`,
            ...(project.endDate ? { caption: `Entrega ${shortDate(project.endDate)}` } : {}),
          },
        ]
      : []),
    ...(budgetPct !== null
      ? [{ key: "presupuesto", label: "Presupuesto ejercido", value: budgetPct, display: `${Math.round(budgetPct)}%` }]
      : []),
  ];

  return {
    tramos: tramoSteps(project, input.tramoCatalog, today),
    avance,
    budget,
    budgetTable: showBudget && schedule ? budgetTable(schedule.payments, amount) : null,
    kpis,
    partidas: schedule ? partidaItems(schedule.tasks, today) : [],
    recentFiles: files ? recentFiles(files, project.id) : null,
    ficha: fichaTable(input),
    contacts: contactsTable(input),
  };
}

// ── Visual (task-list derivations shared by the Resumen styles) ─────────────

/** The project timezone of the Resumen's relative dates (same as the loader's "today"). */
const RESUMEN_TIMEZONE = "America/Mexico_City";

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const WEEKDAYS_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

/** Top-level, non-archived tasks: what every Resumen count reads (subtasks count on their parent). */
function liveParents<T extends Pick<TaskListRow, "parentTaskId" | "archived">>(tasks: T[]): T[] {
  return tasks.filter((task) => !task.parentTaskId && !task.archived);
}

function dueOf(task: Pick<TaskListRow, "commitmentDate">): string | null {
  return task.commitmentDate ? task.commitmentDate.slice(0, 10) : null;
}

export type StatusCount = { status: TaskStatus; label: string; count: number };

/** Donut and legend order (status tokens: chart-2, chart-3, destructive, chart-1). */
export const STATUS_ORDER: ReadonlyArray<{ status: TaskStatus; label: string }> = [
  { status: "en_proceso", label: "En proceso" },
  { status: "pendiente", label: "Pendiente" },
  { status: "bloqueado", label: "Bloqueado" },
  { status: "completado", label: "Completado" },
];

/** Tasks per base status, parents only (non-archived), in the fixed order; zero counts included. */
export function statusCounts(tasks: TaskListRow[]): StatusCount[] {
  const live = liveParents(tasks);
  return STATUS_ORDER.map(({ status, label }) => ({
    status,
    label,
    count: live.filter((task) => task.status === status).length,
  }));
}

export type TramoProgress = {
  tramoId: string;
  key: string;
  label: string;
  state: "done" | "current" | "next";
  pct: number;
  open: number;
  overdue: number;
  total: number;
  /** YYYY-MM-DD: when the tramo started, or for one not started the earliest commitment date of its tasks. */
  startsOn: string | null;
};

/**
 * One row per started tramo (`startedTramos`, catalog order): state from
 * `project.tramos` (current; done when closed or before the current one),
 * `pct` = completado / total of the tramo's top-level non-archived tasks (0
 * without tasks), open and overdue counts, and `startsOn`: the start date of
 * a started tramo, else the earliest commitment date among its tasks.
 */
export function tramoProgress(
  tasks: TaskListRow[],
  catalog: WorkflowRef[],
  project: ProjectDetail,
  today: string,
): TramoProgress[] {
  const live = liveParents(tasks);
  const started = new Map(project.tramos.map((t) => [t.id, t]));
  const ordered = startedTramos(catalog, project);
  const current = project.tramos.find((t) => t.current) ?? null;
  return ordered.map((tramo) => {
    const run = started.get(tramo.id) ?? null;
    let state: TramoProgress["state"] = "next";
    if (run?.current) state = "current";
    else if (run && (run.closedAt !== null || (current !== null && tramo.sortOrder < current.sortOrder))) state = "done";
    const own = live.filter((task) => task.workflowId === tramo.id);
    const done = own.filter((task) => task.status === "completado").length;
    const open = own.filter((task) => task.status !== "completado");
    const overdue = open.filter((task) => {
      const due = dueOf(task);
      return due !== null && due < today;
    }).length;
    const earliest =
      own
        .map(dueOf)
        .filter((d): d is string => d !== null)
        .sort()[0] ?? null;
    return {
      tramoId: tramo.id,
      key: tramo.key || tramo.id,
      label: tramo.name,
      state,
      pct: own.length > 0 ? Math.round((done / own.length) * 100) : 0,
      open: open.length,
      overdue,
      total: own.length,
      startsOn: state === "next" ? earliest : (run?.startedAt?.slice(0, 10) ?? earliest),
    };
  });
}

export type NextTask = {
  id: string;
  title: string;
  tramoKey: string | null;
  phase: string | null;
  responsable: StaffRef | null;
  dueDate: string | null;
  daysLate: number;
  blocked: boolean;
  subtasks: { done: number; total: number };
};

/**
 * "Lo que sigue": open top-level tasks, blocked and overdue first (most days
 * late first), then by commitment date (undated last), at most `limit`.
 */
export function nextTasks(tasks: TaskListRow[], today: string, limit: number): NextTask[] {
  const rows: NextTask[] = liveParents(tasks)
    .filter((task) => task.status !== "completado")
    .map((task) => {
      const due = dueOf(task);
      return {
        id: task.id,
        title: task.title,
        tramoKey: task.workflow?.key ?? null,
        phase: task.phase?.name ?? null,
        responsable: task.manager,
        dueDate: due,
        daysLate: due !== null && due < today ? daysBetween(due, today) : 0,
        blocked: task.status === "bloqueado",
        subtasks: { done: task.subtaskDone, total: task.subtaskCount },
      };
    });
  const urgent = (t: NextTask) => t.blocked || t.daysLate > 0;
  rows.sort((a, b) => {
    if (urgent(a) !== urgent(b)) return urgent(a) ? -1 : 1;
    if (urgent(a) && a.daysLate !== b.daysLate) return b.daysLate - a.daysLate;
    if (a.dueDate !== b.dueDate) {
      if (a.dueDate === null) return 1;
      if (b.dueDate === null) return -1;
      return a.dueDate.localeCompare(b.dueDate);
    }
    return a.title.localeCompare(b.title, "es");
  });
  return rows.slice(0, Math.max(0, limit));
}

export type ActivityItem = {
  id: string;
  actor: StaffRef | null;
  verb: string;
  object: string | null;
  objectTone: "default" | "destructive" | "tramo";
  /** `relativeWhen` of the event. */
  when: string;
  tramoLabel: string | null;
  /** Tramo key of a tramo move or start (the object's color); absent otherwise. */
  tramoKey?: string | null;
};

const STATUS_VALUE_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  bloqueado: "Bloqueado",
  completado: "Completado",
  activo: "Activo",
  pausado: "Pausado",
  cancelado: "Cancelado",
};

const PROJECT_FIELD_LABEL: Record<string, string> = {
  name: "el nombre",
  code: "el código",
  clientId: "el cliente",
  origin: "el origen",
  originStaffId: "el origen",
  projectType: "el tipo",
  addressStreet: "la ubicación",
  addressCity: "la ubicación",
  addressState: "la ubicación",
  managerId: "el responsable",
  coordinatorId: "la coordinación",
  startDate: "la fecha de inicio",
  endDate: "la entrega final",
  contractAmountMxn: "el contrato",
  progress: "el avance",
};

/** The tramo of a history value: a workflow id, or the "{key}: {n}" of a tramo start. */
function tramoOfValue(value: string | null, catalog: WorkflowRef[]): WorkflowRef | null {
  if (!value) return null;
  const head = value.split(":")[0]!.trim();
  return catalog.find((t) => t.id === value || t.id === head || t.key === head) ?? null;
}

/**
 * "Actividad reciente": the newest `limit` history events as
 * "{actor} {verb} {object}" lines, only what the history records (file
 * uploads are not history events): comentario → "comentó en"; a status
 * change → "marcó … como {after}" (Bloqueado in destructive), to completado
 * → "completó"; the current tramo → "movió el proyecto a {tramo}"; a tramo
 * start → "inició {tramo}"; any other change → "actualizó {field}".
 */
export function activityItems(events: HistoryEvent[], catalog: WorkflowRef[], now: Date, limit: number): ActivityItem[] {
  return events.slice(0, Math.max(0, limit)).map((event): ActivityItem => {
    const subject = event.entity === "project" ? "el proyecto" : "la tarea";
    const base = { id: event.id, actor: event.actor, when: relativeWhen(event.eventAt, now) };
    if (event.kind === "comentario") {
      return { ...base, verb: "comentó en", object: subject, objectTone: "default", tramoLabel: null };
    }
    if (event.field === "currentWorkflowId") {
      const tramo = tramoOfValue(event.afterValue, catalog);
      return {
        ...base,
        verb: "movió el proyecto a",
        object: tramo?.name ?? "otro tramo",
        objectTone: "tramo",
        tramoLabel: null,
        tramoKey: tramo?.key ?? null,
      };
    }
    if (event.field === "tramo_started" || event.field === "tramo_start_undone") {
      const startedNow = event.field === "tramo_started";
      const tramo = tramoOfValue(startedNow ? event.afterValue : event.beforeValue, catalog);
      return {
        ...base,
        verb: startedNow ? "inició" : "deshizo el inicio de",
        object: tramo?.name ?? "un tramo",
        objectTone: "tramo",
        tramoLabel: tramo?.name ?? null,
        tramoKey: tramo?.key ?? null,
      };
    }
    if (event.field === "status") {
      const after = event.afterValue ?? "";
      if (after === "completado") {
        return { ...base, verb: "completó", object: subject, objectTone: "default", tramoLabel: null };
      }
      return {
        ...base,
        verb: `marcó ${subject} como`,
        object: STATUS_VALUE_LABEL[after] ?? (after || "sin estatus"),
        objectTone: after === "bloqueado" ? "destructive" : "default",
        tramoLabel: null,
      };
    }
    const field = event.field ? (PROJECT_FIELD_LABEL[event.field] ?? "la ficha") : "la ficha";
    return { ...base, verb: "actualizó", object: field, objectTone: "default", tramoLabel: null };
  });
}

/**
 * Relative time of an event or file in the project timezone: "hace {n} h"
 * the same day, "ayer", the weekday and date within the week ("vie 6 nov"),
 * else the short date ("20 oct"). "" for an unreadable date.
 */
export function relativeWhen(iso: string, now: Date): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "";
  const day = zonedIsoDate(at, RESUMEN_TIMEZONE);
  const diffDays = daysBetween(day, zonedIsoDate(now, RESUMEN_TIMEZONE));
  if (diffDays <= 0) return `hace ${Math.max(1, Math.floor((now.getTime() - at.getTime()) / 3_600_000))} h`;
  if (diffDays === 1) return "ayer";
  const date = isoToDate(day);
  const short = `${date.getUTCDate()} ${MONTHS_SHORT[date.getUTCMonth()]}`;
  return diffDays < 7 ? `${WEEKDAYS_SHORT[date.getUTCDay()]} ${short}` : short;
}

/** Load of one team member: open tasks across all projects against `staff.capacity`. */
export type TeamLoad = Record<string /* staffId */, { loadPct: number; openTotal: number; capacity: number }>;

/** One person of the Visual "Equipo y carga" card. */
export type TeamLoadCard = {
  id: string;
  name: string;
  initials: string;
  loadPct: number;
  /** This project's open top-level tasks of the person (as responsable) that are overdue / blocked. */
  overdueHere: number;
  blockedHere: number;
  /** Most frequent tramo among the person's tasks in this project (avatar tint). */
  tramoKey: string | null;
};

/** People of "Equipo y carga" before "+{n}". */
export const TEAM_LOAD_MAX = 6;

/**
 * The project's team (responsable, coordinación, active miembros, each once)
 * with their load (`teamLoad`) and this project's overdue and blocked counts.
 */
export function teamLoadCards(
  input: Pick<ProjectSummaryInput, "project" | "staff" | "teamLoad" | "today">,
  tasks: TaskListRow[],
): TeamLoadCard[] {
  const { project, staff, teamLoad, today } = input;
  const people = new Map<string, string>();
  const add = (person: StaffRef | null) => {
    if (person && !people.has(person.id)) people.set(person.id, staff[person.id]?.name ?? person.name);
  };
  add(project.manager);
  add(project.coordinator);
  for (const member of project.members) if (member.active !== false) add(member);

  const live = liveParents(tasks);
  return [...people.entries()].map(([id, name]) => {
    const own = live.filter((task) => task.managerId === id);
    const open = own.filter((task) => task.status !== "completado");
    return {
      id,
      name,
      initials: initialsOf(name),
      loadPct: teamLoad[id]?.loadPct ?? 0,
      overdueHere: open.filter((task) => {
        const due = dueOf(task);
        return due !== null && due < today;
      }).length,
      blockedHere: open.filter((task) => task.status === "bloqueado").length,
      tramoKey: dominantTramo(own.map((task) => task.workflow?.key ?? null)),
    };
  });
}

// ── Esencial (tramo line, recent files, team) ───────────────────────────────

/** One tramo of the Esencial dot line, with its second label line. */
export type EsencialTramoStep = {
  key: string;
  label: string;
  state: "done" | "current" | "next";
  pct: number;
  overdue: number;
  /** "95 % · 1 vencida" | "fase 2 de 3" | "inicia ene" | "sin iniciar"; empty without a tramo. */
  detail: string;
};

export type EsencialTramoLine = {
  /** One per started tramo; empty when the project has started none (the card shows its empty state). */
  steps: EsencialTramoStep[];
  /** The muted "Siguiente: {tramo}" hint (`nextTramoHint`); null without one. */
  next: { key: string; label: string } | null;
  /** "En Diseño · Proyecto ejecutivo"; "Sin tramo asignado" without a current tramo. */
  title: string;
  real: number;
  /** Text alternative of the dot line. */
  ariaLabel: string;
};

/** The Resumen's empty state when the project has started no tramo (#1043). */
export const RESUMEN_NO_TRAMO = "Este proyecto aún no tiene tramo.";

const LONG_MONTH = new Intl.DateTimeFormat("es-MX", { month: "long", timeZone: "UTC" });

function longMonth(iso: string): string {
  return LONG_MONTH.format(isoToDate(iso)).toLowerCase();
}

function vencidas(n: number): string {
  return `${n} ${n === 1 ? "vencida" : "vencidas"}`;
}

/** "fase {i} de {n}" by fase id in the catalog order; null when the fase or the catalog is unknown. */
function phasePosition(phases: WorkflowPhaseRef[], phaseId: string | null): { index: number; total: number } | null {
  if (!phaseId || phases.length === 0) return null;
  const ordered = [...phases].sort((a, b) => a.sortOrder - b.sortOrder);
  const index = ordered.findIndex((phase) => phase.id === phaseId);
  return index < 0 ? null : { index: index + 1, total: ordered.length };
}

/**
 * The Esencial tramo card: one step per started tramo of `progress` (catalog order),
 * with "{pct} % · {n} vencida(s)" for a done tramo, "fase {i} de {n}" for the
 * current one (by `taskStats.currentPhaseId` over `phasesByTramo`) and
 * "inicia {mmm}" (earliest commitment date of its tasks) or "sin iniciar"
 * for the next ones. Without a current tramo (`needsTramo`) every step is
 * "next" with no detail and the title reads "Sin tramo asignado".
 */
export function esencialTramoLine(input: ProjectSummaryInput, progress: TramoProgress[]): EsencialTramoLine {
  const { project, portfolio, taskStats } = input;
  const real = Math.round(portfolio?.real ?? project.progress);
  const startedIds = new Set(project.tramos.map((t) => t.id));
  const fromProgress = progress.filter((step) => startedIds.has(step.tramoId));
  const source: TramoProgress[] =
    fromProgress.length > 0
      ? fromProgress
      : tramoSteps(project, input.tramoCatalog, input.today).map((step) => {
          const tramo = startedTramos(input.tramoCatalog, project).find((t) => (t.key || t.id) === step.key);
          return {
            tramoId: tramo?.id ?? step.key,
            key: step.key,
            label: step.label,
            state: step.state,
            pct: 0,
            open: 0,
            overdue: 0,
            total: 0,
            startsOn: null,
          };
        });
  const hint = nextTramoHint(input.tramoCatalog, project);
  const next = hint ? { key: hint.key || hint.id, label: hint.name } : null;
  const current = project.needsTramo ? null : (source.find((step) => step.state === "current") ?? null);

  if (!current) {
    const steps = source.map((step) => ({
      key: step.key,
      label: step.label,
      state: "next" as const,
      pct: 0,
      overdue: 0,
      detail: "",
    }));
    return {
      steps,
      next,
      title: steps.length > 0 ? "Sin tramo asignado" : RESUMEN_NO_TRAMO,
      real,
      ariaLabel:
        steps.length > 0
          ? `Tramos: sin tramo asignado (${steps.map((s) => s.label).join(", ")})${next ? `, siguiente ${next.label}` : ""}`
          : RESUMEN_NO_TRAMO,
    };
  }

  const position = phasePosition(input.phasesByTramo[current.tramoId] ?? [], taskStats.currentPhaseId);
  const spoken: string[] = [];
  const steps: EsencialTramoStep[] = source.map((step) => {
    // A tramo closed without tasks of its own reads as complete.
    const pct = Math.round(step.state === "done" && step.total === 0 ? 100 : step.pct);
    if (step.state === "done") {
      spoken.push(`${step.label} terminado ${pct} %${step.overdue > 0 ? `, ${vencidas(step.overdue)}` : ""}`);
      return {
        key: step.key,
        label: step.label,
        state: "done",
        pct,
        overdue: step.overdue,
        detail: `${pct} %${step.overdue > 0 ? ` · ${vencidas(step.overdue)}` : ""}`,
      };
    }
    if (step.state === "current") {
      const detail = position ? `fase ${position.index} de ${position.total}` : `${pct} %`;
      spoken.push(`${step.label} en curso ${detail}`);
      return { key: step.key, label: step.label, state: "current", pct, overdue: step.overdue, detail };
    }
    const starts = step.startsOn ? step.startsOn.slice(0, 10) : null;
    spoken.push(`${step.label} ${starts ? `inicia ${longMonth(starts)}` : "sin iniciar"}`);
    return {
      key: step.key,
      label: step.label,
      state: "next",
      pct,
      overdue: step.overdue,
      detail: starts ? `inicia ${shortMonth(starts)}` : "sin iniciar",
    };
  });

  if (next) spoken.push(`siguiente ${next.label}`);
  return {
    steps,
    next,
    title: taskStats.currentPhase ? `En ${current.label} · ${taskStats.currentPhase}` : `En ${current.label}`,
    real,
    ariaLabel: `Tramos: ${spoken.join(", ")}`,
  };
}

/** A recent Drive file of the Esencial "Archivos" card. */
export type RecentFileRow = { id: string; name: string; ext: string; href: string | null; when: string };

/** Type label of a file: its extension in uppercase, else a label from the MIME type. */
export function fileTypeLabel(item: Pick<StaffFileItem, "name" | "mimeType">): string {
  const dot = item.name.lastIndexOf(".");
  if (dot > 0 && dot < item.name.length - 1) {
    const ext = item.name.slice(dot + 1);
    if (/^[a-z0-9]{1,5}$/i.test(ext)) return ext.toUpperCase();
  }
  const mime = item.mimeType;
  if (mime.includes("pdf")) return "PDF";
  if (mime === "image/jpeg") return "JPG";
  if (mime === "image/png") return "PNG";
  if (mime.includes("spreadsheet") || mime.includes("sheet")) return "XLSX";
  if (mime.includes("document") || mime.includes("word")) return "DOC";
  if (mime.includes("presentation")) return "PPT";
  if (mime.includes("dwg")) return "DWG";
  return "ARCH";
}

/**
 * The newest `limit` files (folders left out) of the root Drive listing,
 * newest first, with the type label and a relative date ("ayer", "6 nov").
 * Null when the Drive folder can't be read.
 */
export function recentFileRows(files: StaffFileItem[] | null, now: Date, limit: number): RecentFileRow[] | null {
  if (!files) return null;
  return files
    .filter((item) => item.kind === "file")
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
    .slice(0, Math.max(0, limit))
    .map((file) => ({
      id: file.id,
      name: file.name,
      ext: fileTypeLabel(file),
      href: file.webViewLink,
      when: relativeWhen(file.modifiedAt, now),
    }));
}

/** One avatar of the team stack; `tramoKey` (the tint) is filled by the caller from the person's tasks. */
export type TeamAvatar = { id: string; name: string; initials: string; tramoKey: string | null };

/** Avatars shown before "+{n}". */
export const TEAM_AVATARS_MAX = 5;

/**
 * The Esencial "Equipo" card: responsable, coordinación and active miembros
 * (each once), at most five avatars plus the overflow count, and the line
 * "Responsable: {name} · {n} personas" ("Sin responsable · …" without one).
 */
export function teamLine(project: Pick<ProjectDetail, "manager" | "coordinator" | "members">): {
  avatars: TeamAvatar[];
  overflow: number;
  text: string;
  manager: string | null;
} {
  const people = new Map<string, string>();
  const add = (person: { id: string; name: string } | null) => {
    if (person && !people.has(person.id)) people.set(person.id, person.name);
  };
  add(project.manager);
  add(project.coordinator);
  for (const member of project.members) if (member.active !== false) add(member);

  const all = [...people.entries()].map(([id, name]) => ({ id, name, initials: initialsOf(name), tramoKey: null }));
  const count = all.length;
  const personas = `${count} ${count === 1 ? "persona" : "personas"}`;
  const manager = project.manager?.name ?? null;
  return {
    avatars: all.slice(0, TEAM_AVATARS_MAX),
    overflow: Math.max(0, count - TEAM_AVATARS_MAX),
    text: manager ? `Responsable: ${manager} · ${personas}` : `Sin responsable · ${personas}`,
    manager,
  };
}

// ── Analítico (tramos y fases, tareas por tramo, KPIs, carga del equipo) ────

/** Label of the bucket of tasks without a fase, in both grouped tables. */
export const RESUMEN_SIN_FASE = "Sin fase";
/** Group of the administrative tasks (no tramo), shown to administrators only. */
export const RESUMEN_ADMIN_GROUP = "Administración";
/** Load thresholds of the team table: the same values as `OCCUPANCY_HEAT` (`PeopleWidget`). */
export const RESUMEN_LOAD_WARN_AT = 60;
export const RESUMEN_LOAD_CRIT_AT = 90;

const DAY_MONTH_LONG = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", timeZone: "UTC" });
const ONE_DECIMAL = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

/** "9 de noviembre" */
export function dayMonthLong(iso: string): string {
  return DAY_MONTH_LONG.format(isoToDate(iso)).toLowerCase();
}

function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function rowDue(task: Pick<TaskListRow, "commitmentDate">): string | null {
  return task.commitmentDate ? task.commitmentDate.slice(0, 10) : null;
}

function rowDone(task: Pick<TaskListRow, "status">): boolean {
  return task.status === "completado";
}

function rowOverdue(task: Pick<TaskListRow, "status" | "commitmentDate">, today: string): boolean {
  const due = rowDue(task);
  return !rowDone(task) && due !== null && due < today;
}

/** Days an open task is past its commitment date (0 when on time, undated or done). */
export function taskDaysLate(task: Pick<TaskListRow, "status" | "commitmentDate">, today: string): number {
  const due = rowDue(task);
  return due !== null && rowOverdue(task, today) ? daysBetween(due, today) : 0;
}

/** The tasks every Analítico count uses: not archived, top level (subtasks live inside their parent). */
export function resumenTasks(tasks: TaskListRow[]): TaskListRow[] {
  return tasks.filter((task) => !task.archived && !task.parentTaskId);
}

function pctOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/** A started tramo's state: current, done (closed or before the current one) or next. */
export function tramoRunState(project: ProjectDetail, tramo: WorkflowRef): "done" | "current" | "next" {
  const run = project.tramos.find((t) => t.id === tramo.id) ?? null;
  const current = project.tramos.find((t) => t.current) ?? null;
  if (run?.current) return "current";
  if (run && (run.closedAt !== null || (current !== null && tramo.sortOrder < current.sortOrder))) return "done";
  return "next";
}

/**
 * The current fase: the first fase (by `sortOrder`) of the current tramo with
 * open tasks, the same rule as `projectTaskStats.currentPhase`.
 */
function currentPhaseIdOf(tasks: TaskListRow[], project: ProjectDetail): string | null {
  const phased = tasks
    .filter((t) => !rowDone(t) && t.phase !== null && (project.currentWorkflowId === null || t.workflowId === project.currentWorkflowId))
    .map((t) => t.phase!)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return phased[0]?.id ?? null;
}

export type PhaseRow = {
  phaseId: string | null;
  name: string;
  current: boolean;
  tasks: number;
  open: number;
  overdue: number;
  pct: number;
  /** Earliest creation date of the fase's tasks (fases have no dates); null without dated tasks. */
  start: string | null;
  /** Latest commitment date of the fase's tasks; null without dated tasks. */
  endPlan: string | null;
  /** Days past `endPlan`: today − end while open tasks remain, last close − end once done; null when undated. */
  deviationDays: number | null;
};

function phaseRowOf(
  phaseId: string | null,
  name: string,
  current: boolean,
  tasks: TaskListRow[],
  today: string,
): PhaseRow {
  const open = tasks.filter((t) => !rowDone(t));
  const dues = tasks.flatMap((t) => {
    const due = rowDue(t);
    return due ? [due] : [];
  });
  const endPlan = dues.length > 0 ? dues.reduce((a, b) => (b > a ? b : a)) : null;
  const start =
    endPlan === null || tasks.length === 0
      ? null
      : tasks.map((t) => t.createdAt.slice(0, 10)).reduce((a, b) => (b < a ? b : a));
  let deviationDays: number | null = null;
  if (endPlan !== null) {
    if (open.length > 0) {
      deviationDays = today > endPlan ? daysBetween(endPlan, today) : 0;
    } else {
      const closes = tasks.flatMap((t) => (t.closedAt ? [t.closedAt.slice(0, 10)] : []));
      const lastClose = closes.length > 0 ? closes.reduce((a, b) => (b > a ? b : a)) : null;
      deviationDays = lastClose !== null && lastClose > endPlan ? daysBetween(endPlan, lastClose) : 0;
    }
  }
  return {
    phaseId,
    name,
    current,
    tasks: tasks.length,
    open: open.length,
    overdue: open.filter((t) => rowOverdue(t, today)).length,
    pct: pctOf(tasks.length - open.length, tasks.length),
    start,
    endPlan,
    deviationDays,
  };
}

const TRAMO_STATE_LABEL = { done: "cerrado", current: "en curso", next: "sin iniciar" } as const;

/**
 * "Tramos y fases": one group per started tramo (`startedTramos`, catalog
 * order) with one row per fase; no groups when the project started none.
 * Catalog fases with no tasks are listed with zeros; fases that only appear on
 * tasks follow, and tasks without a fase go to a last "Sin fase" row. Group
 * metrics: "actual" on the current tramo, "{n} fases" caption, "{state} {pct} %"
 * (or "cerrado con {n} pendiente" for a closed tramo with open tasks),
 * "{n} tareas", "{n} vencida(s)" and "{n} bloqueada(s)" when any. `totals`
 * is keyed by column (`name`, `tasks`, `open`, `overdue`, `pct`, `start`,
 * `endPlan`, `deviationDays`).
 */
export function tramoPhaseGroups(
  tasks: TaskListRow[],
  catalog: WorkflowRef[],
  phasesByTramo: Record<string, WorkflowPhaseRef[]>,
  project: ProjectDetail,
  today: string,
): { groups: Group<PhaseRow>[]; totals: Record<string, string> } {
  const live = resumenTasks(tasks);
  const currentPhaseId = currentPhaseIdOf(live, project);
  const allRows: PhaseRow[] = [];

  const groups = startedTramos(catalog, project).map((tramo): Group<PhaseRow> => {
    const inTramo = live.filter((t) => t.workflowId === tramo.id);
    const known = [...(phasesByTramo[tramo.id] ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
    const knownIds = new Set(known.map((p) => p.id));
    const extra = new Map<string, WorkflowPhaseRef>();
    for (const t of inTramo) if (t.phase && !knownIds.has(t.phase.id)) extra.set(t.phase.id, t.phase);
    const phases = [...known, ...[...extra.values()].sort((a, b) => a.sortOrder - b.sortOrder)];

    const rows = phases.map((phase) =>
      phaseRowOf(
        phase.id,
        phase.name,
        phase.id === currentPhaseId,
        inTramo.filter((t) => t.phaseId === phase.id || t.phase?.id === phase.id),
        today,
      ),
    );
    const unphased = inTramo.filter((t) => !t.phaseId && !t.phase);
    if (unphased.length > 0) rows.push(phaseRowOf(null, RESUMEN_SIN_FASE, false, unphased, today));
    allRows.push(...rows);

    const state = tramoRunState(project, tramo);
    const open = inTramo.filter((t) => !rowDone(t)).length;
    const overdue = inTramo.filter((t) => rowOverdue(t, today)).length;
    const blocked = inTramo.filter((t) => t.status === "bloqueado").length;
    const pct = pctOf(inTramo.length - open, inTramo.length);

    return {
      id: tramo.id,
      label: tramo.name,
      caption: countLabel(rows.length, "fase", "fases"),
      metrics: [
        ...(state === "current" ? [{ key: "actual", value: "actual", pill: true }] : []),
        state === "done" && open > 0
          ? { key: "estado", value: `cerrado con ${open} pendiente`, tone: "warning" as const }
          : { key: "estado", value: `${TRAMO_STATE_LABEL[state]} ${pct} %` },
        { key: "tareas", value: countLabel(inTramo.length, "tarea", "tareas") },
        {
          key: "vencidas",
          value: countLabel(overdue, "vencida", "vencidas"),
          tone: overdue > 0 ? ("destructive" as const) : ("muted" as const),
        },
        ...(blocked > 0
          ? [{ key: "bloqueadas", value: countLabel(blocked, "bloqueada", "bloqueadas"), tone: "destructive" as const }]
          : []),
      ],
      rows,
    };
  });

  const sum = (key: "tasks" | "open" | "overdue") => allRows.reduce((acc, row) => acc + row[key], 0);
  const starts = allRows.flatMap((row) => (row.start ? [row.start] : [])).sort();
  const ends = allRows.flatMap((row) => (row.endPlan ? [row.endPlan] : [])).sort();
  const deviations = allRows.flatMap((row) => (row.deviationDays !== null ? [row.deviationDays] : []));
  const maxDeviation = deviations.length > 0 ? Math.max(...deviations) : null;
  const totalTasks = sum("tasks");

  return {
    groups,
    totals: {
      name: `Total · ${countLabel(allRows.length, "fase", "fases")}`,
      tasks: String(totalTasks),
      open: String(sum("open")),
      overdue: String(sum("overdue")),
      pct: `${pctOf(totalTasks - sum("open"), totalTasks)} %`,
      start: starts[0] ? shortDate(starts[0]) : "—",
      endPlan: ends.length > 0 ? shortDate(ends[ends.length - 1]!) : "—",
      deviationDays: maxDeviation === null ? "—" : maxDeviation > 0 ? `+${maxDeviation} máx.` : "0",
    },
  };
}

export type TaskRow = {
  id: string;
  title: string;
  phase: string | null;
  responsable: string | null;
  status: TaskStatus;
  due: string | null;
  daysLate: number;
  done: boolean;
  /** For `StatusChip` (custom name over the base label). */
  customStatus: TaskListRow["customStatus"];
};

/** A "Tareas por tramo" row of a task. */
export function taskRowOf(task: TaskListRow, today: string): TaskRow {
  return {
    id: task.id,
    title: task.title,
    phase: task.phase?.name ?? null,
    responsable: task.manager?.name ?? null,
    status: task.status,
    due: rowDue(task),
    daysLate: taskDaysLate(task, today),
    done: rowDone(task),
    customStatus: task.customStatus,
  };
}

/**
 * Rows of one group: open first by days late (desc) then due date (undated
 * last), open tasks without a fase after the phased ones ("Sin fase"
 * bucket), completed tasks last.
 */
function sortTaskRows(rows: TaskRow[]): TaskRow[] {
  const rank = (row: TaskRow) => (row.done ? 2 : row.phase === null ? 1 : 0);
  return [...rows].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      b.daysLate - a.daysLate ||
      (a.due ?? "9999-12-31").localeCompare(b.due ?? "9999-12-31") ||
      a.title.localeCompare(b.title, "es"),
  );
}

/**
 * "Tareas por tramo": one group per started tramo (`startedTramos`, also when
 * empty, for its quick-add row), then tramos not started that still have
 * tasks, and "Administración" for tasks without a tramo; a tramo the project
 * never started gets no empty group. Groups with overdue tasks come first by Σ days late
 * (desc), the rest in catalog order. Metrics: "{k} vencidas · {Σ} d" and
 * "bloqueada" when any. `totals` is keyed by column (`title`, `daysLate`).
 */
export function taskGroupsByTramo(
  tasks: TaskListRow[],
  catalog: WorkflowRef[],
  project: Pick<ProjectDetail, "tramos">,
  today: string,
): { groups: Group<TaskRow>[]; totals: Record<string, string> } {
  const live = resumenTasks(tasks);
  const tramos = startedTramos(catalog, project);
  const known = new Set(tramos.map((t) => t.id));
  const byId = new Map(catalog.map((t) => [t.id, t]));
  const extra = new Map<string, WorkflowRef>();
  for (const t of live) {
    if (!t.workflowId || known.has(t.workflowId)) continue;
    const ref = byId.get(t.workflowId) ?? t.workflow;
    if (ref) extra.set(t.workflowId, ref);
  }
  const buckets: { id: string; label: string; tasks: TaskListRow[] }[] = [
    ...[...tramos, ...[...extra.values()].sort((a, b) => a.sortOrder - b.sortOrder)].map((tramo) => ({
      id: tramo.id,
      label: tramo.name,
      tasks: live.filter((t) => t.workflowId === tramo.id),
    })),
  ];
  const untramoed = live.filter((t) => !t.workflowId);
  if (untramoed.length > 0) buckets.push({ id: "admin", label: RESUMEN_ADMIN_GROUP, tasks: untramoed });

  const built = buckets.map((bucket, index) => {
    const rows = sortTaskRows(bucket.tasks.map((t) => taskRowOf(t, today)));
    const late = rows.filter((row) => row.daysLate > 0);
    const daysSum = late.reduce((acc, row) => acc + row.daysLate, 0);
    const blocked = rows.some((row) => !row.done && row.status === "bloqueado");
    const group: Group<TaskRow> = {
      id: bucket.id,
      label: bucket.label,
      caption: countLabel(rows.length, "tarea", "tareas"),
      metrics: [
        ...(late.length > 0
          ? [{ key: "vencidas", value: `${countLabel(late.length, "vencida", "vencidas")} · ${daysSum} d`, tone: "destructive" as const }]
          : []),
        ...(blocked ? [{ key: "bloqueada", value: "bloqueada", tone: "destructive" as const }] : []),
      ],
      rows,
    };
    return { group, index, daysSum, late: late.length };
  });

  built.sort((a, b) => {
    const aLate = a.late > 0 ? 0 : 1;
    const bLate = b.late > 0 ? 0 : 1;
    if (aLate !== bLate) return aLate - bLate;
    if (aLate === 0 && a.daysSum !== b.daysSum) return b.daysSum - a.daysSum;
    return a.index - b.index;
  });

  const total = live.length;
  const daysTotal = built.reduce((acc, b) => acc + b.daysSum, 0);
  return {
    groups: built.map((b) => b.group),
    totals: { title: `Total · ${countLabel(total, "tarea", "tareas")}`, daysLate: String(daysTotal) },
  };
}

/**
 * The five KPIs of the Analítico strip (four without `showBudget`): AVANCE
 * (deviation vs plan, hidden without plan or schedule), TAREAS ABIERTAS
 * ("de {total}", change vs 7 days ago), VENCIDAS ("· {pct} %" of open,
 * change vs a week ago), RETRASO PROMEDIO (change in days or "sin cambio")
 * and PRESUP. EJERCIDO (admins; points under or over the avance). Counts
 * come from the task rows so they agree with both tables.
 */
export function resumenKpis(input: ProjectSummaryInput, tasks: TaskListRow[]): KpiStripItem[] {
  const { project, portfolio, schedule, showBudget, today } = input;
  const live = resumenTasks(tasks);
  const open = live.filter((t) => !rowDone(t));
  const overdue = open.filter((t) => rowOverdue(t, today));
  const real = Math.round(portfolio?.real ?? project.progress);
  const plan = schedule && portfolio?.plan != null ? Math.round(portfolio.plan) : null;

  const items: KpiStripItem[] = [];

  const deviation = plan !== null ? real - plan : null;
  items.push({
    key: "avance",
    label: "Avance",
    value: `${real} %`,
    ...(deviation !== null
      ? {
          delta: {
            label: `${signed(deviation)} pts vs plan (${plan} %)`,
            tone: deviation < 0 ? ("bad" as const) : deviation > 0 ? ("good" as const) : ("neutral" as const),
          },
        }
      : {}),
  });

  const weekAgoOpen = portfolio && portfolio.series7.length > 0 ? portfolio.series7[0]! : null;
  items.push({
    key: "abiertas",
    label: "Tareas abiertas",
    value: open.length,
    secondary: `de ${live.length}`,
    ...(weekAgoOpen !== null
      ? { delta: { label: `${signed(open.length - weekAgoOpen)} esta semana`, tone: "neutral" as const } }
      : {}),
  });

  const overdueChange = portfolio ? overdue.length - portfolio.overdueWeekAgo : null;
  items.push({
    key: "vencidas",
    label: "Vencidas",
    value: overdue.length,
    secondary: `· ${pctOf(overdue.length, open.length)} %`,
    tone: overdue.length > 0 ? "destructive" : "default",
    ...(overdueChange !== null
      ? {
          delta: {
            label: `${signed(overdueChange)} vs semana pasada`,
            tone: overdueChange > 0 ? ("bad" as const) : overdueChange < 0 ? ("good" as const) : ("neutral" as const),
          },
        }
      : {}),
  });

  const lateDays = overdue.map((t) => taskDaysLate(t, today));
  const avgDelay =
    portfolio?.avgDelayDays ?? (lateDays.length > 0 ? Math.round((lateDays.reduce((a, b) => a + b, 0) / lateDays.length) * 10) / 10 : null);
  const avgWeekAgo = portfolio?.avgDelayWeekAgo ?? null;
  const delayChange = avgDelay !== null && avgWeekAgo !== null ? Math.round((avgDelay - avgWeekAgo) * 10) / 10 : null;
  items.push({
    key: "retraso",
    label: "Retraso promedio",
    value: avgDelay !== null ? `${ONE_DECIMAL.format(avgDelay)} d` : "—",
    delta:
      delayChange === null || delayChange === 0
        ? { label: "sin cambio", tone: "neutral" }
        : { label: `${delayChange > 0 ? "+" : ""}${ONE_DECIMAL.format(delayChange)} d`, tone: delayChange > 0 ? "bad" : "good" },
  });

  const budget = showBudget ? (portfolio?.budgetSpentPct ?? null) : null;
  if (budget !== null) {
    const spent = Math.round(budget);
    const gap = real - spent;
    items.push({
      key: "presupuesto",
      label: "Presup. ejercido",
      value: `${spent} %`,
      secondary: "Admin",
      delta:
        gap >= 0
          ? { label: `${gap} pts bajo el avance`, tone: gap > 0 ? "good" : "neutral" }
          : { label: `${-gap} pts sobre el avance`, tone: "bad" },
    });
  }

  return items;
}

export type TeamLoadRow = {
  staffId: string;
  name: string;
  /** "{dominant tramo here} · {role}" (each part left out when unknown). */
  context: string;
  /** Open tasks of the person in this project. */
  here: number;
  overdueHere: number;
  /** Open tasks in every project ÷ capacity (`teamLoad`). */
  loadPct: number;
  tone: "ok" | "warn" | "critical";
};

/** Tone of a load percentage: ≥ 90 critical, ≥ 60 warn (the `OCCUPANCY_HEAT` thresholds). */
export function loadToneOf(pct: number): TeamLoadRow["tone"] {
  if (pct >= RESUMEN_LOAD_CRIT_AT) return "critical";
  if (pct >= RESUMEN_LOAD_WARN_AT) return "warn";
  return "ok";
}

/**
 * "Carga del equipo": responsable, coordinación and active miembros (each
 * once) with their open and overdue tasks here, the tramo where most of them
 * are, their role ("responsable" for the manager) and the total load from
 * `teamLoad`. Sorted by load (desc), then name.
 */
export function teamLoadRows(input: ProjectSummaryInput, tasks: TaskListRow[]): TeamLoadRow[] {
  const { project, staff, today } = input;
  const live = resumenTasks(tasks);
  const people = new Map<string, { name: string; role: string | null }>();
  const add = (person: { id: string; name: string } | null, role: string | null) => {
    if (person && !people.has(person.id)) people.set(person.id, { name: person.name, role });
  };
  add(project.manager, "responsable");
  add(project.coordinator, "coordinación");
  for (const member of project.members) if (member.active !== false) add(member, member.role?.trim() || null);

  const load = input.teamLoad;
  const rows = [...people.entries()].map(([staffId, person]): TeamLoadRow => {
    const mine = live.filter((t) => t.managerId === staffId && !rowDone(t));
    const tramoCounts = new Map<string, number>();
    let dominant: string | null = null;
    for (const t of mine) {
      const name = t.workflow?.name ?? null;
      if (!name) continue;
      const n = (tramoCounts.get(name) ?? 0) + 1;
      tramoCounts.set(name, n);
      if (dominant === null || n > (tramoCounts.get(dominant) ?? 0)) dominant = name;
    }
    const role = person.role ?? staff[staffId]?.puesto ?? null;
    const loadPct = Math.round(load[staffId]?.loadPct ?? 0);
    return {
      staffId,
      name: staff[staffId]?.name || person.name,
      context: [dominant, role].filter(Boolean).join(" · "),
      here: mine.length,
      overdueHere: mine.filter((t) => rowOverdue(t, today)).length,
      loadPct,
      tone: loadToneOf(loadPct),
    };
  });
  return rows.sort((a, b) => b.loadPct - a.loadPct || a.name.localeCompare(b.name, "es"));
}

/** First week where the plan is `minGapPts` (3) or more points over the real progress; null when never. */
export function sCurveGapStart(points: SCurvePoint[], minGapPts = 3): string | null {
  const first = points.find((p) => p.real !== null && p.planned - p.real >= minGapPts);
  return first ? first.weekStart : null;
}

/** "{proyecto}-tareas-{YYYY-MM-DD}.csv", the name in lowercase with dashes. */
export function tareasCsvFilename(projectName: string, today: string): string {
  const slug =
    projectName
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "proyecto";
  return `${slug}-tareas-${today}.csv`;
}

/** The "Tareas por tramo" export: header + one row per task, in table order. */
export function tareasCsvRows(groups: Group<TaskRow>[]): { header: string[]; rows: (string | number | null)[][] } {
  return {
    header: ["Tramo", "Tarea", "Fase", "Responsable", "Estatus", "Vence", "Días de retraso"],
    rows: groups.flatMap((group) =>
      (group.rows ?? []).map((row) => [
        group.label,
        row.title,
        row.phase ?? RESUMEN_SIN_FASE,
        row.responsable,
        taskStatusLabel(row),
        row.due,
        row.daysLate,
      ]),
    ),
  };
}

