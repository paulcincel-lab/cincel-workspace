// @vitest-environment node
/**
 * Server-side assistant threads against a real Postgres (redesign BE §8.10,
 * §16): a new client uuid creates the thread, a repeat reuses it, another
 * owner's id is refused before any write, messages upsert by
 * `(thread_id, id)` and the title comes from the first user message. Runs
 * only when TEST_DATABASE_URL points at a migrated database.
 */
import { randomUUID } from "node:crypto";

import type { UIMessage } from "ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("assistant threads (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const threads = await import("@/lib/assistant/threads");

  let owner = "";
  let other = "";

  async function threadRow(id: string) {
    const [row] = await db.select().from(schema.assistantThreads).where(eq(schema.assistantThreads.id, id));
    return row;
  }

  beforeAll(async () => {
    const rows = await db
      .insert(schema.staff)
      .values([{ name: `Thread owner ${run}` }, { name: `Thread other ${run}` }])
      .returning({ id: schema.staff.id });
    owner = rows[0]!.id;
    other = rows[1]!.id;
  });

  afterAll(async () => {
    const ids = [owner, other].filter(Boolean);
    if (ids.length) {
      await db.delete(schema.assistantThreads).where(inArray(schema.assistantThreads.staffId, ids));
      await db.delete(schema.staff).where(inArray(schema.staff.id, ids));
    }
  });

  it("creates the thread for a new client uuid and reuses it on repeat", async () => {
    const id = randomUUID();
    expect(await threads.upsertOwnedThread(db, { threadId: id, staffId: owner, context: { route: "/inicio" } })).toEqual({
      created: true,
    });
    expect(
      await threads.upsertOwnedThread(db, { threadId: id, staffId: owner, context: { route: "/tareas", taskId: "x" } }),
    ).toEqual({ created: false });
    const row = await threadRow(id);
    expect(row.staffId).toBe(owner);
    expect(row.context).toEqual({ route: "/tareas", taskId: "x" });
    expect(row.title).toBe(threads.DEFAULT_THREAD_TITLE);
  });

  it("refuses another owner's thread id and writes nothing", async () => {
    const id = randomUUID();
    await threads.upsertOwnedThread(db, { threadId: id, staffId: owner, context: { route: "/inicio" } });
    const before = await threadRow(id);

    await expect(
      threads.upsertOwnedThread(db, { threadId: id, staffId: other, context: { route: "/robado" } }),
    ).rejects.toThrow(/^FORBIDDEN/);

    const after = await threadRow(id);
    expect(after.staffId).toBe(owner);
    expect(after.context).toEqual({ route: "/inicio" });
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
  });

  it("refuses a deleted thread", async () => {
    const id = randomUUID();
    await threads.upsertOwnedThread(db, { threadId: id, staffId: owner, context: { route: "/" } });
    await db.update(schema.assistantThreads).set({ deletedAt: new Date() }).where(eq(schema.assistantThreads.id, id));
    await expect(threads.upsertOwnedThread(db, { threadId: id, staffId: owner, context: { route: "/" } })).rejects.toThrow(
      /^NOT_FOUND/,
    );
  });

  it("upserts messages by (thread_id, id), keeps order and sets the title once", async () => {
    const id = randomUUID();
    await threads.upsertOwnedThread(db, { threadId: id, staffId: owner, context: { route: "/" } });

    const user1: UIMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "  ¿Qué vence\n esta semana?  " }] };
    const assistant1: UIMessage = { id: "a1", role: "assistant", parts: [{ type: "text", text: "Revisando…" }] };
    await threads.saveThreadMessages(db, id, [user1, assistant1]);

    const updated: UIMessage = { ...assistant1, parts: [{ type: "text", text: "Tres tareas vencen." }] };
    const user2: UIMessage = { id: "u2", role: "user", parts: [{ type: "text", text: "Otra pregunta" }] };
    await threads.saveThreadMessages(db, id, [user1, updated, user2]);

    const loaded = await threads.loadThreadMessages(db, id);
    expect(loaded.map((m) => m.id)).toEqual(["u1", "a1", "u2"]);
    expect(loaded[1].parts).toEqual([{ type: "text", text: "Tres tareas vencen." }]);
    expect((await threadRow(id)).title).toBe("¿Qué vence esta semana?");

    // The same message id in another thread is a different row.
    const second = randomUUID();
    await threads.upsertOwnedThread(db, { threadId: second, staffId: owner, context: { route: "/" } });
    await threads.saveThreadMessages(db, second, [{ id: "u1", role: "user", parts: [{ type: "text", text: "Hola" }] }]);
    expect((await threads.loadThreadMessages(db, id)).find((m) => m.id === "u1")!.parts).toEqual(user1.parts);
  });
});
