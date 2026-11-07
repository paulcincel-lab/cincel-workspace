/**
 * Small database steps of the project flow wizard actions (BE §7.8): the status map's custom status check and
 * "Crear integrante" with puestos. Kept apart from the actions so they take any `db` (app client or transaction).
 */
import { and, inArray, isNull } from "drizzle-orm";

import { positions, staffPositions, taskStatuses } from "@/lib/db/schema";
import type { ImportDb } from "@/lib/import/refs";
import type { MondayStatusMap } from "@/lib/types/monday-import";
import { createStaffFromMonday, CreateStaffRefused, type CreatedStaff } from "@/scripts/monday/created-staff";

/** The custom status ids the map points at. */
export function customStatusIdsOf(map: MondayStatusMap): string[] {
  const ids = new Set<string>();
  for (const entry of Object.values(map)) {
    if ("customStatusId" in entry.target) ids.add(entry.target.customStatusId);
  }
  return [...ids];
}

/** True when every custom status of the map is a live status. */
export async function statusMapStatusesExist(db: ImportDb, map: MondayStatusMap): Promise<boolean> {
  const ids = customStatusIdsOf(map);
  if (ids.length === 0) return true;
  const found = await db
    .select({ id: taskStatuses.id })
    .from(taskStatuses)
    .where(and(inArray(taskStatuses.id, ids), isNull(taskStatuses.deletedAt)));
  return new Set(found.map((r) => r.id)).size === ids.length;
}

/**
 * Creates the staff member of a monday person and gives them the chosen puestos (`staff_positions`, source
 * `manual`) in one transaction. A puesto that is deleted or inactive refuses the whole create.
 */
export async function createStaffWithPositions(
  db: ImportDb,
  user: Parameters<typeof createStaffFromMonday>[1],
  positionIds: readonly string[],
): Promise<CreatedStaff> {
  const ids = [...new Set(positionIds)];
  return db.transaction(async (tx) => {
    if (ids.length > 0) {
      const live = await tx
        .select({ id: positions.id, active: positions.active })
        .from(positions)
        .where(and(inArray(positions.id, ids), isNull(positions.deletedAt)));
      if (live.filter((p) => p.active).length !== ids.length) {
        throw new CreateStaffRefused("Uno de los puestos elegidos ya no existe. Elige otro.");
      }
    }
    const staff = await createStaffFromMonday(tx, user);
    if (ids.length > 0) {
      await tx
        .insert(staffPositions)
        .values(ids.map((positionId) => ({ staffId: staff.id, positionId, source: "manual" })))
        .onConflictDoNothing();
    }
    return staff;
  });
}
