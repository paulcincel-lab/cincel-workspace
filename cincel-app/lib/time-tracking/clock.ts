/**
 * Clock transitions of Control de horario (redesign BE §8.7). Each one runs in
 * one transaction that first locks the caller's open entry with
 * `select … for update` (`ownerScoped.lockForUpdate`), so two tabs can't
 * double-append a pause:
 *
 * - clockIn: off | done → on (inserts a new entry with its `source`);
 * - pause: on → pausa (appends `{ from: now, to: null }`);
 * - resume: pausa → on (closes the last pause);
 * - clockOut: on | pausa → done (closes an open pause, `ended_at = now`,
 *   `closed_by = 'user'`).
 *
 * Any other transition throws `ALREADY_ON` / `NOT_ON`. The partial unique
 * index `time_entries_one_open_uq` keeps one open entry per staff: of two
 * concurrent clock-ins one wins and the other gets `ALREADY_ON`.
 */
import { asc, eq, isNull, or } from "drizzle-orm";

import { timeEntries } from "@/lib/db/schema";
import type { TimeEntryPause } from "@/lib/db/schema/time";
import type { FlowDb, FlowTx } from "@/lib/project-flow/db";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import { timeEntriesRepository, type TimeEntryRow } from "@/lib/repositories/time-entries-repository";
import { localDate } from "@/lib/time-tracking/local-time";
import { hasOpenPause } from "@/lib/time-tracking/state";
import type { TimeEntrySource } from "@/lib/types/redesign";

const UNIQUE_VIOLATION = "23505";
const ONE_OPEN_INDEX = "time_entries_one_open_uq";

/** Whether `err` (or one of its causes) is the one-open-entry unique violation. */
export function isOneOpenViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === "object") {
      const { code, constraint_name, constraint } = current as {
        code?: unknown;
        constraint_name?: unknown;
        constraint?: unknown;
      };
      if (code === UNIQUE_VIOLATION) {
        const name = typeof constraint_name === "string" ? constraint_name : constraint;
        return typeof name !== "string" || name === ONE_OPEN_INDEX;
      }
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** The caller's entries of `today` plus the open one (even when it started on an earlier day), oldest first. */
export async function listDayEntries(db: OwnerDb, staffId: string, today: string): Promise<TimeEntryRow[]> {
  return timeEntriesRepository.list(db, staffId, {
    where: or(eq(timeEntries.workDate, today), isNull(timeEntries.endedAt)),
    orderBy: [asc(timeEntries.startedAt)],
  });
}

/** The caller's open entry, locked for the rest of `tx`; null when none is open. */
async function lockOpenEntry(tx: FlowTx, staffId: string): Promise<TimeEntryRow | null> {
  const [open] = await timeEntriesRepository.list(tx, staffId, { where: isNull(timeEntries.endedAt), limit: 1 });
  if (!open) return null;
  const locked = await timeEntriesRepository.lockForUpdate(tx, staffId, open.id);
  return locked.endedAt === null ? locked : null;
}

/** off | done → on. Throws `ALREADY_ON` when an entry is open. */
export async function clockIn(db: FlowDb, staffId: string, source: TimeEntrySource, now: Date): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      if (await lockOpenEntry(tx, staffId)) throw new Error("ALREADY_ON");
      await timeEntriesRepository.insert(tx, staffId, {
        workDate: localDate(now),
        startedAt: now,
        pauses: [],
        source,
      });
    });
  } catch (err) {
    if (isOneOpenViolation(err)) throw new Error("ALREADY_ON");
    throw err;
  }
}

/** on → pausa. Throws `NOT_ON` when no entry is open or it is already paused. */
export async function pauseWork(db: FlowDb, staffId: string, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    const open = await lockOpenEntry(tx, staffId);
    if (!open || hasOpenPause(open)) throw new Error("NOT_ON");
    const pauses: TimeEntryPause[] = [...open.pauses, { from: now.toISOString(), to: null }];
    await timeEntriesRepository.update(tx, staffId, open.id, { pauses, updatedAt: now });
  });
}

/** pausa → on. Throws `NOT_ON` when no entry is open or it isn't paused. */
export async function resumeWork(db: FlowDb, staffId: string, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    const open = await lockOpenEntry(tx, staffId);
    if (!open || !hasOpenPause(open)) throw new Error("NOT_ON");
    await timeEntriesRepository.update(tx, staffId, open.id, { pauses: closePauses(open.pauses, now), updatedAt: now });
  });
}

/** on | pausa → done. Throws `NOT_ON` when no entry is open. */
export async function clockOut(db: FlowDb, staffId: string, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    const open = await lockOpenEntry(tx, staffId);
    if (!open) throw new Error("NOT_ON");
    // A clock skew between servers must never break the `ended_at >= started_at` check.
    const endedAt = now.getTime() < open.startedAt.getTime() ? open.startedAt : now;
    await timeEntriesRepository.update(tx, staffId, open.id, {
      pauses: closePauses(open.pauses, endedAt),
      endedAt,
      closedBy: "user",
      updatedAt: now,
    });
  });
}

/** The pauses with an open last pause closed at `at`. */
export function closePauses(pauses: TimeEntryPause[], at: Date): TimeEntryPause[] {
  return pauses.map((pause) => (pause.to === null ? { ...pause, to: at.toISOString() } : pause));
}
