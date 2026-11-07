/**
 * Puestos: the firm's job positions, who holds them and their candidate fases
 * (project flow BE §8.4). Candidates are suggestions only.
 */
import { and, asc, count, eq, inArray, isNull, max, ne, notInArray } from "drizzle-orm";

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
import { flowError } from "@/lib/project-flow/errors";
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

const livePosition = (id: string) => and(eq(positions.id, id), isNull(positions.deletedAt));

function cleanName(value: string | undefined): string {
  const name = value?.trim() ?? "";
  if (!name) throw flowError("EMPTY");
  return name;
}

/** NAME_TAKEN when another live puesto has the same `nameKey` (covers lower(name) and accents). */
async function assertNameFree(executor: FlowExecutor, name: string, exceptId?: string): Promise<void> {
  const rows = await executor
    .select({ name: positions.name })
    .from(positions)
    .where(and(isNull(positions.deletedAt), exceptId ? ne(positions.id, exceptId) : undefined));
  const key = nameKey(name);
  if (rows.some((row) => nameKey(row.name) === key)) throw flowError("NAME_TAKEN");
}

async function assertLivePosition(executor: FlowExecutor, id: string): Promise<void> {
  const [row] = await executor.select({ id: positions.id }).from(positions).where(livePosition(id)).limit(1);
  if (!row) throw flowError("NOT_FOUND");
}

async function loadPositions(onlyId?: string): Promise<Position[]> {
  const rows = await db
    .select()
    .from(positions)
    .where(and(isNull(positions.deletedAt), onlyId ? eq(positions.id, onlyId) : undefined))
    .orderBy(asc(positions.sortOrder), asc(positions.name));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);

  const [phaseRows, countRows, mappingRows] = await Promise.all([
    db
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
      .where(and(inArray(positionPhases.positionId, ids), isNull(workflows.deletedAt)))
      .orderBy(asc(workflows.sortOrder), asc(workflowPhases.sortOrder), asc(workflowPhases.name)),
    db
      .select({ positionId: staffPositions.positionId, n: count() })
      .from(staffPositions)
      .innerJoin(staff, eq(staff.id, staffPositions.staffId))
      .where(and(inArray(staffPositions.positionId, ids), isNull(staff.deletedAt)))
      .groupBy(staffPositions.positionId),
    db
      .selectDistinct({ positionId: workspaceGroupMappings.positionId })
      .from(workspaceGroupMappings)
      .where(inArray(workspaceGroupMappings.positionId, ids)),
  ]);

  const counts = new Map(countRows.map((row) => [row.positionId, Number(row.n)]));
  const mapped = new Set(mappingRows.map((row) => row.positionId));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    active: row.active,
    phases: phaseRows
      .filter((p) => p.positionId === row.id)
      .map(({ id, name, sortOrder, workflowId, workflowName }) => ({ id, name, sortOrder, workflowId, workflowName })),
    staffCount: counts.get(row.id) ?? 0,
    googleManaged: mapped.has(row.id),
  }));
}

async function getPositionOrThrow(id: string): Promise<Position> {
  const [position] = await loadPositions(id);
  if (!position) throw flowError("NOT_FOUND");
  return position;
}

/** Live puestos (active and inactive) by `sort_order`, with phases, staffCount and googleManaged. */
export async function listPositions(): Promise<Position[]> {
  return loadPositions();
}

/** Appended last. NAME_TAKEN, EMPTY. */
export async function createPosition(input: PositionInput): Promise<Position> {
  const name = cleanName(input.name);
  let id: string;
  try {
    id = await db.transaction(async (tx) => {
      await assertNameFree(tx, name);
      const [{ last }] = await tx
        .select({ last: max(positions.sortOrder) })
        .from(positions)
        .where(isNull(positions.deletedAt));
      const [row] = await tx
        .insert(positions)
        .values({ name, active: input.active ?? true, sortOrder: (last ?? -1) + 1 })
        .returning({ id: positions.id });
      return row.id;
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw flowError("NAME_TAKEN");
    throw err;
  }
  return getPositionOrThrow(id);
}

/** NOT_FOUND, NAME_TAKEN, EMPTY. */
export async function updatePosition(id: string, patch: Partial<PositionInput>): Promise<Position> {
  try {
    await db.transaction(async (tx) => {
      await assertLivePosition(tx, id);
      const set: Partial<typeof positions.$inferInsert> = {};
      if (patch.name !== undefined) {
        const name = cleanName(patch.name);
        await assertNameFree(tx, name, id);
        set.name = name;
      }
      if (patch.active !== undefined) set.active = patch.active;
      if (Object.keys(set).length > 0) await tx.update(positions).set(set).where(eq(positions.id, id));
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw flowError("NAME_TAKEN");
    throw err;
  }
  return getPositionOrThrow(id);
}

/**
 * Soft-deletes the puesto and hard-deletes its staff_positions and
 * position_phases rows in one transaction. IN_USE while a Google mapping
 * references it; NOT_FOUND.
 */
export async function softDeletePosition(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await assertLivePosition(tx, id);
    const [mapping] = await tx
      .select({ id: workspaceGroupMappings.id })
      .from(workspaceGroupMappings)
      .where(eq(workspaceGroupMappings.positionId, id))
      .limit(1);
    if (mapping) throw flowError("IN_USE");
    await tx.delete(staffPositions).where(eq(staffPositions.positionId, id));
    await tx.delete(positionPhases).where(eq(positionPhases.positionId, id));
    await tx.update(positions).set({ deletedAt: new Date() }).where(eq(positions.id, id));
  });
}

/** Replaces the candidate fase set in one transaction. Unknown fase ids → NOT_FOUND. */
export async function setPositionPhases(id: string, phaseIds: string[]): Promise<Position> {
  const wanted = [...new Set(phaseIds)];
  await db.transaction(async (tx) => {
    await assertLivePosition(tx, id);
    if (wanted.length > 0) {
      const known = await tx
        .select({ id: workflowPhases.id })
        .from(workflowPhases)
        .innerJoin(workflows, eq(workflows.id, workflowPhases.workflowId))
        .where(and(inArray(workflowPhases.id, wanted), isNull(workflows.deletedAt)));
      if (known.length !== wanted.length) throw flowError("NOT_FOUND", "phase");
    }
    await tx.delete(positionPhases).where(eq(positionPhases.positionId, id));
    if (wanted.length > 0) {
      await tx.insert(positionPhases).values(wanted.map((phaseId) => ({ positionId: id, phaseId })));
    }
  });
  return getPositionOrThrow(id);
}

/** One transaction, `sort_order` = index. */
export async function reorderPositions(orderedIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedIds.entries()) {
      await tx.update(positions).set({ sortOrder: i }).where(livePosition(id));
    }
  });
}

