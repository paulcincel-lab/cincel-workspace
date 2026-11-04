import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  contacts,
  portalAuditEvents,
  portalFileEvents,
  portalLoginLinks,
  portalSessions,
  portalUsers,
  projectContacts,
  projectPortalAccess,
  projects,
  staff,
} from "@/lib/db/schema";
import type { PortalAccessRow, PortalActivityRow } from "@/lib/types/portal";

/**
 * Staff-side portal access (BE §B.4.1, §B.4.8): invitations, revokes and
 * disables from the Clientes tab. Every mutation writes `portal_audit_events`
 * in the same transaction. Portal code never imports this module.
 */

export type PortalAuditKind = "invite" | "resend" | "revoke" | "disable" | "enable";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; current && depth < 5; depth++) {
    if (typeof current === "object" && (current as { code?: unknown }).code === UNIQUE_VIOLATION) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

async function writeAudit(
  tx: Tx,
  event: { kind: PortalAuditKind; portalUserId: string; projectId: string | null; staffId: string },
): Promise<void> {
  await tx.insert(portalAuditEvents).values(event);
}

/** A live (not soft-deleted) project. */
export async function findProject(projectId: string): Promise<{ id: string; name: string; clientId: string } | null> {
  const [row] = await db
    .select({ id: projects.id, name: projects.name, clientId: projects.clientId })
    .from(projects)
    .where(and(eq(projects.id, projectId), isNull(projects.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** A live contact. */
export async function findContact(
  contactId: string,
): Promise<{ id: string; name: string; type: "cliente" | "socio" | "proveedor" } | null> {
  const [row] = await db
    .select({ id: contacts.id, name: contacts.name, type: contacts.type })
    .from(contacts)
    .where(and(eq(contacts.id, contactId), isNull(contacts.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Whether the contact is the project's client or has a `project_contacts` row on it. */
export async function isContactOnProject(project: { id: string; clientId: string }, contactId: string): Promise<boolean> {
  if (project.clientId === contactId) return true;
  const [row] = await db
    .select({ contactId: projectContacts.contactId })
    .from(projectContacts)
    .where(and(eq(projectContacts.projectId, project.id), eq(projectContacts.contactId, contactId)))
    .limit(1);
  return Boolean(row);
}

export type InviteOutcome =
  | { status: "invited"; portalUserId: string }
  | { status: "disabled" }
  | { status: "already_active" };

/**
 * Upserts the portal user by `lower(email)` (new → `invited`; `invited` /
 * `active` kept as they are; `disabled` stops here), grants project access and
 * writes the `invite` audit event, all in one transaction.
 */
export async function invitePortalUser(input: {
  projectId: string;
  contactId: string;
  email: string;
  name: string;
  staffId: string;
}): Promise<InviteOutcome> {
  try {
    return await db.transaction(async (tx) => {
      await tx
        .insert(portalUsers)
        .values({ email: input.email, name: input.name, contactId: input.contactId, invitedByStaffId: input.staffId })
        .onConflictDoNothing();
      const [user] = await tx
        .select({ id: portalUsers.id, status: portalUsers.status })
        .from(portalUsers)
        .where(sql`lower(${portalUsers.email}) = ${input.email}`)
        .limit(1);
      if (!user) throw new Error("portal user upsert returned no row");
      if (user.status === "disabled") return { status: "disabled" } as const;

      const [existing] = await tx
        .select({ id: projectPortalAccess.id })
        .from(projectPortalAccess)
        .where(
          and(
            eq(projectPortalAccess.projectId, input.projectId),
            eq(projectPortalAccess.portalUserId, user.id),
            isNull(projectPortalAccess.revokedAt),
          ),
        )
        .limit(1);
      if (existing) return { status: "already_active" } as const;

      await tx
        .insert(projectPortalAccess)
        .values({ projectId: input.projectId, portalUserId: user.id, grantedByStaffId: input.staffId });
      await writeAudit(tx, { kind: "invite", portalUserId: user.id, projectId: input.projectId, staffId: input.staffId });
      return { status: "invited", portalUserId: user.id } as const;
    });
  } catch (err) {
    // A concurrent invite for the same (project, user) won the partial unique index.
    if (isUniqueViolation(err)) return { status: "already_active" };
    throw err;
  }
}

/** The active access row of a portal user on a project, with what the invite email needs. */
export async function findActiveAccess(
  portalUserId: string,
  projectId: string,
): Promise<{ accessId: string; email: string; status: "invited" | "active" | "disabled"; projectName: string } | null> {
  const [row] = await db
    .select({
      accessId: projectPortalAccess.id,
      email: portalUsers.email,
      status: portalUsers.status,
      projectName: projects.name,
    })
    .from(projectPortalAccess)
    .innerJoin(portalUsers, eq(portalUsers.id, projectPortalAccess.portalUserId))
    .innerJoin(projects, eq(projects.id, projectPortalAccess.projectId))
    .where(
      and(
        eq(projectPortalAccess.portalUserId, portalUserId),
        eq(projectPortalAccess.projectId, projectId),
        isNull(projectPortalAccess.revokedAt),
        isNull(projects.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** `kind` audit events for a portal user since `since` (the resend limit counts `resend`). */
export async function countAuditEventsSince(portalUserId: string, kind: PortalAuditKind, since: Date): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(portalAuditEvents)
    .where(
      and(
        eq(portalAuditEvents.portalUserId, portalUserId),
        eq(portalAuditEvents.kind, kind),
        gte(portalAuditEvents.at, since),
      ),
    );
  return row?.count ?? 0;
}

export async function recordAuditEvent(event: {
  kind: PortalAuditKind;
  portalUserId: string;
  projectId: string | null;
  staffId: string;
}): Promise<void> {
  await db.insert(portalAuditEvents).values(event);
}

/** Sets `revoked_at` / `revoked_by` on an active access row. Null when there is none. */
export async function revokeAccess(
  accessId: string,
  staffId: string,
): Promise<{ portalUserId: string; projectId: string } | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(projectPortalAccess)
      .set({ revokedAt: new Date(), revokedByStaffId: staffId, updatedAt: new Date() })
      .where(and(eq(projectPortalAccess.id, accessId), isNull(projectPortalAccess.revokedAt)))
      .returning({ portalUserId: projectPortalAccess.portalUserId, projectId: projectPortalAccess.projectId });
    if (!row) return null;
    await writeAudit(tx, { kind: "revoke", portalUserId: row.portalUserId, projectId: row.projectId, staffId });
    return row;
  });
}

/**
 * Status `disabled`, every portal session deleted (signed out everywhere) and
 * every unused sign-in link deleted. False when the user doesn't exist; an
 * already disabled user is left as is.
 */
export async function disablePortalUser(portalUserId: string, staffId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: portalUsers.id, status: portalUsers.status })
      .from(portalUsers)
      .where(eq(portalUsers.id, portalUserId))
      .for("update")
      .limit(1);
    if (!user) return false;

    if (user.status !== "disabled") {
      await tx
        .update(portalUsers)
        .set({ status: "disabled", disabledAt: new Date(), disabledByStaffId: staffId, updatedAt: new Date() })
        .where(eq(portalUsers.id, portalUserId));
      await writeAudit(tx, { kind: "disable", portalUserId, projectId: null, staffId });
    }
    // Always, so a session or link created in a race is gone too.
    await tx.delete(portalSessions).where(eq(portalSessions.portalUserId, portalUserId));
    await tx
      .delete(portalLoginLinks)
      .where(and(eq(portalLoginLinks.portalUserId, portalUserId), isNull(portalLoginLinks.usedAt)));
    return true;
  });
}

/**
 * `disabled → active` when the user had signed in before, else `invited`.
 * Access rows are untouched, so revoked projects stay revoked. False when
 * the user doesn't exist; a user who isn't disabled is left as is.
 */
export async function enablePortalUser(portalUserId: string, staffId: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({ id: portalUsers.id, status: portalUsers.status, activatedAt: portalUsers.activatedAt })
      .from(portalUsers)
      .where(eq(portalUsers.id, portalUserId))
      .for("update")
      .limit(1);
    if (!user) return false;
    if (user.status !== "disabled") return true;

    await tx
      .update(portalUsers)
      .set({
        status: user.activatedAt ? "active" : "invited",
        disabledAt: null,
        disabledByStaffId: null,
        updatedAt: new Date(),
      })
      .where(eq(portalUsers.id, portalUserId));
    await writeAudit(tx, { kind: "enable", portalUserId, projectId: null, staffId });
    return true;
  });
}

/** Every access row of the project, revoked ones included, newest first. */
export async function listProjectAccess(projectId: string): Promise<PortalAccessRow[]> {
  const rows = await db
    .select({
      accessId: projectPortalAccess.id,
      portalUserId: portalUsers.id,
      name: portalUsers.name,
      email: portalUsers.email,
      userStatus: portalUsers.status,
      revokedAt: projectPortalAccess.revokedAt,
      contactId: contacts.id,
      contactName: contacts.name,
      contactType: contacts.type,
      invitedBy: staff.name,
      lastLoginAt: portalUsers.lastLoginAt,
    })
    .from(projectPortalAccess)
    .innerJoin(portalUsers, eq(portalUsers.id, projectPortalAccess.portalUserId))
    .innerJoin(contacts, eq(contacts.id, portalUsers.contactId))
    .innerJoin(staff, eq(staff.id, projectPortalAccess.grantedByStaffId))
    .where(eq(projectPortalAccess.projectId, projectId))
    .orderBy(sql`${projectPortalAccess.revokedAt} is not null`, desc(projectPortalAccess.grantedAt));

  return rows.map(toAccessRow);
}

export function toAccessRow(row: {
  accessId: string;
  portalUserId: string;
  name: string;
  email: string;
  userStatus: "invited" | "active" | "disabled";
  revokedAt: Date | null;
  contactId: string;
  contactName: string;
  contactType: "cliente" | "socio" | "proveedor";
  invitedBy: string;
  lastLoginAt: Date | null;
}): PortalAccessRow {
  return {
    accessId: row.accessId,
    portalUserId: row.portalUserId,
    name: row.name,
    email: row.email,
    // Invites only target cliente / socio contacts.
    contact: { id: row.contactId, name: row.contactName, type: row.contactType === "socio" ? "socio" : "cliente" },
    status: row.revokedAt ? "revoked" : row.userStatus,
    invitedBy: row.invitedBy,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
  };
}

/** The last 50 client downloads, previews and uploads on the project. */
export async function listProjectActivity(projectId: string): Promise<PortalActivityRow[]> {
  const rows = await db
    .select({
      id: portalFileEvents.id,
      clientName: portalUsers.name,
      fileName: portalFileEvents.fileName,
      action: portalFileEvents.action,
      at: portalFileEvents.at,
    })
    .from(portalFileEvents)
    .innerJoin(portalUsers, eq(portalUsers.id, portalFileEvents.portalUserId))
    .where(eq(portalFileEvents.projectId, projectId))
    .orderBy(desc(portalFileEvents.at))
    .limit(50);

  return rows.map((row) => ({ ...row, at: row.at.toISOString() }));
}
