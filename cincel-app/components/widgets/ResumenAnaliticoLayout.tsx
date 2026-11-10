"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { ErrorState } from "@/components/shell/ErrorState";
import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import ExportMenu from "@/components/ui/ExportMenu";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { GroupedTable, type Group } from "@/components/widgets/GroupedTable";
import { KpiStrip } from "@/components/widgets/KpiStrip";
import { resumenCommitKeys, resumenTaskColumns } from "@/components/widgets/proyectos-cell-edits";
import { CellCommitProvider } from "@/components/widgets/use-cell-commit";
import { StatusChip } from "@/components/widgets/StatusChip";
import { TeamLoadTable } from "@/components/widgets/TeamLoadTable";
import { HEAT_CELL_CLASS } from "@/components/widgets/record-table-format";
import { createUserTaskAction } from "@/lib/actions/tasks-actions";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { computeSCurve } from "@/lib/cronograma/metrics";
import {
  RESUMEN_SIN_FASE,
  dayMonthLong,
  resumenKpis,
  resumenTasks,
  sCurveGapStart,
  shortDate,
  taskGroupsByTramo,
  tareasCsvFilename,
  tareasCsvRows,
  teamLoadRows,
  tramoPhaseGroups,
  type PhaseRow,
  type ProjectSummaryInput,
  type TaskRow,
  type TeamLoadRow,
} from "@/lib/proyectos/project-summary";
import type { AssigneeSuggestion } from "@/lib/proyectos/assignee-suggestion";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { catalogTaskStatusesOptions } from "@/lib/query/options/catalog";
import { proyectoAssigneeSuggestionOptions, proyectoTareasOptions } from "@/lib/query/options/proyectos";
import { parseQuickAdd, type QuickAddPerson, type QuickAddTramo } from "@/lib/quick-add/parse";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import { tramoColorVar } from "@/lib/tramos/compat";
import type { TaskListRow, TaskPriority, WorkflowPhaseRef, WorkflowRef } from "@/lib/types/core";
import type { SCurvePoint } from "@/lib/types/schedule";
import type { RecordColumn } from "@/lib/types/widgets";
import { buildCsv } from "@/lib/utils/export-service";
import { cn } from "@/lib/utils";

/**
 * Proyecto · Resumen in Analítico (#997, frame `ProyectoResumen-Analitico`):
 * every number in tables grouped by domain. Top to bottom: the KPI strip,
 * the "Ir a" nav (section anchors, CSV export, expand / collapse both
 * tables), "Tramos y fases" (tramo → fase), a row with "Avance contra plan"
 * (S-curve) and "Carga del equipo", and "Tareas por tramo" (tramo → tarea)
 * whose groups end in a quick-add line. The task rows come from
 * `qk.proyectos.tab(id, "tareas")`; the rest from the Resumen read.
 *
 * In "Tareas por tramo", Tarea, Fase, Responsable, Estatus and Vence edit in
 * place with the Tareas table rules (#1026, `resumenTaskColumns`). Every
 * "Tramos y fases" number and date is calculated from the tasks (a fase has
 * no schedule row of its own), so that table stays inert.
 */
export type ResumenAnaliticoLayoutProps = { data: ProjectSummaryInput };

export const SECTION_ERROR_TITLE = "No se pudo cargar esta sección";
export const NO_SCHEDULE_TEXT = "Sin cronograma: el plan aparece al importar uno.";
/** Rows a task group shows before "Cargar más". */
export const TASK_GROUP_CAP = 25;
/** Load of the parsed responsable from which the composer asks for someone else. */
export const HINT_LOAD_PCT = 90;
const SUGGESTION_DEBOUNCE_MS = 300;

const SECTION = "flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-card)]";
const SECTION_HEADER = "flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3.5";
const SECTION_TITLE = "text-[15px] font-semibold text-foreground outline-none";
const MONO_META = "font-mono text-xs text-muted-foreground";

