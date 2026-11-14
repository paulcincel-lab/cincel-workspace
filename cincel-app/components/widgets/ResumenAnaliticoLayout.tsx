"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";

import { ErrorState } from "@/components/shell/ErrorState";
import { LoadingSkeleton } from "@/components/shell/LoadingSkeleton";
import ExportMenu from "@/components/ui/ExportMenu";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button, buttonVariants } from "@/components/ui/shadcn/button";
import { GroupedTable, type Group } from "@/components/widgets/GroupedTable";
import { HiddenCompletedLine, HideCompletedSwitch } from "@/components/widgets/HideCompletedSwitch";
import { useHideCompletedTasks } from "@/components/tareas/use-hide-completed";
import { KpiStrip } from "@/components/widgets/KpiStrip";
import { PeopleStack, ResponsableAvatar } from "@/components/widgets/PeopleStack";
import { QuickAddRow, type QuickAddDraft } from "@/components/widgets/QuickAddRow";
import { TASK_SUPPORT_COLUMN } from "@/components/tareas/task-cell-edits";
import { SUPPORT_COLUMN_LABEL } from "@/components/tareas/task-table-copy";
import { TAREAS_CELL_KEYS, useTaskCellEdits } from "@/components/tareas/use-task-cell-edits";
import { useQuickAddCreate } from "@/components/tareas/quick-add-create";
import { AddSubtaskButton, SUBTASKS_COLLAPSE_ALL, SUBTASKS_EXPAND_ALL, subtaskQuickAddCopy, useSubtaskRows } from "@/components/tareas/use-subtask-rows";
import { CellCommitProvider } from "@/components/widgets/use-cell-commit";
import { StatusChip } from "@/components/widgets/StatusChip";
import { TeamLoadTable } from "@/components/widgets/TeamLoadTable";
import { HEAT_CELL_CLASS } from "@/components/widgets/record-table-format";
import { createUserTaskAction } from "@/lib/actions/tasks-actions";
import { deleteTargetOf, useDeleteTasks } from "@/components/tareas/use-delete-tasks";
import { TaskBulkBar } from "@/components/tareas/TaskBulkBar";
import { ProjectNoEtapa } from "@/components/proyectos/ProjectNoEtapa";
import { useTaskSelection } from "@/components/tareas/use-task-selection";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { computeSCurve } from "@/lib/cronograma/metrics";
import {
  RESUMEN_SIN_FASE,
  dayMonthLong,
  nextEtapaHint,
  sCurveGapStart,
  shortDate,
  taskRowOf,
  tareasCsvFilename,
  tareasCsvRows,
  type PhaseRow,
  type ProjectSummaryInput,
  type TaskRow,
  type TeamLoadRow,
} from "@/lib/proyectos/project-summary";
import {
  EMPTY_RESUMEN_SUMMARY,
  resumenGroupListFilters,
  resumenKpisOf,
  resumenPhaseGroups,
  resumenTaskGroups,
  resumenTeamLoadRows,
} from "@/lib/proyectos/resumen-summary";
import type { AssigneeSuggestion } from "@/lib/proyectos/assignee-suggestion";
import { qk, type TareasListFilters } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { proyectoAssigneeSuggestionOptions, proyectoResumenSummaryOptions } from "@/lib/query/options/proyectos";
import { fetchAllTareasListRows, tareasListInfiniteOptions, taskPhasesKey } from "@/lib/query/options/tareas";
import { parseQuickAdd, type QuickAddPerson, type QuickAddEtapa } from "@/lib/quick-add/parse";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import { etapaColorVar } from "@/lib/etapas/compat";
import type { TaskListRow, TaskPriority, WorkflowPhaseRef, WorkflowRef } from "@/lib/types/core";
import type { SCurvePoint } from "@/lib/types/schedule";
import type { RecordColumn } from "@/lib/types/widgets";
import { buildCsv } from "@/lib/utils/export-service";
import { cn } from "@/lib/utils";

