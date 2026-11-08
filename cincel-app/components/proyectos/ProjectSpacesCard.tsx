"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useQuery, type QueryClient } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable } from "@/components/ui/DataTable";
import InlineEditable from "@/components/ui/InlineEditable";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
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
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { Input } from "@/components/ui/shadcn/input";
import {
  createProjectSpaceAction,
  deleteProjectSpaceAction,
  renameProjectSpaceAction,
  reorderProjectSpacesAction,
} from "@/lib/actions/projects-actions";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { catalogProjectSpacesOptions } from "@/lib/query/options/catalog";
import type { ProjectSpace } from "@/lib/types/core";

export interface ProjectSpacesCardProps {
  projectId: string;
  canEdit: boolean;
}

const MAX_NAME = 120;

type SpacesSnapshot = { previous: ProjectSpace[] | null | undefined };

/** Rows by `sortOrder`, as the card lists them. */
function bySortOrder(rows: readonly ProjectSpace[]): ProjectSpace[] {
  return [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * The ficha's Espacios card. Reads `catalog.projectSpaces(id)` (seeded by
 * the ficha query) and changes it optimistically: create, rename, reorder
 * and delete show at once and roll back with the error copy when the save
 * fails. Every save then invalidates the ficha and Resumen; create and
 * rename also the project picker, delete also Tareas (its tasks lose the
 * espacio).
 */
export function ProjectSpacesCard({ projectId, canEdit }: ProjectSpacesCardProps) {
  const spacesKey = qk.catalog.projectSpaces(projectId);
  const { data } = useQuery(catalogProjectSpacesOptions(projectId));
  const spaces = useMemo(() => bySortOrder(data ?? []), [data]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ProjectSpace | null>(null);

  /** Patches the cached espacios and returns the rows to restore on error. */
  function optimistic<V>(patch: (rows: ProjectSpace[], vars: V) => ProjectSpace[]) {
    return {
      onMutate: async (qc: QueryClient, vars: V): Promise<SpacesSnapshot> => {
        await qc.cancelQueries({ queryKey: spacesKey });
        const previous = qc.getQueryData<ProjectSpace[] | null>(spacesKey);
        qc.setQueryData<ProjectSpace[] | null>(spacesKey, (rows) => (rows ? patch(rows, vars) : rows));
        return { previous };
      },
      rollback: (qc: QueryClient, snap: SpacesSnapshot) => {
        qc.setQueryData(spacesKey, snap.previous);
      },
    };
  }

  const baseInvalidate = [qk.proyectos.tab(projectId, "ficha"), qk.proyectos.resumen(projectId)];
  const mutationOptions = { errorContext: { entity: "space" as const }, onFormError: setError };

  const create = useActionMutation<{ name: string; tempId: string }, ProjectSpace, SpacesSnapshot>(
    ({ name }) => createProjectSpaceAction(projectId, name),
    {
      ...mutationOptions,
      optimistic: optimistic<{ name: string; tempId: string }>((rows, { name, tempId }) => [
        ...rows,
        {
          id: tempId,
          name,
          projectId,
          sortOrder: rows.reduce((max, r) => Math.max(max, r.sortOrder), -1) + 1,
          taskCount: 0,
        },
      ]),
      setData: (qc, created, { tempId }) => {
        qc.setQueryData<ProjectSpace[] | null>(spacesKey, (rows) =>
          rows ? rows.map((r) => (r.id === tempId ? created : r)) : rows,
        );
      },
      invalidate: [...baseInvalidate, qk.catalog.projectOptions()],
    },
  );

  const rename = useActionMutation<{ id: string; name: string }, ProjectSpace, SpacesSnapshot>(
    ({ id, name }) => renameProjectSpaceAction(id, name),
    {
      ...mutationOptions,
      optimistic: optimistic<{ id: string; name: string }>((rows, { id, name }) => rows.map((r) => (r.id === id ? { ...r, name } : r))),
      setData: (qc, updated) => {
        qc.setQueryData<ProjectSpace[] | null>(spacesKey, (rows) =>
          rows ? rows.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)) : rows,
        );
      },
      invalidate: [...baseInvalidate, qk.catalog.projectOptions()],
    },
  );

  const reorder = useActionMutation<string[], void, SpacesSnapshot>(
    (orderedIds) => reorderProjectSpacesAction(projectId, orderedIds),
    {
      ...mutationOptions,
      optimistic: optimistic<string[]>((rows, orderedIds) => {
        const byId = new Map(rows.map((r) => [r.id, r]));
        return orderedIds
          .map((id, index) => {
            const row = byId.get(id);
            return row ? { ...row, sortOrder: index } : null;
          })
          .filter((row): row is ProjectSpace => row !== null);
      }),
      invalidate: baseInvalidate,
    },
  );

  const remove = useActionMutation<string, void, SpacesSnapshot>((id) => deleteProjectSpaceAction(id), {
    ...mutationOptions,
    optimistic: optimistic<string>((rows, id) => rows.filter((r) => r.id !== id)),
    invalidate: [...baseInvalidate, qk.tareas.all],
  });

  function validName(raw: string): string | null {
    const name = raw.trim();
    if (!name) {
      setError("Escribe un nombre.");
      return null;
    }
    if (name.length > MAX_NAME) {
      setError(`El nombre no puede pasar de ${MAX_NAME} caracteres.`);
      return null;
    }
    return name;
  }

  function addSpace(event: FormEvent) {
    event.preventDefault();
    const name = validName(newName);
    if (!name) return;
    setError(null);
    create.mutate(
      { name, tempId: `nuevo-${Date.now()}` },
      {
        onSuccess: () => {
          setNewName("");
          setAdding(false);
        },
      },
    );
  }

  function renameSpace(space: ProjectSpace, raw: string) {
    const name = validName(raw);
    if (!name || name === space.name) return;
    setError(null);
    rename.mutate({ id: space.id, name });
  }

  function reorderSpaces(orderedIds: string[]) {
    setError(null);
    reorder.mutate(orderedIds);
  }

  function confirmDelete() {
    if (!toDelete) return;
    setError(null);
    remove.mutate(toDelete.id);
    setToDelete(null);
  }

  const pending = create.isPending || remove.isPending;

  // The viewer can't see the project.
  if (data === null) return null;

  const columns: ColumnDef<ProjectSpace, unknown>[] = [
    {
      id: "name",
      header: "Espacio",
      enableSorting: false,
      cell: ({ row }) =>
        canEdit ? (
          <InlineEditable
            value={row.original.name}
            onCommit={(value) => renameSpace(row.original, value)}
            editTriggerLabel={`Renombrar ${row.original.name}`}
            renderDisplay={(value) => <span>{value}</span>}
            renderEditor={({ value, onChange, onBlur, onKeyDown }) => (
              <Input
                autoFocus
                value={value}
                maxLength={MAX_NAME}
                aria-label={`Nombre de ${row.original.name}`}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
                onKeyDown={onKeyDown}
                className="h-8"
              />
            )}
          />
        ) : (
          <span>{row.original.name}</span>
        ),
    },
    {
      id: "tasks",
      header: "Tareas",
      enableSorting: false,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.taskCount}</span>,
    },
  ];
  if (canEdit) {
    columns.push({
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" aria-label={`Eliminar ${row.original.name}`} onClick={() => setToDelete(row.original)}>
            Eliminar
          </Button>
        </div>
      ),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Espacios</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {spaces.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Sin espacios. Agrega espacios como «Depto 201» o «Planta baja» para filtrar tareas.
          </p>
        ) : (
          <DataTable
            columns={columns}
            data={spaces}
            getRowId={(row) => row.id}
            onReorderRows={canEdit ? reorderSpaces : undefined}
          />
        )}

        {canEdit ? (
          adding ? (
            <form className="flex flex-wrap items-center gap-2" onSubmit={addSpace}>
              <Input
                autoFocus
                value={newName}
                maxLength={MAX_NAME}
                aria-label="Nombre del espacio"
                placeholder="Depto 201"
                onChange={(e) => setNewName(e.target.value)}
                className="h-8 max-w-xs"
              />
              <Button type="submit" size="sm" disabled={pending}>
                Agregar
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setAdding(false);
                  setNewName("");
                  setError(null);
                }}
              >
                Cancelar
              </Button>
            </form>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              + Agregar espacio
            </Button>
          )
        ) : null}
      </CardContent>

      <AlertDialog open={toDelete !== null} onOpenChange={(next) => (next ? undefined : setToDelete(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {toDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>Las tareas de {toDelete?.name} quedarán sin espacio.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={confirmDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
