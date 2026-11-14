"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { RowDetail } from "@/components/widgets/GroupedTable";
import { getTaskChildrenBatch } from "@/lib/actions/page-data/tareas-actions";
import { qk } from "@/lib/query/keys";
import { seedTaskChildren, taskChildrenOptions } from "@/lib/query/options/tareas";
import type { TableRowAction } from "@/components/widgets/table-rows";
import type { TaskListRow } from "@/lib/types/core";

/**
 * The subtask block of the task tables (#1048): a parent with subtasks gets a
 * toggle in its first cell; open, its children render under it as rows of
 * the same table (`GroupedTable` `rowDetail.rows`), loaded on expand
 * (`taskChildrenOptions`) or, for "Expandir subtareas", in one batch seeded
 * into each parent's key. Collapsed by default; a parent shown only for its
 * matching subtasks (`matchedSubtaskIds`) starts open with just those. What
 * the viewer opens stays while the rows page or re-sort (component state),
 * and resets on a reload.
 */

export const SUBTASKS_EXPAND_ALL = "Expandir subtareas";
export const SUBTASKS_COLLAPSE_ALL = "Contraer subtareas";

/** The toggle's accessible name. */
export function subtasksToggleLabel(title: string): string {
  return `Subtareas de «${title}»`;
}

/** What a screen reader hears after a subtask's title. */
export function subtaskOfLabel(parentTitle: string): string {
  return `subtarea de «${parentTitle}»`;
}

/** The "+ Subtarea…" quick-add row's copy. */
export function subtaskQuickAddCopy(parentTitle: string): { label: string; placeholder: string } {
  return { label: `Nueva subtarea de «${parentTitle}»`, placeholder: "Subtarea…" };
}

/** "Expandir subtareas" / "Contraer subtareas" for the live region. */
export function subtasksAnnouncement(open: boolean, count: number): string {
  const tareas = count === 1 ? "1 tarea" : `${count} tareas`;
  return open ? `Subtareas abiertas de ${tareas}` : `Subtareas cerradas de ${tareas}`;
}

/** A top-level task that has live subtasks (a subtask itself never has a toggle: one level only). */
export function hasSubtasks(task: Pick<TaskListRow, "subtaskCount" | "parentTaskId" | "matchedSubtaskIds">): boolean {
  return task.parentTaskId === null && (task.subtaskCount > 0 || (task.matchedSubtaskIds?.length ?? 0) > 0);
}

/** Open by default: a parent shown as the context of matching subtasks. */
export function openByDefault(task: Pick<TaskListRow, "matchedSubtaskIds">): boolean {
  return (task.matchedSubtaskIds?.length ?? 0) > 0;
}

/** The children to show: the matching ones when the parent is context, without the hidden (deleted) ones. */
export function shownChildren(
  parent: Pick<TaskListRow, "id" | "matchedSubtaskIds">,
  children: TaskListRow[],
  isHidden?: (id: string, parentTaskId: string | null) => boolean,
): TaskListRow[] {
  const matched = parent.matchedSubtaskIds?.length ? new Set(parent.matchedSubtaskIds) : null;
  return children.filter((child) => (!matched || matched.has(child.id)) && !isHidden?.(child.id, child.parentTaskId));
}

/** Toggled ids → the next set after opening (`open` true) or closing every parent given. */
export function toggledForAll(parents: readonly Pick<TaskListRow, "id" | "matchedSubtaskIds">[], open: boolean): Set<string> {
  return new Set(parents.filter((p) => openByDefault(p) !== open).map((p) => p.id));
}

/** The row menu entry and the hover affordance that open the first subtask's quick-add (#1107). */
export const ADD_SUBTASK_ACTION = "Agregar subtarea";

/** A top-level task without subtasks can get its first one inline; a subtask never can (one level only). */
export function canAddFirstSubtask(task: Pick<TaskListRow, "subtaskCount" | "parentTaskId" | "matchedSubtaskIds">): boolean {
  return task.parentTaskId === null && !hasSubtasks(task);
}

