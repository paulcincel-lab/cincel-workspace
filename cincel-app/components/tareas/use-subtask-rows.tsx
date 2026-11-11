"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";

import type { RowDetail } from "@/components/widgets/GroupedTable";
import { getTaskChildrenBatch } from "@/lib/actions/page-data/tareas-actions";
import { qk } from "@/lib/query/keys";
import { seedTaskChildren, taskChildrenOptions } from "@/lib/query/options/tareas";
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
};

/** Stable `combine` (TanStack keeps the result while the data doesn't change). */
const dataOf = (results: { data?: TaskListRow[] }[]) => results.map((r) => r.data);

export function useSubtaskRows<R>({ parents, toRow, taskOf, isHidden, after }: UseSubtaskRowsOptions<R>): SubtaskRows<R> {
  const qc = useQueryClient();
  const [toggled, setToggled] = useState<ReadonlySet<string>>(() => new Set());

  const withSubtasks = useMemo(() => parents.filter(hasSubtasks), [parents]);
  const isOpenTask = useCallback(
    (task: Pick<TaskListRow, "id" | "matchedSubtaskIds">) => openByDefault(task) !== toggled.has(task.id),
    [toggled],
  );
  const openParents = useMemo(() => withSubtasks.filter(isOpenTask), [withSubtasks, isOpenTask]);

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

  const rowDetail = useMemo<RowDetail<R>>(
    () => ({
      hasDetail: (row) => hasSubtasks(taskOf(row)),
      isOpen: (row) => isOpenTask(taskOf(row)),
      onToggle: (row) => toggle(taskOf(row).id),
      label: (row) => subtasksToggleLabel(taskOf(row).title),
      rows: (row) => childrenOf.get(taskOf(row).id),
      after: after ? (row) => after(taskOf(row)) : undefined,
      nestedLabel: (_child, parent) => subtaskOfLabel(taskOf(parent).title),
    }),
    [taskOf, isOpenTask, toggle, childrenOf, after],
  );

  const shownRows = useMemo(() => openParents.flatMap((p) => childrenOf.get(p.id) ?? []), [openParents, childrenOf]);

  return { rowDetail, parentCount: withSubtasks.length, allOpen, toggleAll, shownRows };
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