/**
 * Proyecto · Resumen in Analítico (#997, frame `ProyectoResumen-Analitico`):
 * every number in tables grouped by domain. Top to bottom: the KPI strip,
 * the "Ir a" nav (section anchors, CSV export, expand / collapse both
 * tables), "Etapas y fases" (etapa → fase), a row with "Avance contra plan"
 * (S-curve) and "Carga del equipo", and "Tareas por etapa" (etapa → tarea)
 * whose groups end in a quick-add line.
 *
 * Every count comes from the server's task numbers
 * (`qk.proyectos.resumenSummary(id)`, #1051), never from the loaded rows.
 * Each "Tareas por etapa" group pages its rows through `qk.tareas.list(f)`
 * (30 a page, overdue first, "Cargar más (n restantes)"); the page
 * prefetches the first page of every group. Tarea, Fase, Responsable,
 * Apoyo, Estatus and Vence edit in place with the Tareas table rules
 * (#1026), patching the loaded pages. "Etapas y fases" is calculated from
 * the tasks (a fase has no schedule row of its own), so it stays inert.
 */
export type ResumenAnaliticoLayoutProps = { data: ProjectSummaryInput };

export const SECTION_ERROR_TITLE = "No se pudo cargar esta sección";
export const NO_SCHEDULE_TEXT = "Sin cronograma: el plan aparece al importar uno.";
/** Load of the parsed responsable from which the composer asks for someone else. */
export const HINT_LOAD_PCT = 90;
const SUGGESTION_DEBOUNCE_MS = 300;

const SECTION = "flex flex-col overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-card)]";
const SECTION_HEADER = "flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3.5";
const SECTION_TITLE = "text-[15px] font-semibold text-foreground outline-none";
const MONO_META = "font-mono text-xs text-muted-foreground";

