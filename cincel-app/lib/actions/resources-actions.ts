"use server";

import { revalidatePath } from "next/cache";

import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveResourcesCapabilities } from "@/lib/auth/permissions";
import * as resourcesRepository from "@/lib/repositories/resources-repository";
import type { ResourceLink, ResourceLinkInput, ResourceSection } from "@/lib/types/resource";

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

function revalidateRecursos() {
  revalidatePath("/recursos");
}

export async function fetchResourceLinksAction(
  options: { section?: ResourceSection; personalForId?: string | null } = {}
): Promise<ResourceLink[]> {
  const caps = await requireResourcesCapabilities();
  if (!caps.canViewResources) return [];
  return resourcesRepository.listResourceLinks(options);
}

export async function createResourceLinkAction(input: ResourceLinkInput): Promise<ResourceLink> {
  const user = await requireCapabilityUser();
  if (!canWriteResources(resolveResourcesCapabilities(user))) {
    throw new Error("FORBIDDEN: resource create");
  }
  const row = await resourcesRepository.createResourceLink(input, user.member.id);
  revalidateRecursos();
  return row;
}

export async function updateResourceLinkAction(
  id: string,
  patch: Partial<ResourceLinkInput>
): Promise<ResourceLink> {
  const user = await requireCapabilityUser();
  if (!canWriteResources(resolveResourcesCapabilities(user))) {
    throw new Error("FORBIDDEN: resource edit");
  }
  const row = await resourcesRepository.updateResourceLink(id, patch, user.member.id);
  revalidateRecursos();
  return row;
}

export async function deleteResourceLinkAction(id: string): Promise<void> {
  const user = await requireCapabilityUser();
  if (!canWriteResources(resolveResourcesCapabilities(user))) {
    throw new Error("FORBIDDEN: resource delete");
  }
  await resourcesRepository.softDeleteResourceLink(id, user.member.id);
  revalidateRecursos();
}
