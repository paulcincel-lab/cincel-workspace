"use server";

/**
 * Importar de monday (#672): server actions of the import wizard.
 *
 * Contract for the screens (payload types in lib/types/monday-import.ts).
 * Every action requires an active Administrador who is not the bootstrap
 * admin, and answers `{ ok: true, ...payload }` or `{ ok: false, error }`
 * with a Spanish message to show inline.
 *
 *   getMondayImportStatusAction()                    → { hasServerToken, hasAppliedImport, run: MondayImportRunState | null }
 *   openMondayImportRunAction(fresh?)                → { run }  latest run (resume), or a new one with fresh = true
 *   getMondayImportRunAction(runId)                  → { run }  poll this every ~2 s while run.jobs.<kind>.status = "running"
 *   saveMondayImportStepAction(runId, step)          → {}       the step the wizard resumes at
 *   connectMondayAction(token | null)                → { connection: MondayConnection }  Paso 1; null token = MONDAY_TOKEN
 *   startMondayExportAction(runId, token | null, { boardIds, updates?, files? })
 *                                                    → { job }  background export, then init drafts mapping.json
 *   getMondayExportSourceAction(runId)               → { source: MondayExportSource }  monday side of Pasos 2–4
 *   getMondayImportChoicesAction()                   → { choices: MondayImportChoices }  Cincel side of Pasos 2–4
 *   createMondayStaffAction(runId, mondayUserId)     → { staff }  Paso 4 "Crear integrante": pending until Google sign-in
 *   saveMondayMappingDraftAction(runId, mapping, step?)
 *                                                    → { issues: string[] }  saved even when issues remain
 *   downloadMondayMappingAction(runId)               → { fileName, content }  mapping.json
 *   uploadMondayMappingAction(runId, text)           → { issues }  replaces the draft only when issues = []
 *   getMondayImportOptionsAction(runId)              → { options: MondayImportOptionsInfo }  Paso 5 disabled reasons
 *   previewMondayImportAction(runId)                 → { preview: MondayPreview }  Paso 6; Next needs preview.canApply
 *   startMondayApplyAction(runId)                    → { job }  Paso 7, background; again on a failed job resumes it
 *   getMondayImportedProjectsAction(runId)           → { projects: MondayImportedProject[] }
 *   checkMondayRollbackAction(runId)                 → { check: MondayRollbackCheck }  blockers explain why not
 *   startMondayRollbackAction(runId)                 → { job }  background rollback
 *
 * "Ir al tablero" or "Omitir por ahora" calls completeOnboardingAction (lib/actions/onboarding-actions.ts) and a
 * succeeded apply marks it too, so undoing the import later keeps the wizard finished; the first-login
 * routing (lib/onboarding/first-login.ts) sends Google-signed-in admins to /configuracion/importar-monday
 * until then, while no import is applied.
 *
 * The monday token is a plain argument of connect and export only: the screens keep it in component state,
 * never in storage. It is never stored, logged or returned. Files excluded with Drive not configured is
 * allowed: apply ends the batch without Drive and the folders stay pending for the backfill.
 */
import { getSessionAccess } from "@/lib/auth/session";
import { SYSTEM_ADMIN_ROLE } from "@/lib/data/roles";
import { db } from "@/lib/db/client";
import { createFakeMondayClient, isMondayFake } from "@/lib/monday-import/fake-monday";
import { isRunId, latestRun } from "@/lib/monday-import/runs";
import {
  checkRollback,
  connectMonday,
  downloadDraft,
  getExportSource,
  getImportChoices,
  getOptionsInfo,
  getRunState,
  hasServerToken,
  importedProjects,
  isStep,
  openRun,
  previewImport,
  recordCreatedStaff,
  saveDraft,
  saveStep,
  startApply,
  startExport,
  startRollback,
  uploadDraft,
  WizardError,
  type StartExportInput,
  type WizardDeps,
} from "@/lib/monday-import/service";
import { isBootstrapAdminEmail } from "@/lib/onboarding/first-login";
import { notImplemented } from "@/lib/project-flow/not-implemented";
import { createStaffFromMonday, CreateStaffRefused, type CreatedStaff } from "@/scripts/monday/created-staff";
import * as onboardingRepository from "@/lib/repositories/onboarding-repository";
import type {
  MondayConnection,
  MondayExportSource,
  MondayImportChoices,
  MondayImportedProject,
  MondayImportJob,
  MondayImportOptionsInfo,
  MondayImportResult,
  MondayImportRunState,
  MondayImportStep,
  MondayPositionSuggestion,
  MondayPreview,
  MondayRemapInput,
  MondayRemapPreview,
  MondayRemapState,
  MondayRollbackCheck,
  MondayStatusMap,
} from "@/lib/types/monday-import";

type Admin = { id: string; email: string };

