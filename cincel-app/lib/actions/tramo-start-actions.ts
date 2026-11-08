"use server";

/**
 * Starting a tramo (project flow BE §7.4, FE §7.5). Reads need
 * `activities.canViewActivities`; start and undo need `canCreateActivity`
 * (and admin for `autoStart`). The preview also needs `canViewProjects`.
 * Start and undo return `ActionResult`; the Tareas cache is invalidated on
 * the client (`tramoStartInvalidations`, Query Migration 4d), Proyectos
 * reads `qk.proyectos.*` (5a), and they still revalidate Inicio until that
 * phase moves.
 */
import { toActionResult } from "@/lib/actions/action-result";
import { revalidateInicioScreen } from "@/lib/cache/screens/inicio";

import { canSeeAdminData, resolveActivitiesCapabilities, resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { FLOW_ERROR, flowError } from "@/lib/project-flow/errors";
import { tramoBoard } from "@/lib/project-flow/readiness";
import { previewStartTramo, startTramo, undoStartTramo } from "@/lib/project-flow/start-tramo";
import * as staffRepository from "@/lib/repositories/staff-repository";
import type { ActionResult } from "@/lib/types/schedule";
import type {
  StartTramoInput,
  StartTramoPreview,
  StartTramoResult,
  TramoBoard,
  ViewerScope,
} from "@/lib/types/core";
import { StartTramoInputSchema, UuidSchema, parseInput } from "@/lib/validation/project-flow";

type CapabilityUser = Awaited<ReturnType<typeof requireCapabilityUser>>;

const viewerOf = (user: CapabilityUser): ViewerScope => ({ staffId: user.member.id, isAdmin: canSeeAdminData(user) });

async function requireActivities(capability: "canViewActivities" | "canCreateActivity"): Promise<CapabilityUser> {
  const user = await requireCapabilityUser();
  if (!resolveActivitiesCapabilities(user)[capability]) throw flowError(FLOW_ERROR.FORBIDDEN);
  return user;
}

/** Proyectos reads `qk.proyectos.*` (5a, #959): the client invalidates it; only Inicio is revalidated. */
function revalidateTramoStart() {
  revalidateInicioScreen();
}

/** Listos para iniciar, Próximos and started projects of one tramo. Errors: FORBIDDEN, NOT_FOUND. */
export async function fetchTramoBoardAction(workflowId: string): Promise<TramoBoard> {
  const user = await requireActivities("canViewActivities");
  const id = parseInput(UuidSchema, workflowId);
  return tramoBoard(db, id, viewerOf(user));
}

/**
 * The sheet's fases, templates still to create and candidates. Read-only.
 * Errors: FORBIDDEN (also without `canViewProjects`), NOT_FOUND.
 */
export async function previewStartTramoAction(projectId: string, workflowId: string): Promise<StartTramoPreview> {
  const user = await requireActivities("canViewActivities");
  if (!resolveProjectsCapabilities(user).canViewProjects) throw flowError(FLOW_ERROR.FORBIDDEN);
  const project = parseInput(UuidSchema, projectId);
  const workflow = parseInput(UuidSchema, workflowId);
  return previewStartTramo(db, project, workflow);
}

/**
 * Idempotent: templates already on the project are skipped (`skippedCount`).
 * `by_phase` managers must be live, active staff (`INVALID: managers`);
 * candidates are never enforced. `autoStart` is admin only and is saved in
 * the same transaction as the start.
 * Errors: FORBIDDEN, NOT_FOUND, PHASE_MISMATCH, NO_PHASES, INVALID.
 */
export async function startTramoAction(
  ...args: Parameters<typeof startTramoActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof startTramoActionImpl>>>> {
  return toActionResult(() => startTramoActionImpl(...args));
}

async function startTramoActionImpl(input: StartTramoInput): Promise<StartTramoResult> {
  const user = await requireActivities("canCreateActivity");
  const parsed = parseInput(StartTramoInputSchema, input);
  if (parsed.autoStart !== undefined && !canSeeAdminData(user)) throw flowError(FLOW_ERROR.FORBIDDEN, "autoStart");

  if (parsed.assignment.mode === "by_phase") {
    const managerIds = [
      ...new Set(Object.values(parsed.assignment.managers).filter((id): id is string => Boolean(id))),
    ];
    if (managerIds.length > 0) {
      const live = await staffRepository.liveActiveStaffIds(managerIds);
      if (managerIds.some((id) => !live.has(id))) throw flowError(FLOW_ERROR.INVALID, "managers");
    }
  }

  const result = await db.transaction((tx) =>
    startTramo(tx, {
      projectId: parsed.projectId,
      workflowId: parsed.workflowId,
      phaseIds: [...new Set(parsed.phaseIds)],
      assignment: parsed.assignment,
      actorId: user.member.id,
      trigger: "manual",
      autoStart: parsed.autoStart,
    })
  );
  revalidateTramoStart();
  return result;
}

/** Only the latest untouched batch of the tramo. Errors: FORBIDDEN, NOT_FOUND, TOUCHED. */
export async function undoStartTramoAction(
  ...args: Parameters<typeof undoStartTramoActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof undoStartTramoActionImpl>>>> {
  return toActionResult(() => undoStartTramoActionImpl(...args));
}

async function undoStartTramoActionImpl(batchId: string): Promise<void> {
  const user = await requireActivities("canCreateActivity");
  const id = parseInput(UuidSchema, batchId);
  await db.transaction((tx) => undoStartTramo(tx, id, user.member.id));
  revalidateTramoStart();
}
