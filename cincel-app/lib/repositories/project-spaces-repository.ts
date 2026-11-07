/**
 * Espacios: an optional, ordered per-project list (project flow BE §8.3).
 * Hard-deleted (a filter, not history); task history keeps the old spaceId.
 */
import type { FlowExecutor, FlowTx } from "@/lib/project-flow/db";
import { notImplemented } from "@/lib/project-flow/not-implemented";
import type { ProjectSpace } from "@/lib/types/core";

/** By `sort_order`, with the live task count. */
export async function listSpaces(projectId: string): Promise<ProjectSpace[]> {
  return notImplemented("listSpaces", projectId);
}

/** Appended last. NAME_TAKEN via 23505 + nameKey pre-check; EMPTY; NOT_FOUND (project). */
export async function createSpace(projectId: string, name: string): Promise<ProjectSpace> {
  return notImplemented("createSpace", projectId, name);
}

/** NAME_TAKEN, EMPTY, NOT_FOUND. */
export async function renameSpace(id: string, name: string): Promise<ProjectSpace> {
  return notImplemented("renameSpace", id, name);
}

/** One transaction, `sort_order` = index. NOT_FOUND when an id isn't one of the project's espacios. */
export async function reorderSpaces(projectId: string, orderedIds: string[]): Promise<void> {
  return notImplemented("reorderSpaces", projectId, orderedIds);
}

/**
 * One transaction: records a `spaceId` change on each of its tasks, sets
 * their `space_id` null, deletes the row (`tasks_space_fk` is restrict).
 */
export async function deleteSpace(id: string, actorId: string): Promise<void> {
  return notImplemented("deleteSpace", id, actorId);
}

/** Throws SPACE_MISMATCH unless `spaceId` is an espacio of `projectId`. */
export async function assertSpaceInProject(tx: FlowExecutor, spaceId: string, projectId: string): Promise<void> {
  return notImplemented("assertSpaceInProject", tx, spaceId, projectId);
}

/** The espacio of the project with that name (deduped by nameKey), created when missing. Importer and remap. */
export async function findOrCreateSpace(tx: FlowTx, projectId: string, name: string): Promise<string> {
  return notImplemented("findOrCreateSpace", tx, projectId, name);
}
