// @vitest-environment node
/**
 * Approval audit against a real Postgres (redesign BE §8.10, §16):
 * `assistant_actions` moves proposed → confirmed / cancelled → done / failed,
 * one row per `threadId` + `toolCallId`. Runs only when TEST_DATABASE_URL
 * points at a migrated database (`npm run db:migrate`); every row is removed
 * afterwards (staff delete cascades to threads and actions).
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("assistant approval audit (test DB)", async () => {
  const { and, eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const approvals = await import("@/lib/assistant/approvals");
  const threads = await import("@/lib/assistant/threads");

  let staffId = "";
  const threadId = randomUUID();

  async function action(toolCallId: string) {
    const rows = await db
      .select()
      .from(schema.assistantActions)
      .where(and(eq(schema.assistantActions.threadId, threadId), eq(schema.assistantActions.toolCallId, toolCallId)));
    return rows;
  }

  async function propose(toolCallId: string) {
    return approvals.recordProposedAction(db, {
      threadId,
      staffId,
      toolCallId,
      tool: "create_task",
      input: { description: "Planos", project: "Casa Roble" },
      summary: "Crear la tarea Planos en Casa Roble",
    });
  }

  beforeAll(async () => {
    const [member] = await db
      .insert(schema.staff)
      .values({ name: `Assistant audit ${run}` })
      .returning({ id: schema.staff.id });
    staffId = member!.id;
    await threads.upsertOwnedThread(db, { threadId, staffId, context: { route: "/inicio" } });
  });

  afterAll(async () => {
    if (staffId) {
      await db.delete(schema.assistantThreads).where(eq(schema.assistantThreads.staffId, staffId));
      await db.delete(schema.staff).where(inArray(schema.staff.id, [staffId]));
    }
  });

  it("writes proposed once per tool call", async () => {
    expect(await propose("call-a")).toBe(true);
    expect(await propose("call-a")).toBe(false);
    const rows = await action("call-a");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: "proposed", tool: "create_task", summary: "Crear la tarea Planos en Casa Roble" });
    expect(rows[0].decidedAt).toBeNull();
  });

  it("moves proposed → confirmed → done with the result", async () => {
    await propose("call-b");
    expect(await approvals.recordActionDecision(db, { threadId, toolCallId: "call-b", approved: true })).toBe(true);
    let [row] = await action("call-b");
    expect(row.status).toBe("confirmed");
    expect(row.decidedAt).toBeInstanceOf(Date);

    // A second decision does not change it.
    expect(await approvals.recordActionDecision(db, { threadId, toolCallId: "call-b", approved: false })).toBe(false);

    expect(await approvals.recordActionOutcome(db, { threadId, toolCallId: "call-b", result: { ok: true, id: "t1" } })).toBe(true);
    [row] = await action("call-b");
    expect(row.status).toBe("done");
    expect(row.result).toEqual({ ok: true, id: "t1" });
    expect(row.error).toBeNull();

    // done is final.
    expect(await approvals.recordActionOutcome(db, { threadId, toolCallId: "call-b", error: "late" })).toBe(false);
  });

  it("moves proposed → confirmed → failed with the error", async () => {
    await propose("call-c");
    await approvals.recordActionDecision(db, { threadId, toolCallId: "call-c", approved: true });
    expect(await approvals.recordActionOutcome(db, { threadId, toolCallId: "call-c", error: "FORBIDDEN: task create" })).toBe(true);
    const [row] = await action("call-c");
    expect(row.status).toBe("failed");
    expect(row.error).toBe("FORBIDDEN: task create");
    expect(row.result).toBeNull();
  });

  it("moves proposed → cancelled and never runs afterwards", async () => {
    await propose("call-d");
    expect(await approvals.recordActionDecision(db, { threadId, toolCallId: "call-d", approved: false })).toBe(true);
    expect(await approvals.recordActionOutcome(db, { threadId, toolCallId: "call-d", result: { ok: true } })).toBe(false);
    const [row] = await action("call-d");
    expect(row.status).toBe("cancelled");
  });

  it("does not record an outcome for a call that was never confirmed", async () => {
    await propose("call-e");
    expect(await approvals.recordActionOutcome(db, { threadId, toolCallId: "call-e", result: { ok: true } })).toBe(false);
    const [row] = await action("call-e");
    expect(row.status).toBe("proposed");
  });

  it("keeps the same tool call id apart across threads", async () => {
    const otherThread = randomUUID();
    await threads.upsertOwnedThread(db, { threadId: otherThread, staffId, context: { route: "/" } });
    expect(
      await approvals.recordProposedAction(db, {
        threadId: otherThread,
        staffId,
        toolCallId: "call-a",
        tool: "create_task",
        input: {},
        summary: "otra",
      }),
    ).toBe(true);
  });
});
