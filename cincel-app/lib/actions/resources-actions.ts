"use server";

import { toActionResult } from "@/lib/actions/action-result";
import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveResourcesCapabilities } from "@/lib/auth/permissions";
import { canViewBibliotecaSection } from "@/lib/biblioteca/catalog";
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

export async function recordResourceOpenAction(
  ...args: Parameters<typeof recordResourceOpenActionImpl>
): Promise<ActionResult<{ recorded: boolean }>> {
  return toActionResult(() => recordResourceOpenActionImpl(...args));
}

/**
 * Counts one open of a resource link by the viewer (Biblioteca Analítico
 * "Aperturas 30 d"): at most one per person and link every 10 minutes. Only
 * a link the viewer can see (its section's capability; a personal link only
 * for its owner); `recorded` is false for an open inside the 10 minutes.
 */
async function recordResourceOpenActionImpl(input: { linkId: string }): Promise<{ recorded: boolean }> {
  const user = await requireCapabilityUser();
  const linkId = typeof input?.linkId === "string" ? input.linkId.trim() : "";
  if (!linkId) throw new Error("INVALID: linkId");
  const link = await resourcesRepository.getResourceLink(linkId);
  if (!link) throw new Error("NOT_FOUND: resource link");
  const viewerId = user.member.id;
  const canSee =
    canViewBibliotecaSection(resolveResourcesCapabilities(user), link.section) &&
    (link.personalFor === null || link.personalFor.id === viewerId);
  if (!canSee) throw new Error("FORBIDDEN: resource open");
  return { recorded: await resourcesRepository.recordResourceLinkOpen(link.id, viewerId) };
}