export type UseSubtaskRowsOptions<R> = {
  /** The loaded top-level rows, in table order. */
  parents: readonly TaskListRow[];
  /** The table row of a task (same shape as the parents' rows). */
  toRow(task: TaskListRow): R;
  /** The task a table row stands for. */
  taskOf(row: R): TaskListRow;
  /** Rows deleted a moment ago (`useDeleteTasks().isHidden`). */
  isHidden?(id: string, parentTaskId: string | null): boolean;
  /** `<tr>`s after an open parent's children, e.g. the "+ Subtarea…" `QuickAddRow`. */
  after?(parent: TaskListRow): ReactNode;
  /** The viewer can create tasks: parents without subtasks get "Agregar subtarea" (#1107). Needs `after`. */
  canAdd?: boolean;
};

export type SubtaskRows<R> = {
  rowDetail: RowDetail<R>;
  /** Parents with subtasks among the loaded rows. */
  parentCount: number;
  /** Every one of them is open. */
  allOpen: boolean;
  /** Opens every parent (children in one batch) or closes them all; returns how many moved. */
  toggleAll(): Promise<number>;
  /** The open children rows, in table order (for the selection and the bulk bar). */
  shownRows: R[];
  /** "Agregar subtarea" applies to this task: a top-level task without subtasks, for a viewer who can create. */
  canAddTo(task: TaskListRow): boolean;
  /** Opens the "+ Subtarea…" quick-add under a task without subtasks, with its toggle expanded. */
  addSubtask(task: TaskListRow): void;
  /** The row's `⋯` entries with "Agregar subtarea" before the destructive one, when it applies to the task. */
  withAddAction(task: TaskListRow, actions: TableRowAction[]): TableRowAction[];
  /** Tasks whose quick-add was opened (they have a toggle and an open block even before the first subtask exists). */
  isAdding(task: Pick<TaskListRow, "id">): boolean;
};

/** Stable `combine` (TanStack keeps the result while the data doesn't change). */
const dataOf = (results: { data?: TaskListRow[] }[]) => results.map((r) => r.data);

