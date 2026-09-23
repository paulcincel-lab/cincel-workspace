"use client";

import { useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Label } from "@/components/ui/shadcn/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/shadcn/dialog";
import { createRowActionsColumn } from "@/components/v2/table/RowActionsMenu";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveTaskStatusesCapabilities } from "@/lib/auth/permissions";
import {
  createTaskStatusAction,
  deleteTaskStatusAction,
  fetchTaskStatusesAction,
  updateTaskStatusAction,
} from "@/lib/actions/task-statuses-actions";
import { customStatusVariant } from "@/lib/tasks/status-options";
import type { TaskStatusOption } from "@/lib/types/core";

const ERROR_MESSAGES: Record<string, string> = {
  TASK_STATUS_NAME_REQUIRED: "El nombre del estatus es obligatorio.",
  TASK_STATUS_NAME_TAKEN: "Ya existe un estatus con ese nombre.",
};

function errorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  return ERROR_MESSAGES[error.message] ?? fallback;
}

interface EstatusClientProps {
  initialStatuses: TaskStatusOption[];
}

export function EstatusClient({ initialStatuses }: EstatusClientProps) {
  const [statuses, setStatuses] = useState<TaskStatusOption[]>(initialStatuses);
  const [authenticatedUser] = useState(() => getCurrentAuthenticatedUser());
  const capabilities = useMemo(
    () => resolveTaskStatusesCapabilities(authenticatedUser),
    [authenticatedUser],
  );

  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<TaskStatusOption | null>(null);
  const [name, setName] = useState("");
  const [closes, setCloses] = useState(false);
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function refresh() {
    setStatuses(await fetchTaskStatusesAction());
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, []);

  function openEditor(status: TaskStatusOption | null) {
    setEditing(status);
    setName(status?.name ?? "");
    setCloses(status?.closes ?? false);
    setFormError("");
    setShowEditor(true);
  }

  async function save() {
    if (!name.trim()) {
      setFormError(ERROR_MESSAGES.TASK_STATUS_NAME_REQUIRED);
      return;
    }
    setIsSaving(true);
    setFormError("");
    try {
      if (editing)
        await updateTaskStatusAction(editing.id, { name, closes });
      else
        await createTaskStatusAction({
          name,
          closes,
          sortOrder: statuses.length,
        });
      await refresh();
      setShowEditor(false);
    } catch (error) {
      setFormError(errorMessage(error, "No se pudo guardar el estatus."));
    } finally {
      setIsSaving(false);
    }
  }

  async function remove(status: TaskStatusOption) {
    if (
      !window.confirm(
        `¿Eliminar el estatus "${status.name}"? Las tareas que lo usan pasarán a "${status.closes ? "Completado" : "En proceso"}".`,
      )
    ) {
      return;
    }
    await deleteTaskStatusAction(status.id);
    await refresh();
  }

  const columns = useMemo<ColumnDef<TaskStatusOption, unknown>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Estatus",
        cell: ({ row }) => (
          <Badge variant={customStatusVariant(row.original)}>
            {row.original.name}
          </Badge>
        ),
      },
      {
        id: "closes",
        header: "Cierra la tarea",
        cell: ({ row }) => (
          <span className="text-sm text-foreground">
            {row.original.closes ? "Sí" : "No"}
          </span>
        ),
      },
      ...(capabilities.canManageTaskStatuses
        ? [
            createRowActionsColumn<TaskStatusOption>(() => [
              { label: "Editar", onSelect: (s) => openEditor(s) },
              {
                label: "Eliminar",
                separatorBefore: true,
                variant: "destructive",
                onSelect: (s) => void remove(s),
              },
            ]),
          ]
        : []),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [capabilities.canManageTaskStatuses],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">
              Estatus de tareas
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Estatus propios para las tareas, además de Pendiente, En proceso,
              Completado y Bloqueado. Cada uno tiene su columna en el Tablero.
            </p>
          </div>
          {capabilities.canManageTaskStatuses ? (
            <Button onClick={() => openEditor(null)}>+ Nuevo estatus</Button>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <DataTable
          columns={columns}
          data={statuses}
          getRowId={(row) => row.id}
          onRowClick={
            capabilities.canManageTaskStatuses
              ? (row) => openEditor(row)
              : undefined
          }
          emptyMessage="No hay estatus personalizados."
        />
      </section>

      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar estatus" : "Nuevo estatus"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="status-name">Nombre</Label>
              <Input
                id="status-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={closes}
                onCheckedChange={(checked) => setCloses(Boolean(checked))}
              />
              <span>
                Cuenta como terminado
                <span className="block text-muted-foreground">
                  Las tareas en este estatus cuentan como completadas en
                  métricas y dejan de vencer.
                </span>
              </span>
            </label>
            {formError ? (
              <p className="text-sm text-destructive">{formError}</p>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditor(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void save()} disabled={isSaving}>
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
