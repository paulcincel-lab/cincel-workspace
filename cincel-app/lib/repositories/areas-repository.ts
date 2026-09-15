import { and, asc, eq, inArray, isNull, notInArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { areaMembers, areaWorkflows, areas, staff, workflows } from "@/lib/db/schema";
import { recordChanges } from "@/lib/repositories/history-repository";
import type { Area, AreaDetail, AreaInput } from "@/lib/types/core";

type AreaRow = typeof areas.$inferSelect;

const clean = (v: string | null | undefined): string | null => {
  const t = v?.trim();
  return t ? t : null;
};

function toArea(row: AreaRow): Area {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    leadId: row.leadId,
    active: row.active,
    sortOrder: row.sortOrder,
  };
}

export async function listAreas(options: { includeInactive?: boolean } = {}): Promise<AreaDetail[]> {
  const rows = await db.query.areas.findMany({
    where: and(isNull(areas.deletedAt), options.includeInactive ? undefined : eq(areas.active, true)),
    orderBy: [asc(areas.sortOrder), asc(areas.name)],
    with: {
      lead: true,
      members: { with: { staff: true } },
    },
  });
  const links = await db
    .select({
      areaId: areaWorkflows.areaId,
      id: workflows.id,
      key: workflows.key,
      name: workflows.name,
    })
    .from(areaWorkflows)
    .innerJoin(workflows, eq(workflows.id, areaWorkflows.workflowId))
    .where(isNull(workflows.deletedAt));

  return rows.map((r) => ({
    ...toArea(r),
    lead: r.lead && r.lead.deletedAt === null ? { id: r.lead.id, name: r.lead.name } : null,
    members: r.members
      .filter((m) => m.staff.deletedAt === null)
      .map((m) => ({
        staffId: m.staff.id,
        name: m.staff.name,
        role: m.role,
        active: m.staff.active,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    workflows: links
      .filter((l) => l.areaId === r.id)
      .map((l) => ({ id: l.id, key: l.key, name: l.name })),
  }));
}

export async function getArea(id: string): Promise<AreaDetail | null> {
  const all = await listAreas({ includeInactive: true });
  return all.find((a) => a.id === id) ?? null;
}

function toValues(input: AreaInput) {
  return {
    name: input.name.trim(),
    description: clean(input.description),
    leadId: input.leadId ?? null,
    active: input.active ?? true,
    sortOrder: input.sortOrder ?? 0,
  };
}

export async function createArea(input: AreaInput, actorId: string): Promise<Area> {
  const [row] = await db.insert(areas).values(toValues(input)).returning();
  await recordChanges({
    entity: "area",
    entityId: row.id,
    actorId,
    before: { name: null },
    after: { name: row.name },
    fields: ["name"],
  });
  return toArea(row);
}

export async function updateArea(
  id: string,
  patch: Partial<AreaInput>,
  actorId: string
): Promise<Area> {
  const [before] = await db
    .select()
    .from(areas)
    .where(and(eq(areas.id, id), isNull(areas.deletedAt)))
    .limit(1);
  if (!before) throw new Error("AREA_NOT_FOUND");

  const merged = toValues({
    name: patch.name ?? before.name,
    description: patch.description === undefined ? before.description : patch.description,
    leadId: patch.leadId === undefined ? before.leadId : patch.leadId,
    active: patch.active ?? before.active,
    sortOrder: patch.sortOrder ?? before.sortOrder,
  });
  const [after] = await db.update(areas).set(merged).where(eq(areas.id, id)).returning();
  await recordChanges({
    entity: "area",
    entityId: id,
    actorId,
    before,
    after,
    fields: ["name", "description", "leadId", "active", "sortOrder"],
  });
  return toArea(after);
}

export async function softDeleteArea(id: string, actorId: string): Promise<void> {
  const [row] = await db
    .update(areas)
    .set({ deletedAt: new Date(), active: false })
    .where(and(eq(areas.id, id), isNull(areas.deletedAt)))
    .returning();
  if (!row) throw new Error("AREA_NOT_FOUND");
  await recordChanges({
    entity: "area",
    entityId: id,
    actorId,
    before: { deleted: false },
    after: { deleted: true },
    fields: ["deleted"],
  });
}

/** Replace the members of an area. */
export async function setAreaMembers(
  areaId: string,
  members: Array<{ staffId: string; role?: string | null }>
): Promise<void> {
  const wanted = new Map(members.map((m) => [m.staffId, clean(m.role)]));
  const current = await db
    .select({ staffId: areaMembers.staffId, role: areaMembers.role })
    .from(areaMembers)
    .where(eq(areaMembers.areaId, areaId));

  const toRemove = current.filter((c) => !wanted.has(c.staffId)).map((c) => c.staffId);
  if (toRemove.length > 0) {
    await db
      .delete(areaMembers)
      .where(and(eq(areaMembers.areaId, areaId), inArray(areaMembers.staffId, toRemove)));
  }
  for (const [staffId, role] of wanted) {
    await db
      .insert(areaMembers)
      .values({ areaId, staffId, role })
      .onConflictDoUpdate({ target: [areaMembers.areaId, areaMembers.staffId], set: { role } });
  }
}

/** Replace the workflows an area owns. */
export async function setAreaWorkflows(areaId: string, workflowIds: string[]): Promise<void> {
  const wanted = new Set(workflowIds);
  const current = await db
    .select({ workflowId: areaWorkflows.workflowId })
    .from(areaWorkflows)
    .where(eq(areaWorkflows.areaId, areaId));
  const currentIds = new Set(current.map((c) => c.workflowId));

  const toRemove = [...currentIds].filter((id) => !wanted.has(id));
  const toAdd = [...wanted].filter((id) => !currentIds.has(id));
  if (toRemove.length > 0) {
    await db
      .delete(areaWorkflows)
      .where(and(eq(areaWorkflows.areaId, areaId), inArray(areaWorkflows.workflowId, toRemove)));
  }
  if (toAdd.length > 0) {
    await db.insert(areaWorkflows).values(toAdd.map((workflowId) => ({ areaId, workflowId })));
  }
}

/** Active staff not yet in the area, for the member picker. */
export async function listStaffNotInArea(areaId: string) {
  const inArea = db.select({ id: areaMembers.staffId }).from(areaMembers).where(eq(areaMembers.areaId, areaId));
  return db
    .select({ id: staff.id, name: staff.name, role: staff.role })
    .from(staff)
    .where(and(isNull(staff.deletedAt), eq(staff.active, true), notInArray(staff.id, inArea)))
    .orderBy(asc(staff.name));
}
