import { and, asc, desc, eq, isNull, ne } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { areas, workspaceGroupMappings } from "@/lib/db/schema";
import type { GroupMapping, GroupMappingKind } from "@/lib/types/workspace-access";

/** A validated mapping row, with the group id resolved through `groups.get`. */
export type GroupMappingValues = {
  groupEmail: string;
  groupId: string;
  kind: GroupMappingKind;
  role: string | null;
  areaId: string | null;
  rank: number;
};

const columns = {
  id: workspaceGroupMappings.id,
  groupEmail: workspaceGroupMappings.groupEmail,
  kind: workspaceGroupMappings.kind,
  role: workspaceGroupMappings.role,
  areaId: workspaceGroupMappings.areaId,
  areaName: areas.name,
  rank: workspaceGroupMappings.rank,
};

function selectMappings() {
  return db.select(columns).from(workspaceGroupMappings).leftJoin(areas, eq(areas.id, workspaceGroupMappings.areaId));
}

export async function listGroupMappings(): Promise<GroupMapping[]> {
  return selectMappings().orderBy(
    asc(workspaceGroupMappings.kind),
    desc(workspaceGroupMappings.rank),
    asc(workspaceGroupMappings.groupEmail),
  );
}

export async function getGroupMapping(id: string): Promise<GroupMapping | null> {
  const [row] = await selectMappings().where(eq(workspaceGroupMappings.id, id)).limit(1);
  return row ?? null;
}

/** Whether a live (not soft-deleted) area with this id exists. */
export async function areaExists(areaId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: areas.id })
    .from(areas)
    .where(and(eq(areas.id, areaId), isNull(areas.deletedAt)))
    .limit(1);
  return Boolean(row);
}

/** Whether another mapping already uses this group for this kind. */
export async function groupMappingExists(groupId: string, kind: GroupMappingKind, exceptId?: string): Promise<boolean> {
  const [row] = await db
    .select({ id: workspaceGroupMappings.id })
    .from(workspaceGroupMappings)
    .where(
      and(
        eq(workspaceGroupMappings.groupId, groupId),
        eq(workspaceGroupMappings.kind, kind),
        exceptId ? ne(workspaceGroupMappings.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function insertGroupMapping(values: GroupMappingValues): Promise<GroupMapping> {
  const [row] = await db.insert(workspaceGroupMappings).values(values).returning({ id: workspaceGroupMappings.id });
  return (await getGroupMapping(row.id))!;
}

/** Null when no mapping has this id. */
export async function updateGroupMapping(id: string, values: GroupMappingValues): Promise<GroupMapping | null> {
  const [row] = await db
    .update(workspaceGroupMappings)
    .set(values)
    .where(eq(workspaceGroupMappings.id, id))
    .returning({ id: workspaceGroupMappings.id });
  return row ? getGroupMapping(row.id) : null;
}

export async function deleteGroupMapping(id: string): Promise<void> {
  await db.delete(workspaceGroupMappings).where(eq(workspaceGroupMappings.id, id));
}
