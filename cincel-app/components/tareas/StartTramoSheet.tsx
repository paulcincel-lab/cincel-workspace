"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Label } from "@/components/ui/shadcn/label";
import { PhaseChecklist } from "@/components/tareas/PhaseChecklist";
import { RadioGroup, RadioGroupItem } from "@/components/ui/shadcn/radio-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/shadcn/sheet";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { startTramoAction } from "@/lib/actions/tramo-start-actions";
import { useActionMutation } from "@/lib/query/mutation";
import { startTramoPreviewOptions, tramoStartInvalidations } from "@/lib/query/options/tareas";
import type {
  StaffCandidate,
  StartTramoAssignment,
  StartTramoInput,
  StartTramoPreview,
  StartTramoResult,
  WorkflowRef,
} from "@/lib/types/core";
import type { StartSlotCandidate } from "@/lib/types/tareas-start-slot";

export interface StartTramoSheetProps {
  open: boolean;
  projectId: string | null;
  /** The tramo of the page. */
  workflow: WorkflowRef;
  viewerId: string;
  /** Shows the auto-start checkbox. */
  isAdmin: boolean;
  /** Active staff `{id,name,suggested}` from the start slot (`qk.tareas.startSlot`). */
  staff: StartSlotCandidate[];
  onClose: () => void;
  /** The parent shows the toast; the start mutation already invalidated the caches. */
  onStarted: (result: StartTramoResult) => void;
}

export type AssignmentMode = StartTramoAssignment["mode"];

/** Select sentinel for "Sin asignar" (Select items can't be empty strings). */
const UNASSIGNED = "__none__";
const SAMPLE_COUNT = 3;

type PreviewPhase = StartTramoPreview["phases"][number];

/** "Planos de conjunto, Fachadas, Cortes y 4 más". */
export function sampleTasksText(titles: string[]): string {
  const shown = titles.slice(0, SAMPLE_COUNT).join(", ");
  const rest = titles.length - SAMPLE_COUNT;
  return rest > 0 ? `${shown} y ${rest} más` : shown;
}

/** Candidates sorted by lower open-task load, then name. */
export function sortCandidates(candidates: StaffCandidate[]): StaffCandidate[] {
  return [...candidates].sort((a, b) => a.openTasks - b.openTasks || a.name.localeCompare(b.name, "es"));
}

/** "Candidatos: Ana López (Proyectista ejecutivo), Luis P." or "Sin candidatos". */
export function candidatesText(candidates: StaffCandidate[]): string {
  if (candidates.length === 0) return "Sin candidatos";
  const names = sortCandidates(candidates).map((c) =>
    c.positions.length > 0 ? `${c.name} (${c.positions.join(", ")})` : c.name,
  );
  return `Candidatos: ${names.join(", ")}`;
}

function pendingPhases(preview: StartTramoPreview | null): PreviewPhase[] {
  if (!preview) return [];
  return [...preview.phases]
    .filter((p) => p.templates.length > 0)
    .sort((a, b) => a.phase.sortOrder - b.phase.sortOrder);
}

function completePhases(preview: StartTramoPreview | null): PreviewPhase[] {
  if (!preview) return [];
  return [...preview.phases]
    .filter((p) => p.templates.length === 0 && p.existing > 0)
    .sort((a, b) => a.phase.sortOrder - b.phase.sortOrder);
}

/**
 * Iniciar tramo sheet (FE §3.3, §4.3). The preview is a query
 * (`qk.tareas.startPreview`, staleTime 0) enabled while the sheet is open, so
 * every opening reflects the current board; "Crear N tareas" is a mutation
 * that invalidates the start slot, Tareas, the project and Inicio
 * (`tramoStartInvalidations`). The form (fases, mode, managers, autoStart)
 * stays local and starts fresh each time the sheet opens.
 */
