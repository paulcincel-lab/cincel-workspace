import "server-only";

import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { portalFileEvents, staff } from "@/lib/db/schema";
import { isAdministratorRole } from "@/lib/data/roles";
import { sendMail } from "@/lib/email";
import { archivoRecibidoEmail } from "@/lib/email/templates";
import { createDriveAdmin, DRIVE_SCOPE, type DriveAdmin } from "@/lib/google/drive-admin";
import { driveWebViewLink } from "@/lib/google/drive-url";
import { getServiceAccountTokenSource } from "@/lib/google/service-account";
import type { PortalUploadDrive } from "@/lib/portal/upload-pipeline";

/**
 * Database and mail side of the client upload (BE §B.4.7 steps 5–6): the
 * `portal_file_events` row and the "Archivo recibido" notice to the project's
 * manager and coordinator, or every Administrador when neither has an email.
 */

let serviceAccountDrive: DriveAdmin | null | undefined;

/** Service-account Drive client for uploads; null when it isn't configured. */
export function getPortalUploadDrive(): PortalUploadDrive | null {
  if (serviceAccountDrive === undefined) {
    const getAccessToken = getServiceAccountTokenSource([DRIVE_SCOPE]);
    serviceAccountDrive = getAccessToken ? createDriveAdmin({ getAccessToken }) : null;
  }
  return serviceAccountDrive;
}

export type PortalUploadEventInput = {
  portalUserId: string;
  projectId: string;
  driveFileId: string;
  fileName: string;
  sizeBytes: number;
  ip: string | null;
  userAgent: string | null;
};

export async function recordPortalUploadEvent(
  event: PortalUploadEventInput
): Promise<{ id: string; fileName: string; sizeBytes: number | null; at: Date }> {
  const [row] = await db
    .insert(portalFileEvents)
    .values({ ...event, action: "upload" })
    .returning({
      id: portalFileEvents.id,
      fileName: portalFileEvents.fileName,
      sizeBytes: portalFileEvents.sizeBytes,
      at: portalFileEvents.at,
    });
  return row;
}

type StaffEmailRow = { email: string | null; role?: string | null };

/** Manager and coordinator emails; when there are none, every Administrador's. Lowercased, no duplicates. */
export async function pickUploadRecipients(
  direct: StaffEmailRow[],
  everyone: () => Promise<StaffEmailRow[]>
): Promise<string[]> {
  const emails = (rows: StaffEmailRow[]) => [
    ...new Set(rows.map((row) => row.email?.trim().toLowerCase()).filter((email): email is string => !!email)),
  ];
  const own = emails(direct);
  if (own.length) return own;
  return emails((await everyone()).filter((row) => isAdministratorRole(row.role)));
}

const activeStaffWithEmail = and(isNull(staff.deletedAt), eq(staff.active, true), isNotNull(staff.email));

export async function listUploadRecipients(project: {
  managerId: string | null;
  coordinatorId: string | null;
}): Promise<string[]> {
  const ids = [project.managerId, project.coordinatorId].filter((id): id is string => !!id);
  const direct = ids.length
    ? await db.select({ email: staff.email }).from(staff).where(and(inArray(staff.id, ids), activeStaffWithEmail))
    : [];
  return pickUploadRecipients(direct, () =>
    db.select({ email: staff.email, role: staff.role }).from(staff).where(activeStaffWithEmail)
  );
}

export type PortalUploadNotice = {
  project: { name: string; managerId: string | null; coordinatorId: string | null };
  clientName: string;
  fileName: string;
  inboundFolderId: string;
};

/** Sends "Archivo recibido"; never throws (runs in `after()`). */
export async function notifyPortalUpload(notice: PortalUploadNotice): Promise<void> {
  try {
    const to = await listUploadRecipients(notice.project);
    if (!to.length) {
      console.warn(`[portal] upload to "${notice.project.name}" has no staff to notify`);
      return;
    }
    const mail = archivoRecibidoEmail({
      clientName: notice.clientName,
      projectName: notice.project.name,
      fileName: notice.fileName,
      folderUrl: driveWebViewLink(notice.inboundFolderId, true),
    });
    await sendMail({ to, subject: mail.subject, text: mail.text, html: mail.html });
  } catch (error) {
    console.error("[portal] upload notice failed", error instanceof Error ? error.message : error);
  }
}
