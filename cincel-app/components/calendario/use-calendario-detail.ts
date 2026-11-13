"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";

import { replaceCalendarioUrl, useCalendarioQuery, useCalendarioRange } from "./use-calendario-page";
import { useCalendarioAssistantContext } from "./use-calendario-assistant-context";
import { TASK_ACTION } from "@/components/widgets/calendario/event-detail-model";
import * as tasksActions from "@/lib/actions/tasks-actions";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { meetingDetailOptions } from "@/lib/query/options/calendario";
import { taskStatusInvalidations, taskSheetOptions, taskUpdateInvalidations } from "@/lib/query/options/tareas";
import { openAssistant } from "@/lib/stores/assistant-ui-store";
import { BASE_STATUS_LABEL } from "@/lib/tasks/status-options";
import type { CalItem, CalTaskItem, CalendarioRange, DetailAction, MeetingDetail } from "@/lib/types/calendario";
import type { TaskBulkResult, TaskDetail, TaskStatus } from "@/lib/types/core";

export type CalendarioDetail = {
  /** "e:<uuid>" or "t:<uuid>". */
  id: string;
  kind: "event" | "task";
  entityId: string;
  /** Resolved from the range cache, else from the task sheet / meeting detail; null while it loads or when it is gone. */
  item: CalItem | null;
  meeting?: MeetingDetail;
  /** The task sheet (history, subtareas) for a task detail. */
  task?: TaskDetail | null;
  isPending: boolean;
  /** The task actions of FE §5; #1071 adds the meeting ones. */
  actions: DetailAction[];
  /** Removes `?evento=` (replaceState) and returns focus to the item. */
  close(): void;
};

const RANGE_KEY = [...qk.calendario.all, "range"] as const;

