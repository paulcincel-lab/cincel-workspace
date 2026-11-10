"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { EmptyState } from "@/components/shell/EmptyState";
import { StartTramoSheet } from "@/components/tareas/StartTramoSheet";
import { notifyTramoStarted, useUndoStartTramo } from "@/components/tareas/start-tramo-toast";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { RESUMEN_NO_TRAMO } from "@/lib/proyectos/project-summary";
import { tareasStartSlotOptions } from "@/lib/query/options/tareas";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import type { StartTramoResult, WorkflowRef } from "@/lib/types/core";

export type ProjectNoTramoProps = {
  projectId: string;
  /** The active tramo catalog: the sheet's tramo picker. */
  tramos: WorkflowRef[];
};

/**
 * The Resumen's empty state when the project has started no tramo (#1043),
 * the same in every style: "Este proyecto aún no tiene tramo." and, for whoever
 * can start tramos (`activities.canCreateActivity`, as in Tareas), "Iniciar un
 * tramo", which opens the Iniciar tramo sheet with a tramo picker and nothing
 * preselected. The candidates load once a tramo is picked; a start
 * invalidates the project (`tramoStartInvalidations`), so the Resumen redraws.
 */
export function ProjectNoTramo({ projectId, tramos }: ProjectNoTramoProps) {
  const user = useSessionStore(selectAuthenticatedUser);
  const canStart = useMemo(() => resolveActivitiesCapabilities(user).canCreateActivity, [user]);
  const isAdmin = user?.access === "Administrador";

  const [open, setOpen] = useState(false);
  const [tramoId, setTramoId] = useState<string | null>(null);
  const workflow = tramos.find((t) => t.id === tramoId) ?? null;
  const slot = useQuery({ ...tareasStartSlotOptions(workflow?.id ?? ""), enabled: open && workflow !== null });
  const undo = useUndoStartTramo(workflow?.name ?? "");

  // Each opening starts with no tramo picked; the pick stays after closing so the undo toast keeps its name.
  function openSheet() {
    setTramoId(null);
    setOpen(true);
  }

  function handleStarted(result: StartTramoResult) {
    notifyTramoStarted(result, { undo: (vars) => undo.mutate(vars) });
  }

  return (
    <div data-testid="resumen-no-tramo">
      <EmptyState
        title={RESUMEN_NO_TRAMO}
        action={canStart && tramos.length > 0 ? { label: "Iniciar un tramo", onClick: openSheet } : undefined}
      />
      {canStart ? (
        <StartTramoSheet
          open={open}
          projectId={open ? projectId : null}
          workflow={workflow}
          viewerId={user?.member.id ?? ""}
          isAdmin={isAdmin}
          staff={slot.data?.candidates ?? []}
          tramoPicker={{ tramos, onPick: setTramoId }}
          onClose={() => setOpen(false)}
          onStarted={handleStarted}
        />
      ) : null}
    </div>
  );
}
