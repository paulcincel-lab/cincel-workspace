import { sql } from "drizzle-orm";
import { boolean, check, date, index, jsonb, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { core, stamps, timeEntrySource } from "./_schema";
import { staff } from "./people";

/** One pause inside a time entry; `to` is null while the pause is open. */
export type TimeEntryPause = { from: string; to: string | null };

/**
 * Control de horario entries (BE §3.8). Never deleted; corrections are a
 * `history_events` row of entity `time_entry`. At most one open entry per
 * staff (`time_entries_one_open_uq`).
 */
export const timeEntries = core.table(
  "time_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    /** Local date in America/Mexico_City. */
    workDate: date("work_date").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    pauses: jsonb("pauses").$type<TimeEntryPause[]>().notNull().default(sql`'[]'::jsonb`),
    source: timeEntrySource("source").notNull(),
    /** 'user' | 'auto_close' | null while open. */
    closedBy: text("closed_by"),
    flagged: boolean("flagged").notNull().default(false),
    note: text("note"),
    ...stamps,
  },
  (t) => [
    check("time_entries_order_check", sql`${t.endedAt} is null or ${t.endedAt} >= ${t.startedAt}`),
    check("time_entries_closed_by_check", sql`(${t.endedAt} is null) = (${t.closedBy} is null)`),
    uniqueIndex("time_entries_one_open_uq").on(t.staffId).where(sql`${t.endedAt} is null`),
    index("idx_time_entries_staff_date").on(t.staffId, t.workDate),
    index("idx_time_entries_date").on(t.workDate),
  ]
);
