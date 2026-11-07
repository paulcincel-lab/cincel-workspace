/**
 * Puestos: the firm's job positions, who holds them and their candidate fases
 * (project flow BE §8.4). Candidates are suggestions only.
 */
import { and, asc, count, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  positionPhases,
  positions,
  staff,
  staffPositions,
  tasks,
  workflowPhases,
  workflows,
  workspaceGroupMappings,
} from "@/lib/db/schema";
import type { FlowExecutor } from "@/lib/project-flow/db";
import { nameKey } from "@/lib/project-flow/names";
import type { Position, PositionInput, StaffCandidate } from "@/lib/types/core";

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === "object" && (current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

function cleanName(value: string): string {
  const name = value.trim();
  if (!name) throw new Error("EMPTY");
  return name;
}

/** NAME_TAKEN when another live puesto has the same nameKey. */
async function assertNameFree(executor: FlowExecutor, name: string, exceptId?: string) {
  const rows = await executor
    .select({ name: positions.name })
    .from(positions)
    .where(and(isNull(positions.deletedAt), exceptId ? ne(positions.id, exceptId) : undefined));
  const key = nameKey(name);
  if (rows.some((r) => nameKey(r.name) === key)) throw new Error("NAME_TAKEN");
}

/** Live puestos as DTOs; `ids` limits the set (in `sort_order`, then name). */
async function loadPositions(executor: FlowExecutor, ids?: string[]): Promise<Position[]> {
  if (ids && ids.length === 0) return [];
  const rows = await executor
    .select()
    .from(positions)
    .where(and(isNull(positions.deletedAt), ids ? inArray(positions.id, ids) : undefined))
    .orderBy(asc(positions.sortOrder), asc(positions.name));
  if (rows.length === 0) return [];
  const positionIds = rows.map((r) => r.id);

  const phaseRows = await executor
    .select({
      positionId: positionPhases.positionId,
      id: workflowPhases.id,
      name: workflowPhases.name,
      sortOrder: workflowPhases.sortOrder,
      workflowId: workflows.id,
      workflowName: workflows.name,
    })
    .from(positionPhases)
    .innerJoin(workflowPhases, eq(workflowPhases.id, positionPhases.phaseId))
    .innerJoin(workflows, eq(workflows.id, workflowPhases.workflowId))
    .where(and(inArray(positionPhases.positionId, positionIds), isNull(workflows.deletedAt)))
    .orderBy(asc(workflows.sortOrder), asc(workflows.name), asc(workflowPhases.sortOrder), asc(workflowPhases.name));
  const phases = new Map<string, Position["phases"]>();
  for (const { positionId, ...phase } of phaseRows) {
    const list = phases.get(positionId) ?? [];
    list.push(phase);
    phases.set(positionId, list);
  }

  const countRows = await executor
    .select({ positionId: staffPositions.positionId, n: count() })
    .from(staffPositions)
    .innerJoin(staff, eq(staff.id, staffPositions.staffId))
    .where(and(inArray(staffPositions.positionId, positionIds), isNull(staff.deletedAt)))
    .groupBy(staffPositions.positionId);
  const staffCounts = new Map(countRows.map((r) => [r.positionId, Number(r.n)]));

  const mapped = await executor
    .selectDistinct({ positionId: workspaceGroupMappings.positionId })
    .from(workspaceGroupMappings)
    .where(inArray(workspaceGroupMappings.positionId, positionIds));
  const googleManaged = new Set(mapped.map((r) => r.positionId));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sortOrder: r.sortOrder,
    active: r.active,
    phases: phases.get(r.id) ?? [],
    staffCount: staffCounts.get(r.id) ?? 0,
    googleManaged: googleManaged.has(r.id),
  }));
}

async function loadPosition(executor: FlowExecutor, id: string): Promise<Position> {
  const [position] = await loadPositions(executor, [id]);
  if (!position) throw new Error("NOT_FOUND");
  return position;
}

