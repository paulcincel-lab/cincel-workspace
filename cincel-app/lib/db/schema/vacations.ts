import { sql } from "drizzle-orm";
import { check, date, index, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { core, stamps, vacationKind, vacationStatus } from "./_schema";
import { staff } from "./people";

/** Vacation / absence requests (BE §3.9). `days` = work days in range, computed on insert. */
export const vacationRequests = core.table(
  "vacation_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    staffId: uuid("staff_id")
      .notNull()
      .references(() => staff.id, { onDelete: "cascade" }),
    fromDate: date("from_date").notNull(),
    toDate: date("to_date").notNull(),
    kind: vacationKind("kind").notNull(),
    comment: text("comment").notNull().default(""),
    days: integer("days").notNull(),
    status: vacationStatus("status").notNull().default("pendiente"),
    decidedBy: uuid("decided_by").references(() => staff.id, { onDelete: "set null" }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),
    ...stamps,
  },
  (t) => [
    check("vacation_requests_range_check", sql`${t.toDate} >= ${t.fromDate}`),
    check("vacation_requests_days_check", sql`${t.days} > 0`),
    index("idx_vacation_requests_staff").on(t.staffId, t.fromDate),
    index("idx_vacation_requests_decided_by").on(t.decidedBy),
    index("idx_vacation_requests_range")
      .on(t.fromDate, t.toDate)
      .where(sql`${t.status} in ('pendiente','aprobada')`),
  ]
);
