"use client";

import { type FormEvent, useState } from "react";
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
import { unwrapActionResult } from "@/lib/actions/action-result";
import {
  createProjectSpaceAction,
  deleteProjectSpaceAction,
  renameProjectSpaceAction,
  reorderProjectSpacesAction,
} from "@/lib/actions/projects-actions";
import { fichaFlowErrorText } from "@/lib/proyectos/flow-error-text";
import type { ProjectSpace } from "@/lib/types/core";

export interface ProjectSpacesCardProps {
  projectId: string;
  initialSpaces: ProjectSpace[];
  canEdit: boolean;
}

const MAX_NAME = 120;

export function ProjectSpacesCard({ projectId, initialSpaces, canEdit }: ProjectSpacesCardProps) {
  const [spaces, setSpaces] = useState<ProjectSpace[]>(() => [...initialSpaces].sort((a, b) => a.sortOrder - b.sortOrder));
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [toDelete, setToDelete] = useState<ProjectSpace | null>(null);

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

  async function addSpace(event: FormEvent) {
    event.preventDefault();
    const name = validName(newName);
    if (!name) return;
    setPending(true);
    setError(null);
    try {
      const created = unwrapActionResult(await createProjectSpaceAction(projectId, name));
      setSpaces((rows) => [...rows, created]);
      setNewName("");
      setAdding(false);
    } catch (err) {
      setError(fichaFlowErrorText(err));
    } finally {
      setPending(false);
    }
  }

  async function rename(space: ProjectSpace, raw: string) {
    const name = validName(raw);
    if (!name || name === space.name) return;
    setError(null);
    try {
      const updated = unwrapActionResult(await renameProjectSpaceAction(space.id, name));
      setSpaces((rows) => rows.map((r) => (r.id === space.id ? { ...r, ...updated } : r)));
    } catch (err) {
      setError(fichaFlowErrorText(err));
    }
  }

  async function reorder(orderedIds: string[]) {
    const previous = spaces;
    const byId = new Map(spaces.map((s) => [s.id, s]));
    const next = orderedIds
      .map((id, index) => {
        const row = byId.get(id);
        return row ? { ...row, sortOrder: index } : null;
      })
      .filter((row): row is ProjectSpace => row !== null);
    setSpaces(next);
    setError(null);
    try {
      unwrapActionResult(await reorderProjectSpacesAction(projectId, orderedIds));
    } catch (err) {
      setSpaces(previous);
      setError(fichaFlowErrorText(err));
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    const target = toDelete;
    setPending(true);
    setError(null);
    try {
      unwrapActionResult(await deleteProjectSpaceAction(target.id));
      setSpaces((rows) => rows.filter((r) => r.id !== target.id));
      setToDelete(null);
    } catch (err) {
      setError(fichaFlowErrorText(err));
      setToDelete(null);
    } finally {
      setPending(false);
    }
  }

  const columns: ColumnDef<ProjectSpace, unknown>[] = [
    {
      id: "name",
      header: "Espacio",
      enableSorting: false,
      cell: ({ row }) =>
        canEdit ? (
          <InlineEditable
            value={row.original.name}
            onCommit={(value) => void rename(row.original, value)}
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
            onReorderRows={canEdit ? (ids) => void reorder(ids) : undefined}
          />
        )}

        {canEdit ? (
          adding ? (
            <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => void addSpace(e)}>
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
            <AlertDialogAction variant="destructive" disabled={pending} onClick={() => void confirmDelete()}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