const PHASE_COLUMNS: RecordColumn[] = [
  { key: "name", label: "Fase", width: 220 },
  { key: "tasks", label: "Tareas", align: "right", mono: true, format: "count", width: 80 },
  { key: "open", label: "Abiertas", align: "right", mono: true, format: "count", width: 90 },
  { key: "overdue", label: "Vencidas", align: "right", mono: true, format: "count", width: 90 },
  { key: "pct", label: "Avance", width: 150 },
  { key: "start", label: "Inicio", mono: true, width: 90 },
  { key: "endPlan", label: "Fin plan", mono: true, width: 90 },
  { key: "deviationDays", label: "Desv. días", align: "right", mono: true, width: 100 },
];

/** Heat of "Desv. días": warning from 1 to 9 days, destructive from 10. */
export function deviationHeat(days: number | null): "warn" | "crit" | null {
  if (days === null || days <= 0) return null;
  return days >= 10 ? "crit" : "warn";
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

function downloadText(fileName: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Moves to a section and focuses its heading (`tabindex="-1"`). */
function goToSection(event: MouseEvent<HTMLAnchorElement>, id: string) {
  event.preventDefault();
  const section = document.getElementById(id);
  if (!section) return;
  section.scrollIntoView?.({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  section.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
}

function tramoColor(tramos: Map<string, WorkflowRef>, id: string): string | undefined {
  const tramo = tramos.get(id);
  return tramo ? tramoColorVar(tramo.key, tramo.sortOrder) : undefined;
}

/** The fase a quick-added task lands in: the current fase when it is of that tramo, else the tramo's first. */
function phaseForTramo(data: ProjectSummaryInput, tramoId: string): WorkflowPhaseRef | null {
  const phases = [...(data.phasesByTramo[tramoId] ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const current = data.taskStats.currentPhaseId ? phases.find((p) => p.id === data.taskStats.currentPhaseId) : undefined;
  return current ?? phases[0] ?? null;
}

const NEW_TASK_KEYS = (projectId: string) => [
  qk.tareas.all,
  qk.proyectos.tab(projectId, "tareas"),
  qk.proyectos.shell(projectId),
  qk.proyectos.resumen(projectId),
  qk.proyectos.list(),
  qk.inicio(),
  qk.shell.badges(),
];

/** What the quick-add creates: a user task in the group's tramo. */
export type ResumenQuickAddDraft = {
  title: string;
  tramoId: string;
  phaseId: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  priority: TaskPriority;
};

export function ResumenAnaliticoLayout({ data }: ResumenAnaliticoLayoutProps): ReactNode {
  const projectId = data.project.id;
  const user = useSessionStore(selectAuthenticatedUser);
  const caps = useMemo(() => resolveActivitiesCapabilities(user), [user]);
  const canCreate = caps.canCreateActivity;
  const canAssign = caps.canCreateActivity && caps.canChangeResponsible;

  const tareas = useQuery(proyectoTareasOptions(projectId));
  const loaded = tareas.data?.tasks;
  const tasks = useMemo<TaskListRow[]>(() => loaded ?? [], [loaded]);
  const tasksLoading = tareas.isPending;
  const tasksError = tareas.isError ? { title: SECTION_ERROR_TITLE, onRetry: () => void tareas.refetch() } : undefined;

  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [uncapped, setUncapped] = useState<string[]>([]);
  const [created, setCreated] = useState<string[]>([]);

  const phaseTable = useMemo(
    () => tramoPhaseGroups(tasks, data.tramoCatalog, data.phasesByTramo, data.project, data.today),
    [tasks, data.tramoCatalog, data.phasesByTramo, data.project, data.today],
  );
  const taskTable = useMemo(() => taskGroupsByTramo(tasks, data.tramoCatalog, data.today), [tasks, data.tramoCatalog, data.today]);
  const kpis = useMemo(() => resumenKpis(data, tasks), [data, tasks]);
  const team = useMemo(() => teamLoadRows(data, tasks), [data, tasks]);
  const live = useMemo(() => resumenTasks(tasks), [tasks]);
  const openCount = live.filter((t) => t.status !== "completado").length;
  const overdueCount = live.filter((t) => t.status !== "completado" && t.commitmentDate !== null && t.commitmentDate.slice(0, 10) < data.today).length;

  const tramoById = useMemo(() => new Map(data.tramoCatalog.map((t) => [t.id, t])), [data.tramoCatalog]);

  const qc = useQueryClient();
  const statusesQuery = useQuery({ ...catalogTaskStatusesOptions(), enabled: caps.statusScope !== "none" });
  const statuses = statusesQuery.data;
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  // Responsable: the project's team, by name.
  const teamPeople = useMemo(
    () => Object.values(data.staff).map((s) => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name, "es")),
    [data.staff],
  );
  const taskColumns = useMemo(
    () =>
      resumenTaskColumns({
        qc,
        projectId,
        tasks: tasksById,
        phasesByTramo: data.phasesByTramo,
        people: teamPeople,
        statuses: statuses ?? [],
        viewer: { admin: data.showBudget, caps },
      }),
    [qc, projectId, tasksById, data.phasesByTramo, teamPeople, statuses, data.showBudget, caps],
  );

  const mutation = useActionMutation(createUserTaskAction, { invalidate: NEW_TASK_KEYS(projectId) });
  const people = useMemo<QuickAddPerson[]>(() => {
    const byId = new Map<string, QuickAddPerson>();
    for (const row of team) byId.set(row.staffId, { id: row.staffId, name: row.name, openCount: row.here, overdueCount: row.overdueHere });
    return [...byId.values()];
  }, [team]);
  const quickTramos = useMemo<QuickAddTramo[]>(() => data.tramoCatalog.map((t) => ({ id: t.id, key: t.key, name: t.name })), [data.tramoCatalog]);

  async function createTask(draft: ResumenQuickAddDraft): Promise<{ id: string }> {
    const task = await mutation.mutateAsync({
      projectId,
      title: draft.title,
      workflowId: draft.tramoId,
      phaseId: draft.phaseId,
      managerId: draft.assigneeId,
      priority: draft.priority,
      commitmentDate: draft.dueDate,
    });
    setCreated((current) => [task.id, ...current].slice(0, 20));
    return { id: task.id };
  }

  const phaseGroups = useMemo(
    () => phaseTable.groups.map((group) => ({ ...group, id: `fase-${group.id}`, color: tramoColor(tramoById, group.id) })),
    [phaseTable.groups, tramoById],
  );
  const taskGroups: Group<TaskRow>[] = taskTable.groups.map((group) => {
    const rows = group.rows ?? [];
    const capped = rows.length > TASK_GROUP_CAP && !uncapped.includes(group.id);
    const tramo = tramoById.get(group.id);
    return {
      ...group,
      id: `tareas-${group.id}`,
      color: tramoColor(tramoById, group.id),
      rows: capped ? rows.slice(0, TASK_GROUP_CAP) : rows,
      hasMore: capped,
      quickAdd:
        canCreate && tramo ? (
          <ResumenQuickAdd
            key={tramo.id}
            projectId={projectId}
            tramo={tramo}
            data={data}
            people={people}
            tramos={quickTramos}
            meId={user?.member.id ?? null}
            team={team}
            canAssign={canAssign}
            colSpan={taskColumns.length}
            onCreate={createTask}
          />
        ) : undefined,
    };
  });

  const allIds = [...phaseGroups.map((g) => g.id), ...taskGroups.map((g) => g.id)];
  const allCollapsed = allIds.length > 0 && allIds.every((id) => collapsed.includes(id));
  const expandedOf = (ids: string[]) => ids.filter((id) => !collapsed.includes(id));
  const onExpandedChange = (ids: string[], scope: string[]) =>
    setCollapsed((current) => [...current.filter((id) => !scope.includes(id)), ...scope.filter((id) => !ids.includes(id))]);

  function handleExport() {
    const { header, rows } = tareasCsvRows(taskTable.groups);
    downloadText(tareasCsvFilename(data.project.name, data.today), buildCsv(header, rows), "text/csv;charset=utf-8");
  }

  function renderPhaseCell(key: string, row: PhaseRow): ReactNode | undefined {
    switch (key) {
      case "name":
        return <span className={cn(row.current && "font-semibold", row.phaseId === null && "text-muted-foreground")}>{row.name}</span>;
      case "overdue":
        return <span className={cn("font-mono", row.overdue > 0 && "text-destructive")}>{row.overdue}</span>;
      case "pct":
        return (
          <span className="inline-flex items-center gap-2">
            <span aria-hidden="true" className="relative h-1.5 w-[90px] overflow-hidden rounded-full bg-muted">
              <span className="grow absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${row.pct}%` }} />
            </span>
            <span className="font-mono">{row.pct} %</span>
          </span>
        );
      case "start":
        return <span className="font-mono">{row.start ? shortDate(row.start) : "—"}</span>;
      case "endPlan":
        return <span className="font-mono">{row.endPlan ? shortDate(row.endPlan) : "—"}</span>;
      case "deviationDays": {
        if (row.deviationDays === null) return <span className="font-mono">—</span>;
        const heat = deviationHeat(row.deviationDays);
        if (!heat) return <span className="font-mono">{row.deviationDays}</span>;
        return (
          <span data-heat={heat} className={cn("inline-block rounded px-1.5 py-0.5 font-mono", HEAT_CELL_CLASS[heat])}>
            +{row.deviationDays}
          </span>
        );
      }
      default:
        return undefined;
    }
  }

  function renderTaskCell(key: string, row: TaskRow): ReactNode | undefined {
    switch (key) {
      case "title":
        // The table links it (`rowHref`): a click edits the title, the open icon and ⌘/Ctrl-click open the task.
        return (
          <span title={row.title} className="block max-w-[360px] truncate">
            {row.title}
          </span>
        );
      case "phase":
        return <span className={cn(row.phase === null && "text-muted-foreground")}>{row.phase ?? RESUMEN_SIN_FASE}</span>;
      case "responsable":
        return <span className="block max-w-[170px] truncate">{row.responsable ?? "Sin asignar"}</span>;
      case "status":
        return (
          <span className="inline-flex items-center gap-1.5">
            {row.status === "bloqueado" ? <span aria-hidden="true" className="size-[7px] rounded-full bg-destructive" /> : null}
            <StatusChip status={{ status: row.status, customStatus: row.customStatus }} />
          </span>
        );
      case "due":
        return <span className={cn("font-mono", row.daysLate > 0 && "text-destructive")}>{row.due ? shortDate(row.due) : "—"}</span>;
      case "daysLate":
        return <span className={cn("font-mono", row.daysLate > 0 && "text-destructive")}>{row.daysLate}</span>;
      default:
        return undefined;
    }
  }

  const tramoCount = phaseGroups.length;
  const phaseCount = phaseGroups.reduce((acc, g) => acc + (g.rows?.length ?? 0), 0);
  const phaseScope = phaseGroups.map((g) => g.id);
  const taskScope = taskGroups.map((g) => g.id);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <KpiStrip items={kpis} loading={tasksLoading} />

      <nav aria-label="Ir a sección" className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[.08em] text-muted-foreground">Ir a</span>
        <a href="#s-tramos" onClick={(e) => goToSection(e, "s-tramos")} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Tramos y fases
        </a>
        <a href="#s-avance" onClick={(e) => goToSection(e, "s-avance")} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Avance vs plan
        </a>
        <a href="#s-equipo" onClick={(e) => goToSection(e, "s-equipo")} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Carga del equipo
        </a>
        <a href="#s-tareas" onClick={(e) => goToSection(e, "s-tareas")} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Tareas <span className={cn("font-mono", overdueCount > 0 ? "text-destructive" : "text-muted-foreground")}>{overdueCount}</span>
        </a>
        <span className="flex-1" />
        {caps.canExportData && live.length > 0 ? <ExportMenu formats={["csv"] as const} onExport={handleExport} scaleClassName="scale-100" /> : null}
        <Button
          variant="ghost"
          size="sm"
          disabled={allIds.length === 0}
          onClick={() => setCollapsed(allCollapsed ? [] : allIds)}
        >
          {allCollapsed ? "Expandir todo" : "Contraer todo"}
        </Button>
      </nav>

      <section id="s-tramos" aria-labelledby="s-tramos-title" className={SECTION}>
        <header className={SECTION_HEADER}>
          <h2 id="s-tramos-title" tabIndex={-1} className={SECTION_TITLE}>
            Tramos y fases
          </h2>
          <span className={MONO_META}>
            {tramoCount} {tramoCount === 1 ? "tramo" : "tramos"} · {phaseCount} {phaseCount === 1 ? "fase" : "fases"}
          </span>
        </header>
        <GroupedTable<PhaseRow>
          label="Tramos y fases"
          columns={PHASE_COLUMNS}
          groups={phaseGroups}
          totals={{
            label: phaseTable.totals.name ?? "Total",
            summary: [
              `${phaseTable.totals.tasks} tareas`,
              `${phaseTable.totals.open} abiertas`,
              `${phaseTable.totals.overdue} vencidas`,
              phaseTable.totals.pct,
              `${phaseTable.totals.start} – ${phaseTable.totals.endPlan}`,
              phaseTable.totals.deviationDays,
            ].join(" · "),
          }}
          expanded={expandedOf(phaseScope)}
          onExpandedChange={(ids) => onExpandedChange(ids, phaseScope)}
          getRowId={(row, index) => row.phaseId ?? `sin-fase-${index}`}
          renderCell={renderPhaseCell}
          loading={tasksLoading}
          error={tasksError}
        />
      </section>

      <div className="flex flex-wrap items-stretch gap-4">
        <section id="s-avance" aria-labelledby="s-avance-title" className={cn(SECTION, "min-w-0 flex-[3_1_520px] gap-2.5 p-4")}>
          <AvanceContraPlan data={data} />
        </section>
        <section id="s-equipo" aria-labelledby="s-equipo-title" className={cn(SECTION, "min-w-0 flex-[2_1_380px]")}>
          <header className={SECTION_HEADER}>
            <h2 id="s-equipo-title" tabIndex={-1} className={SECTION_TITLE}>
              Carga del equipo
            </h2>
          </header>
          {tasksLoading ? (
            <LoadingSkeleton variant="table" rows={4} />
          ) : tasksError ? (
            <ErrorState title={SECTION_ERROR_TITLE} onRetry={tasksError.onRetry} />
          ) : (
            <TeamLoadTable rows={team} />
          )}
        </section>
      </div>

      <section id="s-tareas" aria-labelledby="s-tareas-title" className={SECTION}>
        <header className={SECTION_HEADER}>
          <h2 id="s-tareas-title" tabIndex={-1} className={SECTION_TITLE}>
            Tareas por tramo
          </h2>
          <span className={MONO_META}>
            {live.length} {live.length === 1 ? "tarea" : "tareas"} · {openCount} {openCount === 1 ? "abierta" : "abiertas"} ·{" "}
            {overdueCount} {overdueCount === 1 ? "vencida" : "vencidas"}
          </span>
        </header>
        <CellCommitProvider queryKeys={resumenCommitKeys(projectId)}>
          <GroupedTable<TaskRow>
            label="Tareas por tramo"
            columns={taskColumns}
            groups={taskGroups}
            totals={{ label: taskTable.totals.title ?? "Total", summary: `${taskTable.totals.daysLate} días de retraso` }}
            expanded={expandedOf(taskScope)}
            onExpandedChange={(ids) => onExpandedChange(ids, taskScope)}
            getRowId={(row) => row.id}
            renderCell={renderTaskCell}
            rowHref={(row) => `/tareas?tarea=${encodeURIComponent(row.id)}`}
            isRowMuted={(row) => row.done}
            isRowNew={(row) => created.includes(row.id)}
            onLoadMore={(groupId) => setUncapped((current) => [...current, groupId.replace(/^tareas-/, "")])}
            loading={tasksLoading}
            error={tasksError}
          />
        </CellCommitProvider>
      </section>
    </div>
  );
}

// ── Avance contra plan ──────────────────────────────────────────────────────

const CHART = { width: 640, height: 200, left: 34, right: 44, top: 12, bottom: 24 } as const;
const GRID_PCTS = [0, 20, 40, 60, 80, 100];
const MONTH_LABEL = new Intl.DateTimeFormat("es-MX", { month: "short", timeZone: "UTC" });

function monthLabel(iso: string): string {
  return MONTH_LABEL.format(new Date(`${iso}T00:00:00Z`)).replace(".", "").toUpperCase();
}

function linePath(points: { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

/** "Avance real {real} % contra plan {plan} % al {d de mmmm}; la brecha se abre desde el {d de mmmm}". */
export function sCurveAriaLabel(real: number, plan: number, today: string, gapStart: string | null): string {
  const base = `Avance real ${real} % contra plan ${plan} % al ${dayMonthLong(today)}`;
  return gapStart ? `${base}; la brecha se abre desde el ${dayMonthLong(gapStart)}` : base;
}

function AvanceContraPlan({ data }: { data: ProjectSummaryInput }) {
  const points = useMemo<SCurvePoint[]>(
    () => (data.schedule ? computeSCurve(data.schedule, new Date(`${data.today}T00:00:00`)) : []),
    [data.schedule, data.today],
  );
  const cronogramaHref = `/proyectos/${encodeURIComponent(data.project.id)}/cronograma`;
  const title = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <h2 id="s-avance-title" tabIndex={-1} className={SECTION_TITLE}>
        Avance contra plan
      </h2>
      {points.length > 0 ? (
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block w-4 border-t-2 border-solid border-chart-1" />
            Real
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="inline-block w-4 border-t-2 border-dashed border-chart-2" />
            Plan
          </span>
        </span>
      ) : null}
    </div>
  );

  if (points.length === 0) {
    return (
      <>
        {title}
        <p className="text-[12.5px] text-muted-foreground">{NO_SCHEDULE_TEXT}</p>
        <Link href={cronogramaHref} className="self-start text-[12.5px] font-medium text-primary underline-offset-4 hover:underline">
          Ir a Cronograma
        </Link>
      </>
    );
  }

  const plotW = CHART.width - CHART.left - CHART.right;
  const plotH = CHART.height - CHART.top - CHART.bottom;
  const x = (i: number) => CHART.left + (points.length > 1 ? (i / (points.length - 1)) * plotW : 0);
  const y = (pct: number) => CHART.top + (1 - Math.max(0, Math.min(100, pct)) / 100) * plotH;
  const planPts = points.map((p, i) => ({ x: x(i), y: y(p.planned) }));
  const realPts = points.flatMap((p, i) => (p.real !== null ? [{ x: x(i), y: y(p.real) }] : []));
  const lastReal = [...points].reverse().find((p) => p.real !== null) ?? null;
  const real = Math.round(data.portfolio?.real ?? lastReal?.real ?? data.project.progress);
  const plan = Math.round(data.portfolio?.plan ?? points[Math.max(0, realPts.length - 1)]?.planned ?? 0);
  const gap = sCurveGapStart(points);
  const end = realPts[realPts.length - 1] ?? null;
  const months = points.flatMap((p, i) =>
    i === 0 || p.weekStart.slice(0, 7) !== points[i - 1]!.weekStart.slice(0, 7) ? [{ i, label: monthLabel(p.weekStart) }] : [],
  );

  return (
    <>
      {title}
      <svg
        role="img"
        aria-label={sCurveAriaLabel(real, plan, data.today, gap)}
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        className="h-auto w-full"
      >
        {GRID_PCTS.map((pct) => (
          <g key={pct}>
            <line x1={CHART.left} x2={CHART.width - CHART.right} y1={y(pct)} y2={y(pct)} stroke="var(--accent)" strokeWidth={1} />
            <text x={CHART.left - 6} y={y(pct) + 3} textAnchor="end" className="fill-muted-foreground font-mono text-[10px]">
              {pct}
            </text>
          </g>
        ))}
        {months.map((m) => (
          <text key={m.i} x={x(m.i)} y={CHART.height - 6} textAnchor="middle" className="fill-muted-foreground font-mono text-[10px]">
            {m.label}
          </text>
        ))}
        <path d={linePath(planPts)} fill="none" stroke="var(--chart-2)" strokeWidth={2} strokeDasharray="6 5" className="draw" />
        {realPts.length > 0 ? (
          <path d={linePath(realPts)} fill="none" stroke="var(--chart-1)" strokeWidth={2} className="draw" />
        ) : null}
        {end ? (
          <g>
            <circle cx={end.x} cy={end.y} r={5} fill="var(--chart-1)" stroke="var(--card)" strokeWidth={2} />
            <text x={end.x + 8} y={end.y - 8} className="fill-foreground font-mono text-[11px] font-semibold">
              {real} %
            </text>
          </g>
        ) : null}
      </svg>
    </>
  );
}

// ── Quick-add composer ──────────────────────────────────────────────────────

type ResumenQuickAddProps = {
  projectId: string;
  tramo: WorkflowRef;
  data: ProjectSummaryInput;
  people: QuickAddPerson[];
  tramos: QuickAddTramo[];
  meId: string | null;
  team: TeamLoadRow[];
  canAssign: boolean;
  colSpan: number;
  onCreate(draft: ResumenQuickAddDraft): Promise<{ id: string }>;
};

const PRIORITY_CHIP: Record<TaskPriority, { label: string; variant: "warning" | "outline" | "secondary" }> = {
  alta: { label: "Prioridad alta", variant: "warning" },
  media: { label: "Prioridad media", variant: "secondary" },
  baja: { label: "Prioridad baja", variant: "outline" },
};

/**
 * Last row of a "Tareas por tramo" group: write a task with `@persona`,
 * `#tramo` (prefilled to the group), a date and `!prioridad`. While typing it
 * expands into a composer with the parsed tokens ("DETECTADO") and, when the
 * responsable is at 90 % load or more and someone else qualifies
 * (`suggestAssignee`), a status hint: Tab assigns the suggestion, Shift+Tab
 * moves to "Mantener a …", Enter creates, Esc closes.
 */
function ResumenQuickAdd({ projectId, tramo, data, people, tramos, meId, team, canAssign, colSpan, onCreate }: ResumenQuickAddProps) {
  const inputId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const [text, setText] = useState("");
  const [override, setOverride] = useState<{ id: string; name: string } | null>(null);
  const [kept, setKept] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const parsed = useMemo(
    () => parseQuickAdd(text, { today: data.today, people, tramos, meId }),
    [text, data.today, people, tramos, meId],
  );
  const tramoId = parsed.tramoId ?? tramo.id;
  const draftTramo = data.tramoCatalog.find((t) => t.id === tramoId) ?? tramo;
  const phase = phaseForTramo(data, tramoId);
  const parsedAssignee = parsed.assigneeId ?? null;
  const assigneeId = override?.id ?? parsedAssignee;
  const person = parsedAssignee ? (team.find((r) => r.staffId === parsedAssignee) ?? null) : null;
  const personName = override?.name ?? people.find((p) => p.id === assigneeId)?.name ?? null;
  const priority: TaskPriority | null = parsed.priority ?? null;
  const active = text.trim() !== "";
  const ambiguous = parsed.tokens.some((token) => token.status === "ambiguous");

  const heavy = Boolean(active && !override && person && person.loadPct >= HINT_LOAD_PCT && kept !== person.staffId && phase);
  const [debounced, setDebounced] = useState<string | null>(null);
  const wanted = heavy && person && phase ? `${phase.id}:${person.staffId}` : null;
  useEffect(() => {
    if (wanted === null) return;
    const timer = setTimeout(() => setDebounced(wanted), SUGGESTION_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [wanted]);
  const ready = wanted !== null && debounced === wanted;
  const suggestionQuery = useQuery({
    ...proyectoAssigneeSuggestionOptions(projectId, phase?.id ?? "", person?.staffId ?? ""),
    enabled: ready,
  });
  const suggestion: AssigneeSuggestion = ready && canAssign ? (suggestionQuery.data ?? null) : null;
  const showHint = Boolean(heavy && suggestion && person);

  function reset() {
    setText("");
    setOverride(null);
    setKept(null);
  }

  function accept() {
    if (!suggestion) return;
    setOverride({ id: suggestion.staffId, name: suggestion.name });
    inputRef.current?.focus();
  }

  function keep() {
    if (person) setKept(person.staffId);
    inputRef.current?.focus();
  }

  async function submit() {
    const title = parsed.title.trim();
    if (!title || ambiguous || pending) return;
    const draft: ResumenQuickAddDraft = {
      title,
      tramoId,
      phaseId: phase?.id ?? null,
      assigneeId,
      dueDate: parsed.dueDate ?? null,
      priority: priority ?? "media",
    };
    const previous = text;
    setPending(true);
    reset();
    try {
      await onCreate(draft);
    } catch {
      setText(previous);
    } finally {
      setPending(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void submit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (active) reset();
      else inputRef.current?.blur();
    } else if (event.key === "Tab" && showHint) {
      event.preventDefault();
      if (event.shiftKey) keepRef.current?.focus();
      else accept();
    }
  }

  const label = `Nueva tarea en ${tramo.name}`;
  const tramoColor = tramoColorVar(draftTramo.key, draftTramo.sortOrder);

  return (
    <tr className={cn(active && "anim-in")}>
      <td colSpan={colSpan} className={cn("border-b border-accent", active ? "bg-sidebar pb-2.5 pl-10 pr-3 pt-2" : "py-1.5 pl-10 pr-3")}>
        <label htmlFor={inputId} className="sr-only">
          {label}
        </label>
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            value={text}
            disabled={pending}
            aria-describedby={active ? statusId : undefined}
            placeholder="Nueva tarea…"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            className={cn(
              "min-w-0 flex-1 bg-transparent text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground",
              active && "rounded-md border border-primary bg-card px-2.5 py-1.5 ring-3 ring-secondary",
            )}
          />
          {active ? (
            <kbd className="rounded-md border border-border bg-card px-1.5 py-px font-mono text-[11px] text-muted-foreground">↵ crear</kbd>
          ) : (
            <span aria-hidden="true" className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
              @persona #fase fecha !prioridad
            </span>
          )}
        </div>

        {active ? (
          <div id={statusId} className="mt-2 flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-[11px] uppercase tracking-[.08em] text-muted-foreground">Detectado</span>
              <Badge variant="outline" data-chip="fase">
                <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: tramoColor }} />
                {phase ? `${draftTramo.name} › ${phase.name}` : draftTramo.name}
              </Badge>
              {personName ? (
                <Badge variant="secondary" data-chip="persona">
                  {personName}
                </Badge>
              ) : null}
              {parsed.dueDate ? (
                <Badge variant="outline" data-chip="fecha">
                  Vence {shortDate(parsed.dueDate)}
                </Badge>
              ) : null}
              {priority ? (
                <Badge variant={PRIORITY_CHIP[priority].variant} data-chip="prioridad">
                  {PRIORITY_CHIP[priority].label}
                </Badge>
              ) : null}
            </div>

            {showHint && suggestion && person ? (
              <div role="status" className="anim-in flex flex-col gap-2 rounded-[10px] border border-border bg-sidebar px-3 py-2 text-[12.5px] text-secondary-foreground">
                <p>
                  <b className="font-semibold">Asistente:</b> {person.name} está al {person.loadPct} % y tiene {person.overdueHere}{" "}
                  {person.overdueHere === 1 ? "vencida" : "vencidas"} aquí. {suggestion.name} tiene {suggestion.loadPct} % de carga y ya
                  trabajó {suggestion.phaseName} en {suggestion.projectName}.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="xs" onClick={accept}>
                    Asignar a {firstName(suggestion.name)}
                    <kbd className="font-mono text-[10px] opacity-80">Tab</kbd>
                  </Button>
                  <Button ref={keepRef} size="xs" variant="outline" onClick={keep}>
                    Mantener a {firstName(person.name)}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </td>
    </tr>
  );
}
