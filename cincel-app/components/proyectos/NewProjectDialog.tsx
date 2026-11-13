"use client";

import { FormDialog } from "@/components/patterns/FormDialog";
import { actionErrorCode, actionErrorText } from "@/lib/errors";

import {
  ProjectCreateFields,
  projectCreateDescription,
  useProjectCreateForm,
  type ProjectCreateFormProps,
} from "./project-create-form";

export type NewProjectDialogProps = ProjectCreateFormProps & {
  open: boolean;
  onOpenChange(open: boolean): void;
};

/** Error copy of the create: the §9 codes, with the project wording for `NAME_TAKEN` and the starting tramo's fases. */
export function newProjectErrorText(err: unknown): string {
  if (actionErrorCode(err) === "PHASE_MISMATCH") return "Una de las fases ya no pertenece a la etapa elegida. Vuelve a elegirlas.";
  return actionErrorText(err, { entity: "project" });
}

/**
 * "Nuevo proyecto" (redesign FE §3.5, frame `NuevoProyecto`): the create form
 * (`useProjectCreateForm`, `ProjectCreateFields`) on `FormDialog`.
 * Project Flow fields: the name, "Tramo inicial" when `startOptions` is
 * given (staff who can start tramos, #1034), plus Cliente, Origen and "Quién
 * trajo el proyecto" when `adminOptions` is given (admins only). Ignores the
 * presentation style. Closes itself after a successful create; the caller's
 * `onConfirm` decides where to go next.
 */
export function NewProjectDialog({
  open,
  onOpenChange,
  onConfirm,
  presaleAutoStart,
  adminOptions,
  startOptions,
}: NewProjectDialogProps) {
  const form = useProjectCreateForm({ onConfirm, adminOptions, startOptions, toErrorText: newProjectErrorText });

  function handleOpenChange(next: boolean) {
    if (!next) form.reset();
    onOpenChange(next);
  }

  async function handleSubmit() {
    const created = await form.submit();
    if (created) handleOpenChange(false);
  }

  return (
    <FormDialog
      title="Nuevo proyecto"
      description={projectCreateDescription(presaleAutoStart)}
      open={open}
      onOpenChange={handleOpenChange}
      onSubmit={handleSubmit}
      submitLabel={form.saving ? "Creando…" : "Crear proyecto"}
      pending={form.saving}
      error={form.error || null}
      size={adminOptions ? "lg" : "md"}
    >
      <div className="flex flex-col gap-4">
        <ProjectCreateFields form={form} adminOptions={adminOptions} startOptions={startOptions} />
      </div>
    </FormDialog>
  );
}
