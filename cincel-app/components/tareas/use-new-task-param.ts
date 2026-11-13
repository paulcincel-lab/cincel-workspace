"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { useNewTaskUi } from "@/lib/stores/new-task-store";

import type { NewTaskDefaults } from "./new-task-form";
import { readEtapaParam } from "@/lib/ui/etapa-param";

/** The search param that opens `NewTaskDialog` (`/tareas?nueva=1`, FE §2.1). */
export const NEW_TASK_PARAM = "nueva";

/** `?…` of `params` with `nueva` set or removed; "" when nothing is left. */
export function newTaskSearch(params: URLSearchParams, open: boolean): string {
  const next = new URLSearchParams(params.toString());
  if (open) next.set(NEW_TASK_PARAM, "1");
  else next.delete(NEW_TASK_PARAM);
  const search = next.toString();
  return search ? `?${search}` : "";
}

/** The form defaults a URL carries: the view's `proyecto` and `tramo` filters. */
export function newTaskDefaultsFromSearch(params: URLSearchParams): NewTaskDefaults {
  const defaults: NewTaskDefaults = {};
  const projectId = params.get("proyecto");
  const tramoKey = readEtapaParam(params);
  if (projectId) defaults.projectId = projectId;
  if (tramoKey) defaults.tramoKey = tramoKey;
  return defaults;
}

/**
 * The `?nueva=1` entry of `<NewTaskDialogHost/>`: opens the dialog with the
 * URL's `proyecto`/`tramo` defaults and strips the param with
 * `history.replaceState`, so neither step re-renders the page on the server.
 * Every other param stays, so the view underneath is unchanged.
 */
export function useNewTaskUrlEntry(): void {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Keyed on the search string, not the `URLSearchParams` object, so a new
  // object for the same URL does not reopen the dialog.
  const search = searchParams.toString();
  const requested = searchParams.get(NEW_TASK_PARAM) === "1";

  useEffect(() => {
    if (!requested) return;
    const params = new URLSearchParams(search);
    useNewTaskUi.getState().openNewTask(newTaskDefaultsFromSearch(params), "url");
    window.history.replaceState(null, "", `${pathname}${newTaskSearch(params, false)}${window.location.hash}`);
  }, [requested, pathname, search]);
}
