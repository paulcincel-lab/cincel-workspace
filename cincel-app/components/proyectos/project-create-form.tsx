"use client";

import { useState } from "react";

import { Input } from "@/components/ui/shadcn/input";
import { FormField } from "@/components/ui/shadcn/form-field";
import { Label } from "@/components/ui/shadcn/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/shadcn/select";
import { ProjectAdminFields, projectAdminPatch, type ProjectAdminValue } from "@/components/proyectos/ProjectAdminFields";
import { PhaseChecklist } from "@/components/tareas/PhaseChecklist";
import type { ProjectCreateInput, ProjectCreateStartOptions } from "@/lib/types/core";

/**
 * The client and staff lists the admin-only fields (Cliente, Origen, "Quién
 * trajo el proyecto") choose from. Passed only for viewers with
 * `canSeeAdminData`; without it the form asks for the name only.
 */
export type ProjectCreateAdminOptions = {
  clients: Array<{ id: string; name: string }>;
  staff: Array<{ id: string; name: string }>;
};

export interface ProjectCreateFormProps {
  /**
   * Creates the project. `admin` is passed only when `adminOptions` is set:
   * the trimmed Cliente / Origen / "Quién trajo el proyecto" values, saved
   * after the create through `updateProjectAction`.
   */
  onConfirm: (input: ProjectCreateInput, admin?: ProjectAdminValue) => Promise<void>;
  /** Presale starts on its own when a project is created (first tramo set to `on_create`). */
  presaleAutoStart: boolean;
  /** Admins only: shows the optional client and origin fields under the name. */
  adminOptions?: ProjectCreateAdminOptions | null;
  /**
   * Staff who can start tramos (#1034): shows "Tramo inicial" under the
   * name. Without it (or until it loads) the create sends the name only and
   * the server's default applies.
   */
  startOptions?: ProjectCreateStartOptions | null;
}

const EMPTY_NAME = "El nombre del proyecto es obligatorio.";
const NO_PHASES = "Elige al menos una fase.";
/** Select sentinel for "Ninguno" (Select items can't be empty strings). */
const NO_TRAMO = "__none__";
const EMPTY_ADMIN: ProjectAdminValue = { clientId: null, origin: null, originStaffId: null };

/** Spanish copy for the codes `createProjectAction` throws. */
export function friendlyCreateError(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  if (message.startsWith("NAME_TAKEN")) return "Ya existe un proyecto con ese nombre.";
  if (message.startsWith("EMPTY")) return EMPTY_NAME;
  if (message.startsWith("FORBIDDEN")) return "No tienes permiso para crear proyectos.";
  return "No se pudo crear el proyecto. Intenta de nuevo.";
}

/** The create form's description: Presale auto-start is mentioned only while it is on. */
export function projectCreateDescription(presaleAutoStart: boolean): string {
  return presaleAutoStart ? "Solo necesitas el nombre. Presale se inicia automáticamente." : "Solo necesitas el nombre.";
}

/**
 * The tramo and fases the create starts with. `workflowId` undefined = the
 * default (`startOptions.defaultWorkflowId`); `uncheckedPhaseIds` empty =
 * every fase checked.
 */
export type ProjectStartChoice = { workflowId?: string | null; uncheckedPhaseIds: ReadonlySet<string> };

const UNTOUCHED_START: ProjectStartChoice = { uncheckedPhaseIds: new Set() };

/** The tramo the form shows: the picked one, else the default. */
export function selectedStartTramo(options: ProjectCreateStartOptions, choice: ProjectStartChoice) {
  const id = choice.workflowId === undefined ? options.defaultWorkflowId : choice.workflowId;
  return id ? (options.tramos.find((t) => t.id === id) ?? null) : null;
}

/**
 * The start fields of the create input: none while the choice is untouched
 * (the server's default, same as before #1034), `{ startWorkflowId: null }`
 * for "Ninguno", else the tramo and its checked fases. `NO_PHASES` when a
 * tramo with fases has none checked.
 */
export function projectStartInput(
  options: ProjectCreateStartOptions | null | undefined,
  choice: ProjectStartChoice
): Pick<ProjectCreateInput, "startWorkflowId" | "phaseIds"> | "NO_PHASES" {
  if (!options || (choice.workflowId === undefined && choice.uncheckedPhaseIds.size === 0)) return {};
  const tramo = selectedStartTramo(options, choice);
  if (!tramo) return { startWorkflowId: null };
  const phaseIds = tramo.phases.filter((p) => !choice.uncheckedPhaseIds.has(p.id)).map((p) => p.id);
  if (tramo.phases.length > 0 && phaseIds.length === 0) return "NO_PHASES";
  return { startWorkflowId: tramo.id, phaseIds };
}

/**
 * State and submit of `NewProjectDialog`'s create form (redesign FE §3.5).
 * `submit` validates the name, calls `onConfirm` and maps a rejection to copy
 * with `toErrorText`; it resolves `true` once `onConfirm` succeeded.
 */
