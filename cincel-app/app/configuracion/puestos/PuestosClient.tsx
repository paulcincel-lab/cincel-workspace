"use client";

import { useEffect, useMemo, useState } from "react";
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
import {
  createPositionAction,
  deletePositionAction,
  fetchPositionsAction,
  reorderPositionsAction,
  setPositionPhasesAction,
  updatePositionAction,
} from "@/lib/actions/positions-actions";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { resolvePositionsCapabilities } from "@/lib/auth/permissions";
import type { Position, WorkflowDetail } from "@/lib/types/core";

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

interface PuestosClientProps {
  initialPositions: Position[];
  initialWorkflows: WorkflowDetail[];
}

export function PuestosClient({ initialPositions, initialWorkflows }: PuestosClientProps) {
  const [positions, setPositions] = useState<Position[]>(initialPositions);
  const [workflows, setWorkflows] = useState<WorkflowDetail[]>(initialWorkflows);
  const [authenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const canManage = useMemo(
    () => resolvePositionsCapabilities(authenticatedUser).canManagePositions,
    [authenticatedUser],
  );

  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [deleting, setDeleting] = useState<Position | null>(null);
  const [deleteError, setDeleteError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [pageError, setPageError] = useState("");

  async function refresh() {
    try {
      const [positionRows, workflowRows] = await Promise.all([fetchPositionsAction(), fetchWorkflowsAction()]);
      setPositions(positionRows);
      setWorkflows(workflowRows);
    } catch (error) {
      setPageError(positionErrorText(error, "No se pudieron cargar los puestos."));
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, []);

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

    setIsSaving(true);
    setFormError("");
    try {
      const saved = editing
        ? await updatePositionAction(editing.id, { name })
        : await createPositionAction({ name });
      // Keep the saved puesto as the one being edited, so a failed fase save retries an update, not a second create.
      setEditing(saved);
      await setPositionPhasesAction(saved.id, draft.phaseIds);
      await refresh();
      closeEditor();
    } catch (error) {
      setFormError(positionErrorText(error, "No se pudo guardar el puesto."));
    } finally {
      setIsSaving(false);
    }
  }

  function askDelete(position: Position) {
    setDeleteError("");
    setDeleting(position);
  }

  async function confirmDelete() {
    if (!deleting) return;
    setIsDeleting(true);
    setDeleteError("");
    try {
      await deletePositionAction(deleting.id);
      setDeleting(null);
      await refresh();
    } catch (error) {
      setDeleteError(positionErrorText(error, "No se pudo eliminar el puesto."));
    } finally {
      setIsDeleting(false);
    }
  }

  async function reorder(orderedIds: string[]) {
    const byId = new Map(positions.map((position) => [position.id, position]));
    setPositions(orderedIds.map((id) => byId.get(id)).filter((p): p is Position => Boolean(p)));
    try {
      await reorderPositionsAction(orderedIds);
    } catch (error) {
      setPageError(positionErrorText(error, "No se pudo cambiar el orden."));
    }
    await refresh();
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

      {pageError ? (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {pageError}
        </div>
      ) : null}

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <DataTable
          columns={columns}
          data={positions}
          getRowId={(row) => row.id}
          onRowClick={canManage ? (row) => openEdit(row) : undefined}
          onReorderRows={canManage ? (ids) => void reorder(ids) : undefined}
          emptyMessage="Aún no hay puestos."
        />
      </section>

      <PositionEditorDrawer
        show={showEditor}
        onClose={closeEditor}
        position={editing}
        workflows={workflows}
        canManage={canManage}
        isSaving={isSaving}
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
              disabled={isDeleting}
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
