"use client";

import { useCallback, useId, useMemo, useState, type ReactNode } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { ConfirmDeleteDialog } from "@/components/widgets/ConfirmDeleteDialog";
import { UNDO_LABEL } from "@/components/widgets/editable-cell";
import type { TableRowAction } from "@/components/widgets/table-rows";
import {
  deleteProjectAction,
  restoreProjectAction,
} from "@/lib/actions/projects-actions";
import { resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { actionErrorCode, actionErrorText } from "@/lib/errors";
import type { ProyectosPageData } from "@/lib/loaders/proyectos";
import { qk } from "@/lib/query/keys";
import {
  projectDeleteInvalidations,
  projectDeletePreviewOptions,
} from "@/lib/query/options/proyectos";
import {
  selectAuthenticatedUser,
  useSessionStore,
} from "@/lib/stores/session-store";

import {
  PROJECT_DELETE_CONFIRM,
  PROJECT_DELETE_DRIVE_NOTE,
  PROJECT_DELETE_LABEL,
  PROJECT_DELETE_NAME_INPUT_LABEL,
  PROJECT_DELETE_TYPE_NAME,
  PROJECT_DELETE_UNDO_MS,
  PROJECT_DELETED_TOAST,
  PROJECT_RESTORE_EXPIRED,
  PROJECT_RESTORED_TOAST,
  projectDeleteDescription,
  typedNameMatches,
} from "./project-delete-copy";

/** The project a menu entry stands for. */
export type DeleteProjectTarget = { id: string; name: string };

export type UseDeleteProjectOptions = {
  /** After the server confirmed the delete (e.g. leave the project page). */
  onDeleted?(id: string): void;
};

export type DeleteProject = {
  /** `canDeleteProject`: without it no menu offers "Eliminar proyecto" and `request` does nothing. */
  canDelete: boolean;
  /** Opens the confirmation for the project. */
  request(target: DeleteProjectTarget): void;
  /** The `⋯` entry ("Eliminar proyecto", destructive), or none without `canDeleteProject`. */
  rowActions(target: DeleteProjectTarget): TableRowAction[];
  /** The confirmation dialog: render it once next to the menus. */
  dialog: ReactNode;
};

/** The restore error as copy: INVALID is the passed 30-day window. */
export function restoreErrorText(error: unknown): string {
  return actionErrorCode(error) === "INVALID"
    ? PROJECT_RESTORE_EXPIRED
    : actionErrorText(error, { entity: "project" });
}

/** Refetch everything a project delete or restore changes. */
export function invalidateProjectDelete(qc: QueryClient): void {
  for (const queryKey of projectDeleteInvalidations())
    void qc.invalidateQueries({ queryKey });
}

/** `restoreProjectAction` with its toasts; true when it came back. */
export async function restoreProjectWithToast(
  qc: QueryClient,
  id: string,
): Promise<boolean> {
  const result = await restoreProjectAction(id).catch((err: unknown) => ({
    ok: false as const,
    error: String(err),
  }));
  invalidateProjectDelete(qc);
  if (!result.ok) {
    toast.error(restoreErrorText(result.error));
    return false;
  }
  toast(PROJECT_RESTORED_TOAST);
  return true;
}

/** Drops the project from the cached Proyectos list right away (the refetch confirms it). */
function removeFromList(
  qc: QueryClient,
  id: string,
): ProyectosPageData | undefined {
  const before = qc.getQueryData<ProyectosPageData>(qk.proyectos.list());
  if (before) {
    qc.setQueryData<ProyectosPageData>(qk.proyectos.list(), {
      ...before,
      projects: before.projects.filter((p) => p.id !== id),
      portfolio: before.portfolio.filter((p) => p.projectId !== id),
    });
  }
  return before;
}

/**
 * Delete a project (#1050) from the Proyectos row menus and the project
 * header: the in-page confirmation ("¿Eliminar «nombre»? Se eliminan también
 * sus n tareas y se quita el acceso al portal de sus clientes."), typing the
 * name when it has open tasks, then `deleteProjectAction` with a 5 s
 * "Deshacer" toast that calls `restoreProjectAction`.
 */
export function useDeleteProject(
  options: UseDeleteProjectOptions = {},
): DeleteProject {
  const qc = useQueryClient();
  const user = useSessionStore(selectAuthenticatedUser);
  const canDelete = useMemo(
    () => (user ? resolveProjectsCapabilities(user).canDeleteProject : false),
    [user],
  );
  // `target` outlives `open` so the dialog keeps its question while it closes.
  const [target, setTarget] = useState<DeleteProjectTarget | null>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const inputId = useId();
  const { onDeleted } = options;

  const preview = useQuery({
    ...projectDeletePreviewOptions(target?.id ?? ""),
    enabled: open && target !== null,
  });
  const counts = open && preview.data ? preview.data : null;
  const failed = open && preview.isError;
  // Without the counts (a failed read) the name is asked for, as with open tasks.
  const needsName = failed || (counts?.openTaskCount ?? 0) > 0;
  const name = counts?.name ?? target?.name ?? "";
  // Until the counts load the confirm waits, so open tasks can't skip the typed name.
  const confirmDisabled =
    (!counts && !failed) || (needsName && !typedNameMatches(typed, name));

  const run = useCallback(
    async (project: DeleteProjectTarget) => {
      const before = removeFromList(qc, project.id);
      const result = await deleteProjectAction(project.id).catch(
        (err: unknown) => ({
          ok: false as const,
          error: String(err),
        }),
      );
      if (!result.ok) {
        if (before) qc.setQueryData(qk.proyectos.list(), before);
        toast.error(actionErrorText(result.error, { entity: "project" }));
        return;
      }
      qc.removeQueries({
        queryKey: qk.proyectos.deletePreview(project.id),
        exact: true,
      });
      invalidateProjectDelete(qc);
      onDeleted?.(project.id);
      toast(PROJECT_DELETED_TOAST, {
        duration: PROJECT_DELETE_UNDO_MS,
        action: {
          label: UNDO_LABEL,
          onClick: () => void restoreProjectWithToast(qc, project.id),
        },
      });
    },
    [qc, onDeleted],
  );

  const request = useCallback(
    (next: DeleteProjectTarget) => {
      if (!canDelete) return;
      setTarget(next);
      setTyped("");
      setOpen(true);
    },
    [canDelete],
  );

  const rowActions = useCallback(
    (next: DeleteProjectTarget): TableRowAction[] =>
      canDelete
        ? [
            {
              id: "eliminar-proyecto",
              label: PROJECT_DELETE_LABEL,
              destructive: true,
              onSelect: () => request(next),
            },
          ]
        : [],
    [canDelete, request],
  );

  const dialog = canDelete ? (
    <ConfirmDeleteDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setOpen(false);
      }}
      title={target ? PROJECT_DELETE_CONFIRM(name) : ""}
      description={projectDeleteDescription(counts ? counts.taskCount : null)}
      confirmDisabled={confirmDisabled}
      onConfirm={() => {
        if (!target || !open || confirmDisabled) return;
        setOpen(false);
        void run(target);
      }}
    >
      {needsName ? (
        <div className="flex flex-col gap-1.5" data-slot="confirm-delete-name">
          <Label
            htmlFor={inputId}
            className="text-[13px] font-normal text-muted-foreground"
          >
            {PROJECT_DELETE_TYPE_NAME(name, counts?.openTaskCount ?? null)}
          </Label>
          <Input
            id={inputId}
            value={typed}
            autoComplete="off"
            aria-label={PROJECT_DELETE_NAME_INPUT_LABEL}
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {PROJECT_DELETE_DRIVE_NOTE}
      </p>
    </ConfirmDeleteDialog>
  ) : null;

  return { canDelete, request, rowActions, dialog };
}
