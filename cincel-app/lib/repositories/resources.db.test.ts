// @vitest-environment node
/**
 * Resource links against a real Postgres (Biblioteca Analítico, #1006): the
 * project of a document (`resource_links.project_id`, set null when the
 * project goes) and the 30-day / 7-day open aggregate. Runs only when
 * TEST_DATABASE_URL points at a migrated database (`npm run db:migrate`).
 * Every row carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().replace(/-/g, "").slice(0, 8);
const m = `rl${run}`;
const DAY = 24 * 60 * 60 * 1000;

describe.skipIf(!url)("resource links (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const repo = await import("@/lib/repositories/resources-repository");

  const ids = { staff: [] as string[], projects: [] as string[], links: [] as string[] };
  let viewerId = "";
  let otherId = "";

  beforeAll(async () => {
    const members = await db
      .insert(schema.staff)
      .values([
        { name: `Lectora ${m}`, role: "Colaborador" },
        { name: `Otro ${m}`, role: "Colaborador" },
      ])
      .returning({ id: schema.staff.id });
    viewerId = members[0]!.id;
    otherId = members[1]!.id;
    ids.staff.push(viewerId, otherId);
  });

  afterAll(async () => {
    if (ids.links.length > 0) {
      await db.delete(schema.resourceLinkOpens).where(inArray(schema.resourceLinkOpens.resourceLinkId, ids.links));
      await db.delete(schema.resourceLinks).where(inArray(schema.resourceLinks.id, ids.links));
    }
    if (ids.projects.length > 0) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.staff.length > 0) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  it("project_id set null when project deleted", async () => {
    const [project] = await db.insert(schema.projects).values({ name: `Torre ${m}` }).returning({ id: schema.projects.id });
    ids.projects.push(project!.id);
    const link = await repo.createResourceLink(
      {
        title: `Bitácora ${m}`,
        section: "formatos-obra",
        linkType: "web",
        url: `https://example.com/${m}`,
        projectId: project!.id,
      },
      viewerId,
    );
    ids.links.push(link.id);
    expect(link.project).toEqual({ id: project!.id, name: `Torre ${m}` });

    await db.delete(schema.projects).where(eq(schema.projects.id, project!.id));
    const [row] = await db
      .select({ projectId: schema.resourceLinks.projectId })
      .from(schema.resourceLinks)
      .where(eq(schema.resourceLinks.id, link.id));
    expect(row!.projectId).toBeNull();
    expect((await repo.getResourceLink(link.id))!.project).toBeNull();
  });

  it("opens aggregate 30 d and week", async () => {
    const link = await repo.createResourceLink(
      { title: `Acta ${m}`, section: "formatos-obra", linkType: "web", url: `https://example.com/acta-${m}` },
      viewerId,
    );
    ids.links.push(link.id);
    const now = Date.now();
    await db.insert(schema.resourceLinkOpens).values([
      { resourceLinkId: link.id, staffId: viewerId, openedAt: new Date(now - 1 * DAY) },
      { resourceLinkId: link.id, staffId: viewerId, openedAt: new Date(now - 10 * DAY) },
      { resourceLinkId: link.id, staffId: otherId, openedAt: new Date(now - 3 * DAY) },
      { resourceLinkId: link.id, staffId: otherId, openedAt: new Date(now - 20 * DAY) },
      // Outside the 30 days: not counted.
      { resourceLinkId: link.id, staffId: otherId, openedAt: new Date(now - 45 * DAY) },
    ]);

    const counts = await repo.countResourceLinkOpens(viewerId);
    const mine = counts.find((row) => row.linkId === link.id);
    expect(mine).toEqual({ linkId: link.id, opens30d: 4, mine30d: 2, week: 2 });

    // Dedupe: a second open inside 10 minutes is not written.
    expect(await repo.recordResourceLinkOpen(link.id, viewerId)).toBe(true);
    expect(await repo.recordResourceLinkOpen(link.id, viewerId)).toBe(false);
    const after = (await repo.countResourceLinkOpens(viewerId)).find((row) => row.linkId === link.id);
    expect(after).toMatchObject({ opens30d: 5, mine30d: 3, week: 3 });
  });
});