const FORBIDDEN = "Solo un Administrador puede importar de monday.";
const UNEXPECTED = "Algo salió mal. Intenta de nuevo.";
const BAD_RUN = "No se encontró esta importación.";

// MONDAY_FAKE=1 (local e2e only) answers with the CLI fixture account instead of calling monday.
const deps = (): WizardDeps => (isMondayFake() ? { db, createClient: createFakeMondayClient } : { db });

async function currentAdmin(): Promise<Admin | null> {
  try {
    const access = await getSessionAccess();
    const user = access.user;
    if (access.status !== "active" || !user || user.access !== SYSTEM_ADMIN_ROLE) return null;
    if (isBootstrapAdminEmail(user.email)) return null;
    return { id: user.id, email: user.email ?? "" };
  } catch {
    return null;
  }
}

/** Runs `fn` for an Administrador; WizardError messages go to the screen, anything else is logged. */
async function guarded<T extends object>(
  name: string,
  fn: (admin: Admin) => Promise<T>,
): Promise<MondayImportResult<T>> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false, error: FORBIDDEN };
  try {
    return { ok: true, ...(await fn(admin)) };
  } catch (err) {
    if (err instanceof WizardError) return { ok: false, error: err.message };
    // The token is never part of an error: it only lives in the monday client's headers.
    console.error(`[monday-import] ${name} failed:`, err instanceof Error ? err.message : err);
    return { ok: false, error: UNEXPECTED };
  }
}

function checkRunId(runId: unknown): asserts runId is string {
  if (!isRunId(runId)) throw new WizardError(BAD_RUN);
}

export async function getMondayImportStatusAction(): Promise<
  MondayImportResult<{ hasServerToken: boolean; hasAppliedImport: boolean; run: MondayImportRunState | null }>
> {
  return guarded("status", async () => {
    const latest = await latestRun();
    return {
      hasServerToken: hasServerToken(),
      hasAppliedImport: await onboardingRepository.hasAppliedImport(),
      run: latest ? await getRunState(latest.runId, deps()) : null,
    };
  });
}

export async function openMondayImportRunAction(fresh = false): Promise<MondayImportResult<{ run: MondayImportRunState }>> {
  return guarded("open", async (admin) => {
    const run = await openRun(admin.id, deps(), fresh === true);
    return { run: await getRunState(run.runId, deps()) };
  });
}

export async function getMondayImportRunAction(runId: string): Promise<MondayImportResult<{ run: MondayImportRunState }>> {
  return guarded("run", async () => {
    checkRunId(runId);
    return { run: await getRunState(runId, deps()) };
  });
}

export async function saveMondayImportStepAction(
  runId: string,
  step: MondayImportStep,
): Promise<MondayImportResult<Record<never, never>>> {
  return guarded("step", async () => {
    checkRunId(runId);
    if (!isStep(step)) throw new WizardError("Paso no válido.");
    await saveStep(runId, step, deps());
    return {};
  });
}

export async function connectMondayAction(
  token: string | null,
): Promise<MondayImportResult<{ connection: MondayConnection }>> {
  return guarded("connect", async () => ({ connection: await connectMonday(token, deps()) }));
}

export async function startMondayExportAction(
  runId: string,
  token: string | null,
  input: StartExportInput,
): Promise<MondayImportResult<{ job: MondayImportJob }>> {
  return guarded("export", async () => {
    checkRunId(runId);
    const boardIds = Array.isArray(input?.boardIds) ? input.boardIds.map(String) : [];
    const job = await startExport(
      runId,
      token,
      { boardIds, updates: input?.updates !== false, files: input?.files !== false },
      deps(),
    );
    return { job };
  });
}

export async function getMondayExportSourceAction(
  runId: string,
): Promise<MondayImportResult<{ source: MondayExportSource }>> {
  return guarded("source", async () => {
    checkRunId(runId);
    return { source: await getExportSource(runId, deps()) };
  });
}

export async function getMondayImportChoicesAction(): Promise<MondayImportResult<{ choices: MondayImportChoices }>> {
  return guarded("choices", async () => ({ choices: await getImportChoices(db) }));
}

/**
 * "Crear integrante" (#689): the staff member of a monday person of the run's export, with monday's name and
 * email (never the client's), pending until they first sign in with Google. The screen then maps the person to it
 * with `created: true`, so a rollback of the import removes it while unused.
 */
export async function createMondayStaffAction(
  runId: string,
  mondayUserId: string,
  // Project flow (FE §7.8): the puestos to give the new person; saved once the importer switches (Phase 4).
  options: { positionIds?: string[] } = {},
): Promise<MondayImportResult<{ staff: CreatedStaff }>> {
  void options;
  return guarded("create-staff", async () => {
    checkRunId(runId);
    const source = await getExportSource(runId, deps());
    const user = source.users.find((u) => u.id === String(mondayUserId));
    if (!user) throw new WizardError("Esta persona no está en la exportación.");
    try {
      const staff = await createStaffFromMonday(deps().db, user);
      await recordCreatedStaff(runId, staff.id, deps());
      return { staff };
    } catch (err) {
      if (err instanceof CreateStaffRefused) throw new WizardError(err.message);
      throw err;
    }
  });
}

