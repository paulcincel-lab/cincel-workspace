"use client";

import { useEffect, useState } from "react";

import AppAvatar from "@/components/ui/AppAvatar";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { StatusBadge } from "@/components/v2/status/StatusBadge";
import {
  createSubtaskAction,
  listSubtasksAction,
} from "@/lib/actions/tasks-actions";
import {
  BASE_STATUS_COLOR,
  BASE_STATUS_LABEL,
} from "@/lib/tasks/status-options";
import type { TaskRef } from "@/lib/types/core";
import { formatDateDMY } from "@/lib/utils/date";

const SUBTASK_ERROR_COPY: Record<string, string> = {
  NESTED: "Una subtarea no puede tener subtareas.",
  FORBIDDEN: "No tienes permiso para agregar subtareas.",
  NOT_FOUND: "La tarea ya no existe.",
};

/** Spanish copy for a createSubtaskAction error code (NESTED, FORBIDDEN, NOT_FOUND). */
export function subtaskErrorMessage(error: unknown): string {
  const code = error instanceof Error ? error.message.split(":")[0].trim() : "";
  return SUBTASK_ERROR_COPY[code] ?? "No se pudo agregar la subtarea.";
}

type Props = {
  parentId: string;
  /** Opens a child task in the same drawer. */
  onOpenSubtask: (subtask: TaskRef) => void;
};

/** The task drawer's Subtareas section: child tasks plus "Agregar subtarea". */
export default function TaskSubtasks({ parentId, onOpenSubtask }: Props) {
  const [subtasks, setSubtasks] = useState<TaskRef[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState("");

  useEffect(() => {
    let cancelled = false;
    listSubtasksAction(parentId)
      .then((rows) => {
        if (!cancelled) setSubtasks(rows);
      })
      .catch(() => {
        if (!cancelled) setLoadError("No se pudieron cargar las subtareas.");
      });
    return () => {
      cancelled = true;
    };
  }, [parentId]);

  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    setAddError("");
    try {
      await createSubtaskAction(parentId, { title });
      setNewTitle("");
      setSubtasks(await listSubtasksAction(parentId));
    } catch (error) {
      setAddError(subtaskErrorMessage(error));
    } finally {
      setAdding(false);
    }
  };

  return (
    <section>
      <h3 className="text-lg font-semibold text-foreground">Subtareas</h3>
      <div className="mt-3 space-y-2 rounded-2xl border border-border p-4">
        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : subtasks === null ? (
          <p className="text-sm text-muted-foreground">Cargando subtareas...</p>
        ) : subtasks.length > 0 ? (
          <ul className="space-y-1">
            {subtasks.map((subtask) => (
              <li key={subtask.id}>
                <button
                  type="button"
                  onClick={() => onOpenSubtask(subtask)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                >
                  <StatusBadge
                    label={BASE_STATUS_LABEL[subtask.status]}
                    token={BASE_STATUS_COLOR[subtask.status]}
                  />
                  <span className="flex-1 truncate text-foreground">
                    {subtask.title}
                  </span>
                  {subtask.managerName ? (
                    <AppAvatar name={subtask.managerName} showName={false} />
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      Sin responsable
                    </span>
                  )}
                  <span className="w-20 text-right text-xs text-muted-foreground">
                    {formatDateDMY(subtask.commitmentDate ?? "")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Sin subtareas.</p>
        )}

        <div className="flex gap-2 pt-2">
          <Input
            value={newTitle}
            onChange={(event) => setNewTitle(event.target.value)}
            placeholder="Nueva subtarea..."
            aria-label="Título de la subtarea"
            className="h-8 text-sm"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void handleAdd();
              }
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={adding}
            onClick={() => void handleAdd()}
          >
            Agregar subtarea
          </Button>
        </div>
        {addError ? (
          <p className="text-xs text-destructive">{addError}</p>
        ) : null}
      </div>
    </section>
  );
}
