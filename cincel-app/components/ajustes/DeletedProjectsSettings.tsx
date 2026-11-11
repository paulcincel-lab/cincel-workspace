"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";

import { AdminPageHeading } from "@/components/ajustes/AdminFields";
import {
  DELETED_PROJECTS_DESCRIPTION,
  DELETED_PROJECTS_EMPTY,
  DELETED_PROJECTS_ERROR,
  DELETED_PROJECTS_TITLE,
  RESTORE_LABEL,
  RESTORE_PROJECT_LABEL,
} from "@/components/proyectos/project-delete-copy";
import { restoreProjectWithToast } from "@/components/proyectos/use-delete-project";
import { ErrorState } from "@/components/shell/ErrorState";
import { DataTable } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/shadcn/button";
import { deletedProjectsOptions } from "@/lib/query/options/proyectos";
import type { DeletedProjectRow } from "@/lib/types/project-delete";

const DATE_FORMAT = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", year: "numeric" });

/** "9 nov 2026" */
export function deletedDateText(iso: string): string {
  return DATE_FORMAT.format(new Date(iso)).replace(/\./g, "");
}

function tareasText(n: number): string {
  return n === 1 ? "1 tarea" : `${n} tareas`;
}

/**
 * Ajustes › Proyectos eliminados (#1050): the projects deleted in the last 30
 * days (`qk.proyectos.deleted()`), with who deleted them, when, how many
 * tasks went with them and until when they can come back. "Restaurar" calls
 * `restoreProjectAction`; portal access is not restored.
 */
export function DeletedProjectsSettings() {
  const qc = useQueryClient();
  const query = useQuery(deletedProjectsOptions());
  const [restoring, setRestoring] = useState<ReadonlySet<string>>(() => new Set());

  const columns = useMemo<ColumnDef<DeletedProjectRow, unknown>[]>(() => {
    async function restore(row: DeletedProjectRow) {
      setRestoring((prev) => new Set(prev).add(row.id));
      try {
        await restoreProjectWithToast(qc, row.id);
      } finally {
        setRestoring((prev) => {
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
      }
    }
    return [
      {
        id: "name",
        header: "Proyecto",
        accessorFn: (row) => row.name,
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="truncate font-medium">{row.original.name}</span>
            {row.original.clientName ? (
              <span className="truncate text-xs text-muted-foreground">{row.original.clientName}</span>
            ) : null}
          </div>
        ),
      },
      {
        id: "deletedAt",
        header: "Eliminado",
        accessorFn: (row) => row.deletedAt,
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-mono tabular-nums">{deletedDateText(row.original.deletedAt)}</span>
            {row.original.deletedBy ? (
              <span className="text-xs text-muted-foreground">por {row.original.deletedBy.name}</span>
            ) : null}
          </div>
        ),
      },
      {
        id: "taskCount",
        header: "Tareas",
        accessorFn: (row) => row.taskCount,
        cell: ({ row }) => <span className="tabular-nums">{tareasText(row.original.taskCount)}</span>,
      },
      {
        id: "restorableUntil",
        header: "Se puede restaurar hasta",
        accessorFn: (row) => row.restorableUntil,
        cell: ({ row }) => <span className="font-mono tabular-nums">{deletedDateText(row.original.restorableUntil)}</span>,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Acciones</span>,
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={RESTORE_PROJECT_LABEL(row.original.name)}
            disabled={restoring.has(row.original.id)}
            onClick={() => void restore(row.original)}
          >
            {RESTORE_LABEL}
          </Button>
        ),
      },
    ];
  }, [qc, restoring]);

  return (
    <div className="flex flex-col gap-4" data-slot="deleted-projects">
      <AdminPageHeading title={DELETED_PROJECTS_TITLE} description={DELETED_PROJECTS_DESCRIPTION} />
      {query.isError ? (
        <ErrorState title={DELETED_PROJECTS_ERROR} onRetry={() => void query.refetch()} />
      ) : (
        <DataTable<DeletedProjectRow>
          columns={columns}
          data={query.data ?? []}
          getRowId={(row) => row.id}
          getRowLabel={(row) => row.name}
          isLoading={query.isPending}
          emptyMessage={DELETED_PROJECTS_EMPTY}
        />
      )}
    </div>
  );
}
