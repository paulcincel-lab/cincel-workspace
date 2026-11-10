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

  it("saves and loads message metadata", async () => {
    const id = randomUUID();
    await threads.upsertOwnedThread(db, { threadId: id, staffId: owner, context: { route: "/" } });
    const assistant: UIMessage = {
      id: "a1",
      role: "assistant",
      parts: [{ type: "text", text: "Listo" }],
      metadata: {
        createdAt: "2020-01-01T00:00:00.000Z",
        toolMs: { "call-1": 420 },
        responseMs: 1800,
        usage: { inputTokens: 1200, outputTokens: 80 },
      },
    };
    const plain: UIMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "Hola" }] };
    await threads.saveThreadMessages(db, id, [plain, assistant]);

    const rows = await db
      .select({ id: schema.assistantMessages.id, metadata: schema.assistantMessages.metadata })
      .from(schema.assistantMessages)
      .where(eq(schema.assistantMessages.threadId, id));
    const row = rows.find((r) => r.id === "a1")!;
    expect(row.metadata).toEqual({ toolMs: { "call-1": 420 }, responseMs: 1800, usage: { inputTokens: 1200, outputTokens: 80 } });

    const loaded = await threads.loadThreadMessages(db, id);
    const loadedAssistant = loaded.find((m) => m.id === "a1")!;
    expect(loadedAssistant.metadata).toMatchObject({ toolMs: { "call-1": 420 }, responseMs: 1800 });
    // The time comes from the row, never from the streamed value.
    expect(loadedAssistant.metadata!.createdAt).not.toBe("2020-01-01T00:00:00.000Z");
    expect(Number.isNaN(Date.parse(loadedAssistant.metadata!.createdAt!))).toBe(false);
    // A row without metadata still gets its time.
    expect(Object.keys(loaded.find((m) => m.id === "u1")!.metadata!)).toEqual(["createdAt"]);
  });

  it("merges toolMs across the approval resume", async () => {
    const id = randomUUID();
    await threads.upsertOwnedThread(db, { threadId: id, staffId: owner, context: { route: "/" } });
    const asked: UIMessage = {
      id: "a1",
      role: "assistant",
      parts: [{ type: "text", text: "¿Confirmas?" }],
      metadata: { toolMs: { "call-read": 300 }, responseMs: 900 },
    };
    await threads.saveThreadMessages(db, id, [asked]);

    // The approved call runs in the next request: only its own duration is new.
    const resumed: UIMessage = {
      ...asked,
      parts: [{ type: "text", text: "Hecho" }],
      metadata: { toolMs: { "call-write": 650 }, responseMs: 1200 },
    };
    await threads.saveThreadMessages(db, id, [resumed]);
    // A save without metadata keeps what is stored.
    await threads.saveThreadMessages(db, id, [{ ...resumed, metadata: undefined }]);

    const loaded = (await threads.loadThreadMessages(db, id)).find((m) => m.id === "a1")!;
    expect(loaded.metadata).toMatchObject({ toolMs: { "call-read": 300, "call-write": 650 }, responseMs: 1200 });
  it("tool_call_count counts non-widget tool parts once", async () => {
    const id = randomUUID();
    await threads.upsertOwnedThread(db, { threadId: id, staffId: owner, context: { route: "/" } });
    const user: UIMessage = { id: "u1", role: "user", parts: [{ type: "text", text: "Crea dos tareas" }] };
    const requested = {
      id: "a1",
      role: "assistant",
      parts: [
        { type: "tool-list_activities_due", toolCallId: "c1", state: "output-available", input: {}, output: [] },
        { type: "tool-render_chart", toolCallId: "c2", state: "output-available", input: {}, output: { ok: true } },
        { type: "tool-create_task", toolCallId: "c3", state: "approval-requested", input: {}, approval: { id: "p3" } },
        { type: "tool-create_task", toolCallId: "c4", state: "approval-requested", input: {}, approval: { id: "p4" } },
        { type: "text", text: "¿Confirmas?" },
      ],
    } as unknown as UIMessage;
    await threads.saveThreadMessages(db, id, [user, requested]);
    expect((await threadRow(id)).toolCallCount).toBe(3);

    // The approval resume rewrites the same message: no call is counted twice.
    const resumed = {
      ...requested,
      parts: requested.parts.map((part) =>
        "approval" in part ? { ...part, state: "output-available", output: { ok: true } } : part,
      ),
    } as UIMessage;
    await threads.saveThreadMessages(db, id, [resumed]);
    expect((await threadRow(id)).toolCallCount).toBe(3);

    // A new assistant message adds its own calls; a repeated toolCallId counts once.
    const next = {
      id: "a2",
      role: "assistant",
      parts: [
        { type: "dynamic-tool", toolName: "team_workload_summary", toolCallId: "c5", state: "input-available", input: {} },
        { type: "dynamic-tool", toolName: "team_workload_summary", toolCallId: "c5", state: "output-available", input: {}, output: [] },
      ],
    } as unknown as UIMessage;
    await threads.saveThreadMessages(db, id, [next]);
    expect((await threadRow(id)).toolCallCount).toBe(4);
  });
});