/** Live puestos (active and inactive) by `sort_order`, with phases, staffCount and googleManaged. */
export async function listPositions(): Promise<Position[]> {
  return loadPositions(db);
}

/** NAME_TAKEN, EMPTY. */
export async function createPosition(input: PositionInput): Promise<Position> {
  const name = cleanName(input.name);
  try {
    return await db.transaction(async (tx) => {
      await assertNameFree(tx, name);
      const existing = await tx
        .select({ sortOrder: positions.sortOrder })
        .from(positions)
        .where(isNull(positions.deletedAt));
      const sortOrder = existing.reduce((max, r) => Math.max(max, r.sortOrder + 1), 0);
      const [row] = await tx
        .insert(positions)
        .values({ name, sortOrder, active: input.active ?? true })
        .returning({ id: positions.id });
      return loadPosition(tx, row.id);
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new Error("NAME_TAKEN");
    throw err;
  }
}

/** NOT_FOUND, NAME_TAKEN, EMPTY. */
export async function updatePosition(id: string, patch: Partial<PositionInput>): Promise<Position> {
  const nextName = patch.name === undefined ? undefined : cleanName(patch.name);
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(positions)
        .where(and(eq(positions.id, id), isNull(positions.deletedAt)))
        .limit(1);
      if (!before) throw new Error("NOT_FOUND");
      const name = nextName ?? before.name;
      const active = patch.active ?? before.active;
      if (name !== before.name) await assertNameFree(tx, name, id);
      if (name !== before.name || active !== before.active) {
        await tx.update(positions).set({ name, active }).where(eq(positions.id, id));
      }
      return loadPosition(tx, id);
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new Error("NAME_TAKEN");
    throw err;
  }
}

/**
 * Soft-deletes the puesto and hard-deletes its staff_positions and
 * position_phases rows in one transaction. IN_USE while a Google mapping
 * references it; NOT_FOUND.
 */
export async function softDeletePosition(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: positions.id })
      .from(positions)
      .where(and(eq(positions.id, id), isNull(positions.deletedAt)))
      .limit(1);
    if (!row) throw new Error("NOT_FOUND");
    const [mapping] = await tx
      .select({ id: workspaceGroupMappings.id })
      .from(workspaceGroupMappings)
      .where(eq(workspaceGroupMappings.positionId, id))
      .limit(1);
    if (mapping) throw new Error("IN_USE");
    await tx.delete(staffPositions).where(eq(staffPositions.positionId, id));
    await tx.delete(positionPhases).where(eq(positionPhases.positionId, id));
    await tx.update(positions).set({ deletedAt: new Date() }).where(eq(positions.id, id));
  });
}

/** Replaces the candidate fase set in one transaction. Unknown fase ids → NOT_FOUND. */
export async function setPositionPhases(id: string, phaseIds: string[]): Promise<Position> {
  const unique = [...new Set(phaseIds)];
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ id: positions.id })
      .from(positions)
      .where(and(eq(positions.id, id), isNull(positions.deletedAt)))
      .limit(1);
    if (!row) throw new Error("NOT_FOUND");
    if (unique.length > 0) {
      const found = await tx
        .select({ id: workflowPhases.id })
        .from(workflowPhases)
        .where(inArray(workflowPhases.id, unique));
      if (found.length !== unique.length) throw new Error("NOT_FOUND");
    }
    await tx.delete(positionPhases).where(eq(positionPhases.positionId, id));
    if (unique.length > 0) {
      await tx.insert(positionPhases).values(unique.map((phaseId) => ({ positionId: id, phaseId })));
    }
    return loadPosition(tx, id);
  });
}

export async function reorderPositions(orderedIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedIds.entries()) {
      await tx
        .update(positions)
        .set({ sortOrder: i })
        .where(and(eq(positions.id, id), isNull(positions.deletedAt)));
    }
  });
}

