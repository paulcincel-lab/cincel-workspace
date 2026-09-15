"use server";

import { revalidatePath } from "next/cache";

import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveWorkflowsCapabilities } from "@/lib/auth/permissions";
import * as workflowsRepository from "@/lib/repositories/workflows-repository";
import type {
  Workflow,
  WorkflowDetail,
  WorkflowInput,
  WorkflowTaskTemplate,
  WorkflowTaskTemplateInput,
} from "@/lib/types/core";

async function requireWorkflowsCapabilities() {
  return resolveWorkflowsCapabilities(await requireCapabilityUser());
}

export async function fetchWorkflowsAction(
  options: { includeInactive?: boolean } = {}
): Promise<WorkflowDetail[]> {
  const caps = await requireWorkflowsCapabilities();
  if (!caps.canViewWorkflows) return [];
  return workflowsRepository.listWorkflows(options);
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

export async function createTemplateAction(
  workflowId: string,
  input: WorkflowTaskTemplateInput
): Promise<WorkflowTaskTemplate> {
  const user = await requireCapabilityUser();
  if (!resolveWorkflowsCapabilities(user).canManageWorkflows) {
    throw new Error("FORBIDDEN: template create");
  }
  const row = await workflowsRepository.createTemplate(workflowId, input, user.member.id);
  revalidatePath("/configuracion/workflows");
  return row;
}

export async function updateTemplateAction(
  id: string,
  patch: Partial<WorkflowTaskTemplateInput>
): Promise<WorkflowTaskTemplate> {
  const user = await requireCapabilityUser();
  if (!resolveWorkflowsCapabilities(user).canManageWorkflows) {
    throw new Error("FORBIDDEN: template edit");
  }
  const row = await workflowsRepository.updateTemplate(id, patch, user.member.id);
  revalidatePath("/configuracion/workflows");
  return row;
}

export async function deactivateTemplateAction(id: string): Promise<WorkflowTaskTemplate> {
  const user = await requireCapabilityUser();
  if (!resolveWorkflowsCapabilities(user).canManageWorkflows) {
    throw new Error("FORBIDDEN: template deactivate");
  }
  const row = await workflowsRepository.deactivateTemplate(id, user.member.id);
  revalidatePath("/configuracion/workflows");
  return row;
}

export async function reorderTemplatesAction(workflowId: string, orderedIds: string[]): Promise<void> {
  const user = await requireCapabilityUser();
  if (!resolveWorkflowsCapabilities(user).canManageWorkflows) {
    throw new Error("FORBIDDEN: template reorder");
  }
  await workflowsRepository.reorderTemplates(workflowId, orderedIds);
  revalidatePath("/configuracion/workflows");
}
