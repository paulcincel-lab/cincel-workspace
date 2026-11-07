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
import type { TramoStep } from "@/components/widgets/TramoStepperWidget";
import type { ProjectDetail, ProjectSpaceRef, ProjectStatus, TaskListItem, WorkflowRef } from "@/lib/types/core";
import type { PortfolioRow } from "@/lib/types/redesign";
import type { PaymentRow, ScheduleTask } from "@/lib/types/schedule";
import type { EntityCard, KpiDatum, ProgressItem, RecordTableData } from "@/lib/types/widgets";
import type { StaffFileItem } from "@/lib/types/workspace-access";

export type ProjectTaskStats = {
  total: number;
  done: number;
  open: number;
  overdue: number;
  /** Name of the first fase of the current tramo with open tasks; null when no task has a fase. */
  currentPhase: string | null;
};

export type ProjectStaffInfo = { email: string | null; puesto: string | null };

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
  /** By staff id: email (for the Cutto chat link) and puesto. */
  staff: Record<string, ProjectStaffInfo>;
  /** `canSeeAdminData`: budget bar and budget tables. */
  showBudget: boolean;
  /** "Cliente y contactos" (B8). */
  showClientContacts: boolean;
  /** YYYY-MM-DD (project timezone). */
  today: string;
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

/** "3 nov" */
export function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(isoToDate(iso))
    .replace(".", "")
    .toLowerCase();
}

/** "abril 2026" */
export function monthYear(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { month: "long", year: "numeric", timeZone: "UTC" })
    .format(isoToDate(iso))
    .replace(" de ", " ")
    .toLowerCase();
}

function shortMonth(iso: string): string {
  return new Intl.DateTimeFormat("es-MX", { month: "short", timeZone: "UTC" })
    .format(isoToDate(iso))
    .replace(".", "")
    .toLowerCase();
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
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 }).format(amount);
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
export function projectTaskStats(tasks: TaskListItem[], today: string, currentWorkflowId: string | null): ProjectTaskStats {
  const live = tasks.filter((t) => !t.archived);
  const done = live.filter((t) => t.status === "completado").length;
  const openTasks = live.filter((t) => t.status !== "completado");
  const overdue = openTasks.filter((t) => t.commitmentDate !== null && t.commitmentDate.slice(0, 10) < today).length;
  const phased = openTasks
    .filter((t) => currentWorkflowId === null || t.workflowId === currentWorkflowId)
    .flatMap((t) => (t.phase ? [t.phase] : []))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return { total: live.length, done, open: openTasks.length, overdue, currentPhase: phased[0]?.name ?? null };
}

// ── Tramos ──────────────────────────────────────────────────────────────────

export function tramoSteps(project: ProjectDetail, catalog: WorkflowRef[], today: string): TramoStep[] {
  const started = new Map(project.tramos.map((t) => [t.id, t]));
  const ordered = [...(catalog.length > 0 ? catalog : project.tramos)].sort((a, b) => a.sortOrder - b.sortOrder);
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
