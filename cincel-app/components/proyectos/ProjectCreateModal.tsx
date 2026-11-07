"use client";

import { useId, useState, type FormEvent } from "react";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/shadcn/sheet";
import { Button } from "@/components/ui/shadcn/button";
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

export interface ProjectCreateModalProps {
  onClose: () => void;
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
 * State and submit of the create form, shared by the legacy sheet and the
 * redesign `NewProjectDialog` (FE §4.11.1: the dialog extends this component).
 * `submit` validates the name, calls `onConfirm` and maps a rejection to copy
 * with `toErrorText`; it resolves `true` once `onConfirm` succeeded.
 */
export function useProjectCreateForm({
  onConfirm,
  adminOptions,
  toErrorText = friendlyCreateError,
}: Pick<ProjectCreateModalProps, "onConfirm" | "adminOptions"> & { toErrorText?: (err: unknown) => string }) {
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
  errorId,
}: {
  form: ProjectCreateForm;
  adminOptions?: ProjectCreateAdminOptions | null;
  /** Set when the error is shown under the field (sheet); the dialog shows it in its own alert. */
  errorId?: string;
}) {
  const showInlineError = Boolean(errorId && form.error);
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
          aria-describedby={showInlineError ? errorId : undefined}
        />
        {showInlineError ? (
          <p id={errorId} className="mt-1 text-sm text-destructive">
            {form.error}
          </p>
        ) : null}
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

/**
 * Sheet for creating a project. A project starts with its name only: client,
 * tipo, encargado and fechas are edited later in the ficha.
 */
export function ProjectCreateModal({ onClose, onConfirm, presaleAutoStart, adminOptions }: ProjectCreateModalProps) {
  const form = useProjectCreateForm({ onConfirm, adminOptions });
  const errorId = useId();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await form.submit();
  }

  return (
    <Sheet open onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent className="overflow-y-auto">
        <form onSubmit={handleSubmit} noValidate className="flex flex-1 flex-col">
          <SheetHeader>
            <SheetTitle className="text-lg">Nuevo proyecto</SheetTitle>
            <SheetDescription>{projectCreateDescription(presaleAutoStart)}</SheetDescription>
          </SheetHeader>

          <div className="flex-1 space-y-4 px-6 py-4">
            <ProjectCreateFields form={form} adminOptions={adminOptions} errorId={errorId} />
          </div>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={form.saving}>
              {form.saving ? "Creando…" : "Crear proyecto"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