export function useSubtaskRows<R>({ parents, toRow, taskOf, isHidden, after, canAdd = false }: UseSubtaskRowsOptions<R>): SubtaskRows<R> {
  const qc = useQueryClient();
  const [toggled, setToggled] = useState<ReadonlySet<string>>(() => new Set());
  const [adding, setAdding] = useState<ReadonlySet<string>>(() => new Set());

  const withSubtasks = useMemo(() => parents.filter(hasSubtasks), [parents]);
  const isOpenTask = useCallback(
    (task: Pick<TaskListRow, "id" | "matchedSubtaskIds">) => openByDefault(task) !== toggled.has(task.id),
    [toggled],
  );
  // A task whose first subtask is being added behaves as a parent: toggle, open block, quick-add row.
  const addingParents = useMemo(
    () => (canAdd ? parents.filter((p) => adding.has(p.id) && canAddFirstSubtask(p)) : []),
    [canAdd, parents, adding],
  );
  const openParents = useMemo(
    () => [...withSubtasks, ...addingParents].filter(isOpenTask),
    [withSubtasks, addingParents, isOpenTask],
  );

  const results = useQueries({
    queries: openParents.map((p) => taskChildrenOptions(p.id)),
    combine: dataOf,
  });
  const childrenOf = useMemo(() => {
    const map = new Map<string, R[] | undefined>();
    openParents.forEach((parent, i) => {
      const data = results[i];
      map.set(parent.id, data ? shownChildren(parent, data, isHidden).map(toRow) : undefined);
    });
    return map;
  }, [openParents, results, isHidden, toRow]);

  const toggle = useCallback((id: string) => {
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allOpen = withSubtasks.length > 0 && openParents.length === withSubtasks.length;
  const toggleAll = useCallback(async () => {
    if (allOpen) {
      const moved = openParents.length;
      setToggled(toggledForAll(withSubtasks, false));
      return moved;
    }
    const closed = withSubtasks.filter((p) => !isOpenTask(p));
    // One read for every parent not cached yet; on failure each parent loads on its own.
    const missing = closed.filter((p) => qc.getQueryData(qk.tasks.children(p.id)) === undefined).map((p) => p.id);
    if (missing.length > 0) {
      try {
        seedTaskChildren(qc, await getTaskChildrenBatch(missing));
      } catch {
        // The per-parent queries below load what the batch didn't.
      }
    }
    setToggled(toggledForAll(withSubtasks, true));
    return closed.length;
  }, [allOpen, openParents.length, withSubtasks, isOpenTask, qc]);

  const isAdding = useCallback((task: Pick<TaskListRow, "id">) => adding.has(task.id), [adding]);
  const canAddTo = useCallback((task: TaskListRow) => canAdd && canAddFirstSubtask(task), [canAdd]);
  const addSubtask = useCallback((task: TaskListRow) => {
    if (!canAdd || !canAddFirstSubtask(task)) return;
    setAdding((prev) => new Set(prev).add(task.id));
    // Closed by default: toggling opens it, and it stays open once the first subtask lands.
    setToggled((prev) => {
      if (openByDefault(task) !== prev.has(task.id)) return prev;
      return new Set(prev).add(task.id);
    });
    // The quick-add row mounts on the next render: focus its input there.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`input[data-quick-add-parent="${CSS.escape(task.id)}"]`)?.focus()),
    );
  }, [canAdd]);

  const withAddAction = useCallback(
    (task: TaskListRow, actions: TableRowAction[]): TableRowAction[] => {
      if (!canAdd || !canAddFirstSubtask(task)) return actions;
      const entry: TableRowAction = { id: "agregar-subtarea", label: ADD_SUBTASK_ACTION, onSelect: () => addSubtask(task) };
      const at = actions.findIndex((a) => a.destructive);
      return at < 0 ? [...actions, entry] : [...actions.slice(0, at), entry, ...actions.slice(at)];
    },
    [canAdd, addSubtask],
  );

  const rowDetail = useMemo<RowDetail<R>>(
    () => ({
      hasDetail: (row) => {
        const task = taskOf(row);
        return hasSubtasks(task) || (canAdd && adding.has(task.id) && task.parentTaskId === null);
      },
      isOpen: (row) => isOpenTask(taskOf(row)),
      onToggle: (row) => toggle(taskOf(row).id),
      label: (row) => subtasksToggleLabel(taskOf(row).title),
      rows: (row) => childrenOf.get(taskOf(row).id),
      after: after ? (row) => after(taskOf(row)) : undefined,
      nestedLabel: (_child, parent) => subtaskOfLabel(taskOf(parent).title),
    }),
    [taskOf, isOpenTask, toggle, childrenOf, after, canAdd, adding],
  );

  const shownRows = useMemo(() => openParents.flatMap((p) => childrenOf.get(p.id) ?? []), [openParents, childrenOf]);

  return { rowDetail, parentCount: withSubtasks.length, allOpen, toggleAll, shownRows, canAddTo, addSubtask, isAdding, withAddAction };
}

/** The toggle before a parent's title where the table has no `rowDetail` (Lista, #1048). */
export function SubtaskToggle({ open, label, onToggle }: { open: boolean; label: string; onToggle(): void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-label={label}
      data-slot="subtask-toggle"
      onClick={onToggle}
      className="mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md align-middle text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      {open ? <ChevronDown aria-hidden="true" className="size-3.5" /> : <ChevronRight aria-hidden="true" className="size-3.5" />}
    </button>
  );
}

/**
 * The quiet "+ Subtarea" button of a task row without subtasks (#1107): shown
 * on row hover and on focus, reachable by Tab, and it opens the quick-add
 * under the task.
 */
export function AddSubtaskButton({ title, onAdd }: { title: string; onAdd(): void }) {
  return (
    <button
      type="button"
      data-slot="add-subtask-button"
      aria-label={`${ADD_SUBTASK_ACTION} a «${title}»`}
      onClick={onAdd}
      className="ml-1.5 inline-flex h-6 shrink-0 items-center rounded-md px-1.5 align-middle text-xs text-muted-foreground opacity-0 outline-none group-hover/row:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring"
    >
      + Subtarea
    </button>
  );
}
