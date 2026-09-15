"use server";

import { revalidatePath } from "next/cache";

import { requireCapabilityUser } from "@/lib/auth/session";
import { isAdministratorRole } from "@/lib/data/roles";
import * as workflowsRepository from "@/lib/repositories/workflows-repository";
import type {
  Workflow,
  WorkflowDetail,
  WorkflowInput,
  WorkflowTaskTemplate,
  WorkflowTaskTemplateInput,
} from "@/lib/types/core";

/** Workflows and their templates are an admin surface (Phase 3). */
async function requireAdmin() {
  const user = await requireCapabilityUser();
  if (!isAdministratorRole(user.member.role) && user.access !== "Dirección") {
    throw new Error("FORBIDDEN: workflows admin");
  }
  return user;
}

export async function fetchWorkflowsAction(
  options: { includeInactive?: boolean } = {}
): Promise<WorkflowDetail[]> {
  await requireCapabilityUser();
  return workflowsRepository.listWorkflows(options);
}

export async function fetchWorkflowAction(id: string): Promise<WorkflowDetail | null> {
  await requireCapabilityUser();
  return workflowsRepository.getWorkflow(id);
}

export async function createWorkflowAction(input: WorkflowInput): Promise<Workflow> {
  const user = await requireAdmin();
  const row = await workflowsRepository.createWorkflow(input, user.member.id);
  revalidatePath("/configuracion/workflows");
  return row;
}

export async function updateWorkflowAction(id: string, patch: Partial<WorkflowInput>): Promise<Workflow> {
  const user = await requireAdmin();
  const row = await workflowsRepository.updateWorkflow(id, patch, user.member.id);
  revalidatePath("/configuracion/workflows");
  return row;
}

export async function deleteWorkflowAction(id: string): Promise<void> {
  const user = await requireAdmin();
  await workflowsRepository.softDeleteWorkflow(id, user.member.id);
  revalidatePath("/configuracion/workflows");
}

export async function createTemplateAction(
  workflowId: string,
  input: WorkflowTaskTemplateInput
): Promise<WorkflowTaskTemplate> {
  const user = await requireAdmin();
  const row = await workflowsRepository.createTemplate(workflowId, input, user.member.id);
  revalidatePath("/configuracion/workflows");
  return row;
}

export async function updateTemplateAction(
  id: string,
  patch: Partial<WorkflowTaskTemplateInput>
): Promise<WorkflowTaskTemplate> {
  const user = await requireAdmin();
  const row = await workflowsRepository.updateTemplate(id, patch, user.member.id);
  revalidatePath("/configuracion/workflows");
  return row;
}

export async function deactivateTemplateAction(id: string): Promise<WorkflowTaskTemplate> {
  const user = await requireAdmin();
  const row = await workflowsRepository.deactivateTemplate(id, user.member.id);
  revalidatePath("/configuracion/workflows");
  return row;
}

export async function reorderTemplatesAction(workflowId: string, orderedIds: string[]): Promise<void> {
  await requireAdmin();
  await workflowsRepository.reorderTemplates(workflowId, orderedIds);
  revalidatePath("/configuracion/workflows");
}
