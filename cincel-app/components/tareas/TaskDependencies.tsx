"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

import AppAvatar from "@/components/ui/AppAvatar";
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/shadcn/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/shadcn/popover";
import { StatusBadge } from "@/components/v2/status/StatusBadge";
import {
  addTaskDependencyAction,
  fetchTasksAction,
  listTaskDependenciesAction,
  removeTaskDependencyAction,
} from "@/lib/actions/tasks-actions";
import {
  BASE_STATUS_COLOR,
  BASE_STATUS_LABEL,
} from "@/lib/tasks/status-options";
import type { TaskListItem, TaskRef } from "@/lib/types/core";
import { formatDateDMY } from "@/lib/utils/date";

const DEPENDENCY_ERROR_COPY: Record<string, string> = {
  FORBIDDEN: "No tienes permiso para editar las dependencias de esta tarea.",
  NOT_FOUND: "La tarea o la dependencia ya no existe.",
  OTHER_PROJECT: "Solo puedes depender de tareas del mismo proyecto.",
  SELF: "Una tarea no puede depender de sí misma.",
  DUPLICATE: "Esta tarea ya depende de la tarea elegida.",
  CYCLE:
    "No se puede agregar: la tarea elegida ya depende de esta, y se formaría un ciclo.",
};

/**
 * Spanish copy for an add/remove dependency error code
 * (FORBIDDEN, NOT_FOUND, OTHER_PROJECT, SELF, DUPLICATE, CYCLE).
 */
export function dependencyErrorMessage(
  error: unknown,
  fallback = "No se pudo actualizar la dependencia.",
): string {
  const code = error instanceof Error ? error.message.split(":")[0].trim() : "";
  return DEPENDENCY_ERROR_COPY[code] ?? fallback;
}

type Dependencies = { dependsOn: TaskRef[]; blocks: TaskRef[] };

type Props = {
  taskId: string;
  projectId: string;
  /** Opens a linked task in the same drawer. */
  onOpenTask: (task: TaskRef) => void;
  /** Called after a dependency is added or removed, so the caller can refresh "En espera". */
  onChange?: () => void;
};

function TaskRefRow({
  task,
  onOpen,
}: {
  task: TaskRef;
  onOpen: (task: TaskRef) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
    >
      <StatusBadge
        label={BASE_STATUS_LABEL[task.status]}
        token={BASE_STATUS_COLOR[task.status]}
      />
      <span className="flex-1 truncate text-foreground">{task.title}</span>
      {task.managerName ? (
        <AppAvatar name={task.managerName} showName={false} />
      ) : (
        <span className="text-xs text-muted-foreground">Sin responsable</span>
      )}
      <span className="w-20 text-right text-xs text-muted-foreground">
        {formatDateDMY(task.commitmentDate ?? "")}
      </span>
    </button>
  );
}

/** The task drawer's Dependencias section: "Depende de" (editable) and "Bloquea a" (read-only). */
export default function TaskDependencies({
  taskId,
  projectId,
  onOpenTask,
  onChange,
}: Props) {
  const [deps, setDeps] = useState<Dependencies | null>(null);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [candidates, setCandidates] = useState<TaskListItem[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<TaskRef | null>(null);

  useEffect(() => {
    let cancelled = false;
    listTaskDependenciesAction(taskId)
      .then((rows) => {
        if (!cancelled) setDeps(rows);
      })
      .catch(() => {
        if (!cancelled) setLoadError("No se pudieron cargar las dependencias.");
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  const openPicker = (next: boolean) => {
    setPickerOpen(next);
    if (!next || candidates !== null) return;
    fetchTasksAction({ projectId })
      .then(setCandidates)
      .catch(() => setCandidates([]));
  };

  const reload = async () => {
    setDeps(await listTaskDependenciesAction(taskId));
    onChange?.();
  };

  const handleAdd = async (dependsOnTaskId: string) => {
    if (saving) return;
    setPickerOpen(false);
    setSaving(true);
    setError("");
    try {
      await addTaskDependencyAction(taskId, dependsOnTaskId);
      await reload();
    } catch (err) {
      setError(
        dependencyErrorMessage(err, "No se pudo agregar la dependencia."),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    const target = pendingRemove;
    setPendingRemove(null);
    if (!target || saving) return;
    setSaving(true);
    setError("");
    try {
      await removeTaskDependencyAction(taskId, target.id);
      await reload();
    } catch (err) {
      setError(
        dependencyErrorMessage(err, "No se pudo quitar la dependencia."),
      );
    } finally {
      setSaving(false);
    }
  };

  const linkedIds = new Set(deps?.dependsOn.map((t) => t.id) ?? []);
  const options = (candidates ?? []).filter(
    (t) => t.projectId === projectId && t.id !== taskId && !linkedIds.has(t.id),
  );

  return (
    <section>
      <h3 className="text-lg font-semibold text-foreground">Dependencias</h3>
      <div className="mt-3 space-y-4 rounded-2xl border border-border p-4">
        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : deps === null ? (
          <p className="text-sm text-muted-foreground">
            Cargando dependencias...
          </p>
        ) : (
          <>
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">
                Depende de
              </h4>
              {deps.dependsOn.length > 0 ? (
                <ul className="space-y-1">
                  {deps.dependsOn.map((dep) => (
                    <li key={dep.id} className="flex items-center gap-1">
                      <TaskRefRow task={dep} onOpen={onOpenTask} />
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Quitar dependencia ${dep.title}`}
                        disabled={saving}
                        onClick={() => setPendingRemove(dep)}
                      >
                        <X />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No depende de otras tareas.
                </p>
              )}

              <Popover open={pickerOpen} onOpenChange={openPicker}>
                <PopoverTrigger
                  render={
                    <Button variant="outline" size="sm" disabled={saving} />
                  }
                >
                  Agregar dependencia
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0">
                  <Command>
                    <CommandInput placeholder="Buscar tarea del proyecto..." />
                    <CommandList>
                      {candidates === null ? (
                        <p className="py-6 text-center text-sm text-muted-foreground">
                          Cargando tareas...
                        </p>
                      ) : (
                        <>
                          <CommandEmpty>
                            No hay tareas que coincidan.
                          </CommandEmpty>
                          <CommandGroup>
                            {options.map((option) => (
                              <CommandItem
                                key={option.id}
                                value={`${option.title} ${option.id}`}
                                onSelect={() => void handleAdd(option.id)}
                              >
                                <span className="truncate">{option.title}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {error ? (
                <p className="text-xs text-destructive">{error}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium text-foreground">Bloquea a</h4>
              {deps.blocks.length > 0 ? (
                <ul className="space-y-1">
                  {deps.blocks.map((blocked) => (
                    <li key={blocked.id} className="flex">
                      <TaskRefRow task={blocked} onOpen={onOpenTask} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Ninguna tarea espera a esta.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <AlertDialog
        open={pendingRemove !== null}
        onOpenChange={(next) => {
          if (!next) setPendingRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Quitar esta dependencia?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta tarea dejará de depender de «{pendingRemove?.title}».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void handleRemove()}
            >
              Quitar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
