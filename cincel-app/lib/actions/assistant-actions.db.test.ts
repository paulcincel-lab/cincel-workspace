// @vitest-environment node
/**
 * Assistant thread and audit actions against a real Postgres (redesign BE
 * §7.9, §8.10, §13, §16): owner scoping (another user's thread → NOT_FOUND),
 * soft delete, the 50-thread list cap, pin and read marks, audit paging by
 * cursor and the `daily-digest` trim to 50 live threads. Runs only when TEST_DATABASE_URL
 * points at a migrated database (`npm run db:migrate`). Every staff row a
 * test creates is deleted afterwards (threads, messages and audit cascade).
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { unwrapActions } from "@/tests/helpers/action-result";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const session = vi.hoisted(() => ({ memberId: "" }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: {
      id: session.memberId,
      name: "Integrante",
      role: "",
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "",
      phone: "",
    },
    email: "integrante@cincel.example",
    access: "Colaborador",
  })),
}));

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("assistant actions (test DB)", async () => {
  const { and, eq, inArray, isNull } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const repo = await import("@/lib/repositories/assistant-repository");
  const actions = unwrapActions(await import("@/lib/actions/assistant-actions"));
  const { revalidatePath } = await import("next/cache");

  const staffIds: string[] = [];
  let ownerId = "";
  let otherId = "";

  async function makeStaff(label: string): Promise<string> {
    const [row] = await db
      .insert(schema.staff)
      .values({ name: `Asistente ${run} ${label}` })
      .returning({ id: schema.staff.id });
    staffIds.push(row!.id);
    return row!.id;
  }

  async function makeThread(staffId: string, updatedAt: Date, title = "Hilo"): Promise<string> {
    const id = randomUUID();
    await db.insert(schema.assistantThreads).values({ id, staffId, title, context: { route: "/inicio" }, updatedAt });
    return id;
  }

  async function makeAction(threadId: string, staffId: string, createdAt: Date, n: number): Promise<string> {
    const [row] = await db
      .insert(schema.assistantActions)
      .values({
        threadId,
        staffId,
        toolCallId: `call-${run}-${n}`,
        tool: "crear_tarea",
        input: { n },
        summary: `Acción ${n}`,
        status: "done",
        createdAt,
      })
      .returning({ id: schema.assistantActions.id });
    return row!.id;
  }

  async function liveThreadCount(staffId: string): Promise<number> {
    const rows = await db
      .select({ id: schema.assistantThreads.id })
      .from(schema.assistantThreads)
      .where(and(eq(schema.assistantThreads.staffId, staffId), isNull(schema.assistantThreads.deletedAt)));
    return rows.length;
  }

  beforeAll(async () => {
    ownerId = await makeStaff("Dueño");
    otherId = await makeStaff("Otro");
  });

  beforeEach(() => {
    session.memberId = ownerId;
    vi.mocked(revalidatePath).mockClear();
  });

  afterAll(async () => {
    if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
  });

  it("reads the caller's thread with its messages in order", async () => {
    const threadId = await makeThread(ownerId, new Date(), "Presupuesto cocina");
    const base = Date.now();
    await db.insert(schema.assistantMessages).values([
      { id: "m1", threadId, role: "user", parts: [{ type: "text", text: "Hola" }], createdAt: new Date(base) },
      { id: "m2", threadId, role: "assistant", parts: [{ type: "text", text: "¿Qué necesitas?" }], createdAt: new Date(base + 1) },
    ]);

    const result = await actions.fetchAssistantThreadAction(threadId);
    expect(result.thread).toMatchObject({ id: threadId, title: "Presupuesto cocina", context: { route: "/inicio" } });
    expect(result.messages.map((m) => [m.id, m.role])).toEqual([
      ["m1", "user"],
      ["m2", "assistant"],
    ]);
  });

  it("returns NOT_FOUND for another user's thread on every owner-only action", async () => {
    const foreign = await makeThread(otherId, new Date(), "Ajeno");
    await makeAction(foreign, otherId, new Date(), 900);

    await expect(actions.fetchAssistantThreadAction(foreign)).rejects.toThrow("NOT_FOUND");
    await expect(actions.deleteAssistantThreadAction(foreign)).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
    await expect(actions.fetchAssistantActionsAction({ threadId: foreign })).rejects.toThrow("NOT_FOUND");
    expect((await actions.fetchAssistantThreadsAction()).map((t) => t.id)).not.toContain(foreign);
    expect((await actions.fetchAssistantActionsAction({})).map((a) => a.threadId)).not.toContain(foreign);

    // Still live for its owner.
    session.memberId = otherId;
    await expect(actions.fetchAssistantThreadAction(foreign)).resolves.toMatchObject({ thread: { id: foreign } });
  });

  it("returns NOT_FOUND for a missing or malformed id", async () => {
    await expect(actions.fetchAssistantThreadAction(randomUUID())).rejects.toThrow("NOT_FOUND");
    await expect(actions.fetchAssistantThreadAction("no-es-uuid")).rejects.toThrow("NOT_FOUND");
    await expect(actions.deleteAssistantThreadAction("no-es-uuid")).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("soft-deletes a thread and hides it from the list, without revalidating a path", async () => {
    const threadId = await makeThread(ownerId, new Date(Date.now() + 60_000), "Para borrar");
    expect((await actions.fetchAssistantThreadsAction()).map((t) => t.id)).toContain(threadId);

    await expect(actions.deleteAssistantThreadAction(threadId)).resolves.toEqual({ ok: true, data: undefined });

    expect(revalidatePath).not.toHaveBeenCalled();
    const [row] = await db
      .select({ deletedAt: schema.assistantThreads.deletedAt })
      .from(schema.assistantThreads)
      .where(eq(schema.assistantThreads.id, threadId));
    expect(row?.deletedAt).toBeInstanceOf(Date);
    expect((await actions.fetchAssistantThreadsAction()).map((t) => t.id)).not.toContain(threadId);
    await expect(actions.fetchAssistantThreadAction(threadId)).rejects.toThrow("NOT_FOUND");
    await expect(actions.deleteAssistantThreadAction(threadId)).resolves.toEqual({ ok: false, error: "NOT_FOUND" });
  });

  it("lists at most 50 live threads, newest first", async () => {
    const listerId = await makeStaff("Lista");
    session.memberId = listerId;
    const base = Date.now();
    const ids: string[] = [];
    for (let i = 0; i < 55; i++) ids.push(await makeThread(listerId, new Date(base - i * 1000), `Hilo ${i}`));

    const list = await actions.fetchAssistantThreadsAction();
    expect(list).toHaveLength(50);
    expect(list.map((t) => t.id)).toEqual(ids.slice(0, 50));
    const times = list.map((t) => Date.parse(t.updatedAt));
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it("pages the audit 30 at a time, newest first, by cursor", async () => {
    const auditorId = await makeStaff("Auditoría");
    session.memberId = auditorId;
    const threadA = await makeThread(auditorId, new Date());
    const threadB = await makeThread(auditorId, new Date());
    const base = Date.now();
    const ids: string[] = [];
    // 40 on A and 5 on B, interleaved in time; newest first = index 0.
    for (let i = 0; i < 45; i++) {
      ids.push(await makeAction(i % 9 === 8 ? threadB : threadA, auditorId, new Date(base - i * 1000), i));
    }

    const first = await actions.fetchAssistantActionsAction({});
    expect(first).toHaveLength(30);
    expect(first.map((a) => a.id)).toEqual(ids.slice(0, 30));
    expect(first[0]).toMatchObject({ tool: "crear_tarea", status: "done", summary: "Acción 0", result: null, error: null });

    const second = await actions.fetchAssistantActionsAction({ cursor: first[29]!.id });
    expect(second.map((a) => a.id)).toEqual(ids.slice(30));

    const onB = await actions.fetchAssistantActionsAction({ threadId: threadB });
    expect(onB).toHaveLength(5);
    expect(onB.every((a) => a.threadId === threadB)).toBe(true);

    await expect(actions.fetchAssistantActionsAction({ cursor: "no-es-uuid" })).rejects.toThrow("INVALID");
  });

  it("keeps the audit of a soft-deleted thread readable for its owner", async () => {
    const threadId = await makeThread(ownerId, new Date());
    const actionId = await makeAction(threadId, ownerId, new Date(), 950);
    await actions.deleteAssistantThreadAction(threadId);
    const audit = await actions.fetchAssistantActionsAction({ threadId });
    expect(audit.map((a) => a.id)).toEqual([actionId]);
  });

  it("pin is owner-scoped", async () => {
    const pinnerId = await makeStaff("Fijar");
    session.memberId = pinnerId;
    const updatedAt = new Date(Date.now() - 3_600_000);
    const older = await makeThread(pinnerId, updatedAt, "Viejo");
    const newer = await makeThread(pinnerId, new Date(), "Nuevo");
    const foreign = await makeThread(otherId, new Date(), "Ajeno");

    const pinned = await actions.pinAssistantThreadAction({ id: older, pinned: true });
    expect(pinned).toMatchObject({ id: older, title: "Viejo", pendingApprovals: 0, unread: false });
    expect(pinned.pinnedAt).not.toBeNull();
    // Pinning isn't activity: updated_at stays.
    expect(Date.parse(pinned.updatedAt)).toBe(updatedAt.getTime());
    // Pinned first, even though it is older.
    expect((await actions.fetchAssistantThreadsAction()).map((t) => t.id)).toEqual([older, newer]);

    await expect(actions.pinAssistantThreadAction({ id: foreign, pinned: true })).rejects.toThrow("NOT_FOUND");
    await expect(actions.pinAssistantThreadAction({ id: "no-es-uuid", pinned: true })).rejects.toThrow("NOT_FOUND");
    const [row] = await db
      .select({ pinnedAt: schema.assistantThreads.pinnedAt })
      .from(schema.assistantThreads)
      .where(eq(schema.assistantThreads.id, foreign));
    expect(row?.pinnedAt).toBeNull();

    const unpinned = await actions.pinAssistantThreadAction({ id: older, pinned: false });
    expect(unpinned.pinnedAt).toBeNull();
    expect((await actions.fetchAssistantThreadsAction()).map((t) => t.id)).toEqual([newer, older]);
  });

  it("pendingApprovals counts proposed actions", async () => {
    const approverId = await makeStaff("Confirmar");
    session.memberId = approverId;
    const threadId = await makeThread(approverId, new Date(), "Con confirmaciones");
    const statuses = ["proposed", "proposed", "done", "cancelled"] as const;
    await db.insert(schema.assistantActions).values(
      statuses.map((status, n) => ({
        threadId,
        staffId: approverId,
        toolCallId: `pend-${run}-${n}`,
        tool: "create_task",
        input: { n },
        summary: `Acción ${n}`,
        status,
      })),
    );

    const [summary] = await actions.fetchAssistantThreadsAction();
    expect(summary).toMatchObject({ id: threadId, pendingApprovals: 2 });
  });

  it("unread after a new assistant message, read after mark", async () => {
    const readerId = await makeStaff("Lectura");
    session.memberId = readerId;
    const threadId = await makeThread(readerId, new Date(), "Por leer");
    const base = Date.now();
    await db.insert(schema.assistantMessages).values([
      { id: "r1", threadId, role: "user", parts: [{ type: "text", text: "Hola" }], createdAt: new Date(base - 2_000) },
      { id: "r2", threadId, role: "assistant", parts: [{ type: "text", text: "Hola" }], createdAt: new Date(base - 1_000) },
    ]);
    const unreadOf = async () => (await actions.fetchAssistantThreadsAction()).find((t) => t.id === threadId)?.unread;

    // Never opened: counts as read.
    expect(await unreadOf()).toBe(false);
    await actions.markAssistantThreadReadAction({ id: threadId });
    expect(await unreadOf()).toBe(false);

    const tick = () => new Promise((resolve) => setTimeout(resolve, 10));
    await tick();
    // A user message alone is not a new reply.
    await db
      .insert(schema.assistantMessages)
      .values({ id: "r3", threadId, role: "user", parts: [{ type: "text", text: "¿Y?" }], createdAt: new Date() });
    expect(await unreadOf()).toBe(false);
    await db
      .insert(schema.assistantMessages)
      .values({ id: "r4", threadId, role: "assistant", parts: [{ type: "text", text: "Nueva" }], createdAt: new Date() });
    expect(await unreadOf()).toBe(true);

    await expect(actions.markAssistantThreadReadAction({ id: randomUUID() })).rejects.toThrow("NOT_FOUND");
    session.memberId = otherId;
    await expect(actions.markAssistantThreadReadAction({ id: threadId })).rejects.toThrow("NOT_FOUND");
    session.memberId = readerId;
    expect(await unreadOf()).toBe(true);

    await tick();
    await actions.markAssistantThreadReadAction({ id: threadId });
    expect(await unreadOf()).toBe(false);
  });

  it("daily-digest housekeeping trims each staff to the newest 50 live threads", async () => {
    const trimmedId = await makeStaff("Limpieza");
    const base = Date.now();
    const ids: string[] = [];
    for (let i = 0; i < 53; i++) ids.push(await makeThread(trimmedId, new Date(base - i * 1000)));

    const removed = await repo.trimAssistantThreads(db);
    expect(removed).toBeGreaterThanOrEqual(3);
    expect(await liveThreadCount(trimmedId)).toBe(repo.ASSISTANT_THREADS_KEEP);

    session.memberId = trimmedId;
    expect((await actions.fetchAssistantThreadsAction()).map((t) => t.id)).toEqual(ids.slice(0, 50));
    expect(await repo.trimAssistantThreads(db)).toBe(0);
  });
});
