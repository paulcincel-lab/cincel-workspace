"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import type { EmptyStateProps } from "@/components/shell/EmptyState";
import type { PageHeaderProps } from "@/components/shell/PageHeader";
import { ListPage, type ListSpec } from "@/components/patterns/ListPage";
import { setTaskCustomStatusAction, setTaskStatusAction } from "@/lib/actions/tasks-actions";
import { parseStatusValue } from "@/lib/tasks/status-options";
import type { TaskBoard } from "@/lib/types/redesign";

import { tableroTable } from "./tablero-table";

/** Header description of the Tablero view (FE §3.4). */
export const TABLERO_DESCRIPTION = "Todas los tramos en un solo lugar. Arrastra una tarjeta para cambiar su estatus.";

/** Empty state when the filters leave no task (FE §3.4). */
export const TABLERO_EMPTY: EmptyStateProps = { title: "No hay tareas con estos filtros" };

export type TareasTableroProps = {
  board: TaskBoard;
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
  if (target.kind === "custom") await setTaskCustomStatusAction(taskId, target.id);
  else await setTaskStatusAction(taskId, target.status);
}

/**
 * Tareas · Tablero (`/tareas?vista=tablero`, FE §3.4): `ListPage` with
 * `spec.kind = "board"`. `TaskBoardWidget` renders the three styles from the
 * one board (Visual columns with optimistic drag, collapsed empty columns and
 * the keyboard "Mover a…" menu; Esencial grouped list; Analítico summary +
 * table), so this view never branches on the style.
 */
export function TareasTablero({ board, header, filters, tabs, empty = TABLERO_EMPTY }: TareasTableroProps) {
  const router = useRouter();
  const table = useMemo(() => tableroTable(board), [board]);

  const onMove = useCallback(
    async (taskId: string, columnKey: string) => {
      await moveTaskToColumn(taskId, columnKey);
      router.refresh();
    },
    [router],
  );

  // Built as a value (not an inline literal) so the spec stays assignable to
  // `ListSpec` whether or not the board variant declares `onMove`.
  const spec = useMemo(() => ({ kind: "board" as const, board, table, onMove }), [board, table, onMove]);
  const listSpec: ListSpec = spec;

  return (
    <ListPage
      header={{ description: TABLERO_DESCRIPTION, ...header }}
      filters={filters}
      tabs={tabs}
      spec={listSpec}
      empty={empty}
    />
  );
}