const PHASE_COLUMNS: RecordColumn[] = [
  { key: "name", label: "Fase", fill: true, minWidth: 220 },
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

function etapaColor(etapas: Map<string, WorkflowRef>, id: string): string | undefined {
  const etapa = etapas.get(id);
  return etapa ? etapaColorVar(etapa.key, etapa.sortOrder) : undefined;
}

/** The fase a quick-added task lands in: the current fase when it is of that etapa, else the etapa's first. */
function phaseForEtapa(data: ProjectSummaryInput, etapaId: string): WorkflowPhaseRef | null {
  const phases = [...(data.phasesByEtapa[etapaId] ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
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

/** What the quick-add creates: a user task in the group's etapa. */
export type ResumenQuickAddDraft = {
  title: string;
  etapaId: string;
  phaseId: string | null;
  assigneeId: string | null;
  dueDate: string | null;
  priority: TaskPriority;
};

/** A "Tareas por etapa" row and the task it stands for (cell edits, Apoyo, delete, subtasks). */
export type ResumenTaskRow = TaskRow & { task: TaskListRow };

const taskOfRow = (row: ResumenTaskRow) => row.task;

/** What one group's rows query reports to the layout. */
type GroupRowsState = { rows: TaskListRow[] | undefined; loading: boolean; error: boolean; hasMore: boolean };
type GroupRowsActions = { more(): void; retry(): void };

function sameState(a: GroupRowsState | undefined, b: GroupRowsState): boolean {
  return !!a && a.rows === b.rows && a.loading === b.loading && a.error === b.error && a.hasMore === b.hasMore;
}

/**
 * One "Tareas por etapa" group's rows (`useInfiniteQuery(tareas.list(f))`,
 * 30 a page, overdue first; the page prefetches the first page). Renders
 * nothing: it reports the rows to the layout. Mounted only while its group
 * is open and has tasks.
 */
function GroupRowsLoader({
  id,
  filters,
  onState,
  actions,
}: {
  id: string;
  filters: TareasListFilters;
  onState(id: string, state: GroupRowsState): void;
  actions: RefObject<Map<string, GroupRowsActions>>;
}) {
  const list = useInfiniteQuery(tareasListInfiniteOptions(filters));
  const pages = list.data?.pages;
  const rows = useMemo(() => pages?.flatMap((p) => p.rows), [pages]);
  const loading = list.isPending || list.isFetchingNextPage;
  const error = list.isError && !rows;
  const hasMore = Boolean(list.hasNextPage);
  const { fetchNextPage, refetch } = list;

  useEffect(() => {
    const map = actions.current;
    // The functions themselves (no call here): the layout's "Cargar más" and retry run them.
    map.set(id, { more: fetchNextPage, retry: refetch });
    return () => {
      map.delete(id);
    };
  }, [id, fetchNextPage, refetch, actions]);

  useEffect(() => {
    onState(id, { rows, loading, error, hasMore });
  }, [id, rows, loading, error, hasMore, onState]);

  return null;
}

/** A "Tareas por etapa" group's last rows: the hidden-completed line, then the quick-add (or error) row. */
function withHiddenCompleted(line: ReactNode, quickAdd: ReactNode): ReactNode {
  return (
    <>
      {line}
      {quickAdd}
    </>
  );
}

export function ResumenAnaliticoLayout({ data }: ResumenAnaliticoLayoutProps): ReactNode {
  const projectId = data.project.id;
  const user = useSessionStore(selectAuthenticatedUser);
  const caps = useMemo(() => resolveActivitiesCapabilities(user), [user]);
  const canCreate = caps.canCreateActivity;
  const canAssign = caps.canCreateActivity && caps.canChangeResponsible;
  const today = data.today;

  const summaryQuery = useQuery(proyectoResumenSummaryOptions(projectId));
  const summary = summaryQuery.data ?? EMPTY_RESUMEN_SUMMARY;
  const tasksLoading = summaryQuery.isPending;
  const tasksError =
    summaryQuery.isError && !summaryQuery.data ? { title: SECTION_ERROR_TITLE, onRetry: () => void summaryQuery.refetch() } : undefined;
  // Delete (#1041): deleted tasks (and their subtasks) leave the rows right away; the counts refetch.
  const router = useRouter();
  const deletes = useDeleteTasks({ invalidate: [qk.proyectos.resumen(projectId), qk.proyectos.shell(projectId)] });
  const isHidden = deletes.isHidden;

  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [created, setCreated] = useState<string[]>([]);

  const phaseTable = useMemo(
    () => resumenPhaseGroups(summary, data.etapaCatalog, data.phasesByEtapa, data.project, today),
    [summary, data.etapaCatalog, data.phasesByEtapa, data.project, today],
  );
  // "Ocultar completadas" (#1039): only "Tareas por etapa" leaves them out (on the server); each group says how many.
  const [hideCompleted, setHideCompleted] = useHideCompletedTasks();
  const taskTable = useMemo(
    () => resumenTaskGroups(summary, data.etapaCatalog, data.project, hideCompleted),
    [summary, data.etapaCatalog, data.project, hideCompleted],
  );
  const kpis = useMemo(() => resumenKpisOf(data, summary), [data, summary]);
  const team = useMemo(() => resumenTeamLoadRows(data, summary), [data, summary]);
  // The "Tareas por etapa" header counts what its table lists.
  const openCount = taskTable.open;
  const overdueCount = taskTable.overdue;

  const etapaById = useMemo(() => new Map(data.etapaCatalog.map((t) => [t.id, t])), [data.etapaCatalog]);

  // ── Rows per open group (`qk.tareas.list`), only for groups with tasks.
  const groupFilters = useMemo(
    () =>
      new Map(
        taskTable.groups.map((g) => [
          g.id,
          resumenGroupListFilters(projectId, g.etapa?.key ?? null, { hideCompleted, includeAdmin: summary.includeAdmin }),
        ]),
      ),
    [taskTable.groups, projectId, hideCompleted, summary.includeAdmin],
  );
  const openGroups = useMemo(
    () =>
      summary.canViewTasks
        ? taskTable.groups.filter((g) => g.count > 0 && !collapsed.includes(`tareas-${g.id}`)).map((g) => ({ id: g.id, filters: groupFilters.get(g.id)! }))
        : [],
    [summary.canViewTasks, taskTable.groups, collapsed, groupFilters],
  );
  const [groupRows, setGroupRows] = useState<Record<string, GroupRowsState>>({});
  const rowActions = useRef(new Map<string, GroupRowsActions>());
  const onGroupState = useCallback((id: string, state: GroupRowsState) => {
    setGroupRows((prev) => (sameState(prev[id], state) ? prev : { ...prev, [id]: state }));
  }, []);
  const toRow = useCallback((task: TaskListRow): ResumenTaskRow => ({ ...taskRowOf(task, today), task }), [today]);
  const loadedParents = useMemo(
    () => openGroups.flatMap((g) => (groupRows[g.id]?.rows ?? []).filter((row) => !isHidden(row.id, row.parentTaskId))),
    [openGroups, groupRows, isHidden],
  );

  // Responsable: the project's team, by name.
  const teamPeople = useMemo(
    () => Object.values(data.staff).map((s) => ({ id: s.id, name: s.name })).sort((a, b) => a.name.localeCompare(b.name, "es")),
    [data.staff],
  );
  // ── Editable cells (#1026): the Tareas table rules; a save patches the loaded `qk.tareas.list` pages.
  // The Fase editor reads each etapa's fases: the Resumen already has them, so they need no read of their own.
  const qc = useQueryClient();
  useEffect(() => {
    for (const [workflowId, phases] of Object.entries(data.phasesByEtapa)) {
      if (qc.getQueryData(taskPhasesKey(workflowId)) === undefined) qc.setQueryData(taskPhasesKey(workflowId), phases);
    }
  }, [qc, data.phasesByEtapa]);
  const cells = useTaskCellEdits<ResumenTaskRow>({ taskOf: taskOfRow, etapas: data.etapaCatalog, staff: teamPeople });
  const taskColumns = useMemo<RecordColumn<ResumenTaskRow>[]>(() => {
    const support = cells.support();
    const column = (key: string, label: string, field: Parameters<typeof cells.cell>[0], rest: Partial<RecordColumn<ResumenTaskRow>>) => ({
      key,
      label,
      ...rest,
      ...cells.cell(field),
    });
    return [
      column("title", "Tarea", "tarea", { fill: true }),
      column("phase", "Fase", "fase", { width: 160 }),
      column("responsable", "Responsable", "responsable", { width: 170 }),
      { key: TASK_SUPPORT_COLUMN, label: SUPPORT_COLUMN_LABEL, width: 110, edit: support.edit, canEdit: support.canEdit },
      column("status", "Estatus", "estatus", { width: 140 }),
      // "Vence" here is the commitment date (`taskRowOf`).
      column("due", "Vence", "compromiso", { mono: true, width: 90 }),
      { key: "daysLate", label: "Días de retraso", align: "right", mono: true, format: "count", width: 130 },
    ];
  }, [cells]);
  const span = taskColumns.length + 2;

  const mutation = useActionMutation(createUserTaskAction, { invalidate: NEW_TASK_KEYS(projectId) });
  const people = useMemo<QuickAddPerson[]>(() => {
    const byId = new Map<string, QuickAddPerson>();
    for (const row of team) byId.set(row.staffId, { id: row.staffId, name: row.name, openCount: row.here, overdueCount: row.overdueHere });
    return [...byId.values()];
  }, [team]);
  const quickEtapas = useMemo<QuickAddEtapa[]>(() => data.etapaCatalog.map((t) => ({ id: t.id, key: t.key, name: t.name })), [data.etapaCatalog]);

  async function createTask(draft: ResumenQuickAddDraft): Promise<{ id: string }> {
    const task = await mutation.mutateAsync({
      projectId,
      title: draft.title,
      workflowId: draft.etapaId,
      phaseId: draft.phaseId,
      managerId: draft.assigneeId,
      priority: draft.priority,
      commitmentDate: draft.dueDate,
    });
    setCreated((current) => [task.id, ...current].slice(0, 20));
    return { id: task.id };
  }

  // ── Subtasks (#1048): a collapsible block of nested rows under each parent, "+ Subtarea…" last.
  const quickAdd = useQuickAddCreate();
  const createRef = useRef(quickAdd.create);
  useEffect(() => {
    createRef.current = quickAdd.create;
  });
  const onCreateSubtask = useCallback(async (draft: QuickAddDraft) => {
    const result = await createRef.current(draft);
    setCreated((current) => [result.id, ...current].slice(0, 20));
    return result;
  }, []);
  const subtaskAdd = useCallback(
    (parent: TaskListRow) =>
      canCreate ? (
        <QuickAddRow
          variant="row"
          colSpan={span}
          context={{ ...subtaskQuickAddCopy(parent.title), projectId: parent.projectId, etapaId: parent.workflowId, parentTaskId: parent.id }}
          onCreate={onCreateSubtask}
        />
      ) : null,
    [canCreate, span, onCreateSubtask],
  );
  const subtasks = useSubtaskRows<ResumenTaskRow>({ parents: loadedParents, toRow, taskOf: taskOfRow, isHidden, after: subtaskAdd, canAdd: canCreate });

  const phaseGroups = useMemo(
    () => phaseTable.groups.map((group) => ({ ...group, id: `fase-${group.id}`, color: etapaColor(etapaById, group.id) })),
    [phaseTable.groups, etapaById],
  );
  const taskGroups: Group<ResumenTaskRow>[] = taskTable.groups.map((group) => {
    const state = groupRows[group.id];
    const failed = state?.error === true;
    const etapa = group.etapa ? (etapaById.get(group.etapa.id) ?? group.etapa) : undefined;
    const loaded = state?.rows?.filter((row) => !isHidden(row.id, row.parentTaskId));
    return {
      id: `tareas-${group.id}`,
      label: group.label,
      caption: group.caption,
      metrics: group.metrics,
      color: etapaColor(etapaById, group.id),
      rows: group.count === 0 || failed ? [] : loaded?.map(toRow),
      loading: group.count > 0 && !failed && (state?.loading ?? true),
      hasMore: state?.hasMore ?? false,
      // "Cargar más (n restantes)" (#1051): the summary counts the group, the rows are what loaded.
      remaining: state?.rows ? Math.max(0, group.count - state.rows.length) : undefined,
      quickAdd: withHiddenCompleted(
        <HiddenCompletedLine count={group.hidden} colSpan={span} onShow={() => setHideCompleted(false)} />,
        failed ? (
          <tr>
            <td colSpan={span} className="border-b border-border px-3 py-2">
              <ErrorState title={SECTION_ERROR_TITLE} onRetry={() => rowActions.current.get(group.id)?.retry()} />
            </td>
          </tr>
        ) : canCreate && etapa ? (
          <ResumenQuickAdd
            key={etapa.id}
            projectId={projectId}
            etapa={etapa}
            data={data}
            people={people}
            etapas={quickEtapas}
            meId={user?.member.id ?? null}
            team={team}
            canAssign={canAssign}
            colSpan={span}
            onCreate={createTask}
          />
        ) : undefined,
      ),
    };
  });

  // Row checkboxes and the bulk bar (#1040) on "Tareas por etapa"; "Ocultar completadas" clears the selection.
  const shownRows = [
    ...taskGroups.flatMap((g) => (g.rows ?? []).flatMap((row) => [row, ...(subtasks.rowDetail.isOpen(row) ? (subtasks.rowDetail.rows?.(row) ?? []) : [])])),
  ];
  const selection = useTaskSelection({ visibleIds: shownRows.map((row) => row.id), resetKey: String(hideCompleted) });
  const tasksById = new Map(shownRows.map((row) => [row.id, row.task]));
  const taskOfId = (id: string) => tasksById.get(id);

  const allIds = [...phaseGroups.map((g) => g.id), ...taskGroups.map((g) => g.id)];
  const allCollapsed = allIds.length > 0 && allIds.every((id) => collapsed.includes(id));
  const expandedOf = (ids: string[]) => ids.filter((id) => !collapsed.includes(id));
  const onExpandedChange = (ids: string[], scope: string[]) =>
    setCollapsed((current) => [...current.filter((id) => !scope.includes(id)), ...scope.filter((id) => !ids.includes(id))]);

  const [exporting, setExporting] = useState(false);
  // The export lists every task of the table, also the rows not loaded yet: read on demand.
  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const groups = await Promise.all(
        taskTable.groups.map(async (group) => ({
          label: group.label,
          metrics: [],
          rows:
            group.count > 0 && summary.canViewTasks
              ? (await fetchAllTareasListRows(groupFilters.get(group.id)!)).filter((t) => !isHidden(t.id, t.parentTaskId)).map((t) => taskRowOf(t, today))
              : [],
          id: group.id,
        })),
      );
      const { header, rows } = tareasCsvRows(groups);
      downloadText(tareasCsvFilename(data.project.name, today), buildCsv(header, rows), "text/csv;charset=utf-8");
    } finally {
      setExporting(false);
    }
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

  function renderTaskCell(key: string, row: ResumenTaskRow): ReactNode | undefined {
    switch (key) {
      case "title":
        // The table links it (`rowHref`): a click edits the title, the open icon and ⌘/Ctrl-click open the task.
        return (
          <span className="inline-flex max-w-full min-w-0 items-center gap-1.5">
            <span title={row.title} className="truncate">
              {row.title}
            </span>
            {subtasks.canAddTo(row.task) ? <AddSubtaskButton title={row.title} onAdd={() => subtasks.addSubtask(row.task)} /> : null}
          </span>
        );
      case "phase":
        return <span className={cn(row.phase === null && "text-muted-foreground")}>{row.phase ?? RESUMEN_SIN_FASE}</span>;
      case "responsable":
        return <ResponsableAvatar person={row.task.manager} showUnassignedText className="max-w-[170px]" />;
      case TASK_SUPPORT_COLUMN:
        return <PeopleStack people={row.task.support} label={SUPPORT_COLUMN_LABEL} />;
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

  const etapaCount = phaseGroups.length;
  const noEtapa = data.project.etapas.length === 0;
  const nextEtapa = nextEtapaHint(data.etapaCatalog, data.project);
  const phaseCount = phaseGroups.reduce((acc, g) => acc + (g.rows?.length ?? 0), 0);
  const phaseScope = phaseGroups.map((g) => g.id);
  const taskScope = taskGroups.map((g) => g.id);
  const shownCount = taskTable.shown;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <KpiStrip items={kpis} loading={tasksLoading} />

      <nav aria-label="Ir a sección" className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[.08em] text-muted-foreground">Ir a</span>
        <a href="#s-etapas" onClick={(e) => goToSection(e, "s-etapas")} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Etapas y fases
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
        {caps.canExportData && taskTable.all > 0 ? (
          <ExportMenu formats={["csv"] as const} onExport={() => void handleExport()} scaleClassName="scale-100" />
        ) : null}
        <Button
          variant="ghost"
          size="sm"
          disabled={allIds.length === 0}
          onClick={() => setCollapsed(allCollapsed ? [] : allIds)}
        >
          {allCollapsed ? "Expandir todo" : "Contraer todo"}
        </Button>
      </nav>

      <section id="s-etapas" aria-labelledby="s-etapas-title" className={SECTION}>
        <header className={SECTION_HEADER}>
          <h2 id="s-etapas-title" tabIndex={-1} className={SECTION_TITLE}>
            Etapas y fases
          </h2>
          <span className={MONO_META}>
            {etapaCount} {etapaCount === 1 ? "etapa" : "etapas"} · {phaseCount} {phaseCount === 1 ? "fase" : "fases"}
          </span>
        </header>
        {noEtapa ? (
          // No started etapa (#1043): no suggested fases, the empty state with "Iniciar una etapa".
          <ProjectNoEtapa projectId={projectId} etapas={data.etapaCatalog} />
        ) : (
          <GroupedTable<PhaseRow>
            label="Etapas y fases"
            tableId="resumen-fases"
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
        )}
        {nextEtapa ? (
          <p data-slot="etapa-next" className="px-4 py-2 text-[13px] text-muted-foreground">
            Siguiente: {nextEtapa.name}
          </p>
        ) : null}
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
            Tareas por etapa
          </h2>
          <span className={MONO_META}>
            {shownCount} {shownCount === 1 ? "tarea" : "tareas"} · {openCount} {openCount === 1 ? "abierta" : "abiertas"} ·{" "}
            {overdueCount} {overdueCount === 1 ? "vencida" : "vencidas"}
          </span>
          <HideCompletedSwitch className="ml-auto self-center" checked={hideCompleted} onCheckedChange={setHideCompleted} />
        </header>
        <CellCommitProvider queryKeys={[...TAREAS_CELL_KEYS, qk.proyectos.resumenSummary(projectId), qk.proyectos.resumen(projectId)]}>
          <div className="contents" {...cells.primeProps}>
            <GroupedTable<ResumenTaskRow>
              label="Tareas por etapa"
              tableId="resumen-tareas"
              columns={taskColumns}
              groups={taskGroups}
              totals={{ label: taskTable.totals.title ?? "Total", summary: `${taskTable.totals.daysLate} días de retraso` }}
              expanded={expandedOf(taskScope)}
              onExpandedChange={(ids) => onExpandedChange(ids, taskScope)}
              getRowId={(row) => row.id}
              renderCell={renderTaskCell}
              rowHref={(row) => `/tareas?tarea=${encodeURIComponent(row.id)}`}
              rowDetail={subtasks.rowDetail}
              toolbar={
                subtasks.parentCount > 0 ? (
                  <Button type="button" variant="link" size="sm" onClick={() => void subtasks.toggleAll()}>
                    {subtasks.allOpen ? SUBTASKS_COLLAPSE_ALL : SUBTASKS_EXPAND_ALL}
                  </Button>
                ) : null
              }
              isRowMuted={(row) => row.done}
              isRowNew={(row) => created.includes(row.id)}
              getRowLabel={(row) => row.title}
              selectable
              selectedIds={selection.selectedIds}
              onSelectionChange={selection.onSelectionChange}
              rowActions={(row) => subtasks.withAddAction(row.task, deletes.rowActions(deleteTargetOf(row.task), () => router.push(`/tareas?tarea=${encodeURIComponent(row.id)}`)))}
              onRowDelete={deletes.canDelete ? (row) => deletes.request([deleteTargetOf(row.task)]) : undefined}
              onLoadMore={(groupId) => rowActions.current.get(groupId.replace(/^tareas-/, ""))?.more()}
              loading={tasksLoading}
              error={tasksError}
            />
          </div>
        </CellCommitProvider>
        {deletes.dialog}
        <TaskBulkBar
          selection={selection}
          taskOf={taskOfId}
          staff={teamPeople}
          deletes={deletes}
          invalidate={[qk.proyectos.shell(projectId)]}
        />
        {openGroups.map((g) => (
          <GroupRowsLoader key={g.id} id={g.id} filters={g.filters} onState={onGroupState} actions={rowActions} />
        ))}
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
  etapa: WorkflowRef;
  data: ProjectSummaryInput;
  people: QuickAddPerson[];
  etapas: QuickAddEtapa[];
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
 * Last row of a "Tareas por etapa" group: write a task with `@persona`,
 * `#etapa` (prefilled to the group), a date and `!prioridad`. While typing it
 * expands into a composer with the parsed tokens ("DETECTADO") and, when the
 * responsable is at 90 % load or more and someone else qualifies
 * (`suggestAssignee`), a status hint: Tab assigns the suggestion, Shift+Tab
 * moves to "Mantener a …", Enter creates, Esc closes.
 */
function ResumenQuickAdd({ projectId, etapa, data, people, etapas, meId, team, canAssign, colSpan, onCreate }: ResumenQuickAddProps) {
  const inputId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const [text, setText] = useState("");
  const [override, setOverride] = useState<{ id: string; name: string } | null>(null);
  const [kept, setKept] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const parsed = useMemo(
    () => parseQuickAdd(text, { today: data.today, people, etapas, meId }),
    [text, data.today, people, etapas, meId],
  );
  const etapaId = parsed.etapaId ?? etapa.id;
  const draftEtapa = data.etapaCatalog.find((t) => t.id === etapaId) ?? etapa;
  const phase = phaseForEtapa(data, etapaId);
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
      etapaId,
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

  const label = `Nueva tarea en ${etapa.name}`;
  const etapaColor = etapaColorVar(draftEtapa.key, draftEtapa.sortOrder);

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
                <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: etapaColor }} />
                {phase ? `${draftEtapa.name} › ${phase.name}` : draftEtapa.name}
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