function todayKey(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${mm}-${dd}`;
}

/** A calendar item built from a task sheet, for a link whose item is outside the cached range. */
export function taskItemFromDetail(task: TaskDetail, today: string = todayKey()): CalTaskItem {
  const dateField = task.commitmentDate ? "commitmentDate" : "deliveryDate";
  const date = task.commitmentDate ?? task.deliveryDate ?? today;
  const completed = task.status === "completado";
  return {
    kind: "task",
    id: `t:${task.id}`,
    taskId: task.id,
    title: task.title,
    date,
    dateField,
    project: { id: task.project.id, name: task.project.name },
    etapa: task.workflow ? { id: task.workflow.id, key: task.workflow.key, name: task.workflow.name, colorSlot: task.workflow.colorSlot ?? null } : null,
    phase: task.phase ? { id: task.phase.id, name: task.phase.name } : null,
    status: task.status,
    statusLabel: task.customStatus?.name ?? BASE_STATUS_LABEL[task.status],
    priority: task.priority,
    manager: task.manager ? { id: task.manager.id, name: task.manager.name } : null,
    support: task.support.map((s) => ({ id: s.id, name: s.name })),
    overdue: !completed && date < today,
    completed,
    blocked: task.status === "bloqueado",
    hours: 0,
    hoursSource: "default",
    parentTaskId: task.parentTaskId,
    canEdit: true,
  };
}

type RangeSnapshot = [readonly unknown[], CalendarioRange | undefined][];

/** Patches one item in every cached range, so the calendar changes at once; returns the rollback snapshot. */
async function patchRangeItem(qc: QueryClient, id: string, patch: (item: CalTaskItem) => CalTaskItem): Promise<RangeSnapshot> {
  await qc.cancelQueries({ queryKey: RANGE_KEY });
  const snapshot = qc.getQueriesData<CalendarioRange>({ queryKey: RANGE_KEY });
  qc.setQueriesData<CalendarioRange>({ queryKey: RANGE_KEY }, (old) =>
    old ? { ...old, items: old.items.map((i) => (i.id === id && i.kind === "task" ? patch(i) : i)) } : old,
  );
  return snapshot as RangeSnapshot;
}

function restoreRanges(qc: QueryClient, snapshot: RangeSnapshot): void {
  for (const [key, data] of snapshot) qc.setQueryData(key, data);
}

function withStatus(item: CalTaskItem, status: TaskStatus): CalTaskItem {
  const completed = status === "completado";
  return { ...item, status, statusLabel: BASE_STATUS_LABEL[status], completed, blocked: status === "bloqueado", overdue: completed ? false : item.date < todayKey() };
}

function useTaskDetailActions(item: CalTaskItem | null, close: () => void): DetailAction[] {
  const query = useCalendarioQuery();
  const context = useCalendarioAssistantContext();
  const projectId = item?.project?.id ?? null;
  const taskId = item?.taskId ?? "";

  const invalidate = () => [qk.calendario.all, ...(projectId ? taskStatusInvalidations(projectId) : [qk.inicio(), qk.me.tasks()])];

  const setStatus = useActionMutation<TaskStatus, TaskDetail, RangeSnapshot>((status) => tasksActions.setTaskStatusAction(taskId, status), {
    optimistic: {
      onMutate: (qc, status) => patchRangeItem(qc, `t:${taskId}`, (i) => withStatus(i, status)),
      rollback: restoreRanges,
    },
    setData: (qc, task) => qc.setQueryData(qk.tasks.detail(task.id), task),
    invalidate,
    errorContext: "calendario",
  });

  const setDate = useActionMutation<string, TaskBulkResult, RangeSnapshot>(
    (date) => tasksActions.bulkUpdateTasksAction([taskId], { dueDate: date, dueField: item?.dateField }),
    {
      optimistic: {
        onMutate: (qc, date) => patchRangeItem(qc, `t:${taskId}`, (i) => ({ ...i, date, overdue: !i.completed && date < todayKey() })),
        rollback: restoreRanges,
      },
      invalidate: () => [qk.calendario.all, qk.tasks.detail(taskId), ...(projectId ? taskUpdateInvalidations(projectId) : [qk.inicio(), qk.me.tasks()])],
      partialFailure: (r) => (r.skipped.length > 0 ? "No tienes permiso para cambiar esta tarea." : null),
      successToast: (r) => (r.updated.length > 0 ? "Fecha cambiada." : "No se cambió la fecha."),
      errorContext: "calendario",
    },
  );

  return useMemo(() => {
    if (!item) return [];
    const toggle: DetailAction = item.completed
      ? { key: TASK_ACTION.reopen, label: "Reabrir", onSelect: () => setStatus.mutate("pendiente"), disabled: !item.canEdit || setStatus.isPending }
      : { key: TASK_ACTION.complete, label: "Marcar completada", primary: true, onSelect: () => setStatus.mutate("completado", { onSuccess: () => toast.success("Tarea completada.") }), disabled: !item.canEdit || setStatus.isPending };
    return [
      toggle,
      {
        key: TASK_ACTION.open,
        label: "Abrir tarea",
        onSelect: () => replaceCalendarioUrl({ ...query, tarea: item.taskId }),
      },
      {
        key: TASK_ACTION.changeDate,
        label: "Cambiar fecha",
        disabled: !item.canEdit || setDate.isPending,
        onPickDate: (date: string) => setDate.mutate(date),
      },
      {
        key: TASK_ACTION.propose,
        label: "✦ Propón otra fecha",
        onSelect: () => {
          close();
          openAssistant({
            context: { route: "/calendario", taskId: item.taskId, calendar: { ...context, selectedItemId: item.id } },
            prompt: `Propón otra fecha para «${item.title}».`,
          });
        },
      },
    ];
  }, [item, query, context, close, setStatus, setDate]);
}

/**
 * The open detail of `?evento=` ("e:<uuid>" or "t:<uuid>"), or null (FE §5).
 * The item comes from the range cache, else from `taskSheetOptions(id)` /
 * `meetingDetailOptions(id)`. Closing removes the param and returns focus to
 * the element that opened it (an item with `data-calendario-item`).
 */
export function useCalendarioDetail(): CalendarioDetail | null {
  const query = useCalendarioQuery();
  const { range } = useCalendarioRange(query);
  const evento = query.evento;
  const kind = evento ? (evento.startsWith("e:") ? "event" : "task") : null;
  const entityId = evento ? evento.slice(2) : "";

  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!evento) return;
    const active = document.activeElement;
    opener.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }, [evento]);

  const taskQuery = useQuery({ ...taskSheetOptions(entityId), enabled: kind === "task" && entityId !== "" });
  const meetingQuery = useQuery({ ...meetingDetailOptions(entityId), enabled: kind === "event" && entityId !== "" });

  const cached = evento ? (range?.items.find((i) => i.id === evento) ?? null) : null;
  const item: CalItem | null = cached ?? (kind === "task" ? (taskQuery.data ? taskItemFromDetail(taskQuery.data) : null) : (meetingQuery.data?.item ?? null));

  const close = useCallback(() => {
    if (!evento) return;
    const id = evento;
    replaceCalendarioUrl({ ...query, evento: null });
    const target = opener.current && document.contains(opener.current) ? opener.current : document.querySelector<HTMLElement>(`[data-calendario-item="${CSS.escape(id)}"]`);
    requestAnimationFrame(() => target?.focus());
  }, [evento, query]);

  const actions = useTaskDetailActions(item?.kind === "task" ? item : null, close);

  if (!evento || !kind) return null;
  return {
    id: evento,
    kind,
    entityId,
    item,
    meeting: meetingQuery.data ?? undefined,
    task: taskQuery.data,
    isPending: item === null && (kind === "task" ? taskQuery.isPending : meetingQuery.isPending),
    actions: item?.kind === "task" ? actions : [],
    close,
  };
}
