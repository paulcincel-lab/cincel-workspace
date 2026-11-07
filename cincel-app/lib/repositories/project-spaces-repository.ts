/**
 * Espacios: an optional, ordered per-project list (project flow BE §8.3).
 * Hard-deleted (a filter, not history); task history keeps the old spaceId.
 */
import { and, asc, count, eq, inArray, isNull, ne } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { projectSpaces, projects, tasks } from "@/lib/db/schema";
import type { FlowExecutor, FlowTx } from "@/lib/project-flow/db";
import { nameKey } from "@/lib/project-flow/names";
import { recordChange } from "@/lib/repositories/history-repository";
import type { ProjectSpace } from "@/lib/types/core";

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

function toSpace(row: typeof projectSpaces.$inferSelect, taskCount: number): ProjectSpace {
  return { id: row.id, name: row.name, projectId: row.projectId, sortOrder: row.sortOrder, taskCount };
}

/** Live task count per espacio id. */
async function taskCounts(executor: FlowExecutor, spaceIds: string[]): Promise<Map<string, number>> {
  if (spaceIds.length === 0) return new Map();
  const rows = await executor
    .select({ spaceId: tasks.spaceId, n: count() })
    .from(tasks)
    .where(and(inArray(tasks.spaceId, spaceIds), isNull(tasks.deletedAt)))
    .groupBy(tasks.spaceId);
  const out = new Map<string, number>();
  for (const r of rows) if (r.spaceId) out.set(r.spaceId, Number(r.n));
  return out;
}

/** The project's espacio whose nameKey matches `name`, if any. */
async function findByNameKey(
  executor: FlowExecutor,
  projectId: string,
  name: string,
  exceptId?: string
): Promise<{ id: string } | undefined> {
  const rows = await executor
    .select({ id: projectSpaces.id, name: projectSpaces.name })
    .from(projectSpaces)
    .where(and(eq(projectSpaces.projectId, projectId), exceptId ? ne(projectSpaces.id, exceptId) : undefined));
  const key = nameKey(name);
  return rows.find((r) => nameKey(r.name) === key);
}

async function nextSortOrder(executor: FlowExecutor, projectId: string): Promise<number> {
  const rows = await executor
    .select({ sortOrder: projectSpaces.sortOrder })
    .from(projectSpaces)
    .where(eq(projectSpaces.projectId, projectId));
  return rows.reduce((max, r) => Math.max(max, r.sortOrder + 1), 0);
}

/** By `sort_order`, with the live task count. */
export async function listSpaces(projectId: string): Promise<ProjectSpace[]> {
  const rows = await db
    .select()
    .from(projectSpaces)
    .where(eq(projectSpaces.projectId, projectId))
    .orderBy(asc(projectSpaces.sortOrder), asc(projectSpaces.name));
  const counts = await taskCounts(
    db,
    rows.map((r) => r.id)
  );
  return rows.map((r) => toSpace(r, counts.get(r.id) ?? 0));
}

/** Appended last. NAME_TAKEN via 23505 + nameKey pre-check; EMPTY; NOT_FOUND (project). */
export async function createSpace(projectId: string, name: string): Promise<ProjectSpace> {
  const clean = cleanName(name);
  try {
    return await db.transaction(async (tx) => {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
        .limit(1);
      if (!project) throw new Error("NOT_FOUND");
      if (await findByNameKey(tx, projectId, clean)) throw new Error("NAME_TAKEN");
      const [row] = await tx
        .insert(projectSpaces)
        .values({ projectId, name: clean, sortOrder: await nextSortOrder(tx, projectId) })
        .returning();
      return toSpace(row, 0);
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new Error("NAME_TAKEN");
    throw err;
  }
}

/** NAME_TAKEN, EMPTY, NOT_FOUND. */
export async function renameSpace(id: string, name: string): Promise<ProjectSpace> {
  const clean = cleanName(name);
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(projectSpaces).where(eq(projectSpaces.id, id)).limit(1);
      if (!before) throw new Error("NOT_FOUND");
      if (await findByNameKey(tx, before.projectId, clean, id)) throw new Error("NAME_TAKEN");
      const [after] = await tx
        .update(projectSpaces)
        .set({ name: clean })
        .where(eq(projectSpaces.id, id))
        .returning();
      const counts = await taskCounts(tx, [id]);
      return toSpace(after, counts.get(id) ?? 0);
    });
  } catch (err) {
    if (isUniqueViolation(err)) throw new Error("NAME_TAKEN");
    throw err;
  }
}

/** One transaction, `sort_order` = index. NOT_FOUND when an id isn't one of the project's espacios. */
export async function reorderSpaces(projectId: string, orderedIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: projectSpaces.id })
      .from(projectSpaces)
      .where(eq(projectSpaces.projectId, projectId));
    const owned = new Set(rows.map((r) => r.id));
    if (orderedIds.some((id) => !owned.has(id))) throw new Error("NOT_FOUND");
    for (const [i, id] of orderedIds.entries()) {
      await tx
        .update(projectSpaces)
        .set({ sortOrder: i })
        .where(and(eq(projectSpaces.id, id), eq(projectSpaces.projectId, projectId)));
    }
  });
}

/**
 * One transaction: records a `spaceId` change on each of its tasks, sets
 * their `space_id` null, deletes the row (`tasks_space_fk` is restrict).
 */
export async function deleteSpace(id: string, actorId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [space] = await tx
      .select({ id: projectSpaces.id })
      .from(projectSpaces)
      .where(eq(projectSpaces.id, id))
      .limit(1);
    if (!space) throw new Error("NOT_FOUND");
    // Soft-deleted tasks too: the FK is checked on every row.
    const affected = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.spaceId, id));
    for (const task of affected) {
      await recordChange(
        { entity: "task", entityId: task.id, actorId, field: "spaceId", before: id, after: null },
        tx
      );
    }
    if (affected.length > 0) await tx.update(tasks).set({ spaceId: null }).where(eq(tasks.spaceId, id));
    await tx.delete(projectSpaces).where(eq(projectSpaces.id, id));
  });
}

/** Throws SPACE_MISMATCH unless `spaceId` is an espacio of `projectId`. */
export async function assertSpaceInProject(tx: FlowExecutor, spaceId: string, projectId: string): Promise<void> {
  const [row] = await tx
    .select({ id: projectSpaces.id })
    .from(projectSpaces)
    .where(and(eq(projectSpaces.id, spaceId), eq(projectSpaces.projectId, projectId)))
    .limit(1);
  if (!row) throw new Error("SPACE_MISMATCH");
}

/** The espacio of the project with that name (deduped by nameKey), created when missing. Importer and remap. */
export async function findOrCreateSpace(tx: FlowTx, projectId: string, name: string): Promise<string> {
  const clean = cleanName(name);
  const existing = await findByNameKey(tx, projectId, clean);
  if (existing) return existing.id;
  // DO NOTHING keeps the transaction usable when a concurrent writer added the same lower(name).
  const [row] = await tx
    .insert(projectSpaces)
    .values({ projectId, name: clean, sortOrder: await nextSortOrder(tx, projectId) })
    .onConflictDoNothing()
    .returning({ id: projectSpaces.id });
  if (row) return row.id;
  const raced = await findByNameKey(tx, projectId, clean);
  if (!raced) throw new Error("NAME_TAKEN");
  return raced.id;
}
