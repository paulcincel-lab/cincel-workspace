// @vitest-environment node
/**
 * `approvedAbsences` against a real Postgres (redesign BE §8.8, §8.12): only
 * `aprobada` requests overlapping the range, multi-day absences returned
 * whole, the optional staff filter and empty results. Runs only when
 * TEST_DATABASE_URL points at a migrated database. Every row a test creates
 * belongs to per-run staff deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("approvedAbsences (test DB)", async () => {
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { inArray } = await import("drizzle-orm");
  const { approvedAbsences } = await import("./approved-absences");

  const staffIds: string[] = [];
  let ana = "";
  let beto = "";
  let nadie = "";

  async function newStaff(label: string): Promise<string> {
    const [row] = await db
      .insert(schema.staff)
      .values({ name: `${label} ${run}`, email: `${label.toLowerCase()}-${run}@example.test` })
      .returning({ id: schema.staff.id });
    staffIds.push(row.id);
    return row.id;
  }

  async function request(
    staffId: string,
    fromDate: string,
    toDate: string,
    status: "pendiente" | "aprobada" | "rechazada" | "cancelada",
    kind: "vacaciones" | "personal" | "enfermedad" = "vacaciones",
  ) {
    await db.insert(schema.vacationRequests).values({ staffId, fromDate, toDate, status, kind, days: 1 });
  }

  /** Only this run's rows (the shared test DB may hold others). */
  function mine<T extends { staffId: string }>(rows: T[]): T[] {
    return rows.filter((row) => staffIds.includes(row.staffId));
  }

  beforeAll(async () => {
    ana = await newStaff("Ana");
    beto = await newStaff("Beto");
    nadie = await newStaff("Nadie");

    // Range under test: Mon 2031-03-10 … Sun 2031-03-16.
    // Multi-day, starts before the range and ends inside it.
    await request(ana, "2031-03-05", "2031-03-11", "aprobada");
    // Ends the day before the range starts: excluded.
    await request(ana, "2031-03-01", "2031-03-09", "aprobada");
    // Starts on the last day of the range and runs past it.
    await request(beto, "2031-03-16", "2031-03-20", "aprobada", "enfermedad");
    // Starts the day after the range ends: excluded.
    await request(beto, "2031-03-17", "2031-03-18", "aprobada");
    // Inside the range but not approved: excluded.
    await request(ana, "2031-03-12", "2031-03-12", "pendiente");
    await request(beto, "2031-03-13", "2031-03-13", "rechazada");
    await request(beto, "2031-03-14", "2031-03-14", "cancelada");
    // Covers the whole range.
    await request(beto, "2031-03-01", "2031-03-31", "aprobada", "personal");
  });

  afterAll(async () => {
    if (staffIds.length) {
      await db.delete(schema.vacationRequests).where(inArray(schema.vacationRequests.staffId, staffIds));
      await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
    }
  });

  it("returns approved requests overlapping the range, whole and ordered by start", async () => {
    const rows = mine(await approvedAbsences(db, { from: "2031-03-10", to: "2031-03-16" }));
    expect(rows).toEqual([
      { staffId: beto, from: "2031-03-01", to: "2031-03-31", kind: "personal" },
      { staffId: ana, from: "2031-03-05", to: "2031-03-11", kind: "vacaciones" },
      { staffId: beto, from: "2031-03-16", to: "2031-03-20", kind: "enfermedad" },
    ]);
  });

  it("treats both range ends as inclusive", async () => {
    const first = await approvedAbsences(db, { from: "2031-03-11", to: "2031-03-11", staffIds: [ana] });
    expect(first).toEqual([{ staffId: ana, from: "2031-03-05", to: "2031-03-11", kind: "vacaciones" }]);
    const last = await approvedAbsences(db, { from: "2031-03-16", to: "2031-03-16", staffIds: [beto] });
    expect(last).toEqual([
      { staffId: beto, from: "2031-03-01", to: "2031-03-31", kind: "personal" },
      { staffId: beto, from: "2031-03-16", to: "2031-03-20", kind: "enfermedad" },
    ]);
  });

  it("filters by staff", async () => {
    const rows = await approvedAbsences(db, { from: "2031-03-10", to: "2031-03-16", staffIds: [ana] });
    expect(rows).toEqual([{ staffId: ana, from: "2031-03-05", to: "2031-03-11", kind: "vacaciones" }]);
  });

  it("returns none for staff without requests, an empty staff list or an inverted range", async () => {
    expect(await approvedAbsences(db, { from: "2031-03-10", to: "2031-03-16", staffIds: [nadie] })).toEqual([]);
    expect(await approvedAbsences(db, { from: "2031-03-10", to: "2031-03-16", staffIds: [] })).toEqual([]);
    expect(await approvedAbsences(db, { from: "2031-03-16", to: "2031-03-10", staffIds: [ana, beto] })).toEqual([]);
  });

  it("returns none for a range with no approved requests", async () => {
    expect(await approvedAbsences(db, { from: "2031-06-01", to: "2031-06-30", staffIds: [ana, beto] })).toEqual([]);
  });
});
