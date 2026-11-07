// @vitest-environment node
/**
 * Owner scoping of the Gmail cache and sync rows (redesign BE §8.0.3, §9.1,
 * §16): every query takes the staff id from the session argument and never
 * reads or writes another staff member's `gmail_threads` / `gmail_accounts`
 * rows, even when Gmail thread ids collide. Runs only when TEST_DATABASE_URL
 * points at a migrated database.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("gmail repository owner scoping (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const repo = await import("@/lib/repositories/gmail-repository");

  let a = "";
  let b = "";
  let projectId = "";

  beforeAll(async () => {
    const rows = await db
      .insert(schema.staff)
      .values([{ name: `Gmail repo ${run} A` }, { name: `Gmail repo ${run} B` }])
      .returning({ id: schema.staff.id });
    a = rows[0]!.id;
    b = rows[1]!.id;
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Casa repo ${run}` })
      .returning({ id: schema.projects.id });
    projectId = project!.id;
  });

  afterAll(async () => {
    await db.delete(schema.staff).where(inArray(schema.staff.id, [a, b]));
    await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
  });

  beforeEach(async () => {
    await db.delete(schema.gmailThreads).where(inArray(schema.gmailThreads.staffId, [a, b]));
    await db.delete(schema.gmailAccounts).where(inArray(schema.gmailAccounts.staffId, [a, b]));
    const receivedAt = new Date(Date.UTC(2026, 10, 1));
    await db.insert(schema.gmailThreads).values([
      { staffId: a, id: "same", subject: "De A", receivedAt },
      { staffId: b, id: "same", subject: "De B", receivedAt },
      { staffId: b, id: "only-b", subject: "Solo B", receivedAt },
    ]);
    await db.insert(schema.gmailAccounts).values([{ staffId: a }, { staffId: b }]);
  });

  const threadOf = async (staffId: string, id: string) =>
    (await db.select().from(schema.gmailThreads).where(eq(schema.gmailThreads.staffId, staffId))).find(
      (r) => r.id === id,
    );

  it("finds only the owner's thread", async () => {
    expect((await repo.findGmailThread(db, a, "same"))?.subject).toBe("De A");
    expect(await repo.findGmailThread(db, a, "only-b")).toBeNull();
  });

  it("lists only the owner's threads", async () => {
    const rows = await repo.listGmailThreads(db, a, { limit: 50 });
    expect(rows.map((r) => [r.staffId, r.id])).toEqual([[a, "same"]]);
  });

  it("marks read and links only the owner's row", async () => {
    await repo.markGmailThreadRead(db, a, "same");
    await repo.setGmailThreadProject(db, a, "same", projectId);
    expect(await threadOf(a, "same")).toMatchObject({ unread: false, projectId });
    expect(await threadOf(b, "same")).toMatchObject({ unread: true, projectId: null });

    expect(await repo.setGmailThreadProject(db, a, "only-b", projectId)).toBeNull();
    expect((await threadOf(b, "only-b"))?.projectId).toBeNull();
  });

  it("deletes and disconnects only the owner", async () => {
    expect(await repo.deleteGmailThreads(db, a)).toBe(1);
    await repo.markGmailDisconnected(db, a, new Date());
    expect(await threadOf(b, "same")).toBeDefined();
    expect((await repo.findGmailAccount(db, a))?.disconnectedAt).toBeInstanceOf(Date);
    expect((await repo.findGmailAccount(db, b))?.disconnectedAt).toBeNull();
  });
});
