import type { FlowTx } from "./db";
import { notImplemented } from "./not-implemented";

/**
 * Inserts the admin task "Asignar cliente y origen" (`system_key
 * 'assign_client'`, priority alta, commitment today in America/Mexico_City,
 * no manager) unless it exists (BE §9.4 step 2). Returns the task id, or
 * null when it already existed.
 */
export async function ensureAssignClientTask(tx: FlowTx, projectId: string, actorId: string): Promise<string | null> {
  return notImplemented("ensureAssignClientTask", tx, projectId, actorId);
}

/**
 * Closes the live, open `assign_client` task when the project's client goes
 * from null to a value (BE §9.5). Origin isn't required. No-op when none.
 */
export async function closeAssignClientTask(tx: FlowTx, projectId: string, actorId: string): Promise<void> {
  return notImplemented("closeAssignClientTask", tx, projectId, actorId);
}

/**
 * Every id must be a live, active staff member whose access role is
 * "Administrador" (`staffAccessRole`, lib/auth/access-role.ts), else
 * `ASSIGNEE_NOT_ADMIN` (BE §9.5, RD-12).
 */
export async function assertAdminAssignees(tx: FlowTx, staffIds: string[]): Promise<void> {
  return notImplemented("assertAdminAssignees", tx, staffIds);
}
