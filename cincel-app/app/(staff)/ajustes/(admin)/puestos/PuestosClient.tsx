"use client";

import { useMemo, useState } from "react";
import { useSuspenseQuery, type QueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";

import { PositionEditorDrawer, type PositionDraft } from "@/components/configuracion/PositionEditorDrawer";
import { DataTable } from "@/components/ui/DataTable";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { createRowActionsColumn } from "@/components/v2/table/RowActionsMenu";
import { unwrapActionResult } from "@/lib/actions/action-result";
import {
  createPositionAction,
  deletePositionAction,
  reorderPositionsAction,
  setPositionPhasesAction,
  updatePositionAction,
} from "@/lib/actions/positions-actions";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { ajustesPuestosOptions, type AjustesPuestosPageData } from "@/lib/query/options/ajustes";
import { selectCurrentUser, useSessionStore } from "@/lib/stores/session-store";
import { resolvePositionsCapabilities } from "@/lib/auth/permissions";
import type { Position } from "@/lib/types/core";

const ERROR_COPY: Record<string, string> = {
  FORBIDDEN: "No tienes permiso para realizar esta acción.",
  NOT_FOUND: "Ya no existe. Recarga la página.",
  EMPTY: "Escribe un nombre.",
  NAME_TAKEN: "Ya existe un puesto con ese nombre.",
  IN_USE: "Este puesto se asigna desde un grupo de Google. Quita el grupo en Configuración → Google primero.",
};

/** Spanish copy for a puestos action error (`"CODE"` or `"CODE: detail"`). */
export function positionErrorText(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : "";
  const code = message.split(":")[0]?.trim() ?? "";
  return ERROR_COPY[code] ?? fallback;
}

function integrantesLabel(count: number): string {
  return count === 1 ? "1 integrante lo perderá." : `${count} integrantes lo perderán.`;
}

/**
 * What a puesto change makes stale (plan §3, Positions): this page, the
 * Personas team view (puestos per person), the assignee pickers (suggested
 * staff per tramo) and Ajustes › Google (the puestos a mapping can use).
 */
export const POSITION_INVALIDATIONS = [
  qk.ajustes.page("puestos"),
  qk.personas.equipo(),
  ["catalog", "assignable-staff"],
  qk.ajustes.page("google"),
] as const;

/** Reorders the cached puestos to `orderedIds` and returns the previous page data for the rollback. */
export async function reorderCachedPositions(
  qc: QueryClient,
  orderedIds: string[],
): Promise<AjustesPuestosPageData | undefined> {
  const key = qk.ajustes.page("puestos");
  await qc.cancelQueries({ queryKey: key });
  const previous = qc.getQueryData<AjustesPuestosPageData>(key);
  if (previous) {
    const byId = new Map(previous.positions.map((position) => [position.id, position]));
    const positions = orderedIds.map((id) => byId.get(id)).filter((p): p is Position => Boolean(p));
    qc.setQueryData<AjustesPuestosPageData>(key, { ...previous, positions });
  }
  return previous;
}

type SaveVars = {
  /** The puesto being edited, or null for a new one. */
  id: string | null;
  name: string;
  phaseIds: string[];
  /** Called with the saved puesto before its fases are saved. */
  onSaved: (saved: Position) => void;
};

/** Create or rename, then replace the candidate fases: two POSTs in sequence (the fases need the id). */
async function savePosition({ id, name, phaseIds, onSaved }: SaveVars) {
  const saved = unwrapActionResult(id ? await updatePositionAction(id, { name }) : await createPositionAction({ name }));
  onSaved(saved);
  return setPositionPhasesAction(saved.id, phaseIds);
}

/**
 * Ajustes › Puestos. Reads `qk.ajustes.page('puestos')`, hydrated by the
 * page (no fetch on mount). Every write invalidates `POSITION_INVALIDATIONS`;
 * a reorder is optimistic on the cache and rolls back with a toast.
 */
export function PuestosClient() {
  const { positions, workflows } = useSuspenseQuery(ajustesPuestosOptions()).data;
  const authenticatedUser = useSessionStore(selectCurrentUser);
  const canManage = useMemo(
    () => resolvePositionsCapabilities(authenticatedUser).canManagePositions,
    [authenticatedUser],
  );

  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [formError, setFormError] = useState("");

  const [deleting, setDeleting] = useState<Position | null>(null);
  const [deleteError, setDeleteError] = useState("");

  const saveMutation = useActionMutation(savePosition, {
    invalidate: POSITION_INVALIDATIONS,
    // The drawer shows the error inline with the puestos copy (`save()`).
    onFormError: () => undefined,
  });

  const deleteMutation = useActionMutation((id: string) => deletePositionAction(id), {
    invalidate: POSITION_INVALIDATIONS,
    onFormError: () => undefined,
  });

  const reorderMutation = useActionMutation((orderedIds: string[]) => reorderPositionsAction(orderedIds), {
    optimistic: {
      onMutate: (qc, orderedIds) => reorderCachedPositions(qc, orderedIds),
      rollback: (qc, previous) => {
        if (previous) qc.setQueryData(qk.ajustes.page("puestos"), previous);
      },
    },
    invalidate: POSITION_INVALIDATIONS,
    errorContext: { entity: "position" },
  });

  function openNew() {
    setEditing(null);
    setFormError("");
    setShowEditor(true);
  }

  function openEdit(position: Position) {
    setEditing(position);
    setFormError("");
    setShowEditor(true);
  }

  function closeEditor() {
    setShowEditor(false);
    setEditing(null);
  }

  async function save(draft: PositionDraft) {
    const name = draft.name.trim();
    if (!name) {
      setFormError(ERROR_COPY.EMPTY);
      return;
    }

    setFormError("");
    try {
      await saveMutation.mutateAsync({
        id: editing?.id ?? null,
        name,
        phaseIds: draft.phaseIds,
        // Keep the saved puesto as the one being edited, so a failed fase save retries an update, not a second create.
        onSaved: setEditing,
      });
      closeEditor();
    } catch (error) {
      setFormError(positionErrorText(error, "No se pudo guardar el puesto."));
    }
  }

  function askDelete(position: Position) {
    setDeleteError("");
    setDeleting(position);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteError("");
    try {
      await deleteMutation.mutateAsync(deleting.id);
      setDeleting(null);
    } catch (error) {
      setDeleteError(positionErrorText(error, "No se pudo eliminar el puesto."));
    }
  }

  function reorder(orderedIds: string[]) {
    reorderMutation.mutate(orderedIds);
  }

  const columns = useMemo<ColumnDef<Position, unknown>[]>(
    () => [
      {
        id: "order",
        header: "Orden",
        cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.index + 1}</span>,
      },
      {
        accessorKey: "name",
        header: "Puesto",
        cell: ({ row }) => <span className="font-medium text-foreground">{row.original.name}</span>,
      },
      {
        id: "phases",
        header: "Fases candidatas",
        cell: ({ row }) =>
          row.original.phases.length === 0 ? (
            <span className="text-sm text-muted-foreground">Sin fases</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {row.original.phases.map((phase) => (
                <Badge key={phase.id} variant="outline">
                  {phase.workflowName} · {phase.name}
                </Badge>
              ))}
            </div>
          ),
      },
      {
        id: "staffCount",
        header: "Integrantes",
        cell: ({ row }) => <Badge variant="outline">{row.original.staffCount}</Badge>,
      },
      ...(canManage
        ? [
            createRowActionsColumn<Position>(() => [
              { label: "Editar", onSelect: (p) => openEdit(p) },
              {
                label: "Eliminar",
                separatorBefore: true,
                variant: "destructive",
                onSelect: (p) => askDelete(p),
              },
            ]),
          ]
        : []),
    ],
    [canManage],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Puestos</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Los candidatos solo se sugieren al asignar tareas; cualquiera puede asignarse.
            </p>
          </div>
          {canManage ? <Button onClick={openNew}>+ Nuevo puesto</Button> : null}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <DataTable
          columns={columns}
          data={positions}
          getRowId={(row) => row.id}
          onRowClick={canManage ? (row) => openEdit(row) : undefined}
          onReorderRows={canManage ? reorder : undefined}
          emptyMessage="Aún no hay puestos."
        />
      </section>

      <PositionEditorDrawer
        show={showEditor}
        onClose={closeEditor}
        position={editing}
        workflows={workflows}
        canManage={canManage}
        isSaving={saveMutation.isPending}
        formError={formError}
        onSave={(draft) => void save(draft)}
      />

      <AlertDialog open={deleting !== null} onOpenChange={(next) => (next ? undefined : setDeleting(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el puesto {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting ? integrantesLabel(deleting.staffCount) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? (
            <p role="alert" className="text-sm text-destructive">
              {deleteError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => void confirmDelete()}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
