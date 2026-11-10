// @vitest-environment node
/**
 * Checklist DTO against a real Postgres (Mi espacio Analítico): the linked
 * project's name and `updatedAt` as the latest change of the checklist or its
 * items. Runs only when TEST_DATABASE_URL points at a migrated database. Rows
 * belong to per-run staff and projects deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("notes-checklists DTO (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { listChecklistsPage } = await import("@/lib/my-space/notes-checklists");

  let staffId = "";
  let projectId = "";
  let withProject = "";
  let withoutProject = "";

  const at = (day: number) => new Date(Date.UTC(2026, 10, day, 12, 0, 0));
  const user = () => ({ member: { id: staffId } }) as unknown as AuthenticatedUser;

  beforeAll(async () => {
    const [person] = await db
      .insert(schema.staff)
      .values({ name: `Checklist DTO ${run}` })
      .returning({ id: schema.staff.id });
    staffId = person!.id;
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Casa DTO ${run}` })
      .returning({ id: schema.projects.id });
    projectId = project!.id;
    const rows = await db
      .insert(schema.checklists)
      .values([
        { staffId, title: "Con proyecto", projectId, createdAt: at(2), updatedAt: at(2) },
        { staffId, title: "Sin proyecto", createdAt: at(1), updatedAt: at(4) },
      ])
      .returning({ id: schema.checklists.id });
    withProject = rows[0]!.id;
    withoutProject = rows[1]!.id;
    await db.insert(schema.checklistItems).values([
      { checklistId: withProject, text: "Uno", sortOrder: 0, updatedAt: at(3) },
      { checklistId: withProject, text: "Dos", sortOrder: 1, updatedAt: at(6) },
      { checklistId: withoutProject, text: "Tres", sortOrder: 0, updatedAt: at(1) },
    ]);
  });

  afterAll(async () => {
    await db.delete(schema.staff).where(eq(schema.staff.id, staffId));
    await db.delete(schema.projects).where(inArray(schema.projects.id, [projectId]));
  });

  it("checklist DTO has projectName and updatedAt from items", async () => {
    const page = await listChecklistsPage(user());
    const linked = page.items.find((c) => c.id === withProject);
    const plain = page.items.find((c) => c.id === withoutProject);
    expect(linked).toMatchObject({ projectId, projectName: `Casa DTO ${run}`, updatedAt: at(6).toISOString() });
    // No project; the checklist row is newer than its only item.
    expect(plain).toMatchObject({ projectId: null, projectName: null, updatedAt: at(4).toISOString() });
  });
});
