"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { ReadyToStartCard } from "@/components/tareas/ReadyToStartCard";
import { StartTramoSheet } from "@/components/tareas/StartTramoSheet";
import { UpcomingProjects } from "@/components/tareas/UpcomingProjects";
import { notifyTramoStarted, useUndoStartTramo } from "@/components/tareas/start-tramo-toast";
import { mutationErrorText } from "@/lib/query/mutation";
import { tareasStartSlotOptions } from "@/lib/query/options/tareas";
import { selectCurrentUser, useSessionStore } from "@/lib/stores/session-store";
import type { StartTramoResult, WorkflowRef } from "@/lib/types/core";

/**
 * The single tramo the start slot is for: `tramo` names exactly one known
 * tramo key. Null for "Todas" (no tramo), several tramos (`a,b`) or an
 * unknown key, so the slot is not rendered and `iniciar` is ignored.
 */
export function startSlotTramo(tramo: string | null, tramos: WorkflowRef[]): WorkflowRef | null {
  if (!tramo) return null;
  const keys = tramo
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (keys.length !== 1) return null;
  return tramos.find((t) => t.key === keys[0]) ?? null;
}

export type TareasStartSlotProps = {
  workflow: WorkflowRef;
};

/**
 * Project Flow's start slot in Tareas (FE §3.4, §21.2): "Listos para
 * iniciar" and "Próximos" under the page header in every style
 * (`TareasClient` mounts it with one tramo filter), and the Iniciar tramo
 * sheet. The board, the sheet's candidates and `canStart` are one query
 * (`qk.tareas.startSlot(tramoId)`, 30 s stale); a start or an undo
 * invalidates it, so nothing here reloads by hand. `?project=X&iniciar=1`
 * (the `/actividades/[tramo]?project=X` redirect) opens the sheet for project
 * X once; closing it drops both params with `history.replaceState`, so no
 * server render follows.
 */
export function TareasStartSlot({ workflow }: TareasStartSlotProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deepLinkProject = searchParams.get("iniciar") === "1" ? searchParams.get("project") || null : null;

  const user = useSessionStore(selectCurrentUser);
  const isAdmin = user?.access === "Administrador";
  const viewerId = user?.member.id ?? "";

  const slot = useQuery(tareasStartSlotOptions(workflow.id));
  const data = slot.data ?? null;
  const canStart = data?.canStart ?? false;
  const undo = useUndoStartTramo(workflow.name);

  const [pickedProjectId, setPickedProjectId] = useState<string | null>(null);
  // `?project=X&iniciar=1`: the sheet opens for X once (ready or not), as soon as `canStart` is known.
  const [deepLinkDone, setDeepLinkDone] = useState(false);
  const deepLinkTarget = !deepLinkDone && canStart ? deepLinkProject : null;
  const startProjectId = pickedProjectId ?? deepLinkTarget;

  function clearDeepLink() {
    if (!searchParams.has("iniciar") && !searchParams.has("project")) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("iniciar");
    params.delete("project");
    const search = params.toString();
    window.history.replaceState(null, "", search ? `${pathname}?${search}` : pathname);
  }

  function closeSheet() {
    setPickedProjectId(null);
    if (deepLinkTarget) setDeepLinkDone(true);
    clearDeepLink();
  }

  function openSheet(projectId: string) {
    setDeepLinkDone(true);
    setPickedProjectId(projectId);
  }

  // The sheet closes itself (`onClose`) right after this.
  function handleStarted(result: StartTramoResult) {
    notifyTramoStarted(result, { undo: (vars) => undo.mutate(vars) });
  }

  return (
    <section aria-label={`Iniciar ${workflow.name}`} className="flex flex-col gap-4" data-testid="tareas-start-slot">
      {slot.error ? (
        <Alert variant="destructive">
          <AlertDescription>{mutationErrorText(slot.error, { tramoName: workflow.name })}</AlertDescription>
        </Alert>
      ) : null}
      {data ? (
        <>
          <ReadyToStartCard workflow={workflow} ready={data.board.ready} canStart={canStart} onStart={openSheet} />
          <UpcomingProjects upcoming={data.board.upcoming} />
        </>
      ) : null}
      <StartTramoSheet
        open={startProjectId !== null}
        projectId={startProjectId}
        workflow={workflow}
        viewerId={viewerId}
        isAdmin={isAdmin}
        staff={data?.candidates ?? []}
        onClose={closeSheet}
        onStarted={handleStarted}
      />
    </section>
  );
}
