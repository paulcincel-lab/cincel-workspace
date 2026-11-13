"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { EmptyState } from "@/components/shell/EmptyState";
import { StartEtapaSheet } from "@/components/tareas/StartEtapaSheet";
import { notifyEtapaStarted, useUndoStartEtapa } from "@/components/tareas/start-etapa-toast";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { RESUMEN_NO_ETAPA } from "@/lib/proyectos/project-summary";
import { tareasStartSlotOptions } from "@/lib/query/options/tareas";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import type { StartEtapaResult, WorkflowRef } from "@/lib/types/core";

export type ProjectNoEtapaProps = {
  projectId: string;
  /** The active etapa catalog: the sheet's etapa picker. */
  etapas: WorkflowRef[];
};

/**
 * The Resumen's empty state when the project has started no etapa (#1043),
 * the same in every style: "Este proyecto aún no tiene etapa." and, for whoever
 * can start etapas (`activities.canCreateActivity`, as in Tareas), "Iniciar un
 * etapa", which opens the Iniciar etapa sheet with an etapa picker and nothing
 * preselected. The candidates load once an etapa is picked; a start
 * invalidates the project (`etapaStartInvalidations`), so the Resumen redraws.
 */
export function ProjectNoEtapa({ projectId, etapas }: ProjectNoEtapaProps) {
  const user = useSessionStore(selectAuthenticatedUser);
  const canStart = useMemo(() => resolveActivitiesCapabilities(user).canCreateActivity, [user]);
  const isAdmin = user?.access === "Administrador";

  const [open, setOpen] = useState(false);
  const [etapaId, setEtapaId] = useState<string | null>(null);
  const workflow = etapas.find((t) => t.id === etapaId) ?? null;
  const slot = useQuery({ ...tareasStartSlotOptions(workflow?.id ?? ""), enabled: open && workflow !== null });
  const undo = useUndoStartEtapa(workflow?.name ?? "");

  // Each opening starts with no etapa picked; the pick stays after closing so the undo toast keeps its name.
  function openSheet() {
    setEtapaId(null);
    setOpen(true);
  }

  function handleStarted(result: StartEtapaResult) {
    notifyEtapaStarted(result, { undo: (vars) => undo.mutate(vars) });
  }

  return (
    <div data-testid="resumen-no-etapa">
      <EmptyState
        title={RESUMEN_NO_ETAPA}
        action={canStart && etapas.length > 0 ? { label: "Iniciar una etapa", onClick: openSheet } : undefined}
      />
      {canStart ? (
        <StartEtapaSheet
          open={open}
          projectId={open ? projectId : null}
          workflow={workflow}
          viewerId={user?.member.id ?? ""}
          isAdmin={isAdmin}
          staff={slot.data?.candidates ?? []}
          etapaPicker={{ etapas, onPick: setEtapaId }}
          onClose={() => setOpen(false)}
          onStarted={handleStarted}
        />
      ) : null}
    </div>
  );
}
