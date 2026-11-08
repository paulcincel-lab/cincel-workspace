// @vitest-environment node
/**
 * Reminder actions against a real Postgres (redesign BE §7.5, §9.1, §16):
 * the owner-scoped suite instance for `reminders` — every read and write
 * touches only the caller's rows (another person's reminder is `FORBIDDEN`, a
 * missing one `NOT_FOUND`) — plus `PAST_TIME`, link visibility (`INVALID`),
 * the default fetch window and the parse action. Runs only when
 * TEST_DATABASE_URL points at a migrated database; every row it creates is
 * deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { unwrapActions } from "@/tests/helpers/action-result";
import { lockReminders } from "@/tests/setup/reminders-lock";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const session = vi.hoisted(() => ({ memberId: "", access: "Administrador" as string }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: {
      id: session.memberId,
      name: "Recordatorios",
      role: session.access,
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "",
      phone: "",
    },
    email: "",
    access: session.access,
  })),
}));

const run = randomUUID().slice(0, 8);
const MINUTE = 60_000;

describe.skipIf(!url)("reminder actions, owner-only (test DB)", async () => {
  let unlock: (() => Promise<void>) | null = null;
  beforeAll(async () => {
    unlock = await lockReminders(url!);
  }, 300_000);

  const { eq, inArray, isNull } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const actions = unwrapActions(await import("@/lib/actions/my-space-actions"));

  let owner = "";
  let other = "";

  beforeAll(async () => {
    const rows = await db
      .insert(schema.staff)
      .values([
        { name: `Recordatorios ${run} dueño`, email: `rec-owner-${run}@cincel.example` },
        { name: `Recordatorios ${run} otro`, email: `rec-other-${run}@cincel.example` },
      ])
      .returning({ id: schema.staff.id });
    owner = rows[0]!.id;
    other = rows[1]!.id;
  });

  beforeEach(() => {
    session.memberId = owner;
    session.access = "Administrador";
  });

  afterAll(async () => {
    try {
      const ids = [owner, other].filter(Boolean);
      if (ids.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids));
    } finally {
      await unlock?.();
    }
  });

  const inMinutes = (n: number) => new Date(Date.now() + n * MINUTE).toISOString();

  function asStaff(id: string) {
    session.memberId = id;
  }

  async function create(text = `Recordatorio ${run}`, dueAt = inMinutes(60)) {
    return actions.createReminderAction({ text, dueAt });
  }

  it("creates a reminder for the caller with the defaults", async () => {
    const reminder = await create("llamar a Juanma", inMinutes(30));
    expect(reminder).toMatchObject({
      text: "llamar a Juanma",
      repeat: "none",
      channels: ["app"],
      taskId: null,
      projectId: null,
      firedAt: null,
      cancelledAt: null,
    });
    const [row] = await db.select().from(schema.reminders).where(eq(schema.reminders.id, reminder.id));
    expect(row!.staffId).toBe(owner);
  });

  it("stores repeat and channels", async () => {
    const reminder = await actions.createReminderAction({
      text: "revisar bitácora",
      dueAt: inMinutes(90),
      repeat: "weekly",
      channels: ["app", "email"],
    });
    expect(reminder).toMatchObject({ repeat: "weekly", channels: ["app", "email"] });
  });

  it("PAST_TIME when dueAt is more than 60 s ago; 30 s ago is accepted", async () => {
    await expect(create("tarde", inMinutes(-2))).rejects.toThrow(/PAST_TIME/);
    await expect(create("justo", new Date(Date.now() - 30_000).toISOString())).resolves.toMatchObject({
      text: "justo",
    });
  });

  it("INVALID for bad input and links the caller cannot see", async () => {
    await expect(actions.createReminderAction({ text: "", dueAt: inMinutes(10) })).rejects.toThrow(/INVALID/);
    await expect(actions.createReminderAction({ text: "x".repeat(281), dueAt: inMinutes(10) })).rejects.toThrow(
      /INVALID/,
    );
    await expect(actions.createReminderAction({ text: "fecha", dueAt: "mañana" })).rejects.toThrow(/INVALID/);
    await expect(
      actions.createReminderAction({ text: "canal", dueAt: inMinutes(10), channels: [] }),
    ).rejects.toThrow(/INVALID/);
    await expect(
      actions.createReminderAction({ text: "tarea", dueAt: inMinutes(10), taskId: randomUUID() }),
    ).rejects.toThrow(/INVALID/);
    await expect(
      actions.createReminderAction({ text: "proyecto", dueAt: inMinutes(10), projectId: randomUUID() }),
    ).rejects.toThrow(/INVALID/);
  });

  it("accepts a live project the caller can see", async () => {
    const [project] = await db
      .select({ id: schema.projects.id })
      .from(schema.projects)
      .where(isNull(schema.projects.deletedAt))
      .limit(1);
    if (!project) return;
    const reminder = await actions.createReminderAction({ text: "obra", dueAt: inMinutes(10), projectId: project.id });
    expect(reminder.projectId).toBe(project.id);
  });

  it("fetch returns only the caller's open reminders by dueAt", async () => {
    const later = await create("después", inMinutes(120));
    const sooner = await create("antes", inMinutes(15));
    asStaff(other);
    const foreign = await create("ajeno", inMinutes(20));

    const theirs = await actions.fetchRemindersAction({});
    expect(theirs.map((r) => r.id)).toContain(foreign.id);
    expect(theirs.map((r) => r.id)).not.toContain(sooner.id);

    asStaff(owner);
    const mine = (await actions.fetchRemindersAction({})).map((r) => r.id);
    expect(mine).not.toContain(foreign.id);
    expect(mine.indexOf(sooner.id)).toBeGreaterThanOrEqual(0);
    expect(mine.indexOf(sooner.id)).toBeLessThan(mine.indexOf(later.id));
  });

  it("fetch defaults to now − 1 day … now + 30 days, open only", async () => {
    const far = await create("lejano", inMinutes(40 * 24 * 60));
    const fired = await create("disparado", inMinutes(5));
    await db.update(schema.reminders).set({ firedAt: new Date() }).where(eq(schema.reminders.id, fired.id));
    const cancelled = await create("cancelado", inMinutes(6));
    await actions.cancelReminderAction(cancelled.id);

    const ids = (await actions.fetchRemindersAction({})).map((r) => r.id);
    expect(ids).not.toContain(far.id);
    expect(ids).not.toContain(fired.id);
    expect(ids).not.toContain(cancelled.id);

    const ranged = await actions.fetchRemindersAction({ from: inMinutes(0), to: inMinutes(41 * 24 * 60) });
    expect(ranged.map((r) => r.id)).toContain(far.id);
  });

  it("fetch rejects a bad range with INVALID", async () => {
    await expect(actions.fetchRemindersAction({ from: inMinutes(60), to: inMinutes(0) })).rejects.toThrow(/INVALID/);
    await expect(actions.fetchRemindersAction({ from: "ayer" })).rejects.toThrow(/INVALID/);
  });

  it("snooze moves dueAt and clears firedAt", async () => {
    const reminder = await create("posponer", inMinutes(5));
    await db.update(schema.reminders).set({ firedAt: new Date() }).where(eq(schema.reminders.id, reminder.id));
    const until = inMinutes(65);
    const snoozed = await actions.snoozeReminderAction(reminder.id, until);
    expect(snoozed.dueAt).toBe(new Date(until).toISOString());
    expect(snoozed.firedAt).toBeNull();
  });

  it("snooze: PAST_TIME, NOT_FOUND and a cancelled reminder", async () => {
    const reminder = await create("posponer mal", inMinutes(5));
    await expect(actions.snoozeReminderAction(reminder.id, inMinutes(-5))).rejects.toThrow(/PAST_TIME/);
    await expect(actions.snoozeReminderAction(randomUUID(), inMinutes(5))).rejects.toThrow(/NOT_FOUND/);
    await expect(actions.snoozeReminderAction("no-es-uuid", inMinutes(5))).rejects.toThrow(/NOT_FOUND/);
    await expect(actions.snoozeReminderAction(reminder.id, "luego")).rejects.toThrow(/INVALID/);
    await actions.cancelReminderAction(reminder.id);
    await expect(actions.snoozeReminderAction(reminder.id, inMinutes(30))).rejects.toThrow(/NOT_FOUND/);
  });

  it("cancel sets cancelledAt once", async () => {
    const reminder = await create("cancelar", inMinutes(5));
    await actions.cancelReminderAction(reminder.id);
    const [first] = await db.select().from(schema.reminders).where(eq(schema.reminders.id, reminder.id));
    expect(first!.cancelledAt).not.toBeNull();
    await actions.cancelReminderAction(reminder.id);
    const [second] = await db.select().from(schema.reminders).where(eq(schema.reminders.id, reminder.id));
    expect(second!.cancelledAt!.toISOString()).toBe(first!.cancelledAt!.toISOString());
    await expect(actions.cancelReminderAction(randomUUID())).rejects.toThrow(/NOT_FOUND/);
  });

  it("another person's reminder cannot be snoozed or cancelled (FORBIDDEN), even by an administrator", async () => {
    const reminder = await create("privado", inMinutes(10));
    asStaff(other);
    await expect(actions.snoozeReminderAction(reminder.id, inMinutes(30))).rejects.toThrow(/FORBIDDEN/);
    await expect(actions.cancelReminderAction(reminder.id)).rejects.toThrow(/FORBIDDEN/);

    const [row] = await db.select().from(schema.reminders).where(eq(schema.reminders.id, reminder.id));
    expect(row!.cancelledAt).toBeNull();
    expect(row!.dueAt.toISOString()).toBe(reminder.dueAt);
  });

  it("parse action: parses, and rejects empty or > 280 chars with INVALID", async () => {
    const parsed = await actions.parseReminderTextAction("recuérdame mañana 9am llamar a Juanma");
    expect(parsed.cleanText).toBe("llamar a Juanma");
    expect(parsed.dueAt).not.toBeNull();
    expect(parsed.repeat).toBe("none");
    await expect(actions.parseReminderTextAction("   ")).rejects.toThrow(/INVALID/);
    await expect(actions.parseReminderTextAction("x".repeat(281))).rejects.toThrow(/INVALID/);
  });
});
