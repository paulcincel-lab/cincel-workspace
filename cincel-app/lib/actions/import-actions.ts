"use server";

import {
  resolveActivitiesCapabilities,
  resolveClientsCapabilities,
  resolveProjectsCapabilities,
} from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import * as importRepository from "@/lib/repositories/import-repository";
import type { ImportDataEntity } from "@/lib/repositories/import-repository";
import type { ImportData } from "@/lib/types/core";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Read-only monday import data for the "Datos de monday" panel (FE §2.3) of a
 * task, project or contact. Same visibility as the row: the capability that
 * opens the task drawer, project ficha or Directorio sheet, and a row that
 * isn't deleted. `null` when the user can't see the row or it wasn't imported.
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
  return importRepository.getImportData(entity, rowId);
}
