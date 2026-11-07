// @vitest-environment node
/**
 * Cron job `gmail-sync` against a real Postgres (redesign BE §13): cap per
 * tick, oldest first, skips disconnected / backed-off / consent-needing
 * accounts, logs `gmail.sync_failed` and keeps going. The sync itself is a
 * spy. Other test files may own `gmail_accounts` rows at the same time, so
 * order assertions look only at this file's staff. Runs only when
 * TEST_DATABASE_URL points at a migrated database.
 */
import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe("gmailSyncMaxPerTick", async () => {
  const { gmailSyncMaxPerTick, GMAIL_SYNC_DEFAULT_PER_TICK } = await import("./gmail-sync");
  it("reads GMAIL_SYNC_MAX_PER_TICK with a default of 10", () => {
    expect(GMAIL_SYNC_DEFAULT_PER_TICK).toBe(10);
    expect(gmailSyncMaxPerTick({})).toBe(10);
    expect(gmailSyncMaxPerTick({ GMAIL_SYNC_MAX_PER_TICK: "3" })).toBe(3);
    expect(gmailSyncMaxPerTick({ GMAIL_SYNC_MAX_PER_TICK: "nope" })).toBe(10);
  });

  it("is registered as an every-tick job", async () => {
    const { gmailSyncJob } = await import("./gmail-sync");
    expect(gmailSyncJob.name).toBe("gmail-sync");
    expect(gmailSyncJob.due(new Date(), "America/Mexico_City")).toEqual({ run: true });
  });
});

describe.skipIf(!url)("gmail-sync job (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { runGmailSync } = await import("./gmail-sync");
  const { GmailError } = await import("@/lib/gmail/client");

  const now = new Date("2026-11-07T12:00:00Z");
  const minutes = (n: number) => new Date(now.getTime() + n * 60_000);
  const staff: Record<string, string> = {};
  const ctx = () => ({ db, now, traceId: `trace-${run}`, budgetMs: 50_000 });

  beforeAll(async () => {
    const names = ["never", "oldest", "older", "recent", "disconnected", "backoff", "backoffOver", "invalidGrant", "scopeMissing"];
    const rows = await db
      .insert(schema.staff)
      .values(names.map((n) => ({ name: `Job ${n} ${run}`, email: `job-${n}-${run}@cincel.example` })))
      .returning({ id: schema.staff.id });
    names.forEach((n, i) => (staff[n] = rows[i].id));
    await db.insert(schema.gmailAccounts).values([
      { staffId: staff.never, lastSyncedAt: null },
      { staffId: staff.oldest, lastSyncedAt: new Date("2001-01-01T00:00:00Z") },
      { staffId: staff.older, lastSyncedAt: new Date("2001-01-02T00:00:00Z") },
      { staffId: staff.recent, lastSyncedAt: new Date("2001-01-03T00:00:00Z") },
      { staffId: staff.disconnected, lastSyncedAt: new Date("2000-01-01T00:00:00Z"), disconnectedAt: new Date() },
      { staffId: staff.backoff, lastSyncedAt: new Date("2000-01-01T00:00:00Z"), nextSyncAfter: minutes(5), lastError: "rate_limited:2" },
      { staffId: staff.backoffOver, lastSyncedAt: new Date("2001-01-04T00:00:00Z"), nextSyncAfter: minutes(-1), lastError: "rate_limited:0" },
      { staffId: staff.invalidGrant, lastSyncedAt: new Date("2000-01-01T00:00:00Z"), lastError: "invalid_grant" },
      { staffId: staff.scopeMissing, lastSyncedAt: new Date("2000-01-01T00:00:00Z"), lastError: "scope_missing" },
    ]);
  });

  afterAll(async () => {
    const all = Object.values(staff);
    if (all.length) await db.delete(schema.staff).where(inArray(schema.staff.id, all));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mine = (calls: unknown[][]) => {
    const own = new Map(Object.entries(staff).map(([k, v]) => [v, k]));
    return calls.map((c) => own.get(c[1] as string)).filter((k): k is string => !!k);
  };

  it("syncs connected accounts oldest first and skips disconnected, backed-off and consent-needing ones", async () => {
    const sync = vi.fn().mockResolvedValue({ synced: 0 });
    const result = await runGmailSync(ctx(), { sync, maxPerTick: 10_000 });
    expect(mine(sync.mock.calls)).toEqual(["never", "oldest", "older", "recent", "backoffOver"]);
    expect(result.count).toBe(sync.mock.calls.length);
    for (const call of sync.mock.calls) expect(call[0]).toBe(db);
  });

  it("respects the per-tick cap", async () => {
    const sync = vi.fn().mockResolvedValue({ synced: 0 });
    await runGmailSync(ctx(), { sync, maxPerTick: 2 });
    expect(sync).toHaveBeenCalledTimes(2);
    const none = vi.fn();
    expect(await runGmailSync(ctx(), { sync: none, maxPerTick: 0 })).toEqual({ count: 0 });
    expect(none).not.toHaveBeenCalled();
  });

  it("logs gmail.sync_failed with the trace id and keeps going", async () => {
    const logged: string[] = [];
    vi.spyOn(console, "error").mockImplementation((line: unknown) => void logged.push(String(line)));
    const sync = vi.fn(async (_db: unknown, staffId: string) => {
      if (staffId === staff.oldest) throw new GmailError("RATE_LIMITED", 429);
      return { synced: 1 };
    });
    await runGmailSync(ctx(), { sync, maxPerTick: 10_000 });
    expect(mine(sync.mock.calls)).toEqual(["never", "oldest", "older", "recent", "backoffOver"]);
    const line = logged.map((l) => JSON.parse(l)).find((l) => l.staff_id === staff.oldest);
    expect(line).toMatchObject({ msg: "gmail.sync_failed", trace_id: `trace-${run}`, code: "RATE_LIMITED" });
  });

  it("an unexpected failure also backs the account off so it can't hold the head of the queue", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sync = vi.fn(async (_db: unknown, staffId: string) => {
      if (staffId === staff.never) throw new Error("socket hang up");
      return { synced: 0 };
    });
    await runGmailSync(ctx(), { sync, maxPerTick: 10_000 });
    const [row] = await db.select().from(schema.gmailAccounts).where(eq(schema.gmailAccounts.staffId, staff.never));
    expect(row.lastError).toBe("rate_limited:0");
    expect(row.nextSyncAfter?.toISOString()).toBe(minutes(1).toISOString());

    const next = vi.fn().mockResolvedValue({ synced: 0 });
    await runGmailSync(ctx(), { sync: next, maxPerTick: 10_000 });
    expect(mine(next.mock.calls)).not.toContain("never");
  });

  it("stops when the tick budget is spent", async () => {
    let t = 0;
    const sync = vi.fn(async () => {
      t += 30_000;
      return { synced: 0 };
    });
    await runGmailSync({ ...ctx(), budgetMs: 50_000 }, { sync, maxPerTick: 10_000, clock: () => t });
    expect(sync).toHaveBeenCalledTimes(2);
  });
});
