"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { PageHeader } from "@/components/v2/layout/PageHeader";
import { PersonAvatar } from "@/components/v2/status/PersonAvatar";
import { Badge } from "@/components/ui/shadcn/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/shadcn/tabs";
import TaskDrawer from "@/components/tareas/TaskDrawer";
import { TaskMemberProjectFilters, matchesMemberFilter, matchesProjectFilter } from "@/components/tareas/TaskMemberProjectFilters";
import { DEPARTMENTOS } from "@/lib/actividades/departamento";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { canChangeActivityStatus, resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { formatDateDMY } from "@/lib/utils/date";
import { BASE_STATUS_VARIANT, taskStatusLabel } from "@/lib/tasks/status-options";
import { ChecklistProgressCell } from "@/components/tareas/ChecklistProgressCell";
import {
  fetchBoardAction,
  fetchTaskAction,
  setTaskStatusAction,
  addTaskCommentAction,
  addTaskAttachmentAction,
  addTaskLinkAction,
  removeTaskLinkAction,
  addChecklistItemAction,
  updateChecklistItemAction,
  removeChecklistItemAction,
} from "@/lib/actions/tasks-actions";
import type {
  TaskChecklistItem,
  TaskDetail,
  TaskListItem,
  TaskPriority,
  TaskStatus,
  TaskLinkInput,
  WorkflowDetail,
} from "@/lib/types/core";

const STATUS_LABEL: Record<TaskStatus, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  completado: "Completado",
  bloqueado: "Bloqueado",
};

const COLUMN_ORDER: TaskStatus[] = ["pendiente", "en_proceso", "completado", "bloqueado"];

// The board query itself stays cheap even with thousands of tasks (see
// docs/phases/rebuild-phase-8-hardening.md profiling notes), but rendering
// every card as DOM at once does not: a column can hold hundreds of tasks
// with no per-view scoping. Cap the initial render per column and let the
// user page in more, rather than adding a virtualization dependency for a
// board that is usually a few dozen cards deep.
const PAGE_SIZE = 50;

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

const PRIORITY_VARIANT: Record<TaskPriority, "destructive" | "secondary" | "outline"> = {
  alta: "destructive",
  media: "secondary",
  baja: "outline",
};

interface TableroClientProps {
  initialBoard: Record<TaskStatus, TaskListItem[]>;
  workflows: WorkflowDetail[];
}

