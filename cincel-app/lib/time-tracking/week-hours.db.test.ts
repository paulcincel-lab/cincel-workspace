// @vitest-environment node
/**
 * `weekHours` against a real Postgres (redesign BE §8.7, §8.12): day sums,
 * pauses, the lunch deduction, week boundaries and zeros for staff without
 * entries. Runs only when TEST_DATABASE_URL points at a migrated database.
 * Every row a test creates belongs to per-run staff deleted afterwards
 * (entries cascade).
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_TIME_TRACKING_SETTINGS } from "./settings";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

// Monday 2026-11-09 … Sunday 2026-11-15; America/Mexico_City is UTC−6.
const WEEK_START = "2026-11-09";
const settings = { ...DEFAULT_TIME_TRACKING_SETTINGS, enabled: true, lunchMinutes: 60 };

/** Local `HH:MM` on `date` in America/Mexico_City as a Date. */
function local(date: string, time: string): Date {
  return new Date(`${date}T${time}:00-06:00`);
}

describe.skipIf(!url)("weekHours (test DB)", async () => {
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { inArray } = await import("drizzle-orm");
  const { weekHours } = await import("./week-hours");

  const staffIds: string[] = [];
  let worker = "";
  let idle = "";

  async function newStaff(label: string): Promise<string> {
    const [row] = await db
      .insert(schema.staff)
      .values({ name: `${label} ${run}`, email: `${label.toLowerCase()}-${run}@example.test` })
      .returning({ id: schema.staff.id });
    staffIds.push(row.id);
    return row.id;
  }

  async function entry(
    staffId: string,
    workDate: string,
    from: string,
    to: string,
    pauses: { from: string; to: string }[] = [],
  ) {
    await db.insert(schema.timeEntries).values({
      staffId,
      workDate,
      startedAt: local(workDate, from),
      endedAt: local(workDate, to),
      pauses: pauses.map((p) => ({ from: local(workDate, p.from).toISOString(), to: local(workDate, p.to).toISOString() })),
      source: "sidebar",
      closedBy: "user",
    });
  }

  beforeAll(async () => {
    worker = await newStaff("Horas");
    idle = await newStaff("SinHoras");

    // Sunday before the week and Monday after it: outside the week.
    await entry(worker, "2026-11-08", "09:00", "17:00");
    await entry(worker, "2026-11-16", "09:00", "17:00");

    // Monday: 9 h straight, no pause → 9 − 1 lunch = 8.
    await entry(worker, "2026-11-09", "09:00", "18:00");
    // Tuesday: 9 h with a 45 min pause → 8.25 worked, lunch already taken.
    await entry(worker, "2026-11-10", "09:00", "18:00", [{ from: "13:00", to: "13:45" }]);
    // Wednesday: 4.5 h → below 5 h, no deduction.
    await entry(worker, "2026-11-11", "09:00", "13:30");
    // Thursday: two entries 3 h + 3 h, only a 15 min pause → 5.75 worked − 1 = 4.75.
    await entry(worker, "2026-11-12", "08:00", "11:00", [{ from: "10:00", to: "10:15" }]);
    await entry(worker, "2026-11-12", "12:00", "15:00");
    // Sunday (last day of the week): 2 h → counted.
    await entry(worker, "2026-11-15", "10:00", "12:00");
  });

  afterAll(async () => {
    if (staffIds.length) {
      await db.delete(schema.timeEntries).where(inArray(schema.timeEntries.staffId, staffIds));
      await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
    }
  });

  it("sums each day with pauses and the lunch rule, inside the week only", async () => {
    const result = await weekHours(db, [worker], WEEK_START, settings);
    const week = result.get(worker);
    expect(week?.days).toEqual([
      { date: "2026-11-09", hours: 8 },
      { date: "2026-11-10", hours: 8.25 },
      { date: "2026-11-11", hours: 4.5 },
      { date: "2026-11-12", hours: 4.75 },
      { date: "2026-11-13", hours: 0 },
      { date: "2026-11-14", hours: 0 },
      { date: "2026-11-15", hours: 2 },
    ]);
    expect(week?.total).toBe(27.5);
  });

  it("uses the configured lunch minutes", async () => {
    const result = await weekHours(db, [worker], WEEK_START, { ...settings, lunchMinutes: 30 });
    const days = result.get(worker)?.days ?? [];
    expect(days[0]).toEqual({ date: "2026-11-09", hours: 8.5 });
    expect(days[3]).toEqual({ date: "2026-11-12", hours: 5.25 });
  });

  it("returns 7 zero days for staff without entries", async () => {
    const result = await weekHours(db, [idle], WEEK_START, settings);
    expect(result.get(idle)).toEqual({
      days: [
        "2026-11-09",
        "2026-11-10",
        "2026-11-11",
        "2026-11-12",
        "2026-11-13",
        "2026-11-14",
        "2026-11-15",
      ].map((date) => ({ date, hours: 0 })),
      total: 0,
    });
  });

  it("returns zeros for a week with no entries and an empty map for no staff", async () => {
    const result = await weekHours(db, [worker, idle], "2030-01-07", settings);
    expect(result.get(worker)?.total).toBe(0);
    expect(result.get(idle)?.total).toBe(0);
    expect((await weekHours(db, [], WEEK_START, settings)).size).toBe(0);
  });

  it("keys the map by every requested staff id", async () => {
    const result = await weekHours(db, [worker, idle, worker], WEEK_START, settings);
    expect([...result.keys()].sort()).toEqual([worker, idle].sort());
  });
});
