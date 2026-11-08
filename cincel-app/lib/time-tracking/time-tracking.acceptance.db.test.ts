// @vitest-environment node
/**
 * Acceptance (redesign BE §16): clock in → pause → resume → the forgotten
 * exit is auto-closed by the `auto-close-jornadas` job (flagged, one
 * notification) → the team report shows the day. Runs only when
 * TEST_DATABASE_URL points at a migrated database (`npm run db:migrate`).
 *
 * The clock is faked to a Monday of November 2019 (Date only, so the database
 * driver's timers keep working); the files that run the auto-close pass hold
 * one advisory lock (tests/setup/time-entries-lock.ts).
 */
import { unwrapActions } from "@/tests/helpers/action-result";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { lockTimeEntries } from "@/tests/setup/time-entries-lock";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const session = vi.hoisted(() => ({ staffId: "", access: "Colaborador" }));
const stored = vi.hoisted(() => ({ settings: null as unknown }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: {
      id: session.staffId,
      name: "Ana",
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
vi.mock("@/lib/time-tracking/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/time-tracking/settings")>()),
  getTimeTrackingSettings: vi.fn(async () => stored.settings),
}));

describe.skipIf(!url)("time tracking acceptance (test DB)", async () => {
  const { and, eq } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const actions = unwrapActions(await import("@/lib/actions/time-tracking-actions"));
  const { autoCloseJornadasJob } = await import("@/lib/cron/jobs/auto-close-jornadas");
  const { AUTO_CLOSE_TITLE, localInstant } = await import("@/lib/time-tracking/auto-close");
  const { DEFAULT_TIME_TRACKING_SETTINGS } = await import("@/lib/time-tracking/settings");

  const run = Math.random().toString(36).slice(2, 8);
  const DAY = "2019-11-04"; // Monday
  let unlock: (() => Promise<void>) | null = null;

  beforeAll(async () => {
    unlock = await lockTimeEntries(url!);
    stored.settings = {
      ...DEFAULT_TIME_TRACKING_SETTINGS,
      enabled: true,
      requiredFrom: "2019-11-01",
      dayStart: "09:00",
      dayEnd: "18:00",
      autoCloseAt: "20:00",
      workDays: [1, 2, 3, 4, 5],
      lunchMinutes: 60,
    };
    const [row] = await db
      .insert(schema.staff)
      .values({ name: `Acept Horario ${run}`, role: "Colaborador" })
      .returning({ id: schema.staff.id });
    session.staffId = row!.id;
    vi.useFakeTimers({ toFake: ["Date"] });
  }, 300_000);

  afterAll(async () => {
    vi.useRealTimers();
    if (session.staffId) await db.delete(schema.staff).where(eq(schema.staff.id, session.staffId));
    await unlock?.();
  });

  it("clock in → pause → resume → auto-close flagged → report", async () => {
    session.access = "Colaborador";

    vi.setSystemTime(localInstant(DAY, "09:00"));
    expect((await actions.clockInAction({ source: "sidebar" })).state).toBe("on");

    vi.setSystemTime(localInstant(DAY, "13:00"));
    expect((await actions.pauseWorkAction()).state).toBe("pausa");

    vi.setSystemTime(localInstant(DAY, "13:45"));
    expect((await actions.resumeWorkAction()).state).toBe("on");

    // The exit is forgotten; the tick after autoCloseAt closes the day.
    const tickAt = localInstant(DAY, "20:01");
    vi.setSystemTime(tickAt);
    const result = await autoCloseJornadasJob.run({ db, now: tickAt, traceId: `test-${run}`, budgetMs: 50_000 });
    expect(result.count).toBeGreaterThanOrEqual(1);

    const [entry] = await db.select().from(schema.timeEntries).where(eq(schema.timeEntries.staffId, session.staffId));
    expect(entry).toMatchObject({ workDate: DAY, closedBy: "auto_close", flagged: true, source: "sidebar" });
    expect(entry!.endedAt?.toISOString()).toBe(localInstant(DAY, "20:00").toISOString());
    expect(entry!.pauses).toEqual([
      { from: localInstant(DAY, "13:00").toISOString(), to: localInstant(DAY, "13:45").toISOString() },
    ]);

    const sent = await db
      .select()
      .from(schema.notifications)
      .where(
        and(eq(schema.notifications.staffId, session.staffId), eq(schema.notifications.dedupeKey, `auto_close:${entry!.id}`)),
      );
    expect(sent).toHaveLength(1);
    expect(sent[0]!.title).toBe(AUTO_CLOSE_TITLE);

    expect((await actions.fetchMyTodayAction()).state).toBe("done");

    // 09:00–20:00 minus a 45 min pause (≥ 30 min, so no lunch deduction) = 10.25 h.
    session.access = "Administrador";
    const rows = await actions.fetchTeamHoursAction({ weekStart: DAY });
    const row = rows.find((candidate) => candidate.staffId === session.staffId);
    expect(row).toMatchObject({ total: 10.25, target: 40, lateCount: 0, status: "incompleto" });
    expect(row!.days[0]).toEqual({ date: DAY, hours: 10.25 });
  });
});