/**
 * Replaces the person's `source = 'manual'` rows only; `workspace` rows stay
 * (a puesto already held from Workspace is not duplicated). NOT_FOUND for an
 * unknown person or puesto.
 */
export async function setStaffPositions(staffId: string, positionIds: string[]): Promise<void> {
  const wanted = [...new Set(positionIds)];
  await db.transaction(async (tx) => {
    const [person] = await tx
      .select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.id, staffId), isNull(staff.deletedAt)))
      .limit(1);
    if (!person) throw flowError("NOT_FOUND", "staff");
    if (wanted.length > 0) {
      const known = await tx
        .select({ id: positions.id })
        .from(positions)
        .where(and(inArray(positions.id, wanted), isNull(positions.deletedAt)));
      if (known.length !== wanted.length) throw flowError("NOT_FOUND", "position");
    }
    await tx
      .delete(staffPositions)
      .where(
        and(
          eq(staffPositions.staffId, staffId),
          eq(staffPositions.source, "manual"),
          wanted.length > 0 ? notInArray(staffPositions.positionId, wanted) : undefined
        )
      );
    if (wanted.length > 0) {
      await tx
        .insert(staffPositions)
        .values(wanted.map((positionId) => ({ staffId, positionId, source: "manual" })))
        .onConflictDoNothing({ target: [staffPositions.staffId, staffPositions.positionId] });
    }
  });
}

/**
 * Per fase id: staff whose live, active puestos list it, sorted by open
 * tasks (as manager) ascending, then name. One grouped count query.
 * `positions` are the names of that person's puestos that list the fase.
 */
export async function listCandidates(
  executor: FlowExecutor,
  phaseIds: string[]
): Promise<Map<string, StaffCandidate[]>> {
  const out = new Map<string, StaffCandidate[]>(phaseIds.map((id) => [id, []]));
  if (phaseIds.length === 0) return out;

  const rows = await executor
    .select({
      phaseId: positionPhases.phaseId,
      staffId: staff.id,
      staffName: staff.name,
      positionName: positions.name,
    })
    .from(positionPhases)
    .innerJoin(positions, eq(positions.id, positionPhases.positionId))
    .innerJoin(staffPositions, eq(staffPositions.positionId, positions.id))
    .innerJoin(staff, eq(staff.id, staffPositions.staffId))
    .where(
      and(
        inArray(positionPhases.phaseId, phaseIds),
        isNull(positions.deletedAt),
        eq(positions.active, true),
        isNull(staff.deletedAt),
        eq(staff.active, true)
      )
    )
    .orderBy(asc(positions.sortOrder), asc(positions.name));
  if (rows.length === 0) return out;

  const staffIds = [...new Set(rows.map((row) => row.staffId))];
  const openRows = await executor
    .select({ managerId: tasks.managerId, n: count() })
    .from(tasks)
    .where(
      and(
        inArray(tasks.managerId, staffIds),
        isNull(tasks.deletedAt),
        eq(tasks.archived, false),
        ne(tasks.status, "completado")
      )
    )
    .groupBy(tasks.managerId);
  const open = new Map(openRows.map((row) => [row.managerId, Number(row.n)]));

  const byPhase = new Map<string, Map<string, StaffCandidate>>();
  for (const row of rows) {
    let people = byPhase.get(row.phaseId);
    if (!people) {
      people = new Map();
      byPhase.set(row.phaseId, people);
    }
    let candidate = people.get(row.staffId);
    if (!candidate) {
      candidate = { id: row.staffId, name: row.staffName, positions: [], openTasks: open.get(row.staffId) ?? 0 };
      people.set(row.staffId, candidate);
    }
    if (!candidate.positions.includes(row.positionName)) candidate.positions.push(row.positionName);
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
  const [row] = await db.select({ id: positions.id }).from(positions).where(livePosition(id)).limit(1);
  return Boolean(row);
}
