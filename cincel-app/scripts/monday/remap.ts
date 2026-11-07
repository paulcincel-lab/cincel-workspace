/**
 * "Reacomodar importación" core (project flow BE §11.1): re-sorts an imported
 * project's tasks into tramo / fase / espacio / project / admin with the six
 * group targets. Takes `db`; no `server-only`, so the CLI
 * (`npm run monday -- remap`) and the wizard-admin actions share it.
 */
import { notImplemented } from "../../lib/project-flow/not-implemented";
import type { MondayRemapInput, MondayRemapPreview, MondayRemapState } from "../../lib/types/monday-import";
import type { MondayDb } from "./db";

/** A planned change to one live task (fields recorded in history on apply). */
export interface TaskChange {
  taskId: string;
  before: TaskPlacement;
  after: TaskPlacement;
}

export interface TaskPlacement {
  projectId: string;
  kind: "workflow" | "usuario" | "admin";
  workflowId: string | null;
  phaseId: string | null;
  spaceId: string | null;
  templateId: string | null;
}

/** Boards, source groups and current targets of an imported project. Errors: NOT_IMPORTED, EXPORT_MISSING. */
export async function loadRemapState(db: MondayDb, projectId: string): Promise<MondayRemapState> {
  return notImplemented("loadRemapState", db, projectId);
}

/** Translates the project's boards with the input targets and matches tasks by import refs; no writes. */
export async function planRemap(
  db: MondayDb,
  projectId: string,
  input: MondayRemapInput,
): Promise<{ preview: MondayRemapPreview; changes: TaskChange[] }> {
  return notImplemented("planRemap", db, projectId, input);
}

/** One transaction with the project row locked; idempotent. */
export async function applyRemap(
  db: MondayDb,
  projectId: string,
  input: MondayRemapInput,
  actorId: string,
): Promise<{ updated: number }> {
  return notImplemented("applyRemap", db, projectId, input, actorId);
}
