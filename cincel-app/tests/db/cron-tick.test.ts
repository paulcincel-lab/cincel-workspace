// @vitest-environment node
/**
 * Cron tick lease and windows (redesign BE §13, §17 item 12) against a real
 * Postgres. Runs only when TEST_DATABASE_URL points at a migrated database.
 * The concurrency case needs two real connections, so instead of a rolled
 * back transaction every test uses its own lease row and window keys, and
 * the rows are deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { eq, like, sql as dsql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

import { acquireLease, releaseLease } from "@/lib/cron/lease";
import type { CronJob, CronJobName } from "@/lib/cron/registry";
import { runTick } from "@/lib/cron/tick";
import * as schema from "@/lib/db/schema";

const url = process.env.TEST_DATABASE_URL;
const RUN = randomUUID().slice(0, 8);
const leaseName = (label: string) => `test-tick-${RUN}-${label}`;
const windowKey = (label: string) => `test:${RUN}:${label}`;

function job(
  name: CronJobName,
  run: CronJob["run"],
  due: CronJob["due"] = () => ({ run: true })
): CronJob {
  return { name, due, run };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!url)("cron tick (test DB)", () => {
  const sqlA = postgres(url ?? "", { max: 2, onnotice: () => {} });
  const sqlB = postgres(url ?? "", { max: 2, onnotice: () => {} });
  const dbA = drizzle(sqlA, { schema });
  const dbB = drizzle(sqlB, { schema });

  afterAll(async () => {
    await dbA.delete(schema.cronLeases).where(like(schema.cronLeases.job, `test-tick-${RUN}-%`));
    await dbA.delete(schema.cronRuns).where(like(schema.cronRuns.windowKey, `test:${RUN}:%`));
    await sqlA.end({ timeout: 5 });
    await sqlB.end({ timeout: 5 });
  });

  it("two concurrent ticks: only one runs", async () => {
    const lease = leaseName("concurrent");
    const run = vi.fn(async () => {
      await sleep(300);
      return { count: 1 };
    });
    const jobs = [job("notifications-deliver", run)];

    const [a, b] = await Promise.all([
      runTick(new Date(), { db: dbA, jobs, leaseJob: lease }),
      runTick(new Date(), { db: dbB, jobs, leaseJob: lease }),
    ]);

    expect([a.acquired, b.acquired].filter(Boolean)).toHaveLength(1);
    expect(run).toHaveBeenCalledTimes(1);
    const loser = a.acquired ? b : a;
    expect(loser).toEqual({ acquired: false, ran: [], skipped: [] });
  });

  it("many concurrent acquires of one lease: exactly one wins", async () => {
    const lease = leaseName("race");
    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) => acquireLease(i % 2 ? dbA : dbB, lease, `owner-${i}`, 55))
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("a lease that is still held blocks the tick", async () => {
    const lease = leaseName("held");
    expect(await acquireLease(dbA, lease, "other-tick", 55)).toBe(true);
    const run = vi.fn(async () => ({ count: 1 }));

    const report = await runTick(new Date(), { db: dbB, jobs: [job("notifications-deliver", run)], leaseJob: lease });

    expect(report.acquired).toBe(false);
    expect(run).not.toHaveBeenCalled();
  });

  it("an expired lease left by a crashed tick is taken over", async () => {
    const lease = leaseName("crashed");
    await dbA
      .insert(schema.cronLeases)
      .values({ job: lease, owner: "crashed-tick", lockedUntil: dsql`now() - interval '1 second'` });
    const run = vi.fn(async () => ({ count: 2 }));

    const report = await runTick(new Date(), { db: dbB, jobs: [job("notifications-deliver", run)], leaseJob: lease });

    expect(report.acquired).toBe(true);
    expect(report.ran).toEqual([{ job: "notifications-deliver", ms: expect.any(Number), count: 2 }]);
    const [row] = await dbA.select().from(schema.cronLeases).where(eq(schema.cronLeases.job, lease));
    expect(row.owner).not.toBe("crashed-tick");
  });

  it("releases the lease at the end so the next tick runs", async () => {
    const lease = leaseName("release");
    const run = vi.fn(async () => ({ count: 0 }));
    const jobs = [job("notifications-deliver", run)];

    expect((await runTick(new Date(), { db: dbA, jobs, leaseJob: lease })).acquired).toBe(true);
    expect((await runTick(new Date(), { db: dbB, jobs, leaseJob: lease })).acquired).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("release only frees the lease for its owner", async () => {
    const lease = leaseName("owner");
    expect(await acquireLease(dbA, lease, "owner-1", 55)).toBe(true);
    await releaseLease(dbA, lease, "owner-2");
    expect(await acquireLease(dbB, lease, "owner-3", 55)).toBe(false);
    await releaseLease(dbA, lease, "owner-1");
    expect(await acquireLease(dbB, lease, "owner-3", 55)).toBe(true);
  });

  it("a windowed job runs once per window", async () => {
    const lease = leaseName("window");
    const key = windowKey("digest-day-1");
    const run = vi.fn(async () => ({ count: 3 }));
    const jobs = [job("daily-digest", run, () => ({ run: true, windowKey: key }))];

    const first = await runTick(new Date(), { db: dbA, jobs, leaseJob: lease });
    const second = await runTick(new Date(), { db: dbB, jobs, leaseJob: lease });

    expect(run).toHaveBeenCalledTimes(1);
    expect(first.ran.map((r) => r.job)).toEqual(["daily-digest"]);
    expect(second.skipped).toEqual([{ job: "daily-digest", reason: "window_done" }]);
    const rows = await dbA.select().from(schema.cronRuns).where(eq(schema.cronRuns.windowKey, key));
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("done");
    expect(rows[0].finishedAt).not.toBeNull();
    expect(rows[0].detail).toMatchObject({ count: 3 });
  });

  it("a new window runs again", async () => {
    const lease = leaseName("window-next");
    let key = windowKey("day-a");
    const run = vi.fn(async () => ({ count: 1 }));
    const jobs = [job("daily-digest", run, () => ({ run: true, windowKey: key }))];

    await runTick(new Date(), { db: dbA, jobs, leaseJob: lease });
    key = windowKey("day-b");
    await runTick(new Date(), { db: dbA, jobs, leaseJob: lease });

    expect(run).toHaveBeenCalledTimes(2);
  });

  it("a failing job is logged, marks its window failed, and the tick continues", async () => {
    const lease = leaseName("failing");
    const key = windowKey("failing");
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const after = vi.fn(async () => ({ count: 5 }));
    const jobs = [
      job(
        "daily-digest",
        async () => {
          throw new Error("boom");
        },
        () => ({ run: true, windowKey: key })
      ),
      job("notifications-deliver", after),
    ];

    const report = await runTick(new Date(), { db: dbA, jobs, leaseJob: lease });

    expect(after).toHaveBeenCalledTimes(1);
    expect(report.ran.map((r) => r.job)).toEqual(["notifications-deliver"]);
    expect(report.skipped).toEqual([{ job: "daily-digest", reason: "failed" }]);
    const line = JSON.parse(String(errorSpy.mock.calls[0][0]));
    expect(line).toMatchObject({ msg: "cron.job_failed", job: "daily-digest", error: "boom" });
    expect(typeof line.trace_id).toBe("string");
    const [row] = await dbA.select().from(schema.cronRuns).where(eq(schema.cronRuns.windowKey, key));
    expect(row.status).toBe("failed");
    errorSpy.mockRestore();
  });

  it("jobs past the budget are skipped", async () => {
    const lease = leaseName("budget");
    let t = 0;
    const slow = vi.fn(async () => {
      t += 60_000;
      return { count: 1 };
    });
    const next = vi.fn(async () => ({ count: 1 }));
    const jobs = [job("notifications-deliver", slow), job("reminders-fire", next)];

    const report = await runTick(new Date(), { db: dbA, jobs, leaseJob: lease, clock: () => t });

    expect(slow).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
    expect(report.skipped).toEqual([{ job: "reminders-fire", reason: "budget" }]);
  });

  it("jobs that are not due are skipped without a window row", async () => {
    const lease = leaseName("not-due");
    const run = vi.fn(async () => ({ count: 1 }));
    const report = await runTick(new Date(), {
      db: dbA,
      jobs: [job("daily-digest", run, () => ({ run: false }))],
      leaseJob: lease,
    });
    expect(run).not.toHaveBeenCalled();
    expect(report.skipped).toEqual([{ job: "daily-digest", reason: "not_due" }]);
  });
});
