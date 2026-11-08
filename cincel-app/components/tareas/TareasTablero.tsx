"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import type { EmptyStateProps } from "@/components/shell/EmptyState";
import type { PageHeaderProps } from "@/components/shell/PageHeader";
import { ListPage, type ListSpec } from "@/components/patterns/ListPage";
import { unwrapActionResult } from "@/lib/actions/action-result";
import { setTaskCustomStatusAction, setTaskStatusAction } from "@/lib/actions/tasks-actions";
import { parseStatusValue } from "@/lib/tasks/status-options";
import type { TaskStatusOption } from "@/lib/types/core";
import type { TaskBoard } from "@/lib/types/redesign";

import { NewTaskDialog } from "./NewTaskDialog";
import { tableroTable } from "./tablero-table";

/** Header description of the Tablero view (FE §3.4). */
export const TABLERO_DESCRIPTION = "Todas los tramos en un solo lugar. Arrastra una tarjeta para cambiar su estatus.";

/**
 * Empty state when the filters leave no task (FE §3.4). Visual keeps every
 * column (count 0, "Sin tareas" drop zone) and never shows it; Esencial and
 * Analítico, which have no columns, show it instead of the board.
 */
export const TABLERO_EMPTY: EmptyStateProps = { title: "No hay tareas con estos filtros" };

export type TareasTableroProps = {
  board: TaskBoard;
  /** Every configured custom status, so its column shows even when empty. */
  customStatuses?: Pick<TaskStatusOption, "id" | "name">[];
  header: PageHeaderProps;
  filters?: ReactNode;
  tabs?: ReactNode;
  empty?: EmptyStateProps;
};

/**
 * Moves a task to a board column: a base status goes through
 * `setTaskStatusAction`, a `custom:<id>` column through
 * `setTaskCustomStatusAction`. Rejects with the action's error so the board
 * rolls the card back and shows the mapped Spanish message.
 */
export async function moveTaskToColumn(taskId: string, columnKey: string): Promise<void> {
  const target = parseStatusValue(columnKey);
  if (target.kind === "custom") unwrapActionResult(await setTaskCustomStatusAction(taskId, target.id));
  else unwrapActionResult(await setTaskStatusAction(taskId, target.status));
}

/**
 * Tareas · Tablero (`/tareas?vista=tablero`, FE §3.4): `ListPage` with
 * `spec.kind = "board"`. `TaskBoardWidget` renders the three styles from the
 * one board (Visual columns with optimistic drag, collapsed empty columns and
 * the keyboard "Mover a…" menu; Esencial grouped list; Analítico summary +
 * table), so this view never branches on the style.
 */
export function TareasTablero({
  board,
  customStatuses,
  header,
  filters,
  tabs,
  empty = TABLERO_EMPTY,
}: TareasTableroProps) {
  const router = useRouter();
  const table = useMemo(() => tableroTable(board), [board]);
  // "+ Agregar" opens NewTaskDialog in that column's estatus; the dialog
  // refreshes the page so the new card lands in the column.
  const [quickAddStatus, setQuickAddStatus] = useState<string | null>(null);
  const onQuickAdd = useCallback((statusId: string) => setQuickAddStatus(statusId), []);

  const onMove = useCallback(
    async (taskId: string, columnKey: string) => {
      await moveTaskToColumn(taskId, columnKey);
      router.refresh();
    },
    [router],
  );

  // Built as a value (not an inline literal) so the spec stays assignable to
  // `ListSpec` whether or not the board variant declares `onMove`.
  const spec = useMemo(
    () => ({ kind: "board" as const, board, table, onMove, onQuickAdd, customStatuses }),
    [board, table, onMove, onQuickAdd, customStatuses],
  );
  const listSpec: ListSpec = spec;

  return (
    <>
      <ListPage
        header={{ description: TABLERO_DESCRIPTION, ...header }}
        filters={filters}
        tabs={tabs}
        spec={listSpec}
        empty={empty}
      />
      <NewTaskDialog
        open={quickAddStatus !== null}
        onOpenChange={(open) => {
          if (!open) setQuickAddStatus(null);
        }}
        defaults={quickAddStatus ? { status: quickAddStatus } : undefined}
      />
    </>
  );
}
