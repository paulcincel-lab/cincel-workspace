// @vitest-environment node
/**
 * Team hours report, payroll CSV and auto-close against a real Postgres
 * (redesign BE §7.7, §8.7): report statuses, the lunch rule, late count,
 * target minus approved vacations, exempt / inactive staff left out; the
 * auto-close with and without `autoCloseAt` (flagged, pause closed, one
 * notification per entry); CSV formula escaping, BOM and trial days. Runs only
 * when TEST_DATABASE_URL points at a migrated database (`npm run db:migrate`).
 *
 * Every row lives in a week of January 2020, so the auto-close pass (which
 * looks at every open entry) never touches today's rows of other test files;
 * the files that run that pass hold one advisory lock (tests/setup/time-entries-lock.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { lockTimeEntries } from "@/tests/setup/time-entries-lock";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

describe.skipIf(!url)("time tracking report and auto-close (test DB)", async () => {
  const { and, eq, inArray } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { autoCloseOpenEntries, localInstant, AUTO_CLOSE_TITLE } = await import("@/lib/time-tracking/auto-close");
  const { teamHoursCsv, teamHoursReport } = await import("@/lib/time-tracking/report");
  const { DEFAULT_TIME_TRACKING_SETTINGS } = await import("@/lib/time-tracking/settings");

  const run = Math.random().toString(36).slice(2, 8);
  const WEEK = "2020-01-06"; // Monday
  const NOW = localInstant("2020-01-20", "12:00");
  const settings = {
    ...DEFAULT_TIME_TRACKING_SETTINGS,
    enabled: true,
    requiredFrom: "2020-01-01",
    dayStart: "09:00",
    dayEnd: "18:00",
    hoursPerDay: 8,
    lateToleranceMin: 15,
    workDays: [1, 2, 3, 4, 5],
    autoCloseAt: "20:00" as string | null,
    lunchMinutes: 60,
    exemptRoles: [] as string[],
  };
  const staffIds: string[] = [];

  async function makeStaff(label: string, values: { role?: string; active?: boolean; lastName?: string } = {}) {
    const [row] = await db
      .insert(schema.staff)
      .values({
        name: `${label} ${run}`,
        lastName: values.lastName ?? null,
        role: values.role ?? "Colaborador",
        active: values.active ?? true,
      })
      .returning({ id: schema.staff.id });
    staffIds.push(row!.id);
    return row!.id;
  }

  async function makeEntry(
    staffId: string,
    date: string,
    from: string,
    to: string | null,
    pauses: [string, string | null][] = [],
  ) {
    const [row] = await db
      .insert(schema.timeEntries)
      .values({
        staffId,
        workDate: date,
        startedAt: localInstant(date, from),
        endedAt: to === null ? null : localInstant(date, to),
        closedBy: to === null ? null : "user",
        pauses: pauses.map(([a, b]) => ({
          from: localInstant(date, a).toISOString(),
          to: b === null ? null : localInstant(date, b).toISOString(),
        })),
        source: "sidebar",
      })
      .returning({ id: schema.timeEntries.id });
    return row!.id;
  }

  async function entryRow(id: string) {
    const [row] = await db.select().from(schema.timeEntries).where(eq(schema.timeEntries.id, id));
    return row!;
  }

  async function notificationsOf(staffId: string, dedupeKey: string) {
    return db
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.staffId, staffId), eq(schema.notifications.dedupeKey, dedupeKey)));
  }

  let unlock: (() => Promise<void>) | null = null;
  beforeAll(async () => {
    unlock = await lockTimeEntries(url!);
  }, 300_000);

  afterAll(async () => {
    // Entries, vacation requests and notifications cascade with the staff rows.
    if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
    await unlock?.();
  });

  describe("teamHoursReport", () => {
    it("computes statuses, the lunch rule, late count and targets minus approved vacations", async () => {
      const ana = await makeStaff("Ana Horario", { lastName: "Ruiz" });
      const beto = await makeStaff("Beto Horario");
      const carla = await makeStaff("Carla Horario");
      const exempt = await makeStaff("Dirección Horario", { role: "Dirección" });
      const inactive = await makeStaff("Inactivo Horario", { active: false });

      await makeEntry(ana, "2020-01-06", "09:00", "18:00", [["13:00", "14:00"]]); // 8
      await makeEntry(ana, "2020-01-07", "09:00", "15:00"); // 6 − lunch = 5
      await makeEntry(ana, "2020-01-08", "09:00", "15:00", [["12:00", "12:15"]]); // 5.75 − lunch = 4.75
      await makeEntry(ana, "2020-01-09", "09:30", "10:30"); // 1, late
      await makeEntry(carla, "2020-01-06", "09:00", "18:00", [["13:00", "14:00"]]);
      await makeEntry(carla, "2020-01-07", "09:00", "18:00", [["13:00", "14:00"]]);
      await makeEntry(exempt, "2020-01-06", "09:00", "18:00");
      await makeEntry(inactive, "2020-01-06", "09:00", "18:00");
      await db.insert(schema.vacationRequests).values([
        { staffId: carla, fromDate: "2020-01-08", toDate: "2020-01-10", kind: "vacaciones", days: 3, status: "aprobada" },
        { staffId: beto, fromDate: "2020-01-06", toDate: "2020-01-07", kind: "personal", days: 2, status: "pendiente" },
      ]);

      const rows = await teamHoursReport(db, WEEK, { ...settings, exemptRoles: ["Dirección"] }, NOW);
      const mine = new Map(rows.filter((row) => staffIds.includes(row.staffId)).map((row) => [row.staffId, row]));

      expect(mine.has(exempt)).toBe(false);
      expect(mine.has(inactive)).toBe(false);

      const anaRow = mine.get(ana)!;
      expect(anaRow.name).toBe(`Ana Horario ${run} Ruiz`);
      expect(anaRow.days.map((day) => day.hours)).toEqual([8, 5, 4.75, 1, 0, 0, 0]);
      expect(anaRow).toMatchObject({ total: 18.75, target: 40, lateCount: 1, status: "incompleto" });

      // A pending request doesn't reduce the target.
      expect(mine.get(beto)).toMatchObject({ total: 0, target: 40, lateCount: 0, status: "sin_registro" });
      // Three approved vacation work days: 8 × (5 − 3).
      expect(mine.get(carla)).toMatchObject({ total: 16, target: 16, status: "completo" });
    });
  });

  describe("autoCloseOpenEntries", () => {
    it("closes at autoCloseAt with the open pause closed, flagged, and notifies once", async () => {
      const staffId = await makeStaff("Auto Horario");
      const id = await makeEntry(staffId, "2020-01-06", "09:00", null, [
        ["13:00", "14:00"],
        ["19:30", null],
      ]);

      await autoCloseOpenEntries(db, settings, localInstant("2020-01-06", "19:59"));
      expect((await entryRow(id)).endedAt).toBeNull();

      const closed = await autoCloseOpenEntries(db, settings, localInstant("2020-01-06", "20:05"));
      expect(closed).toBeGreaterThanOrEqual(1);
      const row = await entryRow(id);
      const at = localInstant("2020-01-06", "20:00").toISOString();
      expect(row.endedAt?.toISOString()).toBe(at);
      expect(row.closedBy).toBe("auto_close");
      expect(row.flagged).toBe(true);
      expect(row.pauses[1]).toEqual({ from: localInstant("2020-01-06", "19:30").toISOString(), to: at });

      const sent = await notificationsOf(staffId, `auto_close:${id}`);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toMatchObject({ kind: "sistema", title: AUTO_CLOSE_TITLE, inApp: true });

      // A later tick changes nothing and sends nothing new.
      await autoCloseOpenEntries(db, settings, localInstant("2020-01-06", "20:06"));
      expect((await entryRow(id)).endedAt?.toISOString()).toBe(at);
      expect(await notificationsOf(staffId, `auto_close:${id}`)).toHaveLength(1);
    });

    it("without autoCloseAt closes a forgotten entry at dayEnd of its own day", async () => {
      const staffId = await makeStaff("Sin Auto Horario");
      const id = await makeEntry(staffId, "2020-01-07", "09:00", null);
      const noAuto = { ...settings, autoCloseAt: null };

      await autoCloseOpenEntries(db, noAuto, localInstant("2020-01-07", "17:59"));
      expect((await entryRow(id)).endedAt).toBeNull();

      await autoCloseOpenEntries(db, noAuto, localInstant("2020-01-08", "08:00"));
      const row = await entryRow(id);
      expect(row.endedAt?.toISOString()).toBe(localInstant("2020-01-07", "18:00").toISOString());
      expect(row).toMatchObject({ closedBy: "auto_close", flagged: true });
      expect(await notificationsOf(staffId, `auto_close:${id}`)).toHaveLength(1);
    });

    it("leaves an entry the user closed alone", async () => {
      const staffId = await makeStaff("Cerrada Horario");
      const id = await makeEntry(staffId, "2020-01-08", "09:00", "17:00");
      await autoCloseOpenEntries(db, settings, localInstant("2020-01-09", "08:00"));
      expect(await entryRow(id)).toMatchObject({ closedBy: "user", flagged: false });
    });
  });

  describe("teamHoursCsv", () => {
    it("escapes formula-leading cells, starts with the BOM and leaves trial days out", async () => {
      const staffId = await makeStaff(`=HYPERLINK("x")`, { lastName: "Uno" });
      await makeEntry(staffId, "2020-01-06", "09:00", "18:00", [["13:00", "14:00"]]); // trial
      await makeEntry(staffId, "2020-01-09", "09:00", "18:00", [["13:00", "14:00"]]);

      const { csv, trialDays } = await teamHoursCsv(db, WEEK, { ...settings, requiredFrom: "2020-01-08" }, NOW);
      expect(csv.charCodeAt(0)).toBe(0xfeff);
      const lines = csv.slice(1).split("\r\n");
      expect(lines[0]).toBe("persona,fecha,entrada,salida,pausas_min,horas,origen,marcada");
      const mine = lines.filter((line) => line.includes(run) && line.includes("HYPERLINK"));
      expect(mine).toEqual([`"'=HYPERLINK(""x"") ${run} Uno",2020-01-09,09:00,18:00,60,8.00,sidebar,no`]);
      expect(trialDays).toBeGreaterThanOrEqual(1);
    });
  });
});
