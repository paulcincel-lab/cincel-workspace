// @vitest-environment node
/**
 * Cron job `reminders-fire` (redesign BE §13): registered, due on every tick
 * with no window key, runs `fireDueReminders` with the tick's db and time,
 * and runs before `notifications-deliver` so a reminder's email leaves in the
 * same tick. The end-to-end path is `reminders-fire.acceptance.db.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";

const fire = vi.hoisted(() => ({ fireDueReminders: vi.fn(async () => ({ count: 3 })) }));
vi.mock("@/lib/my-space/reminders", () => fire);

describe("reminders-fire job", async () => {
  await import("@/lib/cron/jobs");
  const { registeredJobs } = await import("@/lib/cron/registry");
  const { remindersFireJob } = await import("./reminders-fire");

  it("is registered under its canonical name", () => {
    expect(registeredJobs().map((j) => j.name)).toContain("reminders-fire");
  });

  it("runs before notifications-deliver", () => {
    const names = registeredJobs().map((j) => j.name);
    expect(names.indexOf("reminders-fire")).toBeLessThan(names.indexOf("notifications-deliver"));
  });

  it("is due on every tick, without a window key", () => {
    for (const iso of ["2026-11-06T20:14:00Z", "2026-11-07T06:00:00Z", "2026-12-31T23:59:59Z"]) {
      expect(remindersFireJob.due(new Date(iso), "America/Mexico_City")).toEqual({ run: true });
    }
  });

  it("fires the due reminders with the tick's db and time", async () => {
    const db = {} as Parameters<typeof remindersFireJob.run>[0]["db"];
    const now = new Date("2026-11-06T20:14:00Z");
    await expect(remindersFireJob.run({ db, now, traceId: "t1", budgetMs: 50_000 })).resolves.toEqual({ count: 3 });
    expect(fire.fireDueReminders).toHaveBeenCalledWith(db, now);
  });
});
