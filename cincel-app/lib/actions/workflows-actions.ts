"use server";

import { z } from "zod";

import { toActionResult } from "@/lib/actions/action-result";
import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveWorkflowsCapabilities } from "@/lib/auth/permissions";
import { FLOW_ERROR, flowError } from "@/lib/project-flow/errors";
import * as workflowPhasesRepository from "@/lib/repositories/workflow-phases-repository";
import * as workflowsRepository from "@/lib/repositories/workflows-repository";
import {
  OrderedIdsSchema,
  UuidSchema,
  WorkflowPhaseInputSchema,
  WorkflowTaskTemplateInputSchema,
  parseInput,
} from "@/lib/validation/project-flow";
import type {
  Workflow,
  WorkflowDetail,
  WorkflowInput,
  WorkflowPhase,
  WorkflowPhaseInput,
  WorkflowRef,
  WorkflowTaskTemplate,
  WorkflowTaskTemplateInput,
} from "@/lib/types/core";
import type { ActionResult } from "@/lib/types/schedule";

async function requireWorkflowsCapabilities() {
  return resolveWorkflowsCapabilities(await requireCapabilityUser());
}

/** Signed-in user allowed to manage tramos, fases and templates; FORBIDDEN otherwise. */
async function requireWorkflowsManager() {
  const user = await requireCapabilityUser();
  if (!resolveWorkflowsCapabilities(user).canManageWorkflows) throw flowError(FLOW_ERROR.FORBIDDEN);
  return user;
}

/**
 * Any staff session reads the active tramos, fases and templates (Actividades,
 * Proyectos, Equipo and Puestos all need them). An `includeInactive*` flag
 * requires `canManageWorkflows` (else FORBIDDEN).
 */
export async function fetchWorkflowsAction(
  options: { includeInactive?: boolean; includeInactiveTemplates?: boolean; includeInactivePhases?: boolean } = {}
): Promise<WorkflowDetail[]> {
  const caps = await requireWorkflowsCapabilities();
  // Active rows for any staff session; the inactive flags only for managers, ignored otherwise (BE §7.1).
  if (!caps.canManageWorkflows) return workflowsRepository.listWorkflows({});
  const flags: { includeInactive?: true; includeInactiveTemplates?: true; includeInactivePhases?: true } = {};
  if (options.includeInactive === true) flags.includeInactive = true;
  if (options.includeInactiveTemplates === true) flags.includeInactiveTemplates = true;
  if (options.includeInactivePhases === true) flags.includeInactivePhases = true;
  return workflowsRepository.listWorkflows(flags);
}

export async function fetchWorkflowAction(id: string): Promise<WorkflowDetail | null> {
  const caps = await requireWorkflowsCapabilities();
  if (!caps.canViewWorkflows) return null;
  return workflowsRepository.getWorkflow(id);
}

export async function createWorkflowAction(input: WorkflowInput): Promise<Workflow> {
  const user = await requireCapabilityUser();
  if (!resolveWorkflowsCapabilities(user).canManageWorkflows) {
    throw new Error("FORBIDDEN: workflow create");
  }
  return workflowsRepository.createWorkflow(input, user.member.id);
}

/** The tramo color picker: 1–5, or null for the derived color. */
const ColorSlotSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]).nullable();

/** Partial patch; `colorSlot` is 1–5 or null (INVALID otherwise). Errors: FORBIDDEN, WORKFLOW_NOT_FOUND, INVALID. */
export async function updateWorkflowAction(id: string, patch: Partial<WorkflowInput>): Promise<Workflow> {
  const user = await requireCapabilityUser();
  if (!resolveWorkflowsCapabilities(user).canManageWorkflows) {
    throw new Error("FORBIDDEN: workflow edit");
  }
  const clean: Partial<WorkflowInput> = { ...patch };
  if (patch.colorSlot !== undefined) clean.colorSlot = parseInput(ColorSlotSchema, patch.colorSlot);
  return workflowsRepository.updateWorkflow(id, clean, user.member.id);
}

/**
 * Tramo order (Ajustes › Tramos y fases): `sort_order` = index in one
 * transaction. `canManageWorkflows`. Errors: FORBIDDEN, INVALID.
 */
export async function reorderWorkflowsAction(
  ...args: Parameters<typeof reorderWorkflowsActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof reorderWorkflowsActionImpl>>>> {
  return toActionResult(() => reorderWorkflowsActionImpl(...args));
}

async function reorderWorkflowsActionImpl(orderedIds: string[]): Promise<void> {
  await requireWorkflowsManager();
  await workflowsRepository.reorderWorkflows(parseInput(OrderedIdsSchema, orderedIds));
}

export async function deleteWorkflowAction(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveWorkflowsCapabilities(user).canManageWorkflows) {
    throw new Error("FORBIDDEN: workflow delete");
  }
  await workflowsRepository.softDeleteWorkflow(id, user.member.id);
}

