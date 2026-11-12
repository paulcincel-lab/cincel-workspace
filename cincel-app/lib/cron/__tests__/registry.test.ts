// @vitest-environment node
/**
 * Cron job registry (redesign BE §8.0.4, §13, §21): importing the jobs folder
 * registers exactly the canonical jobs; the jobs without a window
 * (reminders, Gmail, jornadas, delivery) are due on every tick; the digest
 * keeps its 07:30 window.
 */
import { readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { DAILY_PRODUCERS, runDailyProducers, type DailyProducer } from "@/lib/cron/daily-producers";
import { vencimientoProducer } from "@/lib/cron/daily-producers/vencimiento";
import "@/lib/cron/jobs";
import { dailyDigestDue } from "@/lib/cron/jobs/daily-digest";
import { CRON_JOB_NAMES, registeredJobs, type CronJobContext } from "@/lib/cron/registry";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";

const TZ = "America/Mexico_City";
const ctx = (): CronJobContext => ({
  db: {} as OwnerDb,
  now: new Date("2026-11-09T14:00:00Z"),
  traceId: "trace",
  budgetMs: 50_000,
});

describe("cron registry", () => {
  it("registers exactly the canonical job names", () => {
    const names = registeredJobs().map((job) => job.name);
    expect(names).toHaveLength(CRON_JOB_NAMES.length);
    expect([...names].sort()).toEqual([...CRON_JOB_NAMES].sort());
    expect(new Set(names).size).toBe(names.length);
  });

  it("has one file per canonical job in lib/cron/jobs", () => {
    const dir = resolve(__dirname, "../jobs");
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && f !== "index.ts" && !f.endsWith(".test.ts"))
      .map((f) => f.replace(/\.ts$/, ""))
      .sort();
    expect(files).toEqual([...CRON_JOB_NAMES].sort());
  });

  it("the calendar jobs run once per 30 and 15 minute slot", () => {
    const refresh = registeredJobs().find((j) => j.name === "calendar-events-refresh");
    const resync = registeredJobs().find((j) => j.name === "calendar-meetings-resync");
    const a = refresh?.due(new Date("2026-11-09T14:00:00Z"), TZ);
    const b = refresh?.due(new Date("2026-11-09T14:29:00Z"), TZ);
    const c = refresh?.due(new Date("2026-11-09T14:30:00Z"), TZ);
    expect(a?.windowKey).toBe(b?.windowKey);
    expect(c?.windowKey).not.toBe(a?.windowKey);
    expect(resync?.due(new Date("2026-11-09T14:00:00Z"), TZ).windowKey).not.toBe(
      resync?.due(new Date("2026-11-09T14:15:00Z"), TZ).windowKey,
    );
  });

  it.each(["reminders-fire", "gmail-sync", "auto-close-jornadas"] as const)(
    "%s is registered and due on every tick without a window",
    (name) => {
      const job = registeredJobs().find((j) => j.name === name);
      expect(job).toBeDefined();
      for (const iso of ["2026-11-09T06:00:00Z", "2026-11-09T14:00:00Z", "2026-11-10T05:59:00Z"]) {
        expect(job!.due(new Date(iso), TZ)).toEqual({ run: true });
      }
    }
  );

  it("notifications-deliver is due on every tick without a window", () => {
    const job = registeredJobs().find((j) => j.name === "notifications-deliver")!;
    for (const iso of ["2026-11-09T06:00:00Z", "2026-11-09T13:31:00Z", "2026-11-10T05:59:00Z"]) {
      expect(job.due(new Date(iso), TZ)).toEqual({ run: true });
    }
  });

  it("daily-digest uses the dailyDigestDue schedule", () => {
    const job = registeredJobs().find((j) => j.name === "daily-digest")!;
    expect(job.due).toBe(dailyDigestDue);
  });
});

describe("dailyDigestDue", () => {
  // America/Mexico_City is UTC-6 all year (no DST since 2022): 07:30 local = 13:30 UTC.
  it("is not due before 07:30 local", () => {
    expect(dailyDigestDue(new Date("2026-11-09T13:29:00Z"), TZ)).toEqual({ run: false });
    expect(dailyDigestDue(new Date("2026-11-09T06:30:00Z"), TZ)).toEqual({ run: false });
  });

  it("is due from 07:30 local with the local date as the window", () => {
    expect(dailyDigestDue(new Date("2026-11-09T13:30:00Z"), TZ)).toEqual({
      run: true,
      windowKey: "daily-digest:2026-11-09",
    });
  });

  it("keeps the same window for the rest of the local day, even after UTC midnight", () => {
    expect(dailyDigestDue(new Date("2026-11-10T05:59:00Z"), TZ)).toEqual({
      run: true,
      windowKey: "daily-digest:2026-11-09",
    });
  });

  it("opens a new window the next local day", () => {
    expect(dailyDigestDue(new Date("2026-11-10T13:45:00Z"), TZ)).toEqual({
      run: true,
      windowKey: "daily-digest:2026-11-10",
    });
  });
});

describe("daily producers", () => {
  it("lists the vencimiento and progress-snapshots producers", () => {
    expect(DAILY_PRODUCERS.map((p) => p.name)).toEqual(["vencimiento", "progress-snapshots"]);
    expect(DAILY_PRODUCERS[0]).toBe(vencimientoProducer);
  });

  it("runs every producer in order and keeps going after one throws", async () => {
    const calls: string[] = [];
    const producers: DailyProducer[] = [
      { name: "a", run: async () => (calls.push("a"), { count: 2 }) },
      {
        name: "broken",
        run: async () => {
          calls.push("broken");
          throw new Error("boom");
        },
      },
      { name: "c", run: async () => (calls.push("c"), { count: 3 }) },
    ];
    const errors: string[] = [];
    const original = console.error;
    console.error = (line: string) => void errors.push(line);
    try {
      expect(await runDailyProducers(ctx(), producers)).toEqual({ count: 5, failed: ["broken"] });
    } finally {
      console.error = original;
    }
    expect(calls).toEqual(["a", "broken", "c"]);
    expect(errors).toHaveLength(1);
    expect(JSON.parse(errors[0])).toMatchObject({ msg: "cron.producer_failed", producer: "broken", trace_id: "trace" });
  });
});
