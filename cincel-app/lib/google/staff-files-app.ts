import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { projects } from "@/lib/db/schema";
import { createDriveAdmin, DRIVE_SCOPE, type DriveAdmin } from "./drive-admin";
import { getServiceAccountTokenSource } from "./service-account";
import { getStaffAccessToken } from "./staff-token";
import { createProjectAncestry, loadStaffFiles, type StaffFilesProject } from "./staff-files";
import type { StaffFilesResult } from "@/lib/types/workspace-access";

/** App side of the staff Archivos tab (§A.6.3): database, service account and staff token. */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let serviceAccountDrive: DriveAdmin | null | undefined;

function getServiceAccountDrive(): DriveAdmin | null {
  if (serviceAccountDrive === undefined) {
    const getAccessToken = getServiceAccountTokenSource([DRIVE_SCOPE]);
    serviceAccountDrive = getAccessToken ? createDriveAdmin({ getAccessToken }) : null;
  }
  return serviceAccountDrive;
}

/** Process-wide ancestry cache (5 min) shared by every staff Archivos request. */
export const staffProjectAncestry = createProjectAncestry({ getDrive: getServiceAccountDrive });

/** The project's Drive columns, or null when it doesn't exist or is deleted. */
export async function getStaffFilesProject(projectId: string): Promise<StaffFilesProject | null> {
  if (!UUID_RE.test(projectId)) return null;
  const [row] = await db
    .select({
      driveFolderId: projects.driveFolderId,
      driveFolderStatus: projects.driveFolderStatus,
      driveFolderError: projects.driveFolderError,
    })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);
  return row ?? null;
}

export function listStaffProjectFiles(
  staffId: string,
  project: StaffFilesProject,
  folderId: string | null
): Promise<StaffFilesResult> {
  return loadStaffFiles(project, folderId, {
    ancestry: staffProjectAncestry,
    getStaffToken: () => getStaffAccessToken(staffId, "drive"),
    openStaffDrive: (accessToken) => createDriveAdmin({ getAccessToken: async () => accessToken }),
  });
}
