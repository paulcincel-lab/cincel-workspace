"use client";

import { useId, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";

import { FormDialog } from "@/components/patterns/FormDialog";
import { Button } from "@/components/ui/shadcn/button";
import { FormField } from "@/components/ui/shadcn/form-field";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/shadcn/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { fetchCatalogAssignableStaff, fetchCatalogProjectOptions } from "@/lib/actions/page-data/catalog-actions";
import {
  createSubtaskAction,
  createUserTaskAction,
  setTaskCustomStatusAction,
  setTaskStatusAction,
} from "@/lib/actions/tasks-actions";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import { STALE, qk } from "@/lib/query/keys";
import { mutationErrorText, runAction, useActionMutation } from "@/lib/query/mutation";
import type { CatalogProjectOption } from "@/lib/types/catalog";
import type {
  ProjectListItem,
  SubtaskInput,
  TaskDetail,
  TaskPriority,
  UserTaskInput,
  WorkflowDetail,
} from "@/lib/types/core";
import {
  PRIORITY_OPTIONS,
  applyTemplate,
  hasErrors,
  draftFromDefaults,
  initialStatusTarget,
  resolvePhaseId,
  resolveProjectId,
  resolveWorkflowId,
  toSubtaskInputs,
  toUserTaskInput,
  tramoFases,
  tramoTemplateTitles,
  validateDraft,
  type DraftErrors,
  type NewTaskDefaults,
  type NewTaskDraft,
} from "./new-task-form";

export type NewTaskDialogProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  /** Prefills the form; `status` is the board column the task is created in (Tablero "+ Agregar"). */
  defaults?: NewTaskDefaults;
};

/** Select value for "Sin responsable" (Select items can't carry null). */
const NO_MANAGER = "__none__";

type ProjectChoice = Pick<ProjectListItem, "id" | "name" | "currentWorkflowId">;

/** The active projects, as the dialog's project choices (stable for `select` memoization). */
function activeProjectChoices(rows: readonly CatalogProjectOption[]): ProjectChoice[] {
  return rows
    .filter((p) => p.status === "activo")
    .map((p) => ({ id: p.id, name: p.name, currentWorkflowId: p.currentWorkflowId }));
}

/** The active tramos in catalog order. */
function activeWorkflowsInOrder(rows: readonly WorkflowDetail[]): WorkflowDetail[] {
  return rows.filter((w) => w.active).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Responsables suggested for the tramo first. */
function suggestedFirst<T extends { suggested: boolean }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => Number(b.suggested) - Number(a.suggested));
}

/**
 * The tramo catalog with its fases and task templates (the Fase field and
 * "Usar plantilla del tramo" need them). Kept under the `catalog.workflows`
 * prefix, so every invalidation of `qk.catalog.workflows()` refreshes it.
 */
export const newTaskWorkflowsKey = () => [...qk.catalog.workflows(), "detail"] as const;

/** Keys a created task (and its subtareas) makes stale (plan §3, `createUserTaskAction` / `createSubtaskAction`). */
export function newTaskInvalidations(projectId: string, created?: { taskId: string; withSubtasks: boolean }) {
  const keys: (readonly unknown[])[] = [
    qk.tareas.all,
    qk.proyectos.tab(projectId, "tareas"),
    qk.proyectos.shell(projectId),
    qk.proyectos.resumen(projectId),
    qk.proyectos.list(),
    qk.inicio(),
    qk.shell.badges(),
  ];
  if (created?.withSubtasks) keys.push(qk.tasks.detail(created.taskId), qk.tasks.subtasks(created.taskId));
  return keys;
}

type CreateTaskVars = { input: UserTaskInput; statusKey?: string; subtasks: SubtaskInput[] };
type CreateTaskResult = { task: TaskDetail; partialError: unknown };

/**
 * `createUserTaskAction`, then the board column's status, then one
 * `createSubtaskAction` per subtarea. Only the create can fail the call: once
 * the task exists a failed status move or subtarea is reported, not retried,
 * so a second "Crear tarea" can't duplicate the task.
 */
async function createTaskWithExtras({ input, statusKey, subtasks }: CreateTaskVars): Promise<CreateTaskResult> {
  const task = await runAction(createUserTaskAction, input);
  let partialError: unknown = null;
  const target = initialStatusTarget(statusKey, task);
  if (target) {
    try {
      if (target.kind === "custom") await runAction(() => setTaskCustomStatusAction(task.id, target.id), undefined);
      else await runAction(() => setTaskStatusAction(task.id, target.status), undefined);
    } catch (err) {
      partialError = err;
    }
  }
  for (const subtask of subtasks) {
    try {
      await runAction((v: SubtaskInput) => createSubtaskAction(task.id, v), subtask);
    } catch (err) {
      partialError ??= err;
    }
  }
  return { task, partialError };
}

