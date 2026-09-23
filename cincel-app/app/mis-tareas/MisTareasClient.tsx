"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CellContext, ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { ChecklistProgressCell } from "@/components/tareas/ChecklistProgressCell";
import { AccordionPanels } from "@/components/ui/AccordionPanels";
import { PageHeader } from "@/components/v2/layout/PageHeader";
import { KpiRow } from "@/components/v2/layout/KpiRow";
import { PersonAvatar } from "@/components/v2/status/PersonAvatar";
import { TeamMembersCompact } from "@/components/ui/TeamMultiSelect";
import { createRowActionsColumn, type RowAction } from "@/components/v2/table/RowActionsMenu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import TaskDrawer from "@/components/tareas/TaskDrawer";
import { TaskMemberProjectFilters, matchesMemberFilter, matchesProjectFilter } from "@/components/tareas/TaskMemberProjectFilters";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { canChangeActivityStatus, resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import {
  fetchMyTasksAction,
  fetchTaskAction,
  setTaskStatusAction,
  setTaskCustomStatusAction,
  addChecklistItemAction,
  updateChecklistItemAction,
  removeChecklistItemAction,
  reorderProjectTasksAction,
  addTaskCommentAction,
  addTaskAttachmentAction,
  addTaskLinkAction,
  removeTaskLinkAction,
} from "@/lib/actions/tasks-actions";
import { fetchTaskStatusesAction } from "@/lib/actions/task-statuses-actions";
import { TaskStatusCell } from "@/components/tareas/TaskStatusCell";
import { parseStatusValue, statusSelectItems, statusSelectValue, taskStatusLabel } from "@/lib/tasks/status-options";
import type { TaskChecklistItem, TaskDetail, TaskListItem, TaskLinkInput, TaskStatusOption } from "@/lib/types/core";

type RoleFilter = "todas" | "encargado" | "apoyo";

interface MisTareasClientProps {
  initialTasks: TaskListItem[];
}

export function MisTareasClient({ initialTasks }: MisTareasClientProps) {
  const [tasks, setTasks] = useState<TaskListItem[]>(initialTasks);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<TaskDetail | null>(null);
  const [search, setSearch] = useState("");
  // A built-in status or a custom one, as a status select value (see status-options.ts).
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [customStatuses, setCustomStatuses] = useState<TaskStatusOption[]>([]);

  useEffect(() => {
    fetchTaskStatusesAction()
      .then(setCustomStatuses)
      .catch((err) => console.error(err));
  }, []);
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("todas");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [projectId, setProjectId] = useState("");
  const [view, setView] = useState<"activas" | "archivadas">("activas");

  const [authenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const capabilities = useMemo(() => resolveActivitiesCapabilities(authenticatedUser), [authenticatedUser]);
  const viewerId = authenticatedUser?.member.id || "";

  const refresh = useCallback(async () => {
    try {
      const rows = await fetchMyTasksAction({ archived: view === "archivadas" });
      setTasks(rows);
    } catch (err) {
      console.error(err);
    }
  }, [view]);

  useEffect(() => {
    // Keep the list in sync with the server on mount and whenever the
    // activas/archivadas view changes — refresh() is also reused after
    // status changes, so it can't be inlined here without duplication.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedTaskId) return;
    let cancelled = false;
    fetchTaskAction(selectedTaskId)
      .then((detail) => {
        if (!cancelled) setSelectedTaskDetail(detail);
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [selectedTaskId]);

  const activeTaskDetail = selectedTaskId && selectedTaskDetail?.id === selectedTaskId ? selectedTaskDetail : null;

  async function runAction<T>(fn: () => Promise<T>, onSuccess?: (result: T) => void) {
    try {
      const result = await fn();
      onSuccess?.(result);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "No se pudo completar la acción.";
      window.alert(message.startsWith("FORBIDDEN:") ? "No tienes permiso para realizar esta acción." : message);
      await refresh();
    }
  }

  function applyDetailUpdate(updated: TaskDetail) {
    setTasks((cur) => cur.map((t) => (t.id === updated.id ? updated : t)));
    setSelectedTaskDetail((cur) => (cur && cur.id === updated.id ? updated : cur));
  }

  async function changeStatus(task: TaskListItem, value: string) {
    const parsed = parseStatusValue(value);
    await runAction(
      () =>
        parsed.kind === "custom"
          ? setTaskCustomStatusAction(task.id, parsed.id)
          : setTaskStatusAction(task.id, parsed.status),
      applyDetailUpdate
    );
  }

  async function reorderProjectTasks(groupProjectId: string, orderedTaskIds: string[]) {
    try {
      await reorderProjectTasksAction(groupProjectId, orderedTaskIds);
      await refresh();
    } catch (err) {
      console.error(err);
    }
  }

  async function addComment(comment: string) {
    if (!selectedTaskId) return;
    try {
      await addTaskCommentAction(selectedTaskId, comment);
      const detail = await fetchTaskAction(selectedTaskId);
      setSelectedTaskDetail(detail);
    } catch (err) {
      console.error(err);
    }
  }

  async function addLink(input: TaskLinkInput) {
    if (!selectedTaskId) return;
    try {
      await addTaskLinkAction(selectedTaskId, input);
      const detail = await fetchTaskAction(selectedTaskId);
      setSelectedTaskDetail(detail);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo agregar el enlace.");
    }
  }

  async function removeLink(linkId: string) {
    if (!selectedTaskId) return;
    try {
      await removeTaskLinkAction(linkId);
      const detail = await fetchTaskAction(selectedTaskId);
      setSelectedTaskDetail(detail);
    } catch (err) {
      console.error(err);
    }
  }

  async function addAttachment(file: File, checklistItemId?: string) {
    if (!selectedTaskId) return;
    try {
      const formData = new FormData();
      formData.set("file", file);
      if (checklistItemId) formData.set("checklistItemId", checklistItemId);
      await addTaskAttachmentAction(selectedTaskId, formData);
      const detail = await fetchTaskAction(selectedTaskId);
      setSelectedTaskDetail(detail);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "No se pudo adjuntar el archivo.");
    }
  }

  async function addChecklistItem(title: string) {
    if (!selectedTaskId) return;
    try {
      await addChecklistItemAction(selectedTaskId, title);
      const detail = await fetchTaskAction(selectedTaskId);
      setSelectedTaskDetail(detail);
      if (detail) setTasks((cur) => cur.map((t) => (t.id === detail.id ? detail : t)));
    } catch (err) {
      console.error(err);
    }
  }

  async function toggleChecklistItem(item: TaskChecklistItem) {
    if (!selectedTaskId) return;
    try {
      await updateChecklistItemAction(item.id, { completed: !item.completed });
      const detail = await fetchTaskAction(selectedTaskId);
      setSelectedTaskDetail(detail);
      if (detail) setTasks((cur) => cur.map((t) => (t.id === detail.id ? detail : t)));
    } catch (err) {
      console.error(err);
    }
  }

  async function removeChecklistItem(item: TaskChecklistItem) {
    if (!selectedTaskId) return;
    try {
      await removeChecklistItemAction(item.id);
      const detail = await fetchTaskAction(selectedTaskId);
      setSelectedTaskDetail(detail);
      if (detail) setTasks((cur) => cur.map((t) => (t.id === detail.id ? detail : t)));
    } catch (err) {
      console.error(err);
    }
  }

  function isManager(task: TaskListItem) {
    return Boolean(viewerId && task.manager?.id === viewerId);
  }

  function isSupport(task: TaskListItem) {
    return task.support.some((s) => s.id === viewerId);
  }

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const kpis = useMemo(() => {
    const activeTasks = view === "activas" ? tasks : [];
    const asManager = activeTasks.filter(isManager).length;
    const asSupport = activeTasks.filter(isSupport).length;
    const overdue = activeTasks.filter(
      (t) => t.status !== "completado" && !!t.commitmentDate && t.commitmentDate < today
    ).length;
    return [
      { label: "Mis tareas activas", value: activeTasks.length },
      { label: "Como encargado", value: asManager },
      { label: "Como apoyo", value: asSupport },
      { label: "Vencidas", value: overdue, tone: overdue > 0 ? ("warn" as const) : ("default" as const) },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, view, viewerId, today]);

  const filteredTasks = useMemo(() => {
    const query = search.toLowerCase();
    return tasks.filter((t) => {
      const matchesSearch =
        !query ||
        t.project.name.toLowerCase().includes(query) ||
        t.title.toLowerCase().includes(query) ||
        (t.phase ?? "").toLowerCase().includes(query) ||
        taskStatusLabel(t).toLowerCase().includes(query);
      const matchesStatus = !statusFilter || statusSelectValue(t) === statusFilter;
      const matchesRole =
        roleFilter === "todas" ||
        (roleFilter === "encargado" && isManager(t)) ||
        (roleFilter === "apoyo" && isSupport(t));
      return matchesSearch && matchesStatus && matchesRole && matchesMemberFilter(t, memberIds) && matchesProjectFilter(t, projectId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, search, statusFilter, roleFilter, memberIds, projectId, viewerId]);

  function clearFilters() {
    setSearch("");
    setStatusFilter("");
    setRoleFilter("todas");
    setMemberIds([]);
    setProjectId("");
    setView("activas");
  }

  const projectGroups = useMemo(() => {
    const groups = new Map<string, { id: string; name: string; tasks: TaskListItem[] }>();
    for (const task of filteredTasks) {
      const group = groups.get(task.project.id) ?? { id: task.project.id, name: task.project.name, tasks: [] };
      group.tasks.push(task);
      groups.set(task.project.id, group);
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [filteredTasks]);

  const columns = useMemo<ColumnDef<TaskListItem, unknown>[]>(() => {
    return [
      {
        id: "project",
        header: "Proyecto",
        cell: ({ row }: CellContext<TaskListItem, unknown>) => (
          <span className="font-medium">{row.original.project.name}</span>
        ),
      },
      {
        id: "title",
        header: "Tarea",
        cell: ({ row }: CellContext<TaskListItem, unknown>) => <span className="font-medium">{row.original.title}</span>,
      },
      {
        id: "workflow",
        header: "Departamento",
        cell: ({ row }: CellContext<TaskListItem, unknown>) => (
          <span className="text-sm text-muted-foreground">{row.original.workflow?.name || "Sin departamento"}</span>
        ),
      },
      {
        id: "role",
        header: "Mi rol",
        enableSorting: false,
        cell: ({ row }: CellContext<TaskListItem, unknown>) => {
          const task = row.original;
          const manager = isManager(task);
          const support = isSupport(task);
          return (
            <div className="flex flex-wrap gap-1">
              {manager ? <Badge variant="secondary">Encargado</Badge> : null}
              {support ? <Badge variant="outline">Apoyo</Badge> : null}
            </div>
          );
        },
      },
      {
        id: "checklist",
        header: "Checklist",
        enableSorting: false,
        cell: ({ row }: CellContext<TaskListItem, unknown>) => (
          <ChecklistProgressCell
            total={row.original.checklist.total}
            completed={row.original.checklist.completed}
            onClick={() => setSelectedTaskId(row.original.id)}
          />
        ),
      },
      {
        id: "manager",
        header: "Responsable",
        cell: ({ row }: CellContext<TaskListItem, unknown>) => {
          const task = row.original;
          return task.manager ? <PersonAvatar name={task.manager.name} size="sm" /> : <span className="text-muted-foreground">Sin responsable</span>;
        },
      },
      {
        id: "support",
        header: "Equipo",
        enableSorting: false,
        cell: ({ row }: CellContext<TaskListItem, unknown>) => (
          <TeamMembersCompact members={row.original.support.map((s) => s.name)} />
        ),
      },
      {
        id: "status",
        header: "Estado",
        cell: ({ row }: CellContext<TaskListItem, unknown>) => {
          const task = row.original;
          const canChange = canChangeActivityStatus({
            capabilities,
            task: { manager: task.manager, support: task.support },
            viewerId,
          });
          return (
            <TaskStatusCell
              task={task}
              customStatuses={customStatuses}
              canChange={canChange}
              onChange={(value) => void changeStatus(task, value)}
            />
          );
        },
      },
      {
        id: "commitmentDate",
        header: "Compromiso",
        cell: ({ row }: CellContext<TaskListItem, unknown>) => (
          <span className="text-sm">{row.original.commitmentDate || "Sin fecha"}</span>
        ),
      },
      {
        id: "reviewDate",
        header: "Próxima revisión",
        cell: ({ row }: CellContext<TaskListItem, unknown>) => (
          <span className="text-sm">{row.original.reviewDate || "Sin fecha"}</span>
        ),
      },
      {
        id: "deliveryDate",
        header: "Fecha de entrega",
        cell: ({ row }: CellContext<TaskListItem, unknown>) => (
          <span className="text-sm">{row.original.deliveryDate || "Sin fecha"}</span>
        ),
      },
      createRowActionsColumn<TaskListItem>(() => {
        const actions: RowAction<TaskListItem>[] = [
          { label: "Ver detalle", onSelect: (t) => setSelectedTaskId(t.id) },
        ];
        return actions;
      }),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capabilities, viewerId, customStatuses]);

  // Each accordion already names the project, so the per-row Proyecto column is redundant.
  const groupedColumns = useMemo(() => columns.filter((c) => c.id !== "project"), [columns]);

  return (
    <div>
      <PageHeader title="Mis tareas" description="Tareas donde eres encargado o apoyo." />

      <KpiRow tiles={kpis} />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
        <Input type="text" placeholder="Buscar tarea..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-56" />

        <Tabs value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleFilter)}>
          <TabsList>
            <TabsTrigger value="todas">Todas</TabsTrigger>
            <TabsTrigger value="encargado">Soy encargado</TabsTrigger>
            <TabsTrigger value="apoyo">Soy apoyo</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select
          items={{
            __all__: "Estatus",
            ...Object.fromEntries(statusSelectItems(customStatuses).map((i) => [i.value, i.label])),
          }}
          value={statusFilter || "__all__"}
          onValueChange={(v) => setStatusFilter(v === "__all__" ? "" : (v as string))}
        >
          <SelectTrigger className="h-9 w-auto"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Estatus</SelectItem>
            {statusSelectItems(customStatuses).map((i) => (
              <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <TaskMemberProjectFilters
          tasks={tasks}
          memberIds={memberIds}
          onMemberIdsChange={setMemberIds}
          projectId={projectId}
          onProjectIdChange={setProjectId}
          showClear={false}
        />

        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList>
            <TabsTrigger value="activas">Activas</TabsTrigger>
            <TabsTrigger value="archivadas">Archivadas</TabsTrigger>
          </TabsList>
        </Tabs>

        <Button variant="outline" onClick={clearFilters}>Limpiar filtros</Button>
      </div>

      {projectGroups.length === 0 ? (
        <DataTable
          columns={groupedColumns}
          data={[]}
          emptyMessage="No tienes tareas asignadas con los filtros actuales."
        />
      ) : (
        <AccordionPanels
          groups={projectGroups.map((group) => ({
            id: group.id,
            title: group.name,
            count: group.tasks.length,
            content: (
              <DataTable
                columns={groupedColumns}
                data={group.tasks}
                getRowId={(row) => row.id}
                wrapperClassName="rounded-none! border-x-0! border-b-0! shadow-none!"
                onReorderRows={
                  capabilities.canReorderPhases && view === "activas"
                    ? (ids) => void reorderProjectTasks(group.id, ids)
                    : undefined
                }
              />
            ),
          }))}
        />
      )}

      <TaskDrawer
        open={selectedTaskId !== null}
        task={activeTaskDetail}
        onClose={() => setSelectedTaskId(null)}
        onAddComment={(comment) => void addComment(comment)}
        onAddAttachment={(file, checklistItemId) => void addAttachment(file, checklistItemId)}
        onAddLink={(input) => void addLink(input)}
        onRemoveLink={(id) => void removeLink(id)}
        onAddChecklistItem={(title) => void addChecklistItem(title)}
        onToggleChecklistItem={(item) => void toggleChecklistItem(item)}
        onRemoveChecklistItem={(item) => void removeChecklistItem(item)}
      />
    </div>
  );
}
