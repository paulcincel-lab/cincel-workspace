/**
 * `progress-snapshots` daily producer: run once a day by the `daily-digest` job (through `DAILY_PRODUCERS`).
 * Writes one `project_progress_snapshots` row per live project for today (Mexico City calendar) with its
 * current `projects.progress`; a second run the same day overwrites that day's row. The client portal reads
 * the month's first row to show "+{n} pts este mes". Creates no notifications.
 */
import { isNull, sql } from "drizzle-orm";

import { scheduleToday } from "@/lib/cronograma/today";
import { projectProgressSnapshots, projects } from "@/lib/db/schema";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";

import type { DailyProducer } from "./index";

/** Snapshots today's progress of every live project; returns how many rows were written. */
export async function snapshotProjectProgress(db: OwnerDb, now: Date): Promise<number> {
  const today = scheduleToday(now);
  const rows = await db
    .insert(projectProgressSnapshots)
    .select(
      db
        .select({
          projectId: projects.id,
          takenOn: sql<string>`${today}::date`.as("taken_on"),
          progressPct: projects.progress,
        })
        .from(projects)
        .where(isNull(projects.deletedAt))
    )
    .onConflictDoUpdate({
      target: [projectProgressSnapshots.projectId, projectProgressSnapshots.takenOn],
      set: { progressPct: sql`excluded.progress_pct` },
    })
    .returning({ projectId: projectProgressSnapshots.projectId });
  return rows.length;
}

export const progressSnapshotsProducer: DailyProducer = {
  name: "progress-snapshots",
  run: async ({ db, now }) => ({ count: await snapshotProjectProgress(db, now) }),
};
