import "server-only";

import { SYSTEM_ADMIN_ROLE } from "@/lib/data/roles";
import { db } from "@/lib/db/client";
import { toMondayImportHistoryEntry, type MondayImportHistoryEntry } from "@/lib/monday-import/history";
import { latestRun } from "@/lib/monday-import/runs";
import { getImportChoices, getRunState, hasServerToken, WizardError } from "@/lib/monday-import/service";
import { isBootstrapAdminEmail } from "@/lib/onboarding/first-login";
import { listMondayImportBatches } from "@/lib/repositories/import-history-repository";
import type { MondayImportChoices, MondayImportRunState } from "@/lib/types/monday-import";

/**
 * Ajustes › Importar de monday (Query Migration 9d, #966): the page data of
 * `qk.ajustes.page('monday')`. Read only: it reads the latest run's state and
 * never creates or resumes one (that is the "Iniciar / Continuar importación"
 * button, `openMondayImportRunAction`). What it returns is dehydrated into the
 * page HTML: `status` carries only whether the server has a monday token,
 * never the token.
 */

export type AjustesMondayPageData = {
  status: { hasServerToken: boolean };
  /** The latest run, read only; null when there is none. */
  run: MondayImportRunState | null;
  choices: MondayImportChoices | null;
  history: MondayImportHistoryEntry[];
  errors: { load: string | null; history: string | null };
};

/** The viewer fields the Monday rule needs (a session user or a capability user). */
export type MondayPageViewer = { access: string; email?: string | null };

export const MONDAY_LOAD_ERROR = "No se pudo cargar la importación. Recarga la página.";
export const MONDAY_HISTORY_ERROR = "No se pudo cargar el historial de importaciones. Recarga la página.";

type Read<T> = { ok: true; value: T } | { ok: false; error: string };

/** One read of the page; WizardError copy goes to the screen, anything else is logged. */
async function read<T>(name: string, fallback: string, fn: () => Promise<T>): Promise<Read<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if (err instanceof WizardError) return { ok: false, error: err.message };
    console.error(`[ajustes/monday] ${name} failed:`, err instanceof Error ? err.message : err);
    return { ok: false, error: fallback };
  }
}

/** Today's rule: an Administrador who is not the bootstrap admin. */
export function canImportFromMonday(viewer: MondayPageViewer): boolean {
  return viewer.access === SYSTEM_ADMIN_ROLE && !isBootstrapAdminEmail(viewer.email);
}

/**
 * Status, the latest run's state, the Equivalencias choices and the history
 * in one `Promise.all`. FORBIDDEN for anyone but an Administrador who is not
 * the bootstrap admin.
 */
export async function loadAjustesMonday(viewer: MondayPageViewer): Promise<AjustesMondayPageData> {
  if (!canImportFromMonday(viewer)) throw new Error("FORBIDDEN");
  const deps = { db };
  const [run, choices, history] = await Promise.all([
    read("run", MONDAY_LOAD_ERROR, async () => {
      const latest = await latestRun();
      return latest ? getRunState(latest.runId, deps) : null;
    }),
    read("choices", MONDAY_LOAD_ERROR, () => getImportChoices(db)),
    read("history", MONDAY_HISTORY_ERROR, async () =>
      (await listMondayImportBatches()).map(toMondayImportHistoryEntry),
    ),
  ]);
  return {
    status: { hasServerToken: hasServerToken() },
    run: run.ok ? run.value : null,
    choices: choices.ok ? choices.value : null,
    history: history.ok ? history.value : [],
    errors: {
      load: !run.ok ? run.error : !choices.ok ? choices.error : null,
      history: history.ok ? null : MONDAY_HISTORY_ERROR,
    },
  };
}
