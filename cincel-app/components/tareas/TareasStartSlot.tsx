"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { ReadyToStartCard } from "@/components/tareas/ReadyToStartCard";
import { StartTramoSheet } from "@/components/tareas/StartTramoSheet";
import { UpcomingProjects } from "@/components/tareas/UpcomingProjects";
import { notifyTramoStarted } from "@/components/tareas/start-tramo-toast";
import { selectCurrentUser, useSessionStore } from "@/lib/stores/session-store";
import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { actionErrorText } from "@/lib/errors";
import type { TramoStartContract } from "@/lib/tramos/compat";
import type { Staff, StartTramoResult, TramoBoard, WorkflowRef } from "@/lib/types/core";

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
  /** Project Flow's start contract, read through `lib/tramos/compat.ts`. */
  contract: TramoStartContract;
};

/**
 * Project Flow's start slot inside Tareas · Lista (FE §3.4, §21.2):
 * "Listos para iniciar" and "Próximos" above the table, and the Iniciar tramo
 * sheet. `?project=X&iniciar=1` (the `/actividades/[tramo]?project=X`
 * redirect) opens the sheet for project X once; closing it drops both params.
 */
export function TareasStartSlot({ workflow, contract }: TareasStartSlotProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deepLinkProject = searchParams.get("iniciar") === "1" ? searchParams.get("project") || null : null;

  const user = useSessionStore(selectCurrentUser);
  const canStart = useMemo(() => resolveActivitiesCapabilities(user).canCreateActivity, [user]);
  const isAdmin = user?.access === "Administrador";
  const viewerId = user?.member.id ?? "";

  const [board, setBoard] = useState<TramoBoard | null>(null);
  const [staff, setStaff] = useState<Array<Staff & { suggested: boolean }>>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [startProjectId, setStartProjectId] = useState<string | null>(null);

  const loadBoard = useCallback(async () => {
    try {
      setBoard(await contract.fetchBoard(workflow.id));
      setLoadError(null);
    } catch (err) {
      setLoadError(actionErrorText(err, { tramoName: workflow.name }));
    }
  }, [contract, workflow.id, workflow.name]);

  useEffect(() => {
    // Load the tramo board on mount; `loadBoard` is also the post-start refresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    let cancelled = false;
    contract
      .fetchCandidates(workflow.id)
      .then((rows) => {
        if (!cancelled) setStaff(rows);
      })
      .catch(() => {
        // The sheet still works without candidates ("Sin asignar").
      });
    return () => {
      cancelled = true;
    };
  }, [contract, workflow.id]);

  // `?project=X&iniciar=1`: open the sheet for X once, ready or not.
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current || !deepLinkProject || !canStart) return;
    deepLinkHandled.current = true;
    setStartProjectId(deepLinkProject);
  }, [deepLinkProject, canStart]);

  const clearDeepLink = useCallback(() => {
    if (!searchParams.has("iniciar") && !searchParams.has("project")) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("iniciar");
    params.delete("project");
    const search = params.toString();
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }, [pathname, router, searchParams]);

  const closeSheet = useCallback(() => {
    setStartProjectId(null);
    clearDeepLink();
  }, [clearDeepLink]);

  const refreshAfterStart = useCallback(async () => {
    await loadBoard();
    router.refresh();
  }, [loadBoard, router]);

  function handleStarted(result: StartTramoResult) {
    closeSheet();
    notifyTramoStarted(result, { refresh: refreshAfterStart });
    void refreshAfterStart();
  }

  return (
    <section aria-label={`Iniciar ${workflow.name}`} className="flex flex-col gap-4" data-testid="tareas-start-slot">
      {loadError ? (
        <Alert variant="destructive">
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}
      {board ? (
        <>
          <ReadyToStartCard workflow={workflow} ready={board.ready} canStart={canStart} onStart={setStartProjectId} />
          <UpcomingProjects upcoming={board.upcoming} />
        </>
      ) : null}
      <StartTramoSheet
        open={startProjectId !== null}
        projectId={startProjectId}
        workflow={workflow}
        viewerId={viewerId}
        isAdmin={isAdmin}
        staff={staff}
        onClose={closeSheet}
        onStarted={handleStarted}
      />
    </section>
  );
}
