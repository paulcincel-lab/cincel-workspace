import "server-only";

import { and, asc, count, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";

import { DIRECTORY_ERROR_EVENT_KINDS } from "@/lib/auth/directory-error-log";
import { db } from "@/lib/db/client";
import { authEvents, projects, staff, workspaceGroupMappings } from "@/lib/db/schema";
import { tokenEncryptionKey } from "@/lib/google/token-crypto";
import type { DirectoryErrorSource, GoogleHealth } from "@/lib/types/workspace-access";

/**
 * Data for Configuración → Google → Estado (BE §A.7, FE §5): which settings
 * are present, the last Directory and Drive errors, how many active staff
 * already signed in with Google and who is still missing, and how many
 * projects have their Drive folders. Only reports whether secrets are set, never
 * their values.
 */

type Env = Record<string, string | undefined>;

const SOURCE_BY_KIND = new Map(
  Object.entries(DIRECTORY_ERROR_EVENT_KINDS).map(([source, kind]) => [kind, source as DirectoryErrorSource]),
);

const set = (value: string | undefined): string | null => value?.trim() || null;

function tokenKeyConfigured(env: Env): boolean {
  try {
    tokenEncryptionKey(env);
    return true;
  } catch {
    return false;
  }
}

/** Parses an `auth_events.reason` such as `http 403` or `timeout`. */
export function parseDirectoryErrorReason(reason: string | null): { kind: string; status: number | null } {
  const [kind = "network", status] = (reason ?? "").trim().split(/\s+/);
  const code = Number(status);
  return { kind: kind || "network", status: Number.isInteger(code) && code > 0 ? code : null };
}

/** Spanish text for a Directory error kind and status. */
export function directoryErrorMessage(kind: string, status: number | null): string {
  if (kind === "timeout") return "El Directorio de Google no respondió a tiempo";
  if (kind === "http") return `El Directorio de Google respondió ${status ?? "con un error"}`;
  return "No se pudo contactar el Directorio de Google o no está configurado";
}

export async function loadGoogleHealth(env: Env = process.env): Promise<GoogleHealth> {
  const [mappingRows, [directoryEvent], [driveError], [staffCounts], pendingRows, folderRows] = await Promise.all([
    db
      .select({ kind: workspaceGroupMappings.kind, n: count() })
      .from(workspaceGroupMappings)
      .groupBy(workspaceGroupMappings.kind),
    db
      .select({ kind: authEvents.kind, reason: authEvents.reason, at: authEvents.at })
      .from(authEvents)
      .where(inArray(authEvents.kind, Object.values(DIRECTORY_ERROR_EVENT_KINDS)))
      .orderBy(desc(authEvents.at))
      .limit(1),
    db
      .select({ message: projects.driveFolderError, at: projects.updatedAt })
      .from(projects)
      .where(and(isNotNull(projects.driveFolderError), isNull(projects.deletedAt)))
      .orderBy(desc(projects.updatedAt))
      .limit(1),
    db
      .select({ active: count(), googleLinked: count(staff.googleSub) })
      .from(staff)
      .where(and(eq(staff.active, true), isNull(staff.deletedAt))),
    db
      .select({ id: staff.id, name: staff.name, lastName: staff.lastName })
      .from(staff)
      .where(and(eq(staff.active, true), isNull(staff.deletedAt), isNull(staff.googleSub)))
      .orderBy(asc(staff.name), asc(staff.lastName)),
    db
      .select({ status: projects.driveFolderStatus, n: count() })
      .from(projects)
      .where(isNull(projects.deletedAt))
      .groupBy(projects.driveFolderStatus),
  ]);

  const groupMappingCount = mappingRows.reduce((sum, row) => sum + Number(row.n), 0);
  const roleGroupMappingCount = Number(mappingRows.find((row) => row.kind === "role")?.n ?? 0);

  let lastDirectoryError: GoogleHealth["lastDirectoryError"] = null;
  if (directoryEvent) {
    const { kind, status } = parseDirectoryErrorReason(directoryEvent.reason);
    lastDirectoryError = {
      at: directoryEvent.at.toISOString(),
      source: SOURCE_BY_KIND.get(directoryEvent.kind) ?? "sign_in",
      kind,
      status,
      message: directoryErrorMessage(kind, status),
    };
  }

  return {
    workspaceDomain: set(env.GOOGLE_WORKSPACE_DOMAIN)?.toLowerCase() ?? null,
    oauthClientConfigured: Boolean(set(env.GOOGLE_OAUTH_CLIENT_ID) && set(env.GOOGLE_OAUTH_CLIENT_SECRET)),
    groupMappingCount,
    roleGroupMappingCount,
    serviceAccountEmail: set(env.GOOGLE_SA_CLIENT_EMAIL),
    sharedDriveId: set(env.GOOGLE_SHARED_DRIVE_ID),
    tokenKeyConfigured: tokenKeyConfigured(env),
    lastDirectoryError,
    lastDriveError: driveError?.message ? { at: driveError.at.toISOString(), message: driveError.message } : null,
    googleLinkedStaff: Number(staffCounts?.googleLinked ?? 0),
    activeStaff: Number(staffCounts?.active ?? 0),
    pendingGoogleStaff: pendingRows.map((row) => ({
      id: row.id,
      name: [row.name, row.lastName].filter((part) => part && part.trim()).join(" "),
    })),
    projectsWithoutFolder: folderRows
      .filter((row) => row.status === "pending" || row.status === "failed")
      .reduce((sum, row) => sum + Number(row.n), 0),
    projectsWithFolder: Number(folderRows.find((row) => row.status === "ready")?.n ?? 0),
  };
}
