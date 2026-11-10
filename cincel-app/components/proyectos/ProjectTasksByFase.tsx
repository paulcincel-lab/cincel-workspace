"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

import { FiltersBar, type FiltersBarProps } from "@/components/patterns/FiltersBar";
import { ErrorState } from "@/components/shell/ErrorState";
import { Button } from "@/components/ui/shadcn/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { RecordTable } from "@/components/widgets/RecordTable";
import { PeopleStack } from "@/components/widgets/PeopleStack";
import { projectTaskSupportColumn } from "@/components/widgets/proyectos-cell-edits";
import { CellCommitProvider } from "@/components/widgets/use-cell-commit";
import { TASK_SUPPORT_COLUMN } from "@/components/tareas/task-cell-edits";
import { SUPPORT_COLUMN_LABEL } from "@/components/tareas/task-table-copy";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { catalogStaffOptions } from "@/lib/query/options/catalog";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import { deleteTargetOf, useDeleteTasks } from "@/components/tareas/use-delete-tasks";
import { TaskBulkBar } from "@/components/tareas/TaskBulkBar";
import { useTaskSelection } from "@/components/tareas/use-task-selection";
import { HiddenCompletedLine, HideCompletedSwitch } from "@/components/widgets/HideCompletedSwitch";
import { StatusChip } from "@/components/widgets/StatusChip";
import { useHideCompletedTasks } from "@/components/tareas/use-hide-completed";
import {
  PROJECT_TASK_ESTADO_LABEL,
  PROJECT_TASK_ESTADOS,
  UNASSIGNED_FILTER,
  UNASSIGNED_LABEL,
  buildGroupsTable,
  buildTasksTable,
  canAddToGroup,
  estadoCounts,
  filterByPersonAndSearch,
  groupProjectTasks,
  isTaskLate,
  localDateKey,
  matchesEstado,
  parseProjectTasksQuery,
  projectTasksHref,
  responsableOptions,
  topLevelTasks,
  type ProjectGroupRow,
  type ProjectTask,
  type ProjectTaskGroup,
  type ProjectTaskRow,
  type ProjectTasksQuery,
} from "@/lib/proyectos/project-tasks-by-fase";
import { proyectoTareasOptions } from "@/lib/query/options/proyectos";
import { qk } from "@/lib/query/keys";
import { useNewTaskUi } from "@/lib/stores/new-task-store";
import { isTaskClosed } from "@/lib/tasks/status-options";

export type ProjectTasksByFaseProps = {
  projectId: string;
  tasks: ProjectTask[];
  /** `canSeeAdminData(viewer)`: shows the "Administración" group. The server already leaves admin tasks out for others. */
  includeAdmin?: boolean;
  /** `YYYY-MM-DD`; defaults to the viewer's local day. */
  today?: string;
};

const DEFAULT_QUERY: ProjectTasksQuery = { estado: "todas", responsable: null, q: "" };
const ALL_PEOPLE = "__todos__";
/** How long typing waits before the search reaches the URL. */
export const PROJECT_TASKS_SEARCH_DEBOUNCE_MS = 300;

/**
 * Writes the tab's filters to the URL with `history.replaceState`: the App
 * Router mirrors it into `useSearchParams`, the rows are already loaded, so
 * no server render and no action call.
 */
function replaceFilters(projectId: string, query: ProjectTasksQuery): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(window.history.state, "", projectTasksHref(projectId, query));
}

/**
 * The project Tareas tab: reads `qk.proyectos.tab(id, 'tareas')` (prefetched
 * by the page) and renders `ProjectTasksByFase` over it.
 */
export function ProjectTareasTab({ projectId }: { projectId: string }) {
  const { data } = useSuspenseQuery(proyectoTareasOptions(projectId));
  if (!data) {
    return <ErrorState title="No se pudieron cargar las tareas." description="El proyecto no existe o ya no tienes acceso." />;
  }
  return <ProjectTasksByFase projectId={projectId} tasks={data.tasks} includeAdmin={data.includeAdmin} />;
}

/**
 * Proyecto · Tareas (redesign FE §3.5, §4.6): the project's tasks grouped by
 * fase (by tramo when the project has no fase data) with progress per group,
 * the estado / responsable / search filters and "+ Agregar tarea" per group.
 * A composition of library widgets: the per-group summary and the grouped
 * task list are `RecordTable`s, which render Visual, Esencial and Analítico.
 *
 * The filters live in the URL (`estado`, `responsable`, `q`) and change it
 * with `history.replaceState` only: they filter the loaded rows, so they
 * cause no server render. "Agregar tarea" opens the shell's one
 * new-task dialog (`useNewTaskUi`); its host invalidates this tab's query.
 */
