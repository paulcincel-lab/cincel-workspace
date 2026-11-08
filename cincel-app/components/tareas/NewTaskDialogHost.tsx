"use client";

import { Suspense, useMemo } from "react";

import { resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import { useNewTaskUi } from "@/lib/stores/new-task-store";

import { NewTaskDialog } from "./NewTaskDialog";
import { useNewTaskUrlEntry } from "./use-new-task-param";

/** `?nueva=1` → `openNewTask(fromUrl, "url")`; its own boundary because it reads `useSearchParams`. */
function NewTaskUrlEntry() {
  useNewTaskUrlEntry();
  return null;
}

/**
 * The one `NewTaskDialog` of the staff shell (zustand.md §2.3), mounted once
 * in `AppShellClient`. It renders the dialog from `useNewTaskUi` and owns the
 * `?nueva=1` entry. Without `canCreateActivity` nothing renders, so the
 * param is left alone and no catalog loads.
 */
export function NewTaskDialogHost() {
  const user = useSessionStore(selectAuthenticatedUser);
  const canCreate = useMemo(() => resolveActivitiesCapabilities(user).canCreateActivity, [user]);
  const open = useNewTaskUi((s) => s.open);
  const defaults = useNewTaskUi((s) => s.defaults);
  const closeNewTask = useNewTaskUi((s) => s.closeNewTask);

  if (!user || !canCreate) return null;

  return (
    <>
      <Suspense fallback={null}>
        <NewTaskUrlEntry />
      </Suspense>
      <NewTaskDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) closeNewTask();
        }}
        defaults={defaults}
      />
    </>
  );
}
