"use server";

/**
 * Starting an etapa (project flow BE §7.4, FE §7.5). Reads need
 * `activities.canViewActivities`; start and undo need `canCreateActivity`
 * (and admin for `autoStart`). The preview also needs `canViewProjects`.
 * Start and undo return `ActionResult`; the Tareas cache is invalidated on
 * the client (`etapaStartInvalidations`, Query Migration 4d), Proyectos
 * reads `qk.proyectos.*` (5a), and they still revalidate Inicio until that
 * phase moves.
 */
import { toActionResult } from "@/lib/actions/action-result";
import { revalidateInicioScreen } from "@/lib/cache/screens/inicio";

import { canSeeAdminData, resolveActivitiesCapabilities, resolveProjectsCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { FLOW_ERROR, flowError } from "@/lib/project-flow/errors";
import { etapaBoard } from "@/lib/project-flow/readiness";
import { previewStartEtapa, startEtapa, undoStartEtapa } from "@/lib/project-flow/start-etapa";
import * as staffRepository from "@/lib/repositories/staff-repository";
import type { ActionResult } from "@/lib/types/schedule";
import type {
  StartEtapaInput,
  StartEtapaPreview,
  StartEtapaResult,
  EtapaBoard,
  ViewerScope,
} from "@/lib/types/core";
import { StartEtapaInputSchema, UuidSchema, parseInput } from "@/lib/validation/project-flow";

type CapabilityUser = Awaited<ReturnType<typeof requireCapabilityUser>>;

const viewerOf = (user: CapabilityUser): ViewerScope => ({ staffId: user.member.id, isAdmin: canSeeAdminData(user) });

async function requireActivities(capability: "canViewActivities" | "canCreateActivity"): Promise<CapabilityUser> {
  const user = await requireCapabilityUser();
  if (!resolveActivitiesCapabilities(user)[capability]) throw flowError(FLOW_ERROR.FORBIDDEN);
  return user;
}

/** Proyectos reads `qk.proyectos.*` (5a, #959): the client invalidates it; only Inicio is revalidated. */
function revalidateEtapaStart() {
  revalidateInicioScreen();
}

/** Listos para iniciar, Próximos and started projects of one etapa. Errors: FORBIDDEN, NOT_FOUND. */
export async function fetchEtapaBoardAction(workflowId: string): Promise<EtapaBoard> {
  const user = await requireActivities("canViewActivities");
  const id = parseInput(UuidSchema, workflowId);
  return etapaBoard(db, id, viewerOf(user));
}

/**
 * The sheet's fases, templates still to create and candidates. Read-only.
 * Errors: FORBIDDEN (also without `canViewProjects`), NOT_FOUND.
 */
export async function previewStartEtapaAction(projectId: string, workflowId: string): Promise<StartEtapaPreview> {
  const user = await requireActivities("canViewActivities");
  if (!resolveProjectsCapabilities(user).canViewProjects) throw flowError(FLOW_ERROR.FORBIDDEN);
  const project = parseInput(UuidSchema, projectId);
  const workflow = parseInput(UuidSchema, workflowId);
  return previewStartEtapa(db, project, workflow);
}

/**
 * Idempotent: templates already on the project are skipped (`skippedCount`).
 * `by_phase` managers must be live, active staff (`INVALID: managers`);
 * candidates are never enforced. `autoStart` is admin only and is saved in
 * the same transaction as the start.
 * Errors: FORBIDDEN, NOT_FOUND, PHASE_MISMATCH, NO_PHASES, INVALID.
 */
export async function startEtapaAction(
  ...args: Parameters<typeof startEtapaActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof startEtapaActionImpl>>>> {
  return toActionResult(() => startEtapaActionImpl(...args));
}

async function startEtapaActionImpl(input: StartEtapaInput): Promise<StartEtapaResult> {
  const user = await requireActivities("canCreateActivity");
  const parsed = parseInput(StartEtapaInputSchema, input);
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
    startEtapa(tx, {
      projectId: parsed.projectId,
      workflowId: parsed.workflowId,
      phaseIds: [...new Set(parsed.phaseIds)],
      assignment: parsed.assignment,
      actorId: user.member.id,
      trigger: "manual",
      autoStart: parsed.autoStart,
    })
  );
  revalidateEtapaStart();
  return result;
}

/** Only the latest untouched batch of the etapa. Errors: FORBIDDEN, NOT_FOUND, TOUCHED. */
export async function undoStartEtapaAction(
  ...args: Parameters<typeof undoStartEtapaActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof undoStartEtapaActionImpl>>>> {
  return toActionResult(() => undoStartEtapaActionImpl(...args));
}

async function undoStartEtapaActionImpl(batchId: string): Promise<void> {
  const user = await requireActivities("canCreateActivity");
  const id = parseInput(UuidSchema, batchId);
  await db.transaction((tx) => undoStartEtapa(tx, id, user.member.id));
  revalidateEtapaStart();
}
