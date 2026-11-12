// @vitest-environment node
/**
 * `applyProposal` and `undoProposal` against a real Postgres (Calendario BE §6.3, §13).
 * Runs only when TEST_DATABASE_URL points at a migrated database. The session is a
 * non-admin staff member; the meeting actions are mocked (their Google write-through
 * has its own tests).
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const session = vi.hoisted(() => ({ staffId: "", role: "Colaborador" }));
const meetings = vi.hoisted(() => ({ created: [] as string[], cancelled: [] as string[] }));
const bulkCalls = vi.hoisted(() => ({ calls: [] as { ids: string[]; patch: unknown }[] }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), after: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: { id: session.staffId, name: "Ana", role: session.role, area: "", capacity: 0, availability: "", active: true, institutionalEmail: "", phone: "" },
    email: "",
    access: session.role,
  })),
}));
vi.mock("@/lib/actions/tasks-actions", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/actions/tasks-actions")>();
  return {
    ...original,
    bulkUpdateTasksAction: vi.fn(async (ids: string[], patch: unknown) => {
      bulkCalls.calls.push({ ids, patch });
      return original.bulkUpdateTasksAction(ids, patch as never);
    }),
  };
});
vi.mock("@/lib/actions/calendario-actions", () => ({
  createMeetingAction: vi.fn(async () => {
    const eventId = randomUUID();
    meetings.created.push(eventId);
    return { ok: true, data: { eventId } };
  }),
  updateMeetingAction: vi.fn(async () => ({ ok: true, data: {} })),
  cancelMeetingAction: vi.fn(async (eventId: string) => {
    meetings.cancelled.push(eventId);
    return { ok: true, data: { eventId } };
  }),
}));
vi.mock("@/lib/repositories/calendar-events-repository", () => ({
  getEventItem: vi.fn(async (_user: unknown, eventId: string) =>
    meetings.created.includes(eventId) && !meetings.cancelled.includes(eventId)
      ? { eventId, title: "Junta", start: "", end: "", location: null, canEdit: true }
      : null,
  ),
}));

describe.skipIf(!url)("applyProposal / undoProposal (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { applyProposal, undoProposal, proposalRateLimiter } = await import("@/lib/calendario/apply");
  const proposals = await import("@/lib/repositories/proposals-repository");

  const run = randomUUID().slice(0, 8);
  let ownerId = "";
  let otherId = "";
  let projectId = "";
  const taskIds: string[] = [];
  const proposalIds: string[] = [];

  const asUser = (id: string) =>
    ({
      member: { id, name: "Ana", role: "Colaborador", area: "", capacity: 0, availability: "", active: true, institutionalEmail: "", phone: "" },
      email: "",
      access: "Colaborador",
    }) as never;

  async function task(title: string, kind: "usuario" | "admin", commitmentDate: string | null) {
    const [row] = await db
      .insert(schema.tasks)
      .values({ projectId, kind, title: `${title} ${run}`, commitmentDate, createdById: ownerId })
      .returning({ id: schema.tasks.id });
    taskIds.push(row!.id);
    return row!.id;
  }

  function move(changeId: string, taskId: string, from: string | null, to: string): import("@/lib/types/calendario").ProposalChange {
    return {
      changeId,
      type: "task_date",
      taskId,
      title: changeId,
      projectName: null,
      before: { date: from, field: "commitmentDate" },
      after: { date: to },
      staffId: null,
    };
  }

  async function propose(changes: import("@/lib/types/calendario").ProposalChange[], kind: import("@/lib/types/calendario").ProposalKind = "mover_tareas") {
    const proposal = await proposals.createProposal(asUser(ownerId), kind, { title: `Mover ${run}`, line: "x", changes, deferred: [], range: null });
    proposalIds.push(proposal.id);
    return proposal;
  }

  const dateOf = async (id: string) => (await db.select({ d: schema.tasks.commitmentDate }).from(schema.tasks).where(eq(schema.tasks.id, id)))[0]!.d;

  beforeAll(async () => {
    const members = await db
      .insert(schema.staff)
      .values([
        { name: `Dueña ${run}`, role: "Colaborador" },
        { name: `Otra ${run}`, role: "Colaborador" },
      ])
      .returning({ id: schema.staff.id });
    ownerId = members[0]!.id;
    otherId = members[1]!.id;
    session.staffId = ownerId;
    const [project] = await db.insert(schema.projects).values({ name: `Propuestas ${run}` }).returning({ id: schema.projects.id });
    projectId = project!.id;
  });

  afterAll(async () => {
    if (proposalIds.length) await db.delete(schema.assistantProposals).where(inArray(schema.assistantProposals.id, proposalIds));
    const all = await db.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.projectId, projectId));
    const ids = [...new Set([...taskIds, ...all.map((r) => r.id)])];
    if (ids.length) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, ids));
      await db.delete(schema.tasks).where(inArray(schema.tasks.id, ids));
    }
    await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    await db.delete(schema.staff).where(inArray(schema.staff.id, [ownerId, otherId]));
  });

  it("applies a subset and writes only the checked rows", async () => {
    proposalRateLimiter.reset();
    const a = await task("A", "usuario", "2030-01-01");
    const b = await task("B", "usuario", "2030-01-01");
    const proposal = await propose([move("a", a, "2030-01-01", "2030-01-05"), move("b", b, "2030-01-01", "2030-01-05")]);
    const result = await applyProposal(asUser(ownerId), proposal.id, ["a"]);
    expect(result.applied).toEqual(["a"]);
    expect(await dateOf(a)).toBe("2030-01-05");
    expect(await dateOf(b)).toBe("2030-01-01");
    expect(result.undoToken).toMatch(/^[0-9a-f]{64}$/);
    expect((await proposals.getProposal(asUser(ownerId), proposal.id))?.status).toBe("parcial");
  });

  it("skips an admin task for a non-admin and counts it", async () => {
    proposalRateLimiter.reset();
    const own = await task("Propia", "usuario", "2030-02-01");
    const admin = await task("Admin", "admin", "2030-02-01");
    const proposal = await propose([move("own", own, "2030-02-01", "2030-02-04"), move("adm", admin, "2030-02-01", "2030-02-04")]);
    const result = await applyProposal(asUser(ownerId), proposal.id);
    expect(result.applied).toEqual(["own"]);
    expect(result.skipped).toEqual([{ changeId: "adm", reason: "Sin permiso" }]);
    expect(await dateOf(admin)).toBe("2030-02-01");
    expect(result.toast).toContain("Apliqué 1 de 2 cambios");
  });

  it("skips a row that changed after the proposal", async () => {
    proposalRateLimiter.reset();
    const t = await task("Cambia", "usuario", "2030-03-01");
    const proposal = await propose([move("t", t, "2030-03-01", "2030-03-05")]);
    await db.update(schema.tasks).set({ commitmentDate: "2030-03-02" }).where(eq(schema.tasks.id, t));
    const result = await applyProposal(asUser(ownerId), proposal.id);
    expect(result.skipped).toEqual([{ changeId: "t", reason: "Cambió desde la propuesta" }]);
    expect(result.undoToken).toBeNull();
    expect(await dateOf(t)).toBe("2030-03-02");
  });

  it("groups the task moves into one bulk call per date", async () => {
    proposalRateLimiter.reset();
    const [x, y, z] = [await task("X", "usuario", "2030-04-01"), await task("Y", "usuario", "2030-04-01"), await task("Z", "usuario", "2030-04-01")];
    const proposal = await propose([move("x", x, "2030-04-01", "2030-04-03"), move("y", y, "2030-04-01", "2030-04-03"), move("z", z, "2030-04-01", "2030-04-04")]);
    bulkCalls.calls.length = 0;
    await applyProposal(asUser(ownerId), proposal.id);
    expect(bulkCalls.calls).toHaveLength(2);
    expect(bulkCalls.calls.map((c) => c.ids.length).sort()).toEqual([1, 2]);
  });

  it("undo restores only the unchanged rows, then expires", async () => {
    proposalRateLimiter.reset();
    const a = await task("UA", "usuario", "2030-05-01");
    const b = await task("UB", "usuario", "2030-05-01");
    const proposal = await propose([move("a", a, "2030-05-01", "2030-05-05"), move("b", b, "2030-05-01", "2030-05-05")]);
    const applied = await applyProposal(asUser(ownerId), proposal.id);
    await db.update(schema.tasks).set({ commitmentDate: "2030-05-09" }).where(eq(schema.tasks.id, b));
    const undone = await undoProposal(asUser(ownerId), applied.undoToken!);
    expect(undone.restored).toEqual(["a"]);
    expect(undone.skipped).toEqual([{ changeId: "b", reason: "Cambió después de aplicar" }]);
    expect(await dateOf(a)).toBe("2030-05-01");
    expect(await dateOf(b)).toBe("2030-05-09");
    await expect(undoProposal(asUser(ownerId), applied.undoToken!)).rejects.toThrow(/^STALE/);

    const late = await propose([move("a", a, "2030-05-01", "2030-05-06")]);
    const lateApplied = await applyProposal(asUser(ownerId), late.id);
    await db.update(schema.assistantProposals).set({ undoExpiresAt: new Date(Date.now() - 1000) }).where(eq(schema.assistantProposals.id, late.id));
    await expect(undoProposal(asUser(ownerId), lateApplied.undoToken!)).rejects.toThrow(/^UNDO_EXPIRED/);
  });

  it("creates a meeting and cancels it on undo", async () => {
    proposalRateLimiter.reset();
    const proposal = await propose(
      [{ changeId: "m", type: "event_create", draft: { title: "Junta", start: "2030-06-01T10:00:00-06:00", end: "2030-06-01T11:00:00-06:00", projectId: null, location: null, meet: true, attendees: [] } }],
      "crear_reunion",
    );
    const applied = await applyProposal(asUser(ownerId), proposal.id);
    expect(applied.applied).toEqual(["m"]);
    const undone = await undoProposal(asUser(ownerId), applied.undoToken!);
    expect(undone.restored).toEqual(["m"]);
    expect(meetings.cancelled).toHaveLength(1);
  });

  it("only the owner can apply, undo or read it", async () => {
    proposalRateLimiter.reset();
    const t = await task("Ajena", "usuario", "2030-07-01");
    const proposal = await propose([move("t", t, "2030-07-01", "2030-07-02")]);
    await expect(applyProposal(asUser(otherId), proposal.id)).rejects.toThrow(/^FORBIDDEN/);
    expect(await proposals.getProposal(asUser(otherId), proposal.id)).toBeNull();
    const applied = await applyProposal(asUser(ownerId), proposal.id);
    await expect(undoProposal(asUser(otherId), applied.undoToken!)).rejects.toThrow(/^FORBIDDEN/);
    await expect(proposals.cancelProposal(asUser(otherId), proposal.id)).rejects.toThrow(/^FORBIDDEN/);
  });

  it("refuses an expired, applied or cancelled proposal", async () => {
    proposalRateLimiter.reset();
    const t = await task("Vieja", "usuario", "2030-08-01");
    const old = await propose([move("t", t, "2030-08-01", "2030-08-02")]);
    await db.update(schema.assistantProposals).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.assistantProposals.id, old.id));
    await expect(applyProposal(asUser(ownerId), old.id)).rejects.toThrow(/^EXPIRED/);

    const open = await propose([move("t", t, "2030-08-01", "2030-08-03")]);
    await proposals.cancelProposal(asUser(ownerId), open.id);
    await expect(applyProposal(asUser(ownerId), open.id)).rejects.toThrow(/^STALE/);
  });

  it("the daily job expires open proposals past their time", async () => {
    const t = await task("Expira", "usuario", "2030-09-01");
    const open = await propose([move("t", t, "2030-09-01", "2030-09-02")]);
    await db.update(schema.assistantProposals).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(schema.assistantProposals.id, open.id));
    const result = await proposals.expireProposals();
    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect((await proposals.getProposal(asUser(ownerId), open.id))?.status).toBe("expirada");
  });
});
