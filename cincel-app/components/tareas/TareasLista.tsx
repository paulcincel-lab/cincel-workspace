"use client";

import { useCallback, useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import type { EmptyStateProps } from "@/components/shell/EmptyState";
import type { PageHeaderProps } from "@/components/shell/PageHeader";
import { ListPage, type ListSpec } from "@/components/patterns/ListPage";
import { TramoBadge } from "@/components/widgets/TramoBadge";
import { tramoStart } from "@/lib/tramos/compat";
import type { TaskListItem, WorkflowRef } from "@/lib/types/core";

import { listaTable, listaTasks } from "./lista-table";
import { TareasStartSlot, startSlotTramo } from "./TareasStartSlot";

/** Empty state when the filters leave no task (FE §3.4). */
export const LISTA_EMPTY: EmptyStateProps = { title: "No hay tareas con estos filtros" };

export type TareasListaProps = {
  tasks: TaskListItem[];
  header: PageHeaderProps;
  filters?: ReactNode;
  tabs?: ReactNode;
  empty?: EmptyStateProps;
  /** `TareasQuery.tramo`: the start slot renders only for exactly one tramo. */
  tramo: string | null;
  /** `TareasQuery.proyecto`. */
  proyecto?: string | null;
  tramos: WorkflowRef[];
};

/**
 * Tareas · Lista (`/tareas?vista=lista`, FE §3.4, §4.10.2): `ListPage` with
 * `spec.kind = "table"`. `RecordTable` renders the three styles from the one
 * table (Visual grouped by estatus with Completado collapsed, Esencial plain
 * rows with the Plazo column, Analítico dense rows sorted by delay with the
 * by-project summary columns), so this view never branches on the style.
 * With a single tramo and Project Flow present (`tramoStart` in
 * `lib/tramos/compat.ts`), Project Flow's start slot sits above the table.
 */
export function TareasLista({ tasks: loaded, header, filters, tabs, empty = LISTA_EMPTY, tramo, proyecto = null, tramos }: TareasListaProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Idempotent: the page may hand the tasks already narrowed or not.
  const tasks = useMemo(() => listaTasks(loaded, { tramo, proyecto }), [loaded, tramo, proyecto]);
  const data = useMemo(() => listaTable(tasks), [tasks]);
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  // `/tareas?…&tarea=<id>`: the task sheet opens over the mounted list.
  const taskHref = useCallback(
    (taskId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tarea", taskId);
      return `${pathname}?${params.toString()}`;
    },
    [pathname, searchParams],
  );

  const renderCell = useCallback(
    (columnKey: string, row: Record<string, unknown>): ReactNode | undefined => {
      const task = tasksById.get(String(row.id));
      if (!task) return undefined;
      if (columnKey === "tarea") {
        return (
          <Link href={taskHref(task.id)} scroll={false} className="underline-offset-4 hover:underline">
            {task.title}
          </Link>
        );
      }
      if (columnKey === "tramo" && task.workflow) return <TramoBadge tramo={task.workflow} />;
      return undefined;
    },
    [tasksById, taskHref],
  );

  const spec: ListSpec = useMemo(() => ({ kind: "table" as const, data, renderCell }), [data, renderCell]);

  const slotTramo = tramoStart ? startSlotTramo(tramo, tramos) : null;
  const slot =
    slotTramo && tramoStart ? <TareasStartSlot key={slotTramo.id} workflow={slotTramo} contract={tramoStart} /> : null;

  return (
    <ListPage
      header={header}
      filters={
        slot ? (
          <>
            {filters}
            {slot}
          </>
        ) : (
          filters
        )
      }
      tabs={tabs}
      spec={spec}
      empty={empty}
    />
  );
}
