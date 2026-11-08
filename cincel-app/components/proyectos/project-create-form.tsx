"use client";

import { useState } from "react";

import { Input } from "@/components/ui/shadcn/input";
import { FormField } from "@/components/ui/shadcn/form-field";
import { Label } from "@/components/ui/shadcn/label";
import { ProjectAdminFields, projectAdminPatch, type ProjectAdminValue } from "@/components/proyectos/ProjectAdminFields";
import type { ProjectCreateInput } from "@/lib/types/core";

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
}

const EMPTY_NAME = "El nombre del proyecto es obligatorio.";
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
 * State and submit of `NewProjectDialog`'s create form (redesign FE §3.5).
 * `submit` validates the name, calls `onConfirm` and maps a rejection to copy
 * with `toErrorText`; it resolves `true` once `onConfirm` succeeded.
 */
export function useProjectCreateForm({
  onConfirm,
  adminOptions,
  toErrorText = friendlyCreateError,
}: Pick<ProjectCreateFormProps, "onConfirm" | "adminOptions"> & { toErrorText?: (err: unknown) => string }) {
  const [name, setNameState] = useState("");
  const [admin, setAdmin] = useState<ProjectAdminValue>(EMPTY_ADMIN);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function setName(value: string) {
    setNameState(value);
    if (error) setError("");
  }

  function reset() {
    setNameState("");
    setAdmin(EMPTY_ADMIN);
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
    setError("");
    setSaving(true);
    try {
      if (adminOptions) await onConfirm({ name: trimmedName }, projectAdminPatch(admin));
      else await onConfirm({ name: trimmedName });
      // Stays "Creando…" while the caller closes the form and navigates.
      return true;
    } catch (err) {
      setError(toErrorText(err));
      setSaving(false);
      return false;
    }
  }

  return { name, setName, admin, setAdmin, error, saving, submit, reset };
}

export type ProjectCreateForm = ReturnType<typeof useProjectCreateForm>;

/** The create form's fields: the name, plus the admin-only fields when `adminOptions` is set. */
export function ProjectCreateFields({
  form,
  adminOptions,
}: {
  form: ProjectCreateForm;
  adminOptions?: ProjectCreateAdminOptions | null;
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
