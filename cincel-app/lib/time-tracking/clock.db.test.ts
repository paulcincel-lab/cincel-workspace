// @vitest-environment node
/**
 * Clock transitions against a real Postgres (redesign BE §8.7, §16): the full
 * off → on → pausa → on → done → on cycle, `ALREADY_ON` / `NOT_ON` on invalid
 * transitions, two tabs that can't double-append a pause (row lock), two
 * concurrent clock-ins (one wins, the other gets `ALREADY_ON` from the partial
 * unique index), and owner-only reads. Runs only when TEST_DATABASE_URL points
 * at a migrated database (`npm run db:migrate`). Every row a test creates
 * carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("time tracking clock (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const clock = await import("@/lib/time-tracking/clock");
  const { todayStatus } = await import("@/lib/time-tracking/state");
  const { localDate } = await import("@/lib/time-tracking/local-time");
  const { DEFAULT_TIME_TRACKING_SETTINGS } = await import("@/lib/time-tracking/settings");

  const settings = { ...DEFAULT_TIME_TRACKING_SETTINGS, enabled: true };
  let me = "";
  let other = "";

  beforeAll(async () => {
    const rows = await db
      .insert(schema.staff)
      .values([
        { name: `Horario A ${run}`, role: "Colaborador" },
        { name: `Horario B ${run}`, role: "Colaborador" },
      ])
      .returning({ id: schema.staff.id });
    me = rows[0].id;
    other = rows[1].id;
  });

  afterAll(async () => {
    const ids = [me, other].filter(Boolean);
    if (ids.length === 0) return;
    await db.delete(schema.timeEntries).where(inArray(schema.timeEntries.staffId, ids));
    await db.delete(schema.staff).where(inArray(schema.staff.id, ids));
  });

  beforeEach(async () => {
    await db.delete(schema.timeEntries).where(inArray(schema.timeEntries.staffId, [me, other]));
  });

  async function status(staffId: string, now: Date) {
    const entries = await clock.listDayEntries(db, staffId, localDate(now));
    return todayStatus({ entries, settings, role: "Colaborador", now });
  }

  function later(base: Date, minutes: number): Date {
    return new Date(base.getTime() + minutes * 60_000);
  }

  it("walks the whole state machine", async () => {
    const t0 = new Date();
    expect((await status(me, t0)).state).toBe("off");

    await clock.clockIn(db, me, "sidebar", t0);
    expect((await status(me, t0)).state).toBe("on");
    await expect(clock.clockIn(db, me, "login", t0)).rejects.toThrow(/^ALREADY_ON/);
    await expect(clock.resumeWork(db, me, t0)).rejects.toThrow(/^NOT_ON/);

    await clock.pauseWork(db, me, later(t0, 1));
    expect((await status(me, later(t0, 1))).state).toBe("pausa");
    await expect(clock.pauseWork(db, me, later(t0, 1))).rejects.toThrow(/^NOT_ON/);

    await clock.resumeWork(db, me, later(t0, 2));
    expect((await status(me, later(t0, 2))).state).toBe("on");

    await clock.pauseWork(db, me, later(t0, 3));
    await clock.clockOut(db, me, later(t0, 4));
    const done = await status(me, later(t0, 10));
    expect(done.state).toBe("done");
    // 4 minutes open, 1 + 1 paused (the open pause is closed at clock-out).
    expect(done.workedSeconds).toBe(120);

    const [row] = await db.select().from(schema.timeEntries).where(eq(schema.timeEntries.staffId, me));
    expect(row.closedBy).toBe("user");
    expect(row.source).toBe("sidebar");
    expect(row.workDate).toBe(localDate(t0));
    expect(row.pauses).toHaveLength(2);
    expect(row.pauses.every((pause) => pause.to !== null)).toBe(true);
    expect(row.endedAt?.getTime()).toBe(later(t0, 4).getTime());

    await expect(clock.clockOut(db, me, later(t0, 5))).rejects.toThrow(/^NOT_ON/);
    await expect(clock.pauseWork(db, me, later(t0, 5))).rejects.toThrow(/^NOT_ON/);

    await clock.clockIn(db, me, "assistant", later(t0, 6));
    expect((await status(me, later(t0, 6))).state).toBe("on");
    const all = await db.select().from(schema.timeEntries).where(eq(schema.timeEntries.staffId, me));
    expect(all).toHaveLength(2);
  });

  it("two tabs pausing at once append one pause", async () => {
    const t0 = new Date();
    await clock.clockIn(db, me, "sidebar", t0);
    const results = await Promise.allSettled([
      clock.pauseWork(db, me, later(t0, 1)),
      clock.pauseWork(db, me, later(t0, 1)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason)).toMatch(/NOT_ON/);
    const [row] = await db.select().from(schema.timeEntries).where(eq(schema.timeEntries.staffId, me));
    expect(row.pauses).toHaveLength(1);
  });

  it("two concurrent clock-ins leave one open entry and one ALREADY_ON", async () => {
    const t0 = new Date();
    const results = await Promise.allSettled([
      clock.clockIn(db, me, "sidebar", t0),
      clock.clockIn(db, me, "login", t0),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(String(rejected.reason)).toMatch(/ALREADY_ON/);
    const rows = await db.select().from(schema.timeEntries).where(eq(schema.timeEntries.staffId, me));
    expect(rows).toHaveLength(1);
  });

  it("the partial unique index refuses a second open entry", async () => {
    const now = new Date();
    const values = { staffId: me, workDate: localDate(now), startedAt: now, source: "sidebar" as const };
    await db.insert(schema.timeEntries).values(values);
    let error: unknown = null;
    try {
      await db.insert(schema.timeEntries).values(values);
    } catch (err) {
      error = err;
    }
    expect(clock.isOneOpenViolation(error)).toBe(true);
  });

  it("only reads and changes the caller's own entries", async () => {
    const t0 = new Date();
    await clock.clockIn(db, other, "sidebar", t0);
    expect((await status(me, t0)).state).toBe("off");
    await expect(clock.pauseWork(db, me, t0)).rejects.toThrow(/^NOT_ON/);
    await clock.clockIn(db, me, "sidebar", t0);
    await clock.clockOut(db, me, later(t0, 1));
    expect((await status(other, t0)).state).toBe("on");
  });
});
