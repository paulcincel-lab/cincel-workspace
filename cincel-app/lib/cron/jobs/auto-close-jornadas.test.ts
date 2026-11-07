// @vitest-environment node
/**
 * Cron registry entry of `auto-close-jornadas` (redesign BE §13): registered
 * under its canonical name, due on every tick without a job window, running
 * both steps with the tick's executor and clock; the missing clock-in step's
 * own window opens at `dayStart + 2 h`, one key per local day.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const steps = vi.hoisted(() => ({
  autoCloseOpenEntries: vi.fn(async () => 2),
  notifyMissingClockIns: vi.fn(async () => 3),
  getTimeTrackingSettings: vi.fn(),
}));

vi.mock("@/lib/time-tracking/auto-close", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/time-tracking/auto-close")>()),
  autoCloseOpenEntries: steps.autoCloseOpenEntries,
  notifyMissingClockIns: steps.notifyMissingClockIns,
}));
vi.mock("@/lib/time-tracking/settings", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/time-tracking/settings")>()),
  getTimeTrackingSettings: steps.getTimeTrackingSettings,
}));

import { autoCloseJornadasJob } from "@/lib/cron/jobs/auto-close-jornadas";
import { registeredJobs } from "@/lib/cron/registry";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import { localInstant, missingClockInWindow } from "@/lib/time-tracking/auto-close";
import { DEFAULT_TIME_TRACKING_SETTINGS } from "@/lib/time-tracking/settings";
import type { TimeTrackingSettings } from "@/lib/types/redesign";

const settings: TimeTrackingSettings = {
  ...DEFAULT_TIME_TRACKING_SETTINGS,
  enabled: true,
  requiredFrom: "2026-11-02",
  dayStart: "08:30",
  dayEnd: "17:30",
};

beforeEach(() => {
  steps.getTimeTrackingSettings.mockResolvedValue(settings);
});

describe("auto-close-jornadas in the cron registry", () => {
  it("is registered once under its canonical name", () => {
    expect(registeredJobs().filter((job) => job.name === "auto-close-jornadas")).toEqual([autoCloseJornadasJob]);
  });

  it("is due on every tick, without a job window", () => {
    for (const hhmm of ["00:00", "08:30", "10:30", "23:59"]) {
      expect(autoCloseJornadasJob.due(localInstant("2026-11-09", hhmm), "America/Mexico_City")).toEqual({ run: true });
    }
  });

  it("runs the auto-close and the missing clock-in steps with the tick's executor and clock", async () => {
    const db = {} as OwnerDb;
    const now = localInstant("2026-11-09", "10:30");
    const result = await autoCloseJornadasJob.run({ db, now, traceId: "t", budgetMs: 50_000 });
    expect(steps.autoCloseOpenEntries).toHaveBeenCalledWith(db, settings, now);
    expect(steps.notifyMissingClockIns).toHaveBeenCalledWith(db, settings, now);
    expect(result).toEqual({ count: 5 });
  });

  it("opens the missing clock-in window at dayStart + 2 h with one key per day", () => {
    const before = missingClockInWindow(localInstant("2026-11-09", "10:29"), settings);
    const at = missingClockInWindow(localInstant("2026-11-09", "10:30"), settings);
    const later = missingClockInWindow(localInstant("2026-11-09", "16:00"), settings);
    const nextDay = missingClockInWindow(localInstant("2026-11-10", "10:30"), settings);
    expect(before.run).toBe(false);
    expect(at).toEqual({ run: true, date: "2026-11-09", windowKey: "sin_entrada:2026-11-09" });
    expect(later.windowKey).toBe(at.windowKey);
    expect(nextDay.windowKey).toBe("sin_entrada:2026-11-10");
  });
});