export function ProjectTasksByFase({ projectId, tasks, includeAdmin = false, today: todayProp }: ProjectTasksByFaseProps) {
  const searchParams = useSearchParams();
  const summaryHeadingId = useId();
  const tasksHeadingId = useId();
  const today = useMemo(() => todayProp ?? localDateKey(new Date()), [todayProp]);

  const search = searchParams?.toString() ?? "";
  const query = useMemo(() => parseProjectTasksQuery(Object.fromEntries(new URLSearchParams(search))), [search]);
  // The local draft filters right away; the URL follows after the debounce.
  const [draft, setDraft] = useState(() => query.q);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    },
    [],
  );

  const currentQuery: ProjectTasksQuery = { ...query, q: draft };

  function setFilter(patch: Partial<ProjectTasksQuery>) {
    replaceFilters(projectId, { ...currentQuery, ...patch });
  }

  function handleSearch(value: string) {
    setDraft(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      searchTimer.current = null;
      replaceFilters(projectId, { ...query, q: value.trim() });
    }, PROJECT_TASKS_SEARCH_DEBOUNCE_MS);
  }

  // Delete (#1041): deleted tasks leave the list and the counts right away.
  const deletes = useDeleteTasks({ invalidate: [qk.proyectos.resumen(projectId), qk.proyectos.shell(projectId)] });
  const isHidden = deletes.isHidden;
  const rows = useMemo(
    () =>
      topLevelTasks(includeAdmin ? tasks : tasks.filter((task) => task.kind !== "admin")).filter(
        (task) => !isHidden(task.id, task.parentTaskId),
      ),
    [tasks, includeAdmin, isHidden],
  );
  const byPerson = useMemo(
    () => filterByPersonAndSearch(rows, { responsable: query.responsable, q: draft }),
    [rows, query.responsable, draft],
  );
  const counts = useMemo(() => estadoCounts(byPerson, today), [byPerson, today]);
  const matching = useMemo(
    () => byPerson.filter((task) => matchesEstado(task, query.estado, today)),
    [byPerson, query.estado, today],
  );
  // "Ocultar completadas" (#1039): the task list leaves them out and says how many; the summary keeps them.
  const [hideCompleted, setHideCompleted] = useHideCompletedTasks();
  const shown = useMemo(
    () => (hideCompleted ? matching.filter((task) => !isTaskClosed(task)) : matching),
    [matching, hideCompleted],
  );
  const hiddenCompleted = matching.length - shown.length;

  // Groups and their progress cover every task of the project; the list shows the filtered ones.
  const { mode, groups } = useMemo(() => groupProjectTasks(rows, { includeAdmin, today }), [rows, includeAdmin, today]);
  const shownGroups = useMemo(() => {
    const shownIds = new Set(shown.map((task) => task.id));
    return groups
      .map((group) => ({ ...group, tasks: group.tasks.filter((task) => shownIds.has(task.id)) }))
      .filter((group) => group.tasks.length > 0);
  }, [groups, shown]);

  const groupsTable = useMemo(() => buildGroupsTable(groups, mode), [groups, mode]);
  // Apoyo (#1038) edits in place; the other columns stay as they are.
  const qc = useQueryClient();
  const user = useSessionStore(selectAuthenticatedUser);
  const caps = useMemo(() => resolveActivitiesCapabilities(user), [user]);
  const [staffWanted, setStaffWanted] = useState(false);
  const staffQuery = useQuery({ ...catalogStaffOptions(), enabled: staffWanted });
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);
  const tasksTable = useMemo(() => {
    const table = buildTasksTable(shownGroups, today);
    const people = staffQuery.data ?? [];
    const support = projectTaskSupportColumn<ProjectTaskRow>({ qc, projectId, tasks: tasksById, people, viewer: { caps } });
    return {
      ...table,
      columns: table.columns.map((column) => (column.key === TASK_SUPPORT_COLUMN ? { ...column, edit: support.edit, canEdit: support.canEdit } : column)),
    } as typeof table;
  }, [shownGroups, today, staffQuery.data, qc, projectId, tasksById, caps]);
  const people = useMemo(() => responsableOptions(rows), [rows]);

  // Row checkboxes and the bulk bar (#1040) on the task list: a filter change clears the selection.
  const visibleIds = useMemo(() => tasksTable.rows.map((row) => String(row.id)), [tasksTable.rows]);
  const selection = useTaskSelection({
    visibleIds,
    resetKey: JSON.stringify([query.estado, query.responsable, draft, hideCompleted]),
  });
  const hasUnassigned = rows.some((task) => !task.managerId);

  const chips: NonNullable<FiltersBarProps["chips"]> = PROJECT_TASK_ESTADOS.map((estado) => ({
    key: estado,
    label: PROJECT_TASK_ESTADO_LABEL[estado],
    count: counts[estado],
    colorVar: estado === "vencidas" ? "var(--destructive)" : undefined,
    pressed: query.estado === estado,
    href: projectTasksHref(projectId, currentQuery, { estado }),
    onSelect: () => setFilter({ estado }),
  }));

  const openCreate = (group: ProjectTaskGroup | null) =>
    useNewTaskUi
      .getState()
      .openNewTask({ projectId, ...(group?.tramo ? { tramoKey: group.tramo.key } : {}) }, "proyecto");

  const clearFilters = () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = null;
    setDraft("");
    replaceFilters(projectId, DEFAULT_QUERY);
  };

  const responsableSelect = (
    <Select
      key="responsable"
      value={query.responsable ?? ALL_PEOPLE}
      onValueChange={(value) =>
        setFilter({ responsable: value === ALL_PEOPLE || typeof value !== "string" ? null : value })
      }
    >
      <SelectTrigger aria-label="Responsable">
        <SelectValue placeholder="Responsable" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_PEOPLE}>Todos los responsables</SelectItem>
        {people.map((person) => (
          <SelectItem key={person.id} value={person.id}>
            {person.name}
          </SelectItem>
        ))}
        {hasUnassigned ? <SelectItem value={UNASSIGNED_FILTER}>{UNASSIGNED_LABEL}</SelectItem> : null}
      </SelectContent>
    </Select>
  );

  const renderTaskCell = (columnKey: string, row: Record<string, unknown>): ReactNode | undefined => {
    const { task } = row as ProjectTaskRow;
    switch (columnKey) {
      case "estatus":
        return <StatusChip status={{ status: task.status, customStatus: task.customStatus }} size="sm" />;
      case "tarea":
        return (
          <Link
            href={`/tareas?tarea=${encodeURIComponent(task.id)}`}
            className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:underline"
          >
            {task.title}
          </Link>
        );
      case "estatusTexto":
      case "vence":
        return isTaskLate(task, today) ? <span className="text-destructive">{String(row[columnKey])}</span> : undefined;
      case "responsable":
        return task.manager ? undefined : <span className="text-muted-foreground">{UNASSIGNED_LABEL}</span>;
      case TASK_SUPPORT_COLUMN:
        return <PeopleStack people={task.support} label={SUPPORT_COLUMN_LABEL} />;
      default:
        return undefined;
    }
  };

  const renderGroupCell = (columnKey: string, row: Record<string, unknown>): ReactNode | undefined => {
    if (columnKey !== "agregar") return undefined;
    const { group } = row as ProjectGroupRow;
    if (!canAddToGroup(group)) return null;
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => openCreate(group)}
        aria-label={`Agregar tarea a ${group.label}`}
      >
        <Plus aria-hidden="true" />
        Agregar tarea
      </Button>
    );
  };

  return (
    <div className="flex flex-col gap-6" data-slot="project-tasks-by-fase" data-group-mode={mode}>
      <FiltersBar
        chips={chips}
        selects={[responsableSelect]}
        search={{ value: draft, placeholder: `Buscar en ${rows.length} tareas`, onChange: handleSearch }}
      />

      <section aria-labelledby={summaryHeadingId} className="flex flex-col gap-3">
        <h2 id={summaryHeadingId} className="text-base font-semibold text-foreground">
          {mode === "fase" ? "Avance por fase" : "Avance por tramo"}
        </h2>
        <RecordTable
          data={groupsTable}
          renderCell={renderGroupCell}
          emptyState={{
            title: "Este proyecto aún no tiene tareas",
            description: "Agrega la primera tarea del proyecto.",
            action: { label: "Agregar tarea", onClick: () => openCreate(null) },
          }}
        />
      </section>

      {rows.length > 0 ? (
        <section aria-labelledby={tasksHeadingId} className="flex flex-col gap-3">
          <h2 id={tasksHeadingId} className="text-base font-semibold text-foreground">
            Tareas{" "}
            <span className="font-normal text-muted-foreground">
              · {shown.length} de {rows.length} mostradas
            </span>
          </h2>
          <HideCompletedSwitch className="self-start" checked={hideCompleted} onCheckedChange={setHideCompleted} />
          <CellCommitProvider queryKeys={[qk.proyectos.tab(projectId, "tareas")]}>
            <div className="contents" onPointerEnter={() => setStaffWanted(true)} onFocusCapture={() => setStaffWanted(true)}>
              <RecordTable
                data={tasksTable}
                renderCell={renderTaskCell}
                rowSelection={{
                  selectable: true,
                  selectedIds: selection.selectedIds,
                  onSelectionChange: selection.onSelectionChange,
                  getRowLabel: (row) => (row as ProjectTaskRow).task.title,
                }}
                rowMenu={{
                  getRowLabel: (row) => (row as ProjectTaskRow).task.title,
                  // The title is already the task's link: the menu only adds Eliminar.
                  rowActions: (row) => deletes.rowActions(deleteTargetOf((row as ProjectTaskRow).task)),
                  onRowDelete: deletes.canDelete
                    ? (row) => deletes.request([deleteTargetOf((row as ProjectTaskRow).task)])
                    : undefined,
                }}
                emptyState={{
                  title: "No hay tareas con estos filtros",
                  action: { label: "Ver todas", onClick: clearFilters },
                }}
              />
            </div>
          </CellCommitProvider>
          <HiddenCompletedLine as="line" count={hiddenCompleted} onShow={() => setHideCompleted(false)} />
        </section>
      ) : null}
      {deletes.dialog}
      <TaskBulkBar
        selection={selection}
        taskOf={(id) => tasksById.get(id)}
        staff={staffQuery.data ?? []}
        deletes={deletes}
        invalidate={[qk.proyectos.shell(projectId)]}
      />
    </div>
  );
}
