import { and, asc, desc, eq, ne } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { positions, workspaceGroupMappings } from "@/lib/db/schema";
import type { GroupMapping, GroupMappingKind } from "@/lib/types/workspace-access";

/** A validated mapping row, with the group id resolved through `groups.get`. */
export type GroupMappingValues = {
  groupEmail: string;
  groupId: string;
  kind: GroupMappingKind;
  role: string | null;
  positionId: string | null;
  rank: number;
};

const columns = {
  id: workspaceGroupMappings.id,
  groupEmail: workspaceGroupMappings.groupEmail,
  kind: workspaceGroupMappings.kind,
  role: workspaceGroupMappings.role,
  positionId: workspaceGroupMappings.positionId,
  positionName: positions.name,
  rank: workspaceGroupMappings.rank,
};

function selectMappings() {
  return db.select(columns).from(workspaceGroupMappings).leftJoin(positions, eq(positions.id, workspaceGroupMappings.positionId));
}

type MappingRow = Omit<GroupMapping, "memberCount" | "exists">;

/** The Directory facts are filled by the Google page loader (`withGroupStats`); a row read here is unchecked. */
function unchecked(row: MappingRow): GroupMapping {
  return { ...row, memberCount: null, exists: null };
}

export async function listGroupMappings(): Promise<GroupMapping[]> {
  const rows = await selectMappings().orderBy(
    asc(workspaceGroupMappings.kind),
    desc(workspaceGroupMappings.rank),
    asc(workspaceGroupMappings.groupEmail),
  );
  return rows.map(unchecked);
}

export async function getGroupMapping(id: string): Promise<GroupMapping | null> {
  const [row] = await selectMappings().where(eq(workspaceGroupMappings.id, id)).limit(1);
  return row ? unchecked(row) : null;
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
