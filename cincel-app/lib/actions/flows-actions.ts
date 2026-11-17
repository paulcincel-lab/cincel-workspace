"use server";

/**
 * Ajustes › Flujos (#1035). Every action re-checks the admin permission of
 * the segment (the rule of Etapas y fases) and validates its input with zod.
 * They return `ActionResult`; the client invalidates `ajustes.page('flujos')`
 * and the create dialog's options. Errors: FORBIDDEN, NOT_FOUND, EMPTY,
 * NAME_TAKEN, INVALID.
 */
import { toActionResult } from "@/lib/actions/action-result";
import { AJUSTES_SEGMENT_CAPABILITY } from "@/lib/auth/ajustes-segments";
import { requireCapabilityUser } from "@/lib/auth/session";
import { FLOW_ERROR, flowError } from "@/lib/project-flow/errors";
import * as flowsRepository from "@/lib/repositories/flows-repository";
import type { FlowAdminRow, FlowInput } from "@/lib/types/flows-admin";
import type { ActionResult } from "@/lib/types/schedule";
import { FlowInputSchema, UuidSchema, parseInput } from "@/lib/validation/project-flow";

/** Signed-in administrator of the Flujos segment; FORBIDDEN otherwise. */
async function requireFlowsAdmin() {
  const user = await requireCapabilityUser();
  if (!AJUSTES_SEGMENT_CAPABILITY.flujos(user)) throw flowError(FLOW_ERROR.FORBIDDEN);
  return user;
}

/** Creates a flow (active, not the default). Errors: FORBIDDEN, EMPTY, NAME_TAKEN, INVALID. */
export async function createFlowAction(
  ...args: Parameters<typeof createFlowActionImpl>
): Promise<ActionResult<FlowAdminRow>> {
  return toActionResult(() => createFlowActionImpl(...args));
}

async function createFlowActionImpl(input: FlowInput): Promise<FlowAdminRow> {
  await requireFlowsAdmin();
  return flowsRepository.createFlow(parseInput(FlowInputSchema, input));
}

/** Renames a flow, replaces its etapas and gates, and toggles `active`. Errors: FORBIDDEN, NOT_FOUND, EMPTY, NAME_TAKEN, INVALID. */
export async function updateFlowAction(
  ...args: Parameters<typeof updateFlowActionImpl>
): Promise<ActionResult<FlowAdminRow>> {
  return toActionResult(() => updateFlowActionImpl(...args));
}

async function updateFlowActionImpl(id: string, input: FlowInput): Promise<FlowAdminRow> {
  await requireFlowsAdmin();
  return flowsRepository.updateFlow(parseInput(UuidSchema, id), parseInput(FlowInputSchema, input));
}

/** Marks an active flow as the default. Errors: FORBIDDEN, NOT_FOUND, INVALID. */
export async function setDefaultFlowAction(
  ...args: Parameters<typeof setDefaultFlowActionImpl>
): Promise<ActionResult<FlowAdminRow>> {
  return toActionResult(() => setDefaultFlowActionImpl(...args));
}

async function setDefaultFlowActionImpl(id: string): Promise<FlowAdminRow> {
  await requireFlowsAdmin();
  return flowsRepository.setDefaultFlow(parseInput(UuidSchema, id));
}
