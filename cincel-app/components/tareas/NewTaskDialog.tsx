"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";

import { FormDialog } from "@/components/patterns/FormDialog";
import { Button } from "@/components/ui/shadcn/button";
import { FormField } from "@/components/ui/shadcn/form-field";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/shadcn/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { fetchProjectsAction } from "@/lib/actions/projects-actions";
import { fetchAssignableStaffAction } from "@/lib/actions/staff-actions";
import { createSubtaskAction, createUserTaskAction } from "@/lib/actions/tasks-actions";
import { fetchWorkflowsAction } from "@/lib/actions/workflows-actions";
import { actionErrorText } from "@/lib/errors";
import type { ProjectListItem, TaskPriority, WorkflowDetail } from "@/lib/types/core";
import type { StaffOption } from "@/lib/types/redesign";
import {
  PRIORITY_OPTIONS,
  applyTemplate,
  hasErrors,
  initialDraft,
  resolvePhaseId,
  resolveProjectId,
  resolveWorkflowId,
  toSubtaskInputs,
  toUserTaskInput,
  tramoFases,
  tramoTemplateTitles,
  validateDraft,
  type DraftErrors,
  type NewTaskDraft,
} from "./new-task-form";
import { useNewTaskParam } from "./use-new-task-param";

export type NewTaskDialogProps = {
  open: boolean;
  onOpenChange(open: boolean): void;
  defaults?: { projectId?: string; tramoKey?: string; title?: string; description?: string };
};

/** Select value for "Sin responsable" (Select items can't carry null). */
const NO_MANAGER = "__none__";

type ProjectChoice = Pick<ProjectListItem, "id" | "name" | "currentWorkflowId">;

type Catalog = { projects: ProjectChoice[]; workflows: WorkflowDetail[] };

function staffLabel(member: StaffOption): string {
  return [member.name, member.lastName].filter(Boolean).join(" ");
}

/**
 * New task dialog (redesign FE §3.4, frame `NuevaTarea`): extends
 * `NewTaskModal` on `FormDialog`. Título, Proyecto, Tramo, Fase (the tramo's
 * catalog; hidden when it has none), Responsable, Fecha de entrega, Prioridad,
 * Descripción and Subtareas ("Usar plantilla del tramo"). "Crear tarea" calls
 * `createUserTaskAction`, then `createSubtaskAction` per subtarea, and
 * refreshes the open view.
 */
export function NewTaskDialog({ open, onOpenChange, defaults }: NewTaskDialogProps) {
  const router = useRouter();
  const ids = useId();
  const [draft, setDraft] = useState<NewTaskDraft>(() => initialDraft(defaults));
  const [tramoPicked, setTramoPicked] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staffList, setStaffList] = useState<StaffOption[]>([]);
  const [errors, setErrors] = useState<DraftErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // Each opening starts a fresh form from `defaults`.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setDraft(initialDraft(defaults));
      setTramoPicked(false);
      setErrors({});
      setSubmitError(null);
      setPending(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([fetchProjectsAction({ status: "activo" }), fetchWorkflowsAction()])
      .then(([projects, workflows]) => {
        if (cancelled) return;
        setCatalog({
          projects: projects.map((p) => ({ id: p.id, name: p.name, currentWorkflowId: p.currentWorkflowId })),
          workflows: workflows.filter((w) => w.active).sort((a, b) => a.sortOrder - b.sortOrder),
        });
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(actionErrorText(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const projects = useMemo(() => catalog?.projects ?? [], [catalog]);
  const workflows = useMemo(() => catalog?.workflows ?? [], [catalog]);
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
  useEffect(() => {
    if (!open || !catalog) return;
    let cancelled = false;
    fetchAssignableStaffAction(workflowId)
      .then((list) => {
        if (!cancelled) setStaffList([...list].sort((a, b) => Number(b.suggested) - Number(a.suggested)));
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(actionErrorText(err));
      });
    return () => {
      cancelled = true;
    };
  }, [open, catalog, workflowId]);

  const managerId = draft.managerId && staffList.some((s) => s.id === draft.managerId) ? draft.managerId : null;

  const update = (patch: Partial<NewTaskDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const resolved = { ...draft, projectId, workflowId, phaseId, managerId };

  const handleSubmit = async () => {
    const nextErrors = validateDraft(resolved, fases);
    setErrors(nextErrors);
    setSubmitError(null);
    if (hasErrors(nextErrors)) return;

    setPending(true);
    let taskId: string;
    try {
      const task = await createUserTaskAction(toUserTaskInput(resolved, fases));
      taskId = task.id;
    } catch (err) {
      setSubmitError(actionErrorText(err));
      setPending(false);
      return;
    }

    // The task exists now: a failed subtarea is reported, not retried, so a
    // second "Crear tarea" can't duplicate the task.
    let subtaskError: unknown = null;
    for (const input of toSubtaskInputs(resolved)) {
      try {
        await createSubtaskAction(taskId, input);
      } catch (err) {
        subtaskError ??= err;
      }
    }

    setPending(false);
    toast.success("Tarea creada");
    if (subtaskError) toast.error(actionErrorText(subtaskError));
    onOpenChange(false);
    router.refresh();
  };

  const loading = open && !catalog && !loadError;
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
            {catalog && projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay proyectos activos disponibles</p>
            ) : (
              <Select
                items={Object.fromEntries(projects.map((p) => [p.id, p.name]))}
                value={projectId}
                onValueChange={(v) =>
                  update({ projectId: (v as string) ?? "", ...(tramoPicked ? {} : { workflowId: null, phaseId: null }) })
                }
                disabled={!catalog}
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
              disabled={!catalog}
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
              items={{ [NO_MANAGER]: "Sin responsable", ...Object.fromEntries(staffList.map((s) => [s.id, staffLabel(s)])) }}
              value={managerId ?? NO_MANAGER}
              onValueChange={(v) => {
                const next = v as string;
                update({ managerId: next && next !== NO_MANAGER ? next : null });
              }}
              disabled={!catalog}
            >
              <SelectTrigger aria-label="Responsable" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_MANAGER}>Sin responsable</SelectItem>
                {staffList.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {staffLabel(s)}
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

/**
 * `NewTaskDialog` driven by the URL: `?nueva=1` opens it and closing removes
 * the param. The view's `proyecto` and `tramo` filters prefill the form.
 */
export function NewTaskDialogRoute({ defaults }: { defaults?: NewTaskDialogProps["defaults"] }) {
  const { open, setOpen } = useNewTaskParam();
  const searchParams = useSearchParams();
  const fromUrl: NewTaskDialogProps["defaults"] = {
    projectId: searchParams.get("proyecto") ?? undefined,
    tramoKey: searchParams.get("tramo") ?? undefined,
    ...defaults,
  };
  return <NewTaskDialog open={open} onOpenChange={setOpen} defaults={fromUrl} />;
}
