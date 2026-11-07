import { and, asc, eq, gte } from "drizzle-orm";

import type { StatusEvent } from "@/lib/dashboard/inicio";
import { db } from "@/lib/db/client";
import { historyEvents } from "@/lib/db/schema";

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
