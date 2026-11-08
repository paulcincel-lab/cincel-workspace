import { queryOptions, type QueryClient, type QueryKey } from "@tanstack/react-query";

import {
  checkMondayRollbackAction,
  getMondayExportSourceAction,
  getMondayImportChoicesAction,
  getMondayImportedProjectsAction,
  getMondayImportHistoryAction,
  getMondayImportOptionsAction,
  getMondayImportRunAction,
  suggestMondayPositionAction,
} from "@/lib/actions/monday-import-actions";
import type { AjustesMondayPageData } from "@/lib/loaders/ajustes-monday";
import type { MondayImportHistoryEntry } from "@/lib/monday-import/history";
import { STALE, qk } from "@/lib/query/keys";
import type {
  MondayExportSource,
  MondayImportChoices,
  MondayImportedProject,
  MondayImportFail,
  MondayImportOptionsInfo,
  MondayImportResult,
  MondayImportRunState,
  MondayPositionSuggestion,
  MondayRollbackCheck,
} from "@/lib/types/monday-import";

/**
 * `queryOptions` for the Monday import wizard (Query Migration 9d, #966).
 * The page query (`ajustesMondayOptions`, `lib/query/options/ajustes.ts`)
 * seeds `monday.run(id)`, `monday.choices()` and `monday.history()` with
 * `seedMondayQueries`. The query functions only read the server.
 */

/** The run poll while a background job (export, apply, rollback) runs. */
export const MONDAY_POLL_MS = 2000;

/** Throws `Error(error)` for a failed Monday result; returns the payload otherwise. */
export function unwrapMonday<T extends object>(result: MondayImportResult<T>): { ok: true } & T {
  if (result.ok === false) throw new Error((result as MondayImportFail).error);
  return result as { ok: true } & T;
}

/** True while any job of the run is running. */
export function isMondayRunBusy(run: MondayImportRunState | null | undefined): boolean {
  return Boolean(run && Object.values(run.jobs).some((job) => job?.status === "running"));
}

/** The job kinds that were running in `previous` and are no longer running in `next`. */
export function finishedMondayJobs(
  previous: MondayImportRunState | null | undefined,
  next: MondayImportRunState,
): ("export" | "apply" | "rollback")[] {
  if (!previous) return [];
  return (["export", "apply", "rollback"] as const).filter(
    (kind) => previous.jobs[kind]?.status === "running" && next.jobs[kind]?.status !== "running",
  );
}

/**
 * Everything an applied or undone import changes: projects, tasks, the staff
 * catalog, Inicio, the import history and this page, plus the run's
 * imported-projects list and rollback check.
 */
export function mondayImportChangedKeys(runId: string): QueryKey[] {
  return [
    qk.proyectos.all,
    qk.tareas.all,
    qk.catalog.staff(),
    qk.inicio(),
    qk.monday.history(),
    qk.ajustes.page("monday"),
    qk.monday.imported(runId),
    qk.monday.rollbackCheck(runId),
  ];
}

/** Writes the page data into the keys it seeds. */
export function seedMondayQueries(qc: QueryClient, data: AjustesMondayPageData): void {
  if (data.run) qc.setQueryData(qk.monday.run(data.run.runId), data.run);
  if (data.choices) qc.setQueryData(qk.monday.choices(), data.choices);
  if (!data.errors.history) qc.setQueryData(qk.monday.history(), data.history);
}

/**
 * `monday.run(id)`: stale at once, polled every 2 s while a job runs and not
 * otherwise. A poll that sees a job finish invalidates what it changed: the
 * run's export source after an export, and every key of
 * `mondayImportChangedKeys` after an apply or a rollback.
 */
export function mondayRunOptions(runId: string) {
  return queryOptions<MondayImportRunState>({
    queryKey: qk.monday.run(runId),
    queryFn: async ({ client }) => {
      const previous = client.getQueryData<MondayImportRunState>(qk.monday.run(runId));
      const next = unwrapMonday(await getMondayImportRunAction(runId)).run;
      const finished = finishedMondayJobs(previous, next);
      const keys: QueryKey[] = [];
      if (finished.includes("export")) keys.push(qk.monday.source(runId));
      if (finished.includes("apply") || finished.includes("rollback")) keys.push(...mondayImportChangedKeys(runId));
      for (const queryKey of keys) void client.invalidateQueries({ queryKey });
      return next;
    },
    staleTime: STALE.mondayRun,
    refetchInterval: (query) => (isMondayRunBusy(query.state.data) ? MONDAY_POLL_MS : false),
  });
}

/** `monday.choices()`: the Cincel side of the Equivalencias selects. */
export function mondayChoicesOptions() {
  return queryOptions<MondayImportChoices>({
    queryKey: qk.monday.choices(),
    queryFn: async () => unwrapMonday(await getMondayImportChoicesAction()).choices,
    staleTime: STALE.ajustes,
  });
}

/** `monday.history()`: the import batches, newest first. */
export function mondayHistoryOptions() {
  return queryOptions<MondayImportHistoryEntry[]>({
    queryKey: qk.monday.history(),
    queryFn: async () => unwrapMonday(await getMondayImportHistoryAction()).history,
    staleTime: STALE.ajustes,
  });
}

/** `monday.source(id)`: the monday side of Pasos 2–4, once the run is exported. */
export function mondaySourceOptions(runId: string) {
  return queryOptions<MondayExportSource>({
    queryKey: qk.monday.source(runId),
    queryFn: async () => unwrapMonday(await getMondayExportSourceAction(runId)).source,
    staleTime: STALE.ajustes,
  });
}

/** `monday.options(id)`: Paso 5's disabled reasons, read each time the step opens. */
export function mondayImportOptionsOptions(runId: string) {
  return queryOptions<MondayImportOptionsInfo>({
    queryKey: qk.monday.options(runId),
    queryFn: async () => unwrapMonday(await getMondayImportOptionsAction(runId)).options,
    staleTime: 0,
  });
}

/** `monday.imported(id)`: the projects the run's import created. */
export function mondayImportedProjectsOptions(runId: string) {
  return queryOptions<MondayImportedProject[]>({
    queryKey: qk.monday.imported(runId),
    queryFn: async () => unwrapMonday(await getMondayImportedProjectsAction(runId)).projects,
    staleTime: STALE.ajustes,
  });
}

/** `monday.rollbackCheck(id)`: whether the import can still be undone, and why not. */
export function mondayRollbackCheckOptions(runId: string) {
  return queryOptions<MondayRollbackCheck>({
    queryKey: qk.monday.rollbackCheck(runId),
    queryFn: async () => unwrapMonday(await checkMondayRollbackAction(runId)).check,
    staleTime: STALE.ajustes,
  });
}

/** `monday.positionSuggestion(run, person)`: the puesto "Crear integrante" preselects. */
export function mondayPositionSuggestionOptions(runId: string, mondayUserId: string) {
  return queryOptions<MondayPositionSuggestion>({
    queryKey: qk.monday.positionSuggestion(runId, mondayUserId),
    queryFn: async () => unwrapMonday(await suggestMondayPositionAction(runId, mondayUserId)).suggestion,
    staleTime: STALE.ajustes,
  });
}
