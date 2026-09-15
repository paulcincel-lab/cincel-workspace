import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { historyEvents, staff } from "@/lib/db/schema";
import type { HistoryEntity, HistoryEvent } from "@/lib/types/core";

type Db = Pick<typeof db, "insert" | "select">;

const asText = (v: unknown): string | null =>
  v === null || v === undefined ? null : typeof v === "string" ? v : String(v);

/** Append one `cambio` event. Never updates or deletes existing rows. */
export async function recordChange(
  input: {
    entity: HistoryEntity;
    entityId: string;
    actorId: string | null;
    field: string;
    before: unknown;
    after: unknown;
  },
  tx: Db = db
): Promise<void> {
  await tx.insert(historyEvents).values({
    entity: input.entity,
    entityId: input.entityId,
    kind: "cambio",
    actorId: input.actorId,
    field: input.field,
    beforeValue: asText(input.before),
    afterValue: asText(input.after),
  });
}

/**
 * Compare `before` and `after` on the given fields and append one `cambio`
 * per field that differs. Returns the changed field names.
 */
export async function recordChanges<T extends object>(
  input: {
    entity: HistoryEntity;
    entityId: string;
    actorId: string | null;
    before: T;
    after: T;
    fields: ReadonlyArray<keyof T & string>;
  },
  tx: Db = db
): Promise<string[]> {
  const rows = input.fields
    .filter((f) => asText(input.before[f]) !== asText(input.after[f]))
    .map((f) => ({
      entity: input.entity,
      entityId: input.entityId,
      kind: "cambio" as const,
      actorId: input.actorId,
      field: f,
      beforeValue: asText(input.before[f]),
      afterValue: asText(input.after[f]),
    }));
  if (rows.length > 0) await tx.insert(historyEvents).values(rows);
  return rows.map((r) => r.field);
}

/** Append one `comentario` event. */
export async function recordComment(
  input: { entity: HistoryEntity; entityId: string; actorId: string | null; comment: string },
  tx: Db = db
): Promise<HistoryEvent> {
  const [row] = await tx
    .insert(historyEvents)
    .values({
      entity: input.entity,
      entityId: input.entityId,
      kind: "comentario",
      actorId: input.actorId,
      comment: input.comment,
    })
    .returning();
  const actor = input.actorId
    ? (
        await tx
          .select({ id: staff.id, name: staff.name })
          .from(staff)
          .where(eq(staff.id, input.actorId))
      )[0] ?? null
    : null;
  return {
    id: row.id,
    entity: row.entity,
    entityId: row.entityId,
    kind: row.kind,
    actor,
    field: row.field,
    beforeValue: row.beforeValue,
    afterValue: row.afterValue,
    comment: row.comment,
    eventAt: row.eventAt.toISOString(),
  };
}

/** Chronological bitácora for one entity, newest first. */
export async function listHistory(
  entity: HistoryEntity,
  entityId: string,
  limit = 200
): Promise<HistoryEvent[]> {
  const rows = await db
    .select({
      id: historyEvents.id,
      entity: historyEvents.entity,
      entityId: historyEvents.entityId,
      kind: historyEvents.kind,
      actorId: staff.id,
      actorName: staff.name,
      field: historyEvents.field,
      beforeValue: historyEvents.beforeValue,
      afterValue: historyEvents.afterValue,
      comment: historyEvents.comment,
      eventAt: historyEvents.eventAt,
    })
    .from(historyEvents)
    .leftJoin(staff, eq(staff.id, historyEvents.actorId))
    .where(and(eq(historyEvents.entity, entity), eq(historyEvents.entityId, entityId)))
    .orderBy(desc(historyEvents.eventAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    entity: r.entity,
    entityId: r.entityId,
    kind: r.kind,
    actor: r.actorId ? { id: r.actorId, name: r.actorName! } : null,
    field: r.field,
    beforeValue: r.beforeValue,
    afterValue: r.afterValue,
    comment: r.comment,
    eventAt: r.eventAt.toISOString(),
  }));
}
