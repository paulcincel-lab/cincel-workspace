"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type ReactNode } from "react";

import { NewTaskDialog, type NewTaskDialogProps } from "@/components/tareas/NewTaskDialog";
import { FiltersBar, type FiltersBarProps } from "@/components/patterns/FiltersBar";
import { Button } from "@/components/ui/shadcn/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { RecordTable } from "@/components/widgets/RecordTable";
import { StatusChip } from "@/components/widgets/StatusChip";
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
  projectTasksHref,
  responsableOptions,
  topLevelTasks,
  type ProjectGroupRow,
  type ProjectTaskGroup,
  type ProjectTaskRow,
  type ProjectTasksQuery,
} from "@/lib/proyectos/project-tasks-by-fase";
import type { TaskListItem } from "@/lib/types/core";

export type ProjectTasksByFaseProps = {
  projectId: string;
  tasks: TaskListItem[];
  /** `canSeeAdminData(viewer)`: shows the "Administración" group. The server already leaves admin tasks out for others. */
  includeAdmin?: boolean;
  /** The tab's URL filters (`parseProjectTasksQuery`). */
  query?: ProjectTasksQuery;
  /** `YYYY-MM-DD`; defaults to the viewer's local day. */
  today?: string;
};

const DEFAULT_QUERY: ProjectTasksQuery = { estado: "todas", responsable: null, q: "" };
const ALL_PEOPLE = "__todos__";

/**
 * Proyecto · Tareas (redesign FE §3.5, §4.6): the project's tasks grouped by
 * fase (by tramo when the project has no fase data) with progress per group,
 * the estado / responsable / search filters and "+ Agregar tarea" per group.
 * A composition of library widgets: the per-group summary and the grouped
 * task list are `RecordTable`s, which render Visual, Esencial and Analítico.
 */
export function ProjectTasksByFase({
  projectId,
  tasks,
  includeAdmin = false,
  query = DEFAULT_QUERY,
  today: todayProp,
}: ProjectTasksByFaseProps) {
  const router = useRouter();
  const summaryHeadingId = useId();
  const tasksHeadingId = useId();
  const today = useMemo(() => todayProp ?? localDateKey(new Date()), [todayProp]);
  const [search, setSearch] = useState(query.q);
  const [dialogDefaults, setDialogDefaults] = useState<NewTaskDialogProps["defaults"] | null>(null);

  const rows = useMemo(
    () => topLevelTasks(includeAdmin ? tasks : tasks.filter((task) => task.kind !== "admin")),
    [tasks, includeAdmin],
  );
  const byPerson = useMemo(
    () => filterByPersonAndSearch(rows, { responsable: query.responsable, q: search }),
    [rows, query.responsable, search],
  );
  const counts = useMemo(() => estadoCounts(byPerson, today), [byPerson, today]);
  const shown = useMemo(
    () => byPerson.filter((task) => matchesEstado(task, query.estado, today)),
    [byPerson, query.estado, today],
  );

  // Groups and their progress cover every task of the project; the list shows the filtered ones.
  const { mode, groups } = useMemo(() => groupProjectTasks(rows, { includeAdmin, today }), [rows, includeAdmin, today]);
  const shownGroups = useMemo(() => {
    const shownIds = new Set(shown.map((task) => task.id));
    return groups
      .map((group) => ({ ...group, tasks: group.tasks.filter((task) => shownIds.has(task.id)) }))
      .filter((group) => group.tasks.length > 0);
  }, [groups, shown]);

  const groupsTable = useMemo(() => buildGroupsTable(groups, mode), [groups, mode]);
  const tasksTable = useMemo(() => buildTasksTable(shownGroups, today), [shownGroups, today]);
  const people = useMemo(() => responsableOptions(rows), [rows]);
  const hasUnassigned = rows.some((task) => !task.managerId);

  const currentQuery: ProjectTasksQuery = { ...query, q: search };
  const chips: NonNullable<FiltersBarProps["chips"]> = PROJECT_TASK_ESTADOS.map((estado) => ({
    key: estado,
    label: PROJECT_TASK_ESTADO_LABEL[estado],
    count: counts[estado],
    colorVar: estado === "vencidas" ? "var(--destructive)" : undefined,
    pressed: query.estado === estado,
    href: projectTasksHref(projectId, currentQuery, { estado }),
  }));

  const openCreate = (group: ProjectTaskGroup | null) =>
    setDialogDefaults({ projectId, ...(group?.tramo ? { tramoKey: group.tramo.key } : {}) });

  const onDialogOpenChange = (open: boolean) => {
    if (open) return;
    setDialogDefaults(null);
    router.refresh();
  };

  const responsableSelect = (
    <Select
      key="responsable"
      value={query.responsable ?? ALL_PEOPLE}
      onValueChange={(value) =>
        router.push(projectTasksHref(projectId, currentQuery, { responsable: value === ALL_PEOPLE || typeof value !== "string" ? null : value }))
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
        search={{ value: search, placeholder: `Buscar en ${rows.length} tareas`, onChange: setSearch }}
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
          <RecordTable
            data={tasksTable}
            renderCell={renderTaskCell}
            emptyState={{
              title: "No hay tareas con estos filtros",
              action: { label: "Ver todas", href: projectTasksHref(projectId, DEFAULT_QUERY) },
            }}
          />
        </section>
      ) : null}

      <NewTaskDialog
        open={dialogDefaults !== null}
        onOpenChange={onDialogOpenChange}
        defaults={dialogDefaults ?? undefined}
      />
    </div>
  );
}