/**
 * New task dialog (redesign FE §3.4, frame `NuevaTarea`),
 * on `FormDialog`. Título, Proyecto, Tramo, Fase (the tramo's
 * catalog; hidden when it has none), Responsable, Fecha de entrega, Prioridad,
 * Descripción and Subtareas ("Usar plantilla del tramo"). The catalogs are
 * shared queries (`catalog.projectOptions`, the `catalog.workflows` detail,
 * `catalog.assignableStaff(workflowId)`), loaded while open and once per
 * session. "Crear tarea" runs one `useActionMutation` (create → status →
 * subtareas) that invalidates the views showing tasks.
 */
export function NewTaskDialog({ open, onOpenChange, defaults }: NewTaskDialogProps) {
  const ids = useId();
  const [draft, setDraft] = useState<NewTaskDraft>(() => draftFromDefaults(defaults));
  const [tramoPicked, setTramoPicked] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Each opening starts a fresh form from `defaults`.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(draftFromDefaults(defaults));
      setTramoPicked(false);
      setErrors({});
      setSubmitError(null);
    }
  }

  const projectsQuery = useQuery({
    queryKey: qk.catalog.projectOptions(),
    queryFn: () => runAction(fetchCatalogProjectOptions, {}),
    staleTime: STALE.catalog,
    enabled: open,
    select: activeProjectChoices,
  });
  const workflowsQuery = useQuery({
    queryKey: newTaskWorkflowsKey(),
    queryFn: () => runAction(fetchWorkflowsAction, {}),
    staleTime: STALE.catalog,
    enabled: open,
    select: activeWorkflowsInOrder,
  });
  const catalogReady = projectsQuery.data !== undefined && workflowsQuery.data !== undefined;

  const projects = useMemo(() => projectsQuery.data ?? [], [projectsQuery.data]);
  const workflows = useMemo(() => workflowsQuery.data ?? [], [workflowsQuery.data]);
  const projectId = resolveProjectId(draft.projectId, projects);
  const project = projects.find((p) => p.id === projectId) ?? null;
  const workflowId = resolveWorkflowId(draft.workflowId, workflows, {
    tramoKey: tramoPicked ? undefined : defaults?.tramoKey,
    project,
  });
  const workflow = workflows.find((w) => w.id === workflowId) ?? null;
  const fases = useMemo(() => tramoFases(workflow), [workflow]);
  const phaseId = resolvePhaseId(draft.phaseId, fases);
  const templateTitles = tramoTemplateTitles(workflow, fases.length > 0 ? phaseId : null);

  // Responsables for the selected tramo, suggested first.
  const staffQuery = useQuery({
    queryKey: qk.catalog.assignableStaff(workflowId),
    queryFn: () => runAction(fetchCatalogAssignableStaff, { workflowId }),
    staleTime: STALE.catalog,
    enabled: open && catalogReady,
    placeholderData: keepPreviousData,
    select: suggestedFirst,
  });
  const staffList = useMemo(() => staffQuery.data ?? [], [staffQuery.data]);

  const loadFailure = projectsQuery.error ?? workflowsQuery.error ?? staffQuery.error;
  const loadError = open && loadFailure ? mutationErrorText(loadFailure) : null;

  const create = useActionMutation(createTaskWithExtras, {
    invalidate: (vars, data) =>
      data ? newTaskInvalidations(vars.input.projectId, { taskId: data.task.id, withSubtasks: vars.subtasks.length > 0 }) : [],
    successToast: "Tarea creada",
    partialFailure: (data) => (data.partialError ? mutationErrorText(data.partialError) : null),
    onFormError: setSubmitError,
  });
  const pending = create.isPending;

  const managerId = draft.managerId && staffList.some((s) => s.id === draft.managerId) ? draft.managerId : null;

  const update = (patch: Partial<NewTaskDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const resolved = { ...draft, projectId, workflowId, phaseId, managerId };

  const handleSubmit = async () => {
    const nextErrors = validateDraft(resolved, fases);
    setErrors(nextErrors);
    setSubmitError(null);
    if (hasErrors(nextErrors)) return;

    try {
      await create.mutateAsync({
        input: toUserTaskInput(resolved, fases),
        statusKey: defaults?.status,
        subtasks: toSubtaskInputs(resolved),
      });
    } catch {
      // Shown in the form by `onFormError`.
      return;
    }
    onOpenChange(false);
  };

  const loading = open && !catalogReady && !loadError;
  const formError = submitError ?? errors.form ?? loadError;
  const titleErrorId = `${ids}-title-error`;
  const priorityLabelId = `${ids}-priority`;
  const subtasksLabelId = `${ids}-subtasks`;
  const subtasks = draft.subtasks;

  return (
    <FormDialog
      title="Nueva tarea"
      description="Se creará como tarea activa en el proyecto y el tramo que elijas."
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
      onSubmit={handleSubmit}
      submitLabel="Crear tarea"
      pending={pending || loading}
      error={formError}
      size="lg"
    >
      <div className="flex flex-col gap-4">
        {loading ? (
          <p className="text-sm text-muted-foreground" role="status">
            Cargando…
          </p>
        ) : null}

        <FormField className="flex flex-col gap-2">
          <Label>Título</Label>
          <Input
            value={draft.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="¿Qué hay que hacer?"
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? titleErrorId : undefined}
          />
          {errors.title ? (
            <p id={titleErrorId} className="text-sm text-destructive">
              {errors.title}
            </p>
          ) : null}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField className="flex flex-col gap-2">
            <Label>Proyecto</Label>
            {catalogReady && projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay proyectos activos disponibles</p>
            ) : (
              <Select
                items={Object.fromEntries(projects.map((p) => [p.id, p.name]))}
                value={projectId}
                onValueChange={(v) =>
                  update({ projectId: (v as string) ?? "", ...(tramoPicked ? {} : { workflowId: null, phaseId: null }) })
                }
                disabled={!catalogReady}
              >
                <SelectTrigger aria-label="Proyecto" className="w-full">
                  <SelectValue placeholder="Elige un proyecto" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>

          <FormField className="flex flex-col gap-2">
            <Label>Tramo</Label>
            <Select
              items={Object.fromEntries(workflows.map((w) => [w.id, w.name]))}
              value={workflowId ?? ""}
              onValueChange={(v) => {
                setTramoPicked(true);
                update({ workflowId: (v as string) || null, phaseId: null });
              }}
              disabled={!catalogReady}
            >
              <SelectTrigger aria-label="Tramo" className="w-full">
                <SelectValue placeholder="Elige un tramo" />
              </SelectTrigger>
              <SelectContent>
                {workflows.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {fases.length > 0 ? (
            <FormField className="flex flex-col gap-2">
              <Label>Fase</Label>
              <Select
                items={Object.fromEntries(fases.map((f) => [f.id, f.name]))}
                value={phaseId ?? ""}
                onValueChange={(v) => update({ phaseId: (v as string) || null })}
              >
                <SelectTrigger aria-label="Fase" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {fases.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          ) : null}

          <FormField className="flex flex-col gap-2">
            <Label>Responsable</Label>
            <Select
              items={{ [NO_MANAGER]: "Sin responsable", ...Object.fromEntries(staffList.map((s) => [s.id, s.name])) }}
              value={managerId ?? NO_MANAGER}
              onValueChange={(v) => {
                const next = v as string;
                update({ managerId: next && next !== NO_MANAGER ? next : null });
              }}
              disabled={!catalogReady}
            >
              <SelectTrigger aria-label="Responsable" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_MANAGER}>Sin responsable</SelectItem>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField className="flex flex-col gap-2">
            <Label>Fecha de entrega</Label>
            <Input type="date" value={draft.deliveryDate} onChange={(e) => update({ deliveryDate: e.target.value })} />
          </FormField>
        </div>

        <div className="flex flex-col gap-2">
          <span id={priorityLabelId} className="text-sm font-medium text-foreground">
            Prioridad
          </span>
          <RadioGroup
            aria-labelledby={priorityLabelId}
            value={draft.priority}
            onValueChange={(v) => update({ priority: v as TaskPriority })}
            className="flex flex-wrap gap-4"
          >
            {PRIORITY_OPTIONS.map((option) => (
              <Label key={option.value} className="flex items-center gap-2">
                <RadioGroupItem value={option.value} />
                {option.label}
              </Label>
            ))}
          </RadioGroup>
        </div>

        <FormField className="flex flex-col gap-2">
          <Label>Descripción</Label>
          <Textarea
            rows={4}
            value={draft.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="Detalles, acuerdos o pendientes…"
          />
        </FormField>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span id={subtasksLabelId} className="text-sm font-medium text-foreground">
              Subtareas
            </span>
            {templateTitles.length > 0 ? (
              <Button
                type="button"
                variant="link"
                size="sm"
                onClick={() => update({ subtasks: applyTemplate(subtasks, templateTitles) })}
              >
                Usar plantilla del tramo
              </Button>
            ) : null}
          </div>
          {subtasks.length > 0 ? (
            <ul aria-labelledby={subtasksLabelId} className="flex flex-col gap-2">
              {subtasks.map((value, index) => (
                <li key={index} className="flex items-center gap-2">
                  <Input
                    aria-label={`Subtarea ${index + 1}`}
                    value={value}
                    onChange={(e) => update({ subtasks: subtasks.map((s, i) => (i === index ? e.target.value : s)) })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar subtarea ${index + 1}`}
                    onClick={() => update({ subtasks: subtasks.filter((_, i) => i !== index) })}
                  >
                    <X aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <div>
            <Button type="button" variant="outline" size="sm" onClick={() => update({ subtasks: [...subtasks, ""] })}>
              <Plus aria-hidden="true" />
              Agregar subtarea
            </Button>
          </div>
        </div>
      </div>
    </FormDialog>
  );
}
