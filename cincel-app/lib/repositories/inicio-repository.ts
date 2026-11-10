import { and, asc, eq, gte, isNull } from "drizzle-orm";

import type { StatusEvent } from "@/lib/dashboard/inicio";
import { db } from "@/lib/db/client";
import { historyEvents, staff, timeEntries } from "@/lib/db/schema";

/**
 * Inicio KPI history (redesign BE §7.10): every `status` change of tasks or
 * projects since `since`, oldest first. Rows are filtered by the caller's
 * scope afterwards (`fetchInicioAction` keeps only the ids it can see).
 */
export async function listStatusEvents(entity: "task" | "project", since: Date): Promise<StatusEvent[]> {
  return db
    .select({
      entityId: historyEvents.entityId,
      at: historyEvents.eventAt,
      before: historyEvents.beforeValue,
      after: historyEvents.afterValue,
    })
    .from(historyEvents)
    .where(
      and(
        eq(historyEvents.entity, entity),
        eq(historyEvents.kind, "cambio"),
        eq(historyEvents.field, "status"),
        gte(historyEvents.eventAt, since)
      )
    )
    .orderBy(asc(historyEvents.eventAt));
}

/**
 * Inicio Visual "personas con jornada abierta" (#989): the staff ids with an
 * open time entry (`ended_at` null) on the local date `today`, joined to
 * staff (active only). The caller limits them to the dashboard scope.
 */
export async function listOpenShiftStaffIds(today: string): Promise<string[]> {
  const rows = await db
    .select({ staffId: timeEntries.staffId })
    .from(timeEntries)
    .innerJoin(staff, eq(staff.id, timeEntries.staffId))
    .where(and(isNull(timeEntries.endedAt), eq(timeEntries.workDate, today), eq(staff.active, true)));
  return rows.map((r) => r.staffId);
}
