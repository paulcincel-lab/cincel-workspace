"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { resourceLinks } from "@/lib/db/schema";
import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveResourcesCapabilities } from "@/lib/auth/permissions";
import type { ResourceLink } from "@/lib/types/resource";

async function requireResourcesCapabilities() {
  return resolveResourcesCapabilities(await requireCapabilityUser());
}

function canWriteResources(
  caps: Awaited<ReturnType<typeof requireResourcesCapabilities>>
): boolean {
  return (
    caps.enterprise.canCreate ||
    caps.enterprise.canEdit ||
    caps.enterprise.canDelete ||
    caps.corporate.canCreate ||
    caps.corporate.canDelete ||
    caps.canManageFavoritesSection
  );
}

function toResourceLink(row: typeof resourceLinks.$inferSelect): ResourceLink {
  return {
    id: row.id,
    templateKey: row.templateKey,
    title: row.title,
    section: row.section as ResourceLink["section"],
    subsection: row.subsection as ResourceLink["subsection"],
    linkType: row.linkType as ResourceLink["linkType"],
    appliesTo: row.appliesTo as ResourceLink["appliesTo"],
    url: row.url,
    status: row.status as ResourceLink["status"],
    ownerTeamMemberId: row.ownerTeamMemberLegacyId,
    personalForTeamMemberId: row.personalForTeamMemberLegacyId,
    updatedAt: row.updatedAtLabel ?? "",
    history: Array.isArray(row.history)
      ? (row.history as ResourceLink["history"])
      : [],
  };
}

export async function fetchResourceLinksAction(): Promise<ResourceLink[]> {
  const caps = await requireResourcesCapabilities();
  if (!caps.canViewResources) return [];

  const rows = await db.query.resourceLinks.findMany({
    where: isNull(resourceLinks.deletedAt),
    orderBy: [asc(resourceLinks.section), asc(resourceLinks.title)],
  });

  return rows.map(toResourceLink);
}

export async function saveResourceLinksAction(
  links: ResourceLink[]
): Promise<void> {
  const caps = await requireResourcesCapabilities();
  if (!canWriteResources(caps)) {
    throw new Error("FORBIDDEN: resources write");
  }

  for (const link of links) {
    const values = {
      templateKey: link.templateKey,
      title: link.title,
      section: link.section,
      subsection: link.subsection,
      linkType: link.linkType,
      appliesTo: link.appliesTo,
      url: link.url,
      status: link.status,
      ownerTeamMemberLegacyId: link.ownerTeamMemberId,
      personalForTeamMemberLegacyId: link.personalForTeamMemberId,
      updatedAtLabel: link.updatedAt || null,
      history: link.history ?? [],
    };

    await db
      .insert(resourceLinks)
      .values({ id: link.id, ...values })
      .onConflictDoUpdate({ target: resourceLinks.id, set: values });
  }

  revalidatePath("/recursos");
}

export async function deleteResourceLinkAction(id: string): Promise<void> {
  const caps = await requireResourcesCapabilities();
  if (!caps.enterprise.canDelete && !caps.corporate.canDelete) {
    throw new Error("FORBIDDEN: resources delete");
  }

  await db
    .update(resourceLinks)
    .set({ deletedAt: new Date() })
    .where(and(eq(resourceLinks.id, id), isNull(resourceLinks.deletedAt)));

  revalidatePath("/recursos");
}
