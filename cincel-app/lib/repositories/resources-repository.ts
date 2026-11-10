import { and, asc, count, desc, eq, gt, gte, inArray, isNull, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db/client";
import { driveFiles, projects, resourceLinkOpens, resourceLinks, staff } from "@/lib/db/schema";
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
      projectId: projects.id,
      projectName: projects.name,
    })
    .from(resourceLinks)
    .leftJoin(owner, eq(owner.id, resourceLinks.ownerId))
    .leftJoin(personalFor, eq(personalFor.id, resourceLinks.personalForId))
    .leftJoin(driveFiles, eq(driveFiles.id, resourceLinks.driveFileId))
    .leftJoin(projects, and(eq(projects.id, resourceLinks.projectId), isNull(projects.deletedAt)));
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
          sizeBytes: r.drive.sizeBytes ?? null,
          syncedAt: r.drive.syncedAt?.toISOString() ?? null,
        }
      : null,
    project: r.projectId ? { id: r.projectId, name: r.projectName! } : null,
    createdAt: l.createdAt.toISOString(),
    updatedAt: l.updatedAt.toISOString(),
  };
}

/**
 * Live resource links, filtered in SQL:
 * - `section`: one section or a list of them (an empty list matches nothing);
 * - `personalForId`: only the personal links of that person;
 * - `viewerId`: shared links plus the viewer's own personal links
 *   (`personal_for_id IS NULL OR = viewer`), so another person's personal
 *   links never leave the database.
 */
export async function listResourceLinks(
  options: {
    section?: ResourceSection | readonly ResourceSection[];
    personalForId?: string | null;
    viewerId?: string;
  } = {}
): Promise<ResourceLink[]> {
  const sections = options.section === undefined ? null : typeof options.section === "string" ? [options.section] : options.section;
  if (sections && sections.length === 0) return [];
  const rows = await baseQuery()
    .where(
      and(
        isNull(resourceLinks.deletedAt),
        sections ? (sections.length === 1 ? eq(resourceLinks.section, sections[0]) : inArray(resourceLinks.section, [...sections])) : undefined,
        options.personalForId ? eq(resourceLinks.personalForId, options.personalForId) : undefined,
        options.viewerId
          ? or(isNull(resourceLinks.personalForId), eq(resourceLinks.personalForId, options.viewerId))
          : undefined
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
    projectId: input.projectId ?? null,
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
    projectId: patch.projectId === undefined ? before.projectId : patch.projectId,
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

// ── Opens (Biblioteca Analítico "Aperturas 30 d") ───────────────────────────

/** One staff member's opens of one link closer than this count once. */
export const RESOURCE_OPEN_DEDUPE_MS = 10 * 60 * 1000;

/** How long open rows are kept (the delete below spells it as an interval literal). */
export const RESOURCE_OPENS_RETENTION_MONTHS = 13;

/**
 * Records that `staffId` opened `linkId`, unless the same person already
 * opened it within the last 10 minutes, and drops that link's rows older
 * than the retention. True when a row was written.
 */
export async function recordResourceLinkOpen(linkId: string, staffId: string, now: Date = new Date()): Promise<boolean> {
  const since = new Date(now.getTime() - RESOURCE_OPEN_DEDUPE_MS);
  const [recent] = await db
    .select({ id: resourceLinkOpens.id })
    .from(resourceLinkOpens)
    .where(
      and(
        eq(resourceLinkOpens.resourceLinkId, linkId),
        eq(resourceLinkOpens.staffId, staffId),
        gt(resourceLinkOpens.openedAt, since)
      )
    )
    .orderBy(desc(resourceLinkOpens.openedAt))
    .limit(1);
  if (recent) return false;
  await db.insert(resourceLinkOpens).values({ resourceLinkId: linkId, staffId, openedAt: now });
  // Retention: the link's rows older than 13 months go (cheap on the (link, opened_at) index).
  await db
    .delete(resourceLinkOpens)
    .where(
      and(
        eq(resourceLinkOpens.resourceLinkId, linkId),
        sql`${resourceLinkOpens.openedAt} < ${now.toISOString()}::timestamptz - interval '13 months'`
      )
    );
  return true;
}

/** Per-link opens of the last 30 days: everyone's, the viewer's, and everyone's of the last 7 days. */
export type ResourceLinkOpenCounts = { linkId: string; opens30d: number; mine30d: number; week: number };

/**
 * Open counts of the last 30 days per link (only counts; who opened is never
 * returned). `viewerId` fills `mine30d`.
 */
export async function countResourceLinkOpens(viewerId: string): Promise<ResourceLinkOpenCounts[]> {
  const o = resourceLinkOpens;
  const rows = await db
    .select({
      linkId: o.resourceLinkId,
      opens30d: count(),
      mine30d: sql<number>`count(*) filter (where ${o.staffId} = ${viewerId})`,
      week: sql<number>`count(*) filter (where ${o.openedAt} >= now() - interval '7 days')`,
    })
    .from(o)
    .where(gte(o.openedAt, sql`now() - interval '30 days'`))
    .groupBy(o.resourceLinkId);
  return rows.map((r) => ({ linkId: r.linkId, opens30d: Number(r.opens30d), mine30d: Number(r.mine30d), week: Number(r.week) }));
}
