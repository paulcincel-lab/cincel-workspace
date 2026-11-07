"use server";

import {
  canSeeAdminData,
  resolveActivitiesCapabilities,
  resolveClientsCapabilities,
  resolveProjectsCapabilities,
} from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import * as importRepository from "@/lib/repositories/import-repository";
import type { ImportDataEntity } from "@/lib/repositories/import-repository";
import * as tasksRepository from "@/lib/repositories/tasks-repository";
import type { ImportData, ViewerScope } from "@/lib/types/core";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read-only monday import data for the "Datos de monday" panel (FE §2.3) of a
 * task, project or contact. Same visibility as the row: the capability that
 * opens the task drawer, project ficha or Directorio sheet, and a row that
 * isn't deleted. `null` when the user can't see the row or it wasn't imported.
 *
 * Non-administrators (project flow BE §12, B2): `null` for an admin task, and
 * a project's monday client columns (client, contact email and phone) are
 * removed from `data`.
 */
export async function getImportDataAction(
  entity: ImportDataEntity,
  rowId: string,
): Promise<ImportData | null> {
  const user = await requireCapabilityUser();
  const canView =
    entity === "task"
      ? resolveActivitiesCapabilities(user).canViewActivities
      : entity === "project"
        ? resolveProjectsCapabilities(user).canViewProjects
        : entity === "contact"
          ? resolveClientsCapabilities(user).canViewClients
          : false;
  if (!canView) return null;
  if (typeof rowId !== "string" || !UUID.test(rowId)) return null;
  if (!(await importRepository.importDataRowExists(entity, rowId))) return null;
  const viewer: ViewerScope = { staffId: user.member.id, isAdmin: canSeeAdminData(user) };
  if (entity === "task" && !(await taskVisible(rowId, viewer))) return null;
  return importRepository.getImportData(entity, rowId, {
    hideClientColumns: entity === "project" && !viewer.isAdmin,
  });
}

/** `false` for an admin task read by a non-administrator (assertTaskVisible throws FORBIDDEN). */
async function taskVisible(taskId: string, viewer: ViewerScope): Promise<boolean> {
  try {
    await tasksRepository.assertTaskVisible(taskId, viewer);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("FORBIDDEN")) return false;
    throw error;
  }
}