export function TableroClient({ initialBoard, workflows }: TableroClientProps) {
  const [board, setBoard] = useState<Record<TaskStatus, TaskListItem[]>>(initialBoard);
  const [visibleCount, setVisibleCount] = useState<Record<TaskStatus, number>>({
    pendiente: PAGE_SIZE,
    en_proceso: PAGE_SIZE,
    completado: PAGE_SIZE,
    bloqueado: PAGE_SIZE,
  });
  const [departmentFilter, setDepartmentFilter] = useState<string>("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [projectId, setProjectId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<TaskDetail | null>(null);
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);

  const [authenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const capabilities = useMemo(() => resolveActivitiesCapabilities(authenticatedUser), [authenticatedUser]);
  const viewerId = authenticatedUser?.member.id || "";

  const workflowIdBySlug = useMemo(() => {
    const map = new Map<string, string>();
    DEPARTMENTOS.forEach((d) => {
      const workflow = workflows.find((w) => w.key === d.slug);
      if (workflow) map.set(d.slug, workflow.id);
    });
    return map;
  }, [workflows]);

  const allBoardTasks = useMemo(() => COLUMN_ORDER.flatMap((s) => board[s] ?? []), [board]);

  const filteredBoard = useMemo(() => {
    const next = {} as Record<TaskStatus, TaskListItem[]>;
    COLUMN_ORDER.forEach((status) => {
      next[status] = (board[status] ?? []).filter((t) => matchesMemberFilter(t, memberIds) && matchesProjectFilter(t, projectId));
    });
    return next;
  }, [board, memberIds, projectId]);

  const refresh = useCallback(async () => {
    try {
      const workflowId = departmentFilter ? workflowIdBySlug.get(departmentFilter) : undefined;
      const rows = await fetchBoardAction(workflowId ? { workflowId } : {});
      setBoard(rows);
      setVisibleCount({
        pendiente: PAGE_SIZE,
        en_proceso: PAGE_SIZE,
        completado: PAGE_SIZE,
        bloqueado: PAGE_SIZE,
      });
    } catch (err) {
      console.error(err);
    }
  }, [departmentFilter, workflowIdBySlug]);

  useEffect(() => {
    // Re-fetch the board whenever the department filter changes — refresh()
    // is also reused after a drag-and-drop status change, so it can't be
    // inlined here without duplicating the fetch.
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

  function applyDetailUpdate(updated: TaskDetail) {
    setBoard((cur) => {
      const next: Record<TaskStatus, TaskListItem[]> = { ...cur };
      COLUMN_ORDER.forEach((status) => {
        next[status] = next[status].map((t) => (t.id === updated.id ? updated : t));
      });
      return next;
    });
    setSelectedTaskDetail((cur) => (cur && cur.id === updated.id ? updated : cur));
  }

  function canDragTask(task: TaskListItem) {
    return canChangeActivityStatus({
      capabilities,
      task: { manager: task.manager, support: task.support },
      viewerId,
    });
  }

  function handleDragStart(task: TaskListItem) {
    if (!canDragTask(task)) return;
    setDraggingTaskId(task.id);
  }

  function handleDragEnd() {
    setDraggingTaskId(null);
    setDragOverStatus(null);
  }

  // The drag-and-drop flow must never move a card locally before the server
  // confirms the status change — only after setTaskStatusAction resolves do
  // we update `board`, so the UI never shows a status the server hasn't
  // accepted (see docs/phases/rebuild-phase-6-tasks.md risk note).
  async function handleDrop(status: TaskStatus) {
    const taskId = draggingTaskId;
    setDraggingTaskId(null);
    setDragOverStatus(null);
    if (!taskId) return;

    const task = COLUMN_ORDER.flatMap((s) => board[s]).find((t) => t.id === taskId);
    if (!task || task.status === status || !canDragTask(task)) return;

    try {
      const updated = await setTaskStatusAction(taskId, status);
      applyDetailUpdate(updated);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "No se pudo cambiar el estatus de la tarea.";
      window.alert(message.startsWith("FORBIDDEN:") ? "No tienes permiso para realizar esta acción." : message);
      await refresh();
    }
  }

  async function addComment(comment: string) {
    if (!selectedTaskId) return;
    try {
      await addTaskCommentAction(selectedTaskId, comment);
      const detail = await fetchTaskAction(selectedTaskId);
      setSelectedTaskDetail(detail);
      if (detail) applyDetailUpdate(detail);
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
      if (detail) applyDetailUpdate(detail);
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
      if (detail) applyDetailUpdate(detail);
    } catch (err) {
      console.error(err);
    }
  }

  async function addAttachment(file: File) {
    if (!selectedTaskId) return;
    try {
      const formData = new FormData();
      formData.set("file", file);
      await addTaskAttachmentAction(selectedTaskId, formData);
      const detail = await fetchTaskAction(selectedTaskId);
      setSelectedTaskDetail(detail);
      if (detail) applyDetailUpdate(detail);
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
      if (detail) applyDetailUpdate(detail);
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
      if (detail) applyDetailUpdate(detail);
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
      if (detail) applyDetailUpdate(detail);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div>
      <PageHeader
        title="Tablero"
        description="Arrastra una tarjeta entre columnas para cambiar su estatus."
        actions={
          <Tabs value={departmentFilter || "__all__"} onValueChange={(v) => setDepartmentFilter(v === "__all__" ? "" : (v as string))}>
            <TabsList>
              <TabsTrigger value="__all__">Todos</TabsTrigger>
              {DEPARTMENTOS.map((d) => (
                <TabsTrigger key={d.slug} value={d.slug}>
                  {d.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />

      <div className="mb-4">
        <TaskMemberProjectFilters
          tasks={allBoardTasks}
          memberIds={memberIds}
          onMemberIdsChange={setMemberIds}
          projectId={projectId}
          onProjectIdChange={setProjectId}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMN_ORDER.map((status) => {
          const allTasks = filteredBoard[status] ?? [];
          const visible = visibleCount[status];
          const tasks = allTasks.slice(0, visible);
          const remaining = allTasks.length - tasks.length;
          const isDragOver = dragOverStatus === status;
          return (
            <div
              key={status}
              onDragOver={(e) => {
                if (!draggingTaskId) return;
                e.preventDefault();
                setDragOverStatus(status);
              }}
              onDragLeave={() => setDragOverStatus((cur) => (cur === status ? null : cur))}
              onDrop={(e) => {
                e.preventDefault();
                void handleDrop(status);
              }}
              className={`flex min-h-[200px] flex-col gap-2 rounded-lg border p-3 transition-colors ${
                isDragOver ? "border-primary bg-muted" : "border-border bg-card"
              }`}
            >
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-sm font-semibold">{STATUS_LABEL[status]}</h2>
                <span className="text-xs text-muted-foreground">{allTasks.length}</span>
              </div>

              {tasks.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                  Sin tareas
                </p>
              ) : (
                tasks.map((task) => {
                  const draggable = canDragTask(task);
                  return (
                    <div
                      key={task.id}
                      draggable={draggable}
                      onDragStart={() => handleDragStart(task)}
                      onDragEnd={handleDragEnd}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`cursor-pointer rounded-md border border-border bg-background p-3 text-sm shadow-sm transition-opacity hover:border-primary ${
                        draggingTaskId === task.id ? "opacity-50" : ""
                      } ${draggable ? "cursor-grab active:cursor-grabbing" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium">{task.title}</p>
                        {task.customStatus ? (
                          <Badge variant={BASE_STATUS_VARIANT[task.status]} className="shrink-0">
                            {taskStatusLabel(task)}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{task.project.name}</p>

                      <div className="mt-2 flex items-center justify-between gap-2">
                        {task.manager ? (
                          <PersonAvatar name={task.manager.name} size="sm" />
                        ) : (
                          <span className="text-xs text-muted-foreground">Sin responsable</span>
                        )}
                        <Badge variant={PRIORITY_VARIANT[task.priority]}>{PRIORITY_LABEL[task.priority]}</Badge>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                        {task.commitmentDate ? <span>Compromiso: {formatDateDMY(task.commitmentDate)}</span> : null}
                        {task.deliveryDate ? <span>Entrega: {formatDateDMY(task.deliveryDate)}</span> : null}
                      </div>

                      {task.checklist.total > 0 ? (
                        <div className="mt-1.5 text-[11px] text-muted-foreground">
                          <ChecklistProgressCell total={task.checklist.total} completed={task.checklist.completed} />
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}

              {remaining > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    setVisibleCount((cur) => ({ ...cur, [status]: cur[status] + PAGE_SIZE }))
                  }
                  className="rounded-md border border-dashed border-border p-2 text-center text-xs text-muted-foreground hover:border-primary hover:text-foreground"
                >
                  Cargar más ({remaining})
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <TaskDrawer
        open={selectedTaskId !== null}
        task={activeTaskDetail}
        onClose={() => setSelectedTaskId(null)}
        onAddComment={(comment) => void addComment(comment)}
        onAddAttachment={(file) => void addAttachment(file)}
        onAddLink={(input) => void addLink(input)}
        onRemoveLink={(id) => void removeLink(id)}
        onAddChecklistItem={(title) => void addChecklistItem(title)}
        onToggleChecklistItem={(item) => void toggleChecklistItem(item)}
        onRemoveChecklistItem={(item) => void removeChecklistItem(item)}
      />
    </div>
  );
}
