"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

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

const TRAMOS_PATH = "/configuracion/tramos";

async function requireWorkflowsCapabilities() {
  return resolveWorkflowsCapabilities(await requireCapabilityUser());
}

/** Signed-in user allowed to manage tramos, fases and templates; FORBIDDEN otherwise. */
async function requireWorkflowsManager() {
  const user = await requireCapabilityUser();
  if (!resolveWorkflowsCapabilities(user).canManageWorkflows) throw flowError(FLOW_ERROR.FORBIDDEN);
  return user;
}

/** The tramos admin page (old and new route) and the Actividades layout (tabs, sidebar). */
function revalidateTramos(options: { positions?: boolean; projects?: boolean } = {}) {
  revalidatePath("/configuracion/tramos");
  revalidatePath("/configuracion/workflows");
  if (options.positions) revalidatePath("/configuracion/puestos");
  if (options.projects) revalidatePath("/proyectos");
  revalidatePath("/actividades", "layout");
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
  const wantsInactive = Boolean(
    options.includeInactive || options.includeInactiveTemplates || options.includeInactivePhases
  );
  if (wantsInactive && !caps.canManageWorkflows) throw flowError(FLOW_ERROR.FORBIDDEN, "inactive workflows");
  return workflowsRepository.listWorkflows({
    includeInactive: options.includeInactive === true,
    includeInactiveTemplates: options.includeInactiveTemplates === true,
    includeInactivePhases: options.includeInactivePhases === true,
  });
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
  const row = await workflowsRepository.createWorkflow(input, user.member.id);
  revalidatePath("/configuracion/workflows");
  return row;
}

export async function updateWorkflowAction(id: string, patch: Partial<WorkflowInput>): Promise<Workflow> {
  const user = await requireCapabilityUser();
  if (!resolveWorkflowsCapabilities(user).canManageWorkflows) {
    throw new Error("FORBIDDEN: workflow edit");
  }
  const row = await workflowsRepository.updateWorkflow(id, patch, user.member.id);
  revalidatePath("/configuracion/workflows");
  return row;
}

export async function deleteWorkflowAction(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveWorkflowsCapabilities(user).canManageWorkflows) {
    throw new Error("FORBIDDEN: workflow delete");
  }
  await workflowsRepository.softDeleteWorkflow(id, user.member.id);
  revalidatePath("/configuracion/workflows");
}

function revalidateTemplates(layout: boolean) {
  revalidatePath(TRAMOS_PATH);
  if (layout) revalidatePath("/actividades", "layout");
}

/** `phaseId` is required. Errors: FORBIDDEN, NOT_FOUND, EMPTY, INVALID, PHASE_MISMATCH, NAME_TAKEN. */
export async function createTemplateAction(
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
  revalidateTemplates(true);
  return row;
}

/**
 * Partial patch; `phaseId`, when sent, must be a fase of the template's tramo.
 * Errors: FORBIDDEN, NOT_FOUND, EMPTY, INVALID, PHASE_MISMATCH, NAME_TAKEN.
 */
export async function updateTemplateAction(
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
  revalidateTemplates(true);
  return row;
}

export async function deactivateTemplateAction(id: string): Promise<WorkflowTaskTemplate> {
  const user = await requireCapabilityUser();
  if (!resolveWorkflowsCapabilities(user).canManageWorkflows) {
    throw new Error("FORBIDDEN: template deactivate");
  }
  const row = await workflowsRepository.deactivateTemplate(id, user.member.id);
  revalidateTemplates(false);
  return row;
}

export async function reorderTemplatesAction(workflowId: string, orderedIds: string[]): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveWorkflowsCapabilities(user).canManageWorkflows) {
    throw new Error("FORBIDDEN: template reorder");
  }
  await workflowsRepository.reorderTemplates(workflowId, orderedIds);
  revalidateTemplates(false);
}

// ── Tramos y fases (project flow BE §7.1) ───────────────────────────────────

/** Active tramos for the sidebar and tabs (staff session). */
export async function fetchTramosNavAction(): Promise<WorkflowRef[]> {
  await requireCapabilityUser();
  return workflowsRepository.listTramosNav();
}

/** `canManageWorkflows`. Appended last. Errors: FORBIDDEN, NOT_FOUND, NAME_TAKEN, EMPTY. */
export async function createWorkflowPhaseAction(workflowId: string, input: WorkflowPhaseInput): Promise<WorkflowPhase> {
  const user = await requireWorkflowsManager();
  const id = parseInput(UuidSchema, workflowId);
  const values = parseInput(WorkflowPhaseInputSchema, input);
  const row = await workflowPhasesRepository.createPhase(id, values, user.member.id);
  revalidateTramos({ positions: true });
  return row;
}

/** Rename, activate/deactivate. Errors: FORBIDDEN, NOT_FOUND, NAME_TAKEN, EMPTY. */
export async function updateWorkflowPhaseAction(
  id: string,
  patch: Partial<WorkflowPhaseInput>
): Promise<WorkflowPhase> {
  const user = await requireWorkflowsManager();
  const phaseId = parseInput(UuidSchema, id);
  const values = parseInput(WorkflowPhaseInputSchema.partial(), patch);
  const row = await workflowPhasesRepository.updatePhase(phaseId, values, user.member.id);
  revalidateTramos({ positions: true });
  return row;
}

/** `orderedIds` must be exactly the tramo's fase ids. Errors: FORBIDDEN, NOT_FOUND. */
export async function reorderWorkflowPhasesAction(workflowId: string, orderedIds: string[]): Promise<void> {
  await requireWorkflowsManager();
  const id = parseInput(UuidSchema, workflowId);
  const ids = parseInput(OrderedIdsSchema, orderedIds);
  await workflowPhasesRepository.reorderPhases(id, ids);
  revalidateTramos({ positions: true });
}

/**
 * The "Iniciar automáticamente" switch: `true` stores `on_create` for the
 * first active tramo and `on_ready` for the others, `false` stores `manual`.
 * Errors: FORBIDDEN, NOT_FOUND.
 */
export async function setWorkflowAutoStartAction(workflowId: string, autoStart: boolean): Promise<Workflow> {
  const user = await requireWorkflowsManager();
  const id = parseInput(UuidSchema, workflowId);
  const enabled = parseInput(z.boolean(), autoStart);
  const row = await workflowsRepository.setWorkflowAutoStart(id, enabled, user.member.id);
  revalidateTramos({ projects: true });
  return row;
}
