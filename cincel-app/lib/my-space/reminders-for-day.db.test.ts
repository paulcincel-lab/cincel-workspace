// @vitest-environment node
/**
 * `remindersForDay` against a real Postgres (redesign BE §8.5, §8.12): the
 * caller's open reminders of one America/Mexico_City day, ordered by time,
 * as agenda items; fired, cancelled, other days and other staff excluded.
 * Runs only when TEST_DATABASE_URL points at a migrated database. Every row a
 * test creates belongs to per-run staff deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

// America/Mexico_City is UTC−6 (no DST).
const DAY = "2031-05-14";

describe.skipIf(!url)("remindersForDay (test DB)", async () => {
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { inArray } = await import("drizzle-orm");
  const { remindersForDay } = await import("./reminders-for-day");

  const staffIds: string[] = [];
  let owner = "";
  let other = "";
  let empty = "";
  const ids: Record<string, string> = {};

  async function newStaff(label: string): Promise<string> {
    const [row] = await db
      .insert(schema.staff)
      .values({ name: `${label} ${run}`, email: `${label.toLowerCase()}-${run}@example.test` })
      .returning({ id: schema.staff.id });
    staffIds.push(row.id);
    return row.id;
  }

  async function reminder(
    key: string,
    staffId: string,
    dueAt: string,
    extra: { firedAt?: Date; cancelledAt?: Date } = {},
  ) {
    const [row] = await db
      .insert(schema.reminders)
      .values({ staffId, text: `${key} ${run}`, dueAt: new Date(dueAt), ...extra })
      .returning({ id: schema.reminders.id });
    ids[key] = row.id;
  }

  beforeAll(async () => {
    owner = await newStaff("Recuerda");
    other = await newStaff("Otro");
    empty = await newStaff("Vacio");

    // 23:59 local on the day before (05:59 UTC on DAY): excluded.
    await reminder("antes", owner, "2031-05-14T05:59:00Z");
    // 00:00 local, first minute of DAY.
    await reminder("medianoche", owner, "2031-05-14T06:00:00Z");
    // 15:00 local.
    await reminder("tarde", owner, "2031-05-14T21:00:00Z");
    // 09:30 local; inserted after "tarde" to check ordering.
    await reminder("manana", owner, "2031-05-14T15:30:00Z");
    // 23:59 local on DAY (05:59 UTC the next day): included.
    await reminder("noche", owner, "2031-05-15T05:59:00Z");
    // 00:00 local the next day: excluded.
    await reminder("despues", owner, "2031-05-15T06:00:00Z");
    // Same day but fired or cancelled: excluded.
    await reminder("disparado", owner, "2031-05-14T16:00:00Z", { firedAt: new Date("2031-05-14T16:00:00Z") });
    await reminder("cancelado", owner, "2031-05-14T17:00:00Z", { cancelledAt: new Date("2031-05-13T12:00:00Z") });
    // Another staff's reminder that day: excluded.
    await reminder("ajeno", other, "2031-05-14T18:00:00Z");
  });

  afterAll(async () => {
    if (staffIds.length) {
      await db.delete(schema.reminders).where(inArray(schema.reminders.staffId, staffIds));
      await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
    }
  });

  it("returns the caller's open reminders of the local day, ordered by time", async () => {
    const items = await remindersForDay(db, owner, DAY);
    expect(items.map((item) => item.id)).toEqual([ids.medianoche, ids.manana, ids.tarde, ids.noche]);
    expect(items.map((item) => item.title)).toEqual([
      `medianoche ${run}`,
      `manana ${run}`,
      `tarde ${run}`,
      `noche ${run}`,
    ]);
    expect(new Date(items[0].start).toISOString()).toBe("2031-05-14T06:00:00.000Z");
    expect(new Date(items[3].start).toISOString()).toBe("2031-05-15T05:59:00.000Z");
  });

  it("uses the local day on both boundaries", async () => {
    const before = await remindersForDay(db, owner, "2031-05-13");
    expect(before.map((item) => item.id)).toEqual([ids.antes]);
    const after = await remindersForDay(db, owner, "2031-05-15");
    expect(after.map((item) => item.id)).toEqual([ids.despues]);
  });

  it("returns empty for staff without reminders, a day without reminders or a malformed date", async () => {
    expect(await remindersForDay(db, empty, DAY)).toEqual([]);
    expect(await remindersForDay(db, owner, "2031-07-01")).toEqual([]);
    expect(await remindersForDay(db, owner, "mañana")).toEqual([]);
  });

  it("never returns another staff's reminders", async () => {
    const items = await remindersForDay(db, other, DAY);
    expect(items.map((item) => item.id)).toEqual([ids.ajeno]);
  });
});
