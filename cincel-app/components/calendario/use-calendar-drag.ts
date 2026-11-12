"use client";

import { useCallback, useMemo, useState } from "react";
import { type InfiniteData, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";

import { UNDO_LABEL, UNDO_MS, UNDONE_TOAST } from "@/components/widgets/editable-cell";
import { MOVED_ANNOUNCEMENT, MOVED_TOAST, UNDONE_ANNOUNCEMENT } from "@/components/widgets/calendario/grid-copy";
import { useBoardDrag, type BoardCardDragProps } from "@/components/tablero/useBoardDrag";
import { bulkUpdateTasksAction } from "@/lib/actions/tasks-actions";
import { moveTaskInListPage, moveTaskInRange } from "@/lib/calendario/move";
import { useActionMutation } from "@/lib/query/mutation";
import { qk } from "@/lib/query/keys";
import { calendarioInvalidations } from "@/lib/query/options/calendario";
import { useCalendarioUi } from "@/lib/stores/calendario-ui-store";
import type { CalItem, CalTaskItem, CalendarioListPage, CalendarioRange } from "@/lib/types/calendario";
import type { TaskBulkResult } from "@/lib/types/core";
import type { ActionResult } from "@/lib/types/schedule";

type MoveVars = { itemId: string; taskId: string; date: string; field: "commitmentDate" | "deliveryDate"; today: string };
type Snapshot = { key: QueryKey; data: unknown }[];

const RANGE_KEY: QueryKey = [...qk.calendario.all, "range"];
const LIST_KEY: QueryKey = [...qk.calendario.all, "list"];

/** One task to another day through `bulkUpdateTasksAction`; a skipped task is a failure. */
async function moveAction(vars: MoveVars): Promise<ActionResult<TaskBulkResult>> {
  const result = await bulkUpdateTasksAction([vars.taskId], { dueDate: vars.date, dueField: vars.field });
  if (result.ok && !result.data.updated.includes(vars.taskId)) {
    return { ok: false, error: result.data.skipped[0]?.reason ?? "FORBIDDEN" };
  }
  return result;
}

function patchCaches(qc: QueryClient, vars: MoveVars): Snapshot {
  const snap: Snapshot = [];
  for (const [key, data] of qc.getQueriesData<CalendarioRange>({ queryKey: RANGE_KEY })) {
    if (!data) continue;
    snap.push({ key, data });
    qc.setQueryData<CalendarioRange>(key, moveTaskInRange(data, vars.itemId, vars.date));
  }
  for (const [key, data] of qc.getQueriesData<InfiniteData<CalendarioListPage>>({ queryKey: LIST_KEY })) {
    if (!data) continue;
    snap.push({ key, data });
    qc.setQueryData<InfiniteData<CalendarioListPage>>(key, {
      ...data,
      pages: data.pages.map((page) => moveTaskInListPage(page, vars.itemId, vars.date, vars.today)),
    });
  }
  return snap;
}

/** True for a task the viewer may reschedule (meetings are not draggable in v1, F6). */
export function canMoveItem(item: CalItem): item is CalTaskItem {
  return item.kind === "task" && item.canEdit;
}

/**
 * Drag to reschedule for Mes and Semana (FE §4.1, §9.4): an optimistic patch
 * of the cached ranges and lists, `bulkUpdateTasksAction` with the date field
 * the item shows, a toast with Deshacer and a polite announcement. The same
 * `move` serves the keyboard paths (menu, Alt+arrows).
 */
export function useCalendarDrag(items: readonly CalItem[], today: string) {
  const [announcement, setAnnouncement] = useState("");
  const setDragging = useCalendarioUi((s) => s.setDragging);

  const mutation = useActionMutation<MoveVars, TaskBulkResult, Snapshot>(moveAction, {
    invalidate: calendarioInvalidations("tasks"),
    optimistic: {
      async onMutate(qc, vars) {
        await qc.cancelQueries({ queryKey: qk.calendario.all });
        return patchCaches(qc, vars);
      },
      rollback(qc, snap) {
        for (const { key, data } of snap) qc.setQueryData(key, data);
      },
    },
  });
  const { mutateAsync } = mutation;

  const move = useCallback(
    async (item: CalItem, date: string): Promise<void> => {
      if (!canMoveItem(item) || item.date === date) return;
      const base = { itemId: item.id, taskId: item.taskId, field: item.dateField, today };
      const previous = item.date;
      try {
        await mutateAsync({ ...base, date });
      } catch {
        return; // the mutation already rolled back and showed the error
      }
      setAnnouncement(MOVED_ANNOUNCEMENT(item.title, date));
      toast(MOVED_TOAST(item.title, date), {
        duration: UNDO_MS,
        action: {
          label: UNDO_LABEL,
          onClick: () => {
            void (async () => {
              try {
                await mutateAsync({ ...base, date: previous });
              } catch {
                return;
              }
              setAnnouncement(UNDONE_ANNOUNCEMENT(item.title, previous));
              toast(UNDONE_TOAST);
            })();
          },
        },
      });
    },
    [mutateAsync, today],
  );

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const board = useBoardDrag<CalItem>({
    canDrag: canMoveItem,
    onDrop: (id, date) => {
      setDragging(null);
      const item = byId.get(id);
      if (item) return move(item, date);
    },
  });

  /** Spread on a draggable chip. */
  const dragProps = useCallback(
    (item: CalItem): BoardCardDragProps => {
      const props = board.cardProps(item);
      return {
        ...props,
        onDragStart: () => {
          props.onDragStart();
          if (props.draggable) setDragging({ itemId: item.id, overDate: null });
        },
        onDragEnd: () => {
          props.onDragEnd();
          setDragging(null);
        },
      };
    },
    [board, setDragging],
  );

  return {
    move,
    dragProps,
    /** Spread on a day cell or column: the drop target. */
    dropProps: board.columnProps,
    draggingId: board.draggingTaskId,
    overDate: board.dragOverKey,
    announcement,
    announce: setAnnouncement,
  };
}