export function StartTramoSheet({
  open,
  projectId,
  workflow,
  viewerId,
  isAdmin,
  staff,
  onClose,
  onStarted,
}: StartTramoSheetProps) {
  const [error, setError] = useState("");
  const start = useActionMutation<StartTramoInput, StartTramoResult>(startTramoAction, {
    // A failed start writes nothing: keep the screen (and the form) as it is.
    invalidate: (vars, data) => (data ? tramoStartInvalidations(vars) : []),
    errorContext: { tramoName: workflow.name },
    onFormError: setError,
  });
  const previewQuery = useQuery({
    ...startTramoPreviewOptions(projectId ?? "", workflow.id),
    enabled: open && Boolean(projectId),
  });
  // Every opening (and "Reintentar") waits for a fresh preview; the refetch a
  // successful start triggers keeps the form on screen until the sheet closes.
  const loading = previewQuery.isFetching && !start.isPending;
  const preview = !loading && previewQuery.isSuccess ? previewQuery.data : null;
  const loadError = !loading && previewQuery.isError;

  const projectName = preview?.project.name ?? "";
  const title = projectName ? `Iniciar ${workflow.name} · ${projectName}` : `Iniciar ${workflow.name}`;

  function close() {
    setError("");
    onClose();
  }

  function submit(input: StartTramoInput) {
    setError("");
    start.mutate(input, {
      onSuccess: (result) => {
        onStarted(result);
        close();
      },
    });
  }

  return (
    <Sheet open={open} onOpenChange={(next) => (!next ? close() : undefined)}>
      <SheetContent side="right" className="overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>Elige las fases contratadas y quién las hará.</SheetDescription>
        </SheetHeader>

        {preview && projectId ? (
          <StartTramoForm
            key={projectId}
            preview={preview}
            projectId={projectId}
            workflow={workflow}
            viewerId={viewerId}
            isAdmin={isAdmin}
            staff={staff}
            error={error}
            pending={start.isPending}
            onSubmit={submit}
            onClose={close}
          />
        ) : (
          <>
            <div className="px-4">
              {loading ? (
                <div className="space-y-3" data-testid="start-tramo-loading">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : loadError ? (
                <Alert variant="destructive">
                  <AlertDescription className="flex items-center justify-between gap-2">
                    <span>No se pudo cargar la plantilla de {workflow.name}.</span>
                    <Button type="button" size="sm" variant="outline" onClick={() => void previewQuery.refetch()}>
                      Reintentar
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
            <SheetFooter>
              {loadError ? (
                <Button type="button" variant="outline" onClick={close}>
                  Cerrar
                </Button>
              ) : (
                <>
                  <Button type="button" disabled>
                    Crear 0 tareas
                  </Button>
                  <Button type="button" variant="outline" onClick={close}>
                    Cancelar
                  </Button>
                </>
              )}
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

type StartTramoFormProps = {
  preview: StartTramoPreview;
  projectId: string;
  workflow: WorkflowRef;
  viewerId: string;
  isAdmin: boolean;
  staff: StartSlotCandidate[];
  error: string;
  pending: boolean;
  onSubmit: (input: StartTramoInput) => void;
  onClose: () => void;
};

/** The sheet's form for one loaded preview; its defaults come from that preview. */
function StartTramoForm({
  preview,
  projectId,
  workflow,
  viewerId,
  isAdmin,
  staff,
  error,
  pending,
  onSubmit,
  onClose,
}: StartTramoFormProps) {
  const phases = useMemo(() => pendingPhases(preview), [preview]);
  const complete = useMemo(() => completePhases(preview), [preview]);
  const [checkedPhaseIds, setCheckedPhaseIds] = useState<Set<string>>(() => new Set(phases.map((p) => p.phase.id)));
  const [mode, setMode] = useState<AssignmentMode>(isAdmin ? "by_phase" : "self");
  const [managers, setManagers] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(phases.map((p) => [p.phase.id, sortCandidates(p.candidates)[0]?.id ?? null])),
  );
  const [autoStart, setAutoStart] = useState(() => preview.autoStart);

  const count = phases
    .filter((p) => checkedPhaseIds.has(p.phase.id))
    .reduce((sum, p) => sum + p.templates.length, 0);
  const nothingToCreate = preview.alreadyStarted && phases.length === 0;
  const projectName = preview.project.name;

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  function togglePhase(phaseId: string, checked: boolean) {
    setCheckedPhaseIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(phaseId);
      else next.delete(phaseId);
      return next;
    });
  }

  function buildAssignment(phaseIds: string[]): StartTramoAssignment {
    if (mode === "by_phase") {
      return { mode, managers: Object.fromEntries(phaseIds.map((id) => [id, managers[id] ?? null])) };
    }
    return { mode };
  }

  function submit() {
    if (count === 0 || pending) return;
    const phaseIds = phases.filter((p) => checkedPhaseIds.has(p.phase.id)).map((p) => p.phase.id);
    onSubmit({
      projectId,
      workflowId: workflow.id,
      phaseIds,
      assignment: buildAssignment(phaseIds),
      ...(isAdmin && autoStart !== preview.autoStart ? { autoStart } : {}),
    });
  }

  function managerSelect(entry: PreviewPhase) {
    const candidates = sortCandidates(entry.candidates);
    const candidateIds = new Set(candidates.map((c) => c.id));
    const others = staff
      .filter((s) => !candidateIds.has(s.id))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
    const items: Record<string, string> = { [UNASSIGNED]: "Sin asignar" };
    for (const c of candidates) items[c.id] = c.name;
    for (const s of others) items[s.id] = s.name;
    const value = managers[entry.phase.id] ?? UNASSIGNED;
    const fieldId = `start-tramo-manager-${entry.phase.id}`;
    return (
      <div className="mt-2 space-y-1 pl-6">
        <Label htmlFor={fieldId} className="text-xs text-muted-foreground">
          Responsable de {entry.phase.name}
        </Label>
        <Select
          items={items}
          value={value}
          onValueChange={(next) =>
            setManagers((prev) => ({
              ...prev,
              [entry.phase.id]: !next || next === UNASSIGNED ? null : (next as string),
            }))
          }
        >
          <SelectTrigger id={fieldId} aria-label={`Responsable de ${entry.phase.name}`} className="w-full">
            <SelectValue placeholder="Sin asignar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Sin asignar</SelectItem>
            {candidates.length > 0 ? (
              <SelectGroup>
                <SelectLabel>Candidatos</SelectLabel>
                {candidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
            {others.length > 0 ? (
              <SelectGroup>
                <SelectLabel>Todo el equipo</SelectLabel>
                {others.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
          </SelectContent>
        </Select>
      </div>
    );
  }

  function body() {
    if (nothingToCreate) {
      return (
        <Alert>
          <AlertDescription>
            {workflow.name} ya está iniciado en {projectName} y no hay tareas nuevas que crear.
          </AlertDescription>
        </Alert>
      );
    }
    return (
      <div className="space-y-6">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium text-foreground">Fases</legend>
          {phases.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este tramo no tiene tareas de plantilla.</p>
          ) : null}
          <PhaseChecklist
            idPrefix="start-tramo-phase-"
            checkedIds={checkedPhaseIds}
            onToggle={togglePhase}
            phases={phases.map((entry) => ({
              id: entry.phase.id,
              label: `${entry.phase.name} · ${entry.templates.length} tareas`,
              details: (
                <>
                  <p className="text-xs text-muted-foreground">
                    {sampleTasksText(entry.templates.map((t) => t.title))}
                  </p>
                  <p className="text-xs text-muted-foreground">{candidatesText(entry.candidates)}</p>
                </>
              ),
              extra: mode === "by_phase" && checkedPhaseIds.has(entry.phase.id) ? managerSelect(entry) : null,
            }))}
          />
          {complete.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Ya tienen sus tareas: {complete.map((p) => p.phase.name).join(", ")}.
            </p>
          ) : null}
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium text-foreground">Asignación</legend>
          <RadioGroup value={mode} onValueChange={(next) => setMode(next as AssignmentMode)}>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <RadioGroupItem value="self" />
              Asignarme todas
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <RadioGroupItem value="by_phase" />
              Por fase con candidatos
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <RadioGroupItem value="none" />
              Sin asignar
            </label>
          </RadioGroup>
          {mode === "self" && viewerId && staffById.get(viewerId) ? (
            <p className="text-xs text-muted-foreground">Responsable: {staffById.get(viewerId)?.name}</p>
          ) : null}
        </fieldset>

        {isAdmin ? (
          <div className="space-y-1">
            <div className="flex items-start gap-2">
              <Checkbox
                id="start-tramo-auto-start"
                aria-label={`Iniciar ${workflow.name} automáticamente en los próximos proyectos`}
                checked={autoStart}
                onCheckedChange={(next) => setAutoStart(next === true)}
                className="mt-0.5"
              />
              <Label htmlFor="start-tramo-auto-start">
                Iniciar {workflow.name} automáticamente en los próximos proyectos
              </Label>
            </div>
            <p className="pl-6 text-xs text-muted-foreground">Cambia la configuración para todo el despacho.</p>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <>
      <div className="px-4">{body()}</div>

      <SheetFooter>
        {nothingToCreate ? (
          <Button type="button" variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        ) : (
          <>
            <Button type="button" disabled={count === 0 || pending} onClick={submit}>
              {pending ? "Creando…" : `Crear ${count} tareas`}
            </Button>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
          </>
        )}
      </SheetFooter>
    </>
  );
}