/** `phaseId` is required. Errors: FORBIDDEN, NOT_FOUND, EMPTY, INVALID, PHASE_MISMATCH, NAME_TAKEN. */
export async function createTemplateAction(
  ...args: Parameters<typeof createTemplateActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof createTemplateActionImpl>>>> {
  return toActionResult(() => createTemplateActionImpl(...args));
}

async function createTemplateActionImpl(
  workflowId: string,
  input: WorkflowTaskTemplateInput
): Promise<WorkflowTaskTemplate> {
  const user = await requireCapabilityUser();
  if (!resolveWorkflowsCapabilities(user).canManageWorkflows) {
    throw flowError(FLOW_ERROR.FORBIDDEN, "template create");
  }
  const id = parseInput(UuidSchema, workflowId);
  const parsed = parseInput(WorkflowTaskTemplateInputSchema, input);
  const row = await workflowsRepository.createTemplate(id, parsed, user.member.id);
  return row;
}

/**
 * Partial patch; `phaseId`, when sent, must be a fase of the template's tramo.
 * Errors: FORBIDDEN, NOT_FOUND, EMPTY, INVALID, PHASE_MISMATCH, NAME_TAKEN.
 */
export async function updateTemplateAction(
  ...args: Parameters<typeof updateTemplateActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof updateTemplateActionImpl>>>> {
  return toActionResult(() => updateTemplateActionImpl(...args));
}

async function updateTemplateActionImpl(
  id: string,
  patch: Partial<WorkflowTaskTemplateInput>
): Promise<WorkflowTaskTemplate> {
  const user = await requireCapabilityUser();
  if (!resolveWorkflowsCapabilities(user).canManageWorkflows) {
    throw flowError(FLOW_ERROR.FORBIDDEN, "template edit");
  }
  const templateId = parseInput(UuidSchema, id);
  const parsed = parseInput(WorkflowTaskTemplateInputSchema.partial(), patch);
  const row = await workflowsRepository.updateTemplate(templateId, parsed, user.member.id);
  return row;
}

export async function deactivateTemplateAction(
  ...args: Parameters<typeof deactivateTemplateActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof deactivateTemplateActionImpl>>>> {
  return toActionResult(() => deactivateTemplateActionImpl(...args));
}

async function deactivateTemplateActionImpl(id: string): Promise<WorkflowTaskTemplate> {
  const user = await requireCapabilityUser();
  if (!resolveWorkflowsCapabilities(user).canManageWorkflows) {
    throw new Error("FORBIDDEN: template deactivate");
  }
  const row = await workflowsRepository.deactivateTemplate(id, user.member.id);
  return row;
}

export async function reorderTemplatesAction(
  ...args: Parameters<typeof reorderTemplatesActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof reorderTemplatesActionImpl>>>> {
  return toActionResult(() => reorderTemplatesActionImpl(...args));
}

async function reorderTemplatesActionImpl(workflowId: string, orderedIds: string[]): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveWorkflowsCapabilities(user).canManageWorkflows) {
    throw new Error("FORBIDDEN: template reorder");
  }
  await workflowsRepository.reorderTemplates(workflowId, orderedIds);
}

// ── Tramos y fases (project flow BE §7.1) ───────────────────────────────────

/** Active tramos for the sidebar and tabs (staff session). */
export async function fetchTramosNavAction(): Promise<WorkflowRef[]> {
  await requireCapabilityUser();
  return workflowsRepository.listTramosNav();
}

/** `canManageWorkflows`. Appended last. Errors: FORBIDDEN, NOT_FOUND, NAME_TAKEN, EMPTY. */
export async function createWorkflowPhaseAction(
  ...args: Parameters<typeof createWorkflowPhaseActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof createWorkflowPhaseActionImpl>>>> {
  return toActionResult(() => createWorkflowPhaseActionImpl(...args));
}

async function createWorkflowPhaseActionImpl(workflowId: string, input: WorkflowPhaseInput): Promise<WorkflowPhase> {
  const user = await requireWorkflowsManager();
  const id = parseInput(UuidSchema, workflowId);
  const values = parseInput(WorkflowPhaseInputSchema, input);
  const row = await workflowPhasesRepository.createPhase(id, values, user.member.id);
  return row;
}

/** Rename, activate/deactivate. Errors: FORBIDDEN, NOT_FOUND, NAME_TAKEN, EMPTY. */
export async function updateWorkflowPhaseAction(
  ...args: Parameters<typeof updateWorkflowPhaseActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof updateWorkflowPhaseActionImpl>>>> {
  return toActionResult(() => updateWorkflowPhaseActionImpl(...args));
}

async function updateWorkflowPhaseActionImpl(
  id: string,
  patch: Partial<WorkflowPhaseInput>
): Promise<WorkflowPhase> {
  const user = await requireWorkflowsManager();
  const phaseId = parseInput(UuidSchema, id);
  const values = parseInput(WorkflowPhaseInputSchema.partial(), patch);
  const row = await workflowPhasesRepository.updatePhase(phaseId, values, user.member.id);
  return row;
}

/** `orderedIds` must be exactly the tramo's fase ids. Errors: FORBIDDEN, NOT_FOUND. */
export async function reorderWorkflowPhasesAction(
  ...args: Parameters<typeof reorderWorkflowPhasesActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof reorderWorkflowPhasesActionImpl>>>> {
  return toActionResult(() => reorderWorkflowPhasesActionImpl(...args));
}

async function reorderWorkflowPhasesActionImpl(workflowId: string, orderedIds: string[]): Promise<void> {
  await requireWorkflowsManager();
  const id = parseInput(UuidSchema, workflowId);
  const ids = parseInput(OrderedIdsSchema, orderedIds);
  await workflowPhasesRepository.reorderPhases(id, ids);
}

/**
 * The "Iniciar automáticamente" switch: `true` stores `on_create` for the
 * first active tramo and `on_ready` for the others, `false` stores `manual`.
 * Errors: FORBIDDEN, NOT_FOUND.
 */
export async function setWorkflowAutoStartAction(
  ...args: Parameters<typeof setWorkflowAutoStartActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setWorkflowAutoStartActionImpl>>>> {
  return toActionResult(() => setWorkflowAutoStartActionImpl(...args));
}

async function setWorkflowAutoStartActionImpl(workflowId: string, autoStart: boolean): Promise<Workflow> {
  const user = await requireWorkflowsManager();
  const id = parseInput(UuidSchema, workflowId);
  const enabled = parseInput(z.boolean(), autoStart);
  const row = await workflowsRepository.setWorkflowAutoStart(id, enabled, user.member.id);
  return row;
}