export function useProjectCreateForm({
  onConfirm,
  adminOptions,
  startOptions,
  toErrorText = friendlyCreateError,
}: Pick<ProjectCreateFormProps, "onConfirm" | "adminOptions" | "startOptions"> & {
  toErrorText?: (err: unknown) => string;
}) {
  const [name, setNameState] = useState("");
  const [admin, setAdmin] = useState<ProjectAdminValue>(EMPTY_ADMIN);
  const [start, setStartState] = useState<ProjectStartChoice>(UNTOUCHED_START);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function setName(value: string) {
    setNameState(value);
    if (error) setError("");
  }

  function setStart(value: ProjectStartChoice) {
    setStartState(value);
    if (error) setError("");
  }

  function reset() {
    setNameState("");
    setAdmin(EMPTY_ADMIN);
    setStartState(UNTOUCHED_START);
    setError("");
    setSaving(false);
  }

  async function submit(): Promise<boolean> {
    if (saving) return false;
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(EMPTY_NAME);
      return false;
    }
    const startInput = projectStartInput(startOptions, start);
    if (startInput === "NO_PHASES") {
      setError(NO_PHASES);
      return false;
    }
    setError("");
    setSaving(true);
    const input: ProjectCreateInput = { name: trimmedName, ...startInput };
    try {
      if (adminOptions) await onConfirm(input, projectAdminPatch(admin));
      else await onConfirm(input);
      // Stays "Creando…" while the caller closes the form and navigates.
      return true;
    } catch (err) {
      setError(toErrorText(err));
      setSaving(false);
      return false;
    }
  }

  return { name, setName, admin, setAdmin, start, setStart, error, saving, submit, reset };
}

export type ProjectCreateForm = ReturnType<typeof useProjectCreateForm>;

/**
 * "Tramo inicial" (#1034): the active tramos plus "Ninguno", and the picked
 * tramo's fases as checkboxes (the Iniciar tramo sheet's `PhaseChecklist`),
 * all checked by default. The tasks stay unassigned.
 */
export function ProjectStartFields({
  options,
  value,
  onChange,
}: {
  options: ProjectCreateStartOptions;
  value: ProjectStartChoice;
  onChange: (value: ProjectStartChoice) => void;
}) {
  const tramo = selectedStartTramo(options, value);
  const items: Record<string, string> = {
    ...Object.fromEntries(options.tramos.map((t) => [t.id, t.name])),
    [NO_TRAMO]: "Ninguno",
  };

  function toggle(phaseId: string, checked: boolean) {
    const next = new Set(value.uncheckedPhaseIds);
    if (checked) next.delete(phaseId);
    else next.add(phaseId);
    onChange({ ...value, uncheckedPhaseIds: next });
  }

  return (
    <>
      <FormField>
        <Label htmlFor="project-start-tramo" className="block text-sm font-normal text-muted-foreground">
          Tramo inicial
        </Label>
        <Select
          items={items}
          value={tramo?.id ?? NO_TRAMO}
          onValueChange={(next) =>
            onChange({
              workflowId: !next || next === NO_TRAMO ? null : (next as string),
              uncheckedPhaseIds: new Set(),
            })
          }
        >
          <SelectTrigger id="project-start-tramo" className="mt-1 w-full" aria-describedby="project-start-tramo-hint">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.tramos.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
            <SelectItem value={NO_TRAMO}>Ninguno</SelectItem>
          </SelectContent>
        </Select>
        <p id="project-start-tramo-hint" className="mt-1 text-xs text-muted-foreground">
          {tramo ? "Las tareas se crean sin asignar." : "El proyecto queda en Sin tramo; puedes iniciarlo después."}
        </p>
      </FormField>
      {tramo && tramo.phases.length > 0 ? (
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium text-foreground">Fases</legend>
          <PhaseChecklist
            idPrefix="project-start-phase-"
            checkedIds={new Set(tramo.phases.filter((p) => !value.uncheckedPhaseIds.has(p.id)).map((p) => p.id))}
            onToggle={toggle}
            phases={tramo.phases.map((p) => ({ id: p.id, label: `${p.name} · ${p.templateCount} tareas` }))}
          />
        </fieldset>
      ) : null}
    </>
  );
}

/**
 * The create form's fields: the name, "Tramo inicial" when `startOptions` is
 * set, and the admin-only fields when `adminOptions` is set.
 */
export function ProjectCreateFields({
  form,
  adminOptions,
  startOptions,
}: {
  form: ProjectCreateForm;
  adminOptions?: ProjectCreateAdminOptions | null;
  startOptions?: ProjectCreateStartOptions | null;
}) {
  // The dialog shows the error in its own alert.
  return (
    <>
      <FormField>
        <Label className="block text-sm font-normal text-muted-foreground">Nombre del proyecto</Label>
        <Input
          value={form.name}
          onChange={(event) => form.setName(event.target.value)}
          className="mt-1"
          autoFocus
          aria-invalid={form.error ? true : undefined}
        />
      </FormField>
      {startOptions ? <ProjectStartFields options={startOptions} value={form.start} onChange={form.setStart} /> : null}
      {adminOptions ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <ProjectAdminFields
            value={form.admin}
            onChange={form.setAdmin}
            clients={adminOptions.clients}
            staff={adminOptions.staff}
            projectHasClient={false}
          />
        </div>
      ) : null}
    </>
  );
}
