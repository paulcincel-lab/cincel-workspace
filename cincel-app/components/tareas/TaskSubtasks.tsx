"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { ResponsableAvatar } from "@/components/widgets/PeopleStack";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { StatusBadge } from "@/components/v2/status/StatusBadge";
import * as tasksActions from "@/lib/actions/tasks-actions";
import { qk } from "@/lib/query/keys";
import { useActionMutation } from "@/lib/query/mutation";
import { subtaskCreateInvalidations, taskSubtasksOptions } from "@/lib/query/options/tareas";
import {
  BASE_STATUS_COLOR,
  BASE_STATUS_LABEL,
} from "@/lib/tasks/status-options";
import type { SubtaskInput, TaskDetail, TaskRef } from "@/lib/types/core";
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
  /** The parent's project (its Tareas tab refreshes after a create). */
  projectId: string;
  /** Opens a child task in the same drawer. */
  onOpenSubtask: (subtask: TaskRef) => void;
};

/**
 * The task sheet's Subtareas section: child tasks (`qk.tasks.subtasks(id)`)
 * plus "Agregar subtarea" (`createSubtaskAction`, which refreshes the list,
 * the parent's detail and the Tareas views).
 */
export default function TaskSubtasks({ parentId, projectId, onOpenSubtask }: Props) {
  const query = useQuery(taskSubtasksOptions(parentId));
  const subtasks = query.data ?? null;
  const loadError = query.isError ? "No se pudieron cargar las subtareas." : "";
  const [newTitle, setNewTitle] = useState("");
  const [addError, setAddError] = useState("");

  const create = useActionMutation<SubtaskInput, TaskDetail>(
    (input) => tasksActions.createSubtaskAction(parentId, input),
    {
      setData: (qc) => {
        // The parent's counts; `exact` leaves its dependencies alone.
        void qc.invalidateQueries({ queryKey: qk.tasks.detail(parentId), exact: true });
      },
      invalidate: () => subtaskCreateInvalidations(parentId, projectId),
      onFormError: () => undefined,
    },
  );
  const adding = create.isPending;

  const handleAdd = async () => {
    const title = newTitle.trim();
    if (!title || adding) return;
    setAddError("");
    try {
      await create.mutateAsync({ title });
      setNewTitle("");
    } catch (error) {
      setAddError(subtaskErrorMessage(error));
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
                  <ResponsableAvatar
                    person={subtask.managerName ? { id: subtask.managerId ?? subtask.managerName, name: subtask.managerName } : null}
                    showName={false}
                  />
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
