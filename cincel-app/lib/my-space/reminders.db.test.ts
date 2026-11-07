// @vitest-environment node
/**
 * `fireDueReminders` against a real Postgres (redesign BE §8.5, §9.3, §16):
 * due open reminders become one `recordatorio` notification each (dedupe key
 * `recordatorio:<id>:<dueAt ISO>`, channels forced from the reminder),
 * non-repeating ones get `fired_at`, repeating ones move `due_at` forward,
 * rows locked by another tick are skipped, and quiet hours defer the email.
 * Runs only when TEST_DATABASE_URL points at a migrated database. The
 * reminders use instants far in the future so ticks of other files (real
 * "now") never reach them; every row is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { lockReminders } from "@/tests/setup/reminders-lock";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

/** 09:00 in America/Mexico_City (UTC−6). */
const DUE = new Date("2090-01-31T15:00:00.000Z");
const NOW = new Date("2090-01-31T15:00:30.000Z");

describe.skipIf(!url)("fireDueReminders (test DB)", async () => {
  let unlock: (() => Promise<void>) | null = null;
  beforeAll(async () => {
    unlock = await lockReminders(url!);
  }, 300_000);

  const { and, eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { fireDueReminders, reminderDedupeKey } = await import("@/lib/my-space/reminders");

  const staffIds: string[] = [];

  async function makeStaff(label: string): Promise<string> {
    const [row] = await db
      .insert(schema.staff)
      .values({ name: `Recordatorios ${run} ${label}`, email: `recordatorios-${run}-${label}@cincel.example` })
      .returning({ id: schema.staff.id });
    staffIds.push(row!.id);
    return row!.id;
  }

  async function makeReminder(
    staffId: string,
    values: Partial<typeof schema.reminders.$inferInsert> = {},
  ): Promise<typeof schema.reminders.$inferSelect> {
    const [row] = await db
      .insert(schema.reminders)
      .values({ staffId, text: `Recordatorio ${run}`, dueAt: DUE, channels: ["app", "email"], ...values })
      .returning();
    return row!;
  }

  async function reload(id: string) {
    const [row] = await db.select().from(schema.reminders).where(eq(schema.reminders.id, id));
    return row!;
  }

  async function notificationsOf(staffId: string) {
    return db
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.staffId, staffId), eq(schema.notifications.kind, "recordatorio")));
  }

  afterEach(async () => {
    if (staffIds.length) {
      await db.delete(schema.notifications).where(inArray(schema.notifications.staffId, staffIds));
      await db.delete(schema.reminders).where(inArray(schema.reminders.staffId, staffIds));
    }
  });

  afterAll(async () => {
    try {
      if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
    } finally {
      await unlock?.();
    }
  });

  it("fires a due one-off reminder: one in-app row + pending email, fired_at = now", async () => {
    const staffId = await makeStaff("oneoff");
    const reminder = await makeReminder(staffId, { text: "llamar a Juanma" });

    await fireDueReminders(db, NOW);

    const rows = await notificationsOf(staffId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "llamar a Juanma",
      url: "/mi-espacio",
      dedupeKey: reminderDedupeKey(reminder.id, DUE),
      inApp: true,
      emailStatus: "pending",
    });
    const after = await reload(reminder.id);
    expect(after.firedAt?.toISOString()).toBe(NOW.toISOString());
    expect(after.dueAt.toISOString()).toBe(DUE.toISOString());
  });

  it("forces the channels of the reminder over the person's preferences", async () => {
    const appOnly = await makeStaff("apponly");
    const emailOnly = await makeStaff("emailonly");
    // Preferences say the opposite of each reminder's channels.
    await db.insert(schema.notificationPreferences).values([
      { staffId: appOnly, kind: "recordatorio", inApp: false, email: true, digest: false },
      { staffId: emailOnly, kind: "recordatorio", inApp: true, email: false, digest: false },
    ]);
    await makeReminder(appOnly, { channels: ["app"] });
    await makeReminder(emailOnly, { channels: ["email"] });

    await fireDueReminders(db, NOW);

    const [appRow] = await notificationsOf(appOnly);
    expect(appRow).toMatchObject({ inApp: true, emailStatus: "none" });
    const [emailRow] = await notificationsOf(emailOnly);
    expect(emailRow).toMatchObject({ inApp: false, emailStatus: "pending" });
  });

  it("leaves future, fired and cancelled reminders alone", async () => {
    const staffId = await makeStaff("skip");
    const future = await makeReminder(staffId, { dueAt: new Date(NOW.getTime() + 60_000) });
    const fired = await makeReminder(staffId, { firedAt: DUE });
    const cancelled = await makeReminder(staffId, { cancelledAt: DUE });

    await fireDueReminders(db, NOW);

    expect(await notificationsOf(staffId)).toHaveLength(0);
    expect((await reload(future.id)).firedAt).toBeNull();
    expect((await reload(fired.id)).firedAt?.toISOString()).toBe(DUE.toISOString());
    expect((await reload(cancelled.id)).firedAt).toBeNull();
  });

  it("does not fire twice: a second run finds nothing to do", async () => {
    const staffId = await makeStaff("twice");
    await makeReminder(staffId);

    await fireDueReminders(db, NOW);
    await fireDueReminders(db, new Date(NOW.getTime() + 60_000));

    expect(await notificationsOf(staffId)).toHaveLength(1);
  });

  it("skips rows another transaction holds (for update skip locked)", async () => {
    const staffId = await makeStaff("locked");
    const locked = await makeReminder(staffId, { text: "bloqueado" });
    const free = await makeReminder(staffId, { text: "libre" });

    await db.transaction(async (tx) => {
      await tx.select().from(schema.reminders).where(eq(schema.reminders.id, locked.id)).for("update");
      await fireDueReminders(db, NOW);
    });

    expect((await reload(locked.id)).firedAt).toBeNull();
    expect((await reload(free.id)).firedAt?.toISOString()).toBe(NOW.toISOString());
    expect((await notificationsOf(staffId)).map((n) => n.title)).toEqual(["libre"]);

    // Released: the next run fires it.
    await fireDueReminders(db, NOW);
    expect((await reload(locked.id)).firedAt?.toISOString()).toBe(NOW.toISOString());
  });

  it("advances repeating reminders until due_at is in the future (fired_at stays null)", async () => {
    const staffId = await makeStaff("repeat");
    const daily = await makeReminder(staffId, { repeat: "daily", dueAt: new Date("2090-01-28T15:00:00.000Z") });
    const weekly = await makeReminder(staffId, { repeat: "weekly", dueAt: new Date("2090-01-27T23:00:00.000Z") });
    const monthly = await makeReminder(staffId, { repeat: "monthly", dueAt: DUE });

    await fireDueReminders(db, NOW);

    const d = await reload(daily.id);
    expect(d.firedAt).toBeNull();
    expect(d.dueAt.toISOString()).toBe("2090-02-01T15:00:00.000Z");
    expect((await reload(weekly.id)).dueAt.toISOString()).toBe("2090-02-03T23:00:00.000Z");
    // Monthly on the 31st: clamped to the end of February.
    expect((await reload(monthly.id)).dueAt.toISOString()).toBe("2090-02-28T15:00:00.000Z");

    // One notification per occurrence, keyed by the fired dueAt.
    const keys = (await notificationsOf(staffId)).map((n) => n.dedupeKey).sort();
    expect(keys).toEqual(
      [
        reminderDedupeKey(daily.id, new Date("2090-01-28T15:00:00.000Z")),
        reminderDedupeKey(weekly.id, new Date("2090-01-27T23:00:00.000Z")),
        reminderDedupeKey(monthly.id, DUE),
      ].sort(),
    );

    // The next occurrence fires again with its own key.
    await fireDueReminders(db, new Date("2090-02-01T15:00:30.000Z"));
    expect((await reload(daily.id)).dueAt.toISOString()).toBe("2090-02-02T15:00:00.000Z");
    expect(await notificationsOf(staffId)).toHaveLength(4);
  });

  it("links the notification to the reminder's task or project", async () => {
    const staffId = await makeStaff("links");
    const [project] = await db.select({ id: schema.projects.id }).from(schema.projects).limit(1);
    if (!project) return;
    await makeReminder(staffId, { projectId: project.id });

    await fireDueReminders(db, NOW);

    const [row] = await notificationsOf(staffId);
    expect(row?.url).toBe(`/proyectos/${project.id}`);
  });

  it("quiet hours still defer the email; the in-app row is immediate", async () => {
    const staffId = await makeStaff("quiet");
    // 08:00–10:00 local covers the 09:00 due time.
    await db.insert(schema.userPreferences).values({ staffId, quietFrom: "08:00", quietTo: "10:00" });
    await makeReminder(staffId);

    await fireDueReminders(db, NOW);

    const [row] = await notificationsOf(staffId);
    expect(row).toMatchObject({ inApp: true, emailStatus: "pending" });
    expect(row!.deliverAfter.getTime()).toBeGreaterThan(NOW.getTime());
  });
});
