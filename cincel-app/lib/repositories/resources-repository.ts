import { and, asc, eq, isNull } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db/client";
import { driveFiles, resourceLinks, staff } from "@/lib/db/schema";
import { recordChanges } from "@/lib/repositories/history-repository";
import { upsertDriveFile } from "@/lib/repositories/projects-repository";
import type { ResourceLink, ResourceLinkInput, ResourceSection } from "@/lib/types/resource";

const clean = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

const owner = alias(staff, "owner");
const personalFor = alias(staff, "personal_for");

function baseQuery() {
  return db
    .select({
      link: resourceLinks,
      ownerId: owner.id,
      ownerName: owner.name,
      personalForId: personalFor.id,
      personalForName: personalFor.name,
      drive: driveFiles,
    })
    .from(resourceLinks)
    .leftJoin(owner, eq(owner.id, resourceLinks.ownerId))
    .leftJoin(personalFor, eq(personalFor.id, resourceLinks.personalForId))
    .leftJoin(driveFiles, eq(driveFiles.id, resourceLinks.driveFileId));
}

type JoinedRow = Awaited<ReturnType<ReturnType<typeof baseQuery>["execute"]>>[number];

function toResourceLink(r: JoinedRow): ResourceLink {
  const l = r.link;
  return {
    id: l.id,
    templateKey: l.templateKey,
    title: l.title,
    section: l.section as ResourceSection,
    subsection: l.subsection as ResourceLink["subsection"],
    linkType: l.linkType as ResourceLink["linkType"],
    appliesTo: l.appliesTo as ResourceLink["appliesTo"],
    url: l.url,
    status: l.status as ResourceLink["status"],
    owner: r.ownerId ? { id: r.ownerId, name: r.ownerName! } : null,
    personalFor: r.personalForId ? { id: r.personalForId, name: r.personalForName! } : null,
    sortOrder: l.sortOrder,
    drive: r.drive
      ? {
          id: r.drive.id,
          googleFileId: r.drive.googleFileId,
          fileName: r.drive.fileName,
          mimeType: r.drive.mimeType,
          iconLink: r.drive.iconLink,
          thumbnailLink: r.drive.thumbnailLink,
          webViewLink: r.drive.webViewLink,
          syncedAt: r.drive.syncedAt?.toISOString() ?? null,
        }
      : null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

export async function listResourceLinks(
  options: { section?: ResourceSection; personalForId?: string | null } = {}
): Promise<ResourceLink[]> {
  const rows = await baseQuery()
    .where(
      and(
        isNull(resourceLinks.deletedAt),
        options.section ? eq(resourceLinks.section, options.section) : undefined,
        options.personalForId ? eq(resourceLinks.personalForId, options.personalForId) : undefined
      )
    )
    .orderBy(asc(resourceLinks.section), asc(resourceLinks.sortOrder), asc(resourceLinks.title));
  return rows.map(toResourceLink);
}

export async function getResourceLink(id: string): Promise<ResourceLink | null> {
  const [row] = await baseQuery().where(and(eq(resourceLinks.id, id), isNull(resourceLinks.deletedAt)));
  return row ? toResourceLink(row) : null;
}

async function toValues(input: ResourceLinkInput) {
  return {
    templateKey: clean(input.templateKey),
    title: input.title.trim(),
    section: input.section,
    subsection: input.subsection ?? null,
    linkType: input.linkType,
    appliesTo: input.appliesTo ?? "general",
    url: input.url.trim(),
    status: input.status ?? "vigente",
    ownerId: input.ownerId ?? null,
    personalForId: input.personalForId ?? null,
    sortOrder: input.sortOrder ?? 0,
    driveFileId: input.drive ? await upsertDriveFile(input.drive) : null,
  };
}

export async function createResourceLink(input: ResourceLinkInput, actorId: string): Promise<ResourceLink> {
  const values = await toValues({ ...input, ownerId: input.ownerId ?? actorId });
  const [row] = await db.insert(resourceLinks).values(values).returning();
  await recordChanges({
    entity: "resource_link",
    entityId: row.id,
    actorId,
    before: { title: null },
    after: { title: row.title },
    fields: ["title"],
  });
  return (await getResourceLink(row.id))!;
}

export async function updateResourceLink(
  id: string,
  patch: Partial<ResourceLinkInput>,
  actorId: string
): Promise<ResourceLink> {
  const [before] = await db
    .select()
    .from(resourceLinks)
    .where(and(eq(resourceLinks.id, id), isNull(resourceLinks.deletedAt)))
    .limit(1);
  if (!before) throw new Error("RESOURCE_LINK_NOT_FOUND");

  const values = await toValues({
    templateKey: patch.templateKey === undefined ? before.templateKey : patch.templateKey,
    title: patch.title ?? before.title,
    section: patch.section ?? (before.section as ResourceSection),
    subsection: patch.subsection === undefined ? (before.subsection as ResourceLink["subsection"]) : patch.subsection,
    linkType: patch.linkType ?? (before.linkType as ResourceLink["linkType"]),
    appliesTo: patch.appliesTo ?? (before.appliesTo as ResourceLink["appliesTo"]),
    url: patch.url ?? before.url,
    status: patch.status ?? (before.status as ResourceLink["status"]),
    ownerId: patch.ownerId === undefined ? before.ownerId : patch.ownerId,
    personalForId: patch.personalForId === undefined ? before.personalForId : patch.personalForId,
    sortOrder: patch.sortOrder ?? before.sortOrder,
    drive: patch.drive,
  });
  if (patch.drive === undefined) values.driveFileId = before.driveFileId;

  const [after] = await db.update(resourceLinks).set(values).where(eq(resourceLinks.id, id)).returning();
  await recordChanges({
    entity: "resource_link",
    entityId: id,
    actorId,
    before,
    after,
    fields: ["title", "section", "subsection", "url", "status", "appliesTo", "ownerId", "personalForId"],
  });
  return (await getResourceLink(id))!;
}

export async function softDeleteResourceLink(id: string, actorId: string): Promise<void> {
  const [row] = await db
    .update(resourceLinks)
    .set({ deletedAt: new Date() })
    .where(and(eq(resourceLinks.id, id), isNull(resourceLinks.deletedAt)))
    .returning();
  if (!row) throw new Error("RESOURCE_LINK_NOT_FOUND");
  await recordChanges({
    entity: "resource_link",
    entityId: id,
    actorId,
    before: { deleted: false },
    after: { deleted: true },
    fields: ["deleted"],
  });
}