export async function saveMondayMappingDraftAction(
  runId: string,
  mapping: unknown,
  step?: MondayImportStep,
): Promise<MondayImportResult<{ issues: string[] }>> {
  return guarded("draft", async () => {
    checkRunId(runId);
    return saveDraft(runId, mapping, isStep(step) ? step : null, deps());
  });
}

export async function downloadMondayMappingAction(
  runId: string,
): Promise<MondayImportResult<{ fileName: string; content: string }>> {
  return guarded("download", async () => {
    checkRunId(runId);
    return downloadDraft(runId, deps());
  });
}

export async function uploadMondayMappingAction(
  runId: string,
  text: string,
): Promise<MondayImportResult<{ issues: string[] }>> {
  return guarded("upload", async () => {
    checkRunId(runId);
    if (typeof text !== "string" || text.length > 5_000_000) throw new WizardError("El archivo no es válido.");
    return uploadDraft(runId, text, deps());
  });
}

export async function getMondayImportOptionsAction(
  runId: string,
): Promise<MondayImportResult<{ options: MondayImportOptionsInfo }>> {
  return guarded("options", async () => {
    checkRunId(runId);
    return { options: await getOptionsInfo(runId, deps()) };
  });
}

export async function previewMondayImportAction(runId: string): Promise<MondayImportResult<{ preview: MondayPreview }>> {
  return guarded("preview", async (admin) => {
    checkRunId(runId);
    return { preview: await previewImport(runId, admin.id, deps()) };
  });
}

export async function startMondayApplyAction(runId: string): Promise<MondayImportResult<{ job: MondayImportJob }>> {
  return guarded("apply", async (admin) => {
    checkRunId(runId);
    // A finished import also finishes the admin's first-login wizard, even if they never click "Ir al tablero".
    const onApplied = () => onboardingRepository.markOnboardingCompleted(admin.id);
    return { job: await startApply(runId, { email: admin.email }, deps(), onApplied) };
  });
}

export async function getMondayImportedProjectsAction(
  runId: string,
): Promise<MondayImportResult<{ projects: MondayImportedProject[] }>> {
  return guarded("projects", async () => {
    checkRunId(runId);
    return { projects: await importedProjects(runId, deps()) };
  });
}

export async function checkMondayRollbackAction(
  runId: string,
): Promise<MondayImportResult<{ check: MondayRollbackCheck }>> {
  return guarded("rollback-check", async () => {
    checkRunId(runId);
    return { check: await checkRollback(runId, deps()) };
  });
}

export async function startMondayRollbackAction(runId: string): Promise<MondayImportResult<{ job: MondayImportJob }>> {
  return guarded("rollback", async () => {
    checkRunId(runId);
    return { job: await startRollback(runId, deps()) };
  });
}

// --- Project flow (FE §7.8): puesto suggestion, firm-wide status map, "Reacomodar importación" ---
// Wizard admin guard (Administrador, not the bootstrap admin), like the rest of the wizard.

/** "Crear integrante": the puesto suggested by the fases where the person's tasks land (BE §10.8). */
export async function suggestMondayPositionAction(
  runId: string,
  mondayUserId: string,
): Promise<MondayImportResult<{ suggestion: MondayPositionSuggestion }>> {
  return notImplemented("suggestMondayPositionAction", runId, mondayUserId);
}

/**
 * Saves the whole firm-wide status map (app_settings `monday.status_map`).
 * `{ ok: false, error: "STATUS_NOT_FOUND" }` when an entry points at a custom status that no longer exists.
 */
export async function saveMondayStatusMapAction(
  entries: MondayStatusMap,
): Promise<MondayImportResult<{ statusMap: MondayStatusMap }>> {
  return notImplemented("saveMondayStatusMapAction", entries);
}

/** The project's boards with their groups and current targets. Errors: NOT_IMPORTED, EXPORT_MISSING. */
export async function getMondayRemapAction(projectId: string): Promise<MondayImportResult<{ remap: MondayRemapState }>> {
  return notImplemented("getMondayRemapAction", projectId);
}

/** Pure: counts, up to 10 samples and grouped issues; no writes. */
export async function previewMondayRemapAction(
  projectId: string,
  input: MondayRemapInput,
): Promise<MondayImportResult<{ preview: MondayRemapPreview }>> {
  return notImplemented("previewMondayRemapAction", projectId, input);
}

/** One transaction; re-applying the same input changes nothing. */
export async function applyMondayRemapAction(
  projectId: string,
  input: MondayRemapInput,
): Promise<MondayImportResult<{ updated: number }>> {
  return notImplemented("applyMondayRemapAction", projectId, input);
}
