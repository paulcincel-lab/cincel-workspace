import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, isNull, ne } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { portalSessions, portalUsers, projectPortalAccess, projects } from "@/lib/db/schema";
import type { DriveFolderStatus } from "@/lib/db/schema";

/**
 * Database access behind the portal session helpers (`lib/portal/session.ts`,
 * BE §B.2, §B.4.3). Reads only portal tables plus the project row; never the
 * staff `sessions` table.
 */

export const PORTAL_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** The expiry slides at most once a day per session, so most requests do no write. */
export const PORTAL_SESSION_REFRESH_MS = 24 * 60 * 60 * 1000;

/** sha256 hex of the raw cookie token; only the hash is stored. */
export function hashPortalToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newPortalToken(): string {
  return randomBytes(32).toString("hex");
}

export type PortalSessionRecord = {
  sessionId: string;
  expiresAt: Date;
  refreshedAt: Date;
  user: { id: string; name: string; email: string; contactId: string };
};

/** Live session for the token hash: not expired, and its portal user is `active`. */
export async function findActivePortalSession(tokenHash: string, now: Date): Promise<PortalSessionRecord | null> {
  const [row] = await db
    .select({
      sessionId: portalSessions.id,
      expiresAt: portalSessions.expiresAt,
      refreshedAt: portalSessions.refreshedAt,
      id: portalUsers.id,
      name: portalUsers.name,
      email: portalUsers.email,
      contactId: portalUsers.contactId,
    })
    .from(portalSessions)
    .innerJoin(portalUsers, eq(portalUsers.id, portalSessions.portalUserId))
    .where(
      and(eq(portalSessions.tokenHash, tokenHash), gt(portalSessions.expiresAt, now), eq(portalUsers.status, "active"))
    )
    .limit(1);
  if (!row) return null;
  return {
    sessionId: row.sessionId,
    expiresAt: row.expiresAt,
    refreshedAt: row.refreshedAt,
    user: { id: row.id, name: row.name, email: row.email, contactId: row.contactId },
  };
}

/** Moves the expiry to `expiresAt` and stamps `refreshed_at`. */
export async function slidePortalSession(sessionId: string, now: Date, expiresAt: Date): Promise<void> {
  await db.update(portalSessions).set({ expiresAt, refreshedAt: now }).where(eq(portalSessions.id, sessionId));
}

export async function insertPortalSession(input: {
  tokenHash: string;
  portalUserId: string;
  expiresAt: Date;
  userAgent: string | null;
  ip: string | null;
}): Promise<void> {
  await db.insert(portalSessions).values(input);
}

export async function deletePortalSessionByTokenHash(tokenHash: string): Promise<void> {
  await db.delete(portalSessions).where(eq(portalSessions.tokenHash, tokenHash));
}

export type PortalProjectAccess = {
  accessId: string;
  projectId: string;
  name: string;
  code: string | null;
  status: string;
  managerId: string | null;
  coordinatorId: string | null;
  driveFolderStatus: DriveFolderStatus;
  driveClientFolderId: string | null;
  driveInboundFolderId: string | null;
};

/**
 * The active access row for (project, portal user), only when the project is
 * not soft-deleted and not `cancelado`. Null otherwise; callers answer 404.
 */
export async function findPortalProjectAccess(
  portalUserId: string,
  projectId: string
): Promise<PortalProjectAccess | null> {
  const [row] = await db
    .select({
      accessId: projectPortalAccess.id,
      projectId: projects.id,
      name: projects.name,
      code: projects.code,
      status: projects.status,
      managerId: projects.managerId,
      coordinatorId: projects.coordinatorId,
      driveFolderStatus: projects.driveFolderStatus,
      driveClientFolderId: projects.driveClientFolderId,
      driveInboundFolderId: projects.driveInboundFolderId,
    })
    .from(projectPortalAccess)
    .innerJoin(projects, eq(projects.id, projectPortalAccess.projectId))
    .where(
      and(
        eq(projectPortalAccess.projectId, projectId),
        eq(projectPortalAccess.portalUserId, portalUserId),
        isNull(projectPortalAccess.revokedAt),
        isNull(projects.deletedAt),
        ne(projects.status, "cancelado")
      )
    )
    .limit(1);
  return row ?? null;
}
