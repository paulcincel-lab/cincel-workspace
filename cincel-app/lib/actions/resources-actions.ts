"use server";

import { toActionResult } from "@/lib/actions/action-result";
import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveResourcesCapabilities } from "@/lib/auth/permissions";
import * as resourcesRepository from "@/lib/repositories/resources-repository";
import type { ResourceLink, ResourceLinkInput, ResourceSection } from "@/lib/types/resource";
import type { ActionResult } from "@/lib/types/schedule";

/**
 * Resource links (Biblioteca). The writes return `ActionResult` (production
 * strips thrown messages) and revalidate no path: the Biblioteca updates its
 * `biblioteca.links` query cache (Query Migration Phase 8).
 */

async function requireResourcesCapabilities() {
  return resolveResourcesCapabilities(await requireCapabilityUser());
}

function canWriteResources(caps: Awaited<ReturnType<typeof requireResourcesCapabilities>>): boolean {
  return (
    caps.enterprise.canCreate ||
    caps.enterprise.canEdit ||
    caps.enterprise.canDelete ||
    caps.corporate.canCreate ||
    caps.corporate.canDelete ||
    caps.canManageFavoritesSection
  );
}

export async function fetchResourceLinksAction(
  options: { section?: ResourceSection; personalForId?: string | null } = {}
): Promise<ResourceLink[]> {
  const caps = await requireResourcesCapabilities();
  if (!caps.canViewResources) return [];
  return resourcesRepository.listResourceLinks(options);
}

export async function createResourceLinkAction(
  ...args: Parameters<typeof createResourceLinkActionImpl>
): Promise<ActionResult<ResourceLink>> {
  return toActionResult(() => createResourceLinkActionImpl(...args));
}

async function createResourceLinkActionImpl(input: ResourceLinkInput): Promise<ResourceLink> {
  const user = await requireCapabilityUser();
  if (!canWriteResources(resolveResourcesCapabilities(user))) {
    throw new Error("FORBIDDEN: resource create");
  }
  return resourcesRepository.createResourceLink(input, user.member.id);
}

export async function updateResourceLinkAction(
  ...args: Parameters<typeof updateResourceLinkActionImpl>
): Promise<ActionResult<ResourceLink>> {
  return toActionResult(() => updateResourceLinkActionImpl(...args));
}

async function updateResourceLinkActionImpl(id: string, patch: Partial<ResourceLinkInput>): Promise<ResourceLink> {
  const user = await requireCapabilityUser();
  if (!canWriteResources(resolveResourcesCapabilities(user))) {
    throw new Error("FORBIDDEN: resource edit");
  }
  return resourcesRepository.updateResourceLink(id, patch, user.member.id);
}

export async function deleteResourceLinkAction(
  ...args: Parameters<typeof deleteResourceLinkActionImpl>
): Promise<ActionResult<void>> {
  return toActionResult(() => deleteResourceLinkActionImpl(...args));
}

async function deleteResourceLinkActionImpl(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  if (!canWriteResources(resolveResourcesCapabilities(user))) {
    throw new Error("FORBIDDEN: resource delete");
  }
  await resourcesRepository.softDeleteResourceLink(id, user.member.id);
}
