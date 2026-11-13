"use server";

import { z } from "zod";

import { requireCapabilityUser } from "@/lib/auth/session";
import {
  loadCatalogAssignableStaff,
  loadCatalogContacts,
  loadCatalogProjectOptions,
  loadCatalogProjectSpaces,
  loadCatalogStaff,
  loadCatalogTaskStatuses,
  loadCatalogWorkflows,
} from "@/lib/loaders/catalog";
import type {
  CatalogAssignableStaffOption,
  CatalogContactOption,
  CatalogProjectOption,
  CatalogStaffOption,
} from "@/lib/types/catalog";
import type { ProjectSpace, TaskStatusOption, WorkflowRef } from "@/lib/types/core";
import { UuidSchema, parseInput } from "@/lib/validation/project-flow";

/**
 * Catalog reads for pickers (Query Migration 1b, #954), one per `qk.catalog`
 * key. Each one parses its input, requires a staff session (a guest gets
 * FORBIDDEN) and hands the viewer to its loader, which re-checks the page
 * capability. Read-only: no revalidation, no writes.
 */

const EmptyInput = z.object({});
const AssignableStaffInput = z.object({ workflowId: UuidSchema.nullable() });
const ProjectSpacesInput = z.object({ projectId: UuidSchema });
const ContactsInput = z.object({ type: z.enum(["cliente", "socio", "proveedor"]).optional() });

/** Live projects `{id,name,status}` (NewTaskDialog, Inbox, GmailReader). */
export async function fetchCatalogProjectOptions(input: z.input<typeof EmptyInput> = {}): Promise<CatalogProjectOption[]> {
  parseInput(EmptyInput, input);
  return loadCatalogProjectOptions(await requireCapabilityUser());
}

/** Active etapas (`catalog.workflows` and `catalog.etapas`). */
export async function fetchCatalogWorkflows(input: z.input<typeof EmptyInput> = {}): Promise<WorkflowRef[]> {
  parseInput(EmptyInput, input);
  await requireCapabilityUser();
  return loadCatalogWorkflows();
}

export async function fetchCatalogTaskStatuses(input: z.input<typeof EmptyInput> = {}): Promise<TaskStatusOption[]> {
  parseInput(EmptyInput, input);
  return loadCatalogTaskStatuses(await requireCapabilityUser());
}

/** Active staff, only `{id,name}`. */
export async function fetchCatalogStaff(input: z.input<typeof EmptyInput> = {}): Promise<CatalogStaffOption[]> {
  parseInput(EmptyInput, input);
  return loadCatalogStaff(await requireCapabilityUser());
}

/** Assignable staff for an etapa, only `{id,name,suggested}`, suggested first. */
export async function fetchCatalogAssignableStaff(
  input: z.input<typeof AssignableStaffInput>,
): Promise<CatalogAssignableStaffOption[]> {
  const parsed = parseInput(AssignableStaffInput, input);
  return loadCatalogAssignableStaff(await requireCapabilityUser(), parsed);
}

/** A project's espacios; `null` when the viewer can't see the project. */
export async function fetchCatalogProjectSpaces(input: z.input<typeof ProjectSpacesInput>): Promise<ProjectSpace[] | null> {
  const parsed = parseInput(ProjectSpacesInput, input);
  return loadCatalogProjectSpaces(await requireCapabilityUser(), parsed);
}

/** Live contacts `{id,name,type}`, optionally of one type. */
export async function fetchCatalogContacts(input: z.input<typeof ContactsInput> = {}): Promise<CatalogContactOption[]> {
  const parsed = parseInput(ContactsInput, input);
  return loadCatalogContacts(await requireCapabilityUser(), parsed);
}