/** Replaces the person's `source = 'manual'` rows only; `workspace` rows stay. */
export async function setStaffPositions(staffId: string, positionIds: string[]): Promise<void> {
  const unique = [...new Set(positionIds)];
  await db.transaction(async (tx) => {
    const [person] = await tx
      .select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.id, staffId), isNull(staff.deletedAt)))
      .limit(1);
    if (!person) throw new Error("NOT_FOUND");
    if (unique.length > 0) {
      const found = await tx
        .select({ id: positions.id })
        .from(positions)
        .where(and(inArray(positions.id, unique), isNull(positions.deletedAt)));
      if (found.length !== unique.length) throw new Error("NOT_FOUND");
    }
    await tx
      .delete(staffPositions)
      .where(and(eq(staffPositions.staffId, staffId), eq(staffPositions.source, "manual")));
    if (unique.length > 0) {
      // A puesto already held through a Google group keeps its `workspace` row.
      await tx
        .insert(staffPositions)
        .values(unique.map((positionId) => ({ staffId, positionId, source: "manual" })))
        .onConflictDoNothing();
    }
  });
}

/**
 * Per fase id: staff whose live, active puestos list it, sorted by open
 * tasks (as manager) ascending, then name. One grouped count query.
 */
export async function listCandidates(
  executor: FlowExecutor,
  phaseIds: string[]
): Promise<Map<string, StaffCandidate[]>> {
  const unique = [...new Set(phaseIds)];
  const out = new Map<string, StaffCandidate[]>(unique.map((id) => [id, []]));
  if (unique.length === 0) return out;

  const rows = await executor
    .select({
      phaseId: positionPhases.phaseId,
      staffId: staff.id,
      staffName: staff.name,
      positionName: positions.name,
    })
    .from(positionPhases)
    .innerJoin(
      positions,
      and(eq(positions.id, positionPhases.positionId), isNull(positions.deletedAt), eq(positions.active, true))
    )
    .innerJoin(staffPositions, eq(staffPositions.positionId, positions.id))
    .innerJoin(staff, and(eq(staff.id, staffPositions.staffId), isNull(staff.deletedAt), eq(staff.active, true)))
    .where(inArray(positionPhases.phaseId, unique))
    .orderBy(asc(positions.sortOrder), asc(positions.name));
  if (rows.length === 0) return out;

  const staffIds = [...new Set(rows.map((r) => r.staffId))];
  const loadRows = await executor
    .select({ managerId: tasks.managerId, n: count() })
    .from(tasks)
    .where(
      and(
        inArray(tasks.managerId, staffIds),
        isNotNull(tasks.managerId),
        isNull(tasks.deletedAt),
        eq(tasks.archived, false),
        ne(tasks.status, "completado")
      )
    )
    .groupBy(tasks.managerId);
  const openTasks = new Map<string, number>();
  for (const r of loadRows) if (r.managerId) openTasks.set(r.managerId, Number(r.n));

  const byPhase = new Map<string, Map<string, StaffCandidate>>();
  for (const r of rows) {
    const people = byPhase.get(r.phaseId) ?? new Map<string, StaffCandidate>();
    byPhase.set(r.phaseId, people);
    const candidate = people.get(r.staffId) ?? {
      id: r.staffId,
      name: r.staffName,
      positions: [],
      openTasks: openTasks.get(r.staffId) ?? 0,
    };
    if (!candidate.positions.includes(r.positionName)) candidate.positions.push(r.positionName);
    people.set(r.staffId, candidate);
  }
  for (const [phaseId, people] of byPhase) {
    out.set(
      phaseId,
      [...people.values()].sort((a, b) => a.openTasks - b.openTasks || a.name.localeCompare(b.name, "es"))
    );
  }
  return out;
}

/** A live puesto with that id exists (group mapping validation). */
export async function positionExists(id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: positions.id })
    .from(positions)
    .where(and(eq(positions.id, id), isNull(positions.deletedAt)))
    .limit(1);
  return Boolean(row);
}
