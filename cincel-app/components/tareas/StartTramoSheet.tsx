"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Label } from "@/components/ui/shadcn/label";
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
import { previewStartTramoAction, startTramoAction } from "@/lib/actions/tramo-start-actions";
import type {
  Staff,
  StaffCandidate,
  StartTramoAssignment,
  StartTramoInput,
  StartTramoPreview,
  StartTramoResult,
  WorkflowRef,
} from "@/lib/types/core";

import { actionErrorText } from "@/lib/errors";

export interface StartTramoSheetProps {
  open: boolean;
  projectId: string | null;
  /** The tramo of the page. */
  workflow: WorkflowRef;
  viewerId: string;
  /** Shows the auto-start checkbox. */
  isAdmin: boolean;
  staff: Array<Staff & { suggested: boolean }>;
  onClose: () => void;
  /** The parent refreshes and shows the toast. */
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

function staffName(member: Staff): string {
  return [member.name, member.lastName].filter(Boolean).join(" ");
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

/** Iniciar tramo sheet (FE §3.3, §4.3). */
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
  const [preview, setPreview] = useState<StartTramoPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [checkedPhaseIds, setCheckedPhaseIds] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<AssignmentMode>(isAdmin ? "by_phase" : "self");
  const [managers, setManagers] = useState<Record<string, string | null>>({});
  const [autoStart, setAutoStart] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !projectId) return;
    let cancelled = false;
    // A fresh form every time the sheet opens for a project.
    /* eslint-disable react-hooks/set-state-in-effect */
    setPreview(null);
    setLoading(true);
    setLoadError(false);
    setError("");
    setMode(isAdmin ? "by_phase" : "self");
    /* eslint-enable react-hooks/set-state-in-effect */
    previewStartTramoAction(projectId, workflow.id)
      .then((next) => {
        if (cancelled) return;
        const phases = pendingPhases(next);
        setPreview(next);
        setCheckedPhaseIds(new Set(phases.map((p) => p.phase.id)));
        setManagers(
          Object.fromEntries(phases.map((p) => [p.phase.id, sortCandidates(p.candidates)[0]?.id ?? null])),
        );
        setAutoStart(next.autoStart);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, projectId, workflow.id, isAdmin, reloadKey]);

  const phases = useMemo(() => pendingPhases(preview), [preview]);
  const complete = useMemo(() => completePhases(preview), [preview]);
  const count = phases
    .filter((p) => checkedPhaseIds.has(p.phase.id))
    .reduce((sum, p) => sum + p.templates.length, 0);
  const nothingToCreate = Boolean(preview?.alreadyStarted) && phases.length === 0;
  const projectName = preview?.project.name ?? "";
  const title = projectName ? `Iniciar ${workflow.name} · ${projectName}` : `Iniciar ${workflow.name}`;

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
    if (!projectId || !preview || count === 0) return;
    const phaseIds = phases.filter((p) => checkedPhaseIds.has(p.phase.id)).map((p) => p.phase.id);
    const input: StartTramoInput = {
      projectId,
      workflowId: workflow.id,
      phaseIds,
      assignment: buildAssignment(phaseIds),
      ...(isAdmin && autoStart !== preview.autoStart ? { autoStart } : {}),
    };
    setError("");
    startTransition(async () => {
      try {
        const result = await startTramoAction(input);
        onStarted(result);
        onClose();
      } catch (err) {
        setError(actionErrorText(err, { tramoName: workflow.name }));
      }
    });
  }

  function managerSelect(entry: PreviewPhase) {
    const candidates = sortCandidates(entry.candidates);
    const candidateIds = new Set(candidates.map((c) => c.id));
    const others = staff
      .filter((s) => s.active && !candidateIds.has(s.id))
      .sort((a, b) => staffName(a).localeCompare(staffName(b), "es"));
    const items: Record<string, string> = { [UNASSIGNED]: "Sin asignar" };
    for (const c of candidates) items[c.id] = c.name;
    for (const s of others) items[s.id] = staffName(s);
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
                    {staffName(s)}
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
    if (loading) {
      return (
        <div className="space-y-3" data-testid="start-tramo-loading">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      );
    }
    if (loadError) {
      return (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-2">
            <span>No se pudo cargar la plantilla de {workflow.name}.</span>
            <Button type="button" size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      );
    }
    if (!preview) return null;
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
          <ul className="space-y-3">
            {phases.map((entry) => {
              const checked = checkedPhaseIds.has(entry.phase.id);
              const checkboxId = `start-tramo-phase-${entry.phase.id}`;
              return (
                <li key={entry.phase.id}>
                  <div className="flex items-start gap-2">
                    <Checkbox
                      id={checkboxId}
                      aria-label={`${entry.phase.name} · ${entry.templates.length} tareas`}
                      checked={checked}
                      onCheckedChange={(next) => togglePhase(entry.phase.id, next === true)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 space-y-0.5">
                      <Label htmlFor={checkboxId}>
                        {entry.phase.name} · {entry.templates.length} tareas
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {sampleTasksText(entry.templates.map((t) => t.title))}
                      </p>
                      <p className="text-xs text-muted-foreground">{candidatesText(entry.candidates)}</p>
                    </div>
                  </div>
                  {mode === "by_phase" && checked ? managerSelect(entry) : null}
                </li>
              );
            })}
          </ul>
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
              <RadioGroupItem value="self" aria-label="Asignarme todas" />
              Asignarme todas
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <RadioGroupItem value="by_phase" aria-label="Por fase con candidatos" />
              Por fase con candidatos
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <RadioGroupItem value="none" aria-label="Sin asignar" />
              Sin asignar
            </label>
          </RadioGroup>
          {mode === "self" && viewerId && staffById.get(viewerId) ? (
            <p className="text-xs text-muted-foreground">
              Responsable: {staffName(staffById.get(viewerId) as Staff)}
            </p>
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
    <Sheet open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <SheetContent side="right" className="overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>Elige las fases contratadas y quién las hará.</SheetDescription>
        </SheetHeader>

        <div className="px-4">{body()}</div>

        <SheetFooter>
          {nothingToCreate || loadError ? (
            <Button type="button" variant="outline" onClick={onClose}>
              Cerrar
            </Button>
          ) : (
            <>
              <Button type="button" disabled={!preview || count === 0 || isPending} onClick={submit}>
                {isPending ? "Creando…" : `Crear ${count} tareas`}
              </Button>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
