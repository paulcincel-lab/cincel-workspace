// @vitest-environment node
/**
 * Portal access repository against a real Postgres (BE §B.4.1, §B.4.8,
 * §B.8 #8). Runs only when TEST_DATABASE_URL points at a migrated database
 * (`npm run db:migrate`). Every row a test creates carries a per-run marker
 * and is deleted afterwards.
 */
import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);
const HOUR = 3_600_000;

describe.skipIf(!url)("portal access repository (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const repo = await import("@/lib/repositories/portal-access-repository");

  let staffId = "";
  let contactId = "";
  let projectId = "";
  let otherProjectId = "";
  const email = `cliente-${run}@example.com`;
  const portalUserIds: string[] = [];

  async function auditKinds(portalUserId: string): Promise<string[]> {
    const rows = await db
      .select({ kind: schema.portalAuditEvents.kind })
      .from(schema.portalAuditEvents)
      .where(eq(schema.portalAuditEvents.portalUserId, portalUserId))
      .orderBy(schema.portalAuditEvents.at);
    return rows.map((row) => row.kind);
  }

  async function invite(project = projectId) {
    return repo.invitePortalUser({ projectId: project, contactId, email, name: "Ana Cliente", staffId });
  }

  async function userId(): Promise<string> {
    const [row] = await db
      .select({ id: schema.portalUsers.id })
      .from(schema.portalUsers)
      .where(eq(schema.portalUsers.email, email));
    return row!.id;
  }

  beforeAll(async () => {
    const [member] = await db
      .insert(schema.staff)
      .values({ name: `Portal staff ${run}` })
      .returning({ id: schema.staff.id });
    staffId = member!.id;
    const [contact] = await db
      .insert(schema.contacts)
      .values({ type: "cliente", name: `Cliente ${run}` })
      .returning({ id: schema.contacts.id });
    contactId = contact!.id;
    const created = await db
      .insert(schema.projects)
      .values([
        { name: `Portal A ${run}`, clientId: contactId },
        { name: `Portal B ${run}`, clientId: contactId },
      ])
      .returning({ id: schema.projects.id });
    projectId = created[0]!.id;
    otherProjectId = created[1]!.id;
  });

  afterAll(async () => {
    const users = await db
      .select({ id: schema.portalUsers.id })
      .from(schema.portalUsers)
      .where(eq(schema.portalUsers.contactId, contactId));
    portalUserIds.push(...users.map((row) => row.id));
    if (portalUserIds.length) {
      await db.delete(schema.portalAuditEvents).where(inArray(schema.portalAuditEvents.portalUserId, portalUserIds));
      await db.delete(schema.portalFileEvents).where(inArray(schema.portalFileEvents.portalUserId, portalUserIds));
      await db.delete(schema.portalUsers).where(inArray(schema.portalUsers.id, portalUserIds));
    }
    await db.delete(schema.projects).where(inArray(schema.projects.id, [projectId, otherProjectId]));
    await db.delete(schema.contacts).where(eq(schema.contacts.id, contactId));
    await db.delete(schema.staff).where(eq(schema.staff.id, staffId));
  });

  it("invite creates the user and the access row and writes an invite audit event", async () => {
    const outcome = await invite();
    expect(outcome.status).toBe("invited");
    const id = await userId();

    const [user] = await db.select().from(schema.portalUsers).where(eq(schema.portalUsers.id, id));
    expect(user).toMatchObject({ status: "invited", contactId, invitedByStaffId: staffId, name: "Ana Cliente" });
    expect(await repo.findActiveAccess(id, projectId)).toMatchObject({ email, projectName: `Portal A ${run}` });
    expect(await auditKinds(id)).toEqual(["invite"]);
  });

  it("a second invite to the same project is already_active; another project reuses the user", async () => {
    expect((await invite()).status).toBe("already_active");
    expect((await invite(otherProjectId)).status).toBe("invited");
    const users = await db
      .select({ id: schema.portalUsers.id })
      .from(schema.portalUsers)
      .where(eq(schema.portalUsers.contactId, contactId));
    expect(users).toHaveLength(1);
  });

  it("counts resend events within the window", async () => {
    const id = await userId();
    for (let i = 0; i < 3; i++) {
      await repo.recordAuditEvent({ kind: "resend", portalUserId: id, projectId, staffId });
    }
    expect(await repo.countAuditEventsSince(id, "resend", new Date(Date.now() - HOUR))).toBe(3);
    expect(await repo.countAuditEventsSince(id, "resend", new Date(Date.now() + HOUR))).toBe(0);
  });

  it("revoke removes the project from the active access and lists it as revoked", async () => {
    const id = await userId();
    const access = await repo.findActiveAccess(id, otherProjectId);
    expect(await repo.revokeAccess(access!.accessId, staffId)).toEqual({ portalUserId: id, projectId: otherProjectId });
    expect(await repo.findActiveAccess(id, otherProjectId)).toBeNull();
    expect(await repo.revokeAccess(access!.accessId, staffId)).toBeNull();

    const rows = await repo.listProjectAccess(otherProjectId);
    expect(rows).toEqual([
      expect.objectContaining({ accessId: access!.accessId, status: "revoked", invitedBy: `Portal staff ${run}` }),
    ]);
    expect((await auditKinds(id)).filter((kind) => kind === "revoke")).toHaveLength(1);
  });

  it("disable deletes every session and unused link; enable restores without touching revoked projects", async () => {
    const id = await userId();
    const later = new Date(Date.now() + 30 * 24 * HOUR);
    await db.insert(schema.portalSessions).values([
      { tokenHash: randomBytes(32).toString("hex"), portalUserId: id, expiresAt: later },
      { tokenHash: randomBytes(32).toString("hex"), portalUserId: id, expiresAt: later },
    ]);
    await db.insert(schema.portalLoginLinks).values({
      tokenHash: randomBytes(32).toString("hex"),
      portalUserId: id,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });

    expect(await repo.disablePortalUser(id, staffId)).toBe(true);
    const [user] = await db.select().from(schema.portalUsers).where(eq(schema.portalUsers.id, id));
    expect(user).toMatchObject({ status: "disabled", disabledByStaffId: staffId });
    expect(await db.select().from(schema.portalSessions).where(eq(schema.portalSessions.portalUserId, id))).toEqual([]);
    expect(await db.select().from(schema.portalLoginLinks).where(eq(schema.portalLoginLinks.portalUserId, id))).toEqual(
      [],
    );
    expect((await invite()).status).toBe("disabled");

    expect(await repo.enablePortalUser(id, staffId)).toBe(true);
    const [enabled] = await db.select().from(schema.portalUsers).where(eq(schema.portalUsers.id, id));
    // Never signed in, so back to invited.
    expect(enabled).toMatchObject({ status: "invited", disabledAt: null, disabledByStaffId: null });
    expect(await repo.findActiveAccess(id, otherProjectId)).toBeNull();
    expect(await repo.findActiveAccess(id, projectId)).not.toBeNull();

    const kinds = await auditKinds(id);
    expect(kinds.filter((kind) => kind === "disable")).toHaveLength(1);
    expect(kinds.filter((kind) => kind === "enable")).toHaveLength(1);
  });

  it("enable returns an activated user to active", async () => {
    const id = await userId();
    await db.update(schema.portalUsers).set({ activatedAt: new Date() }).where(eq(schema.portalUsers.id, id));
    await repo.disablePortalUser(id, staffId);
    await repo.enablePortalUser(id, staffId);
    const [user] = await db.select().from(schema.portalUsers).where(eq(schema.portalUsers.id, id));
    expect(user!.status).toBe("active");
  });

  it("unknown users are not found", async () => {
    expect(await repo.disablePortalUser(randomUUID(), staffId)).toBe(false);
    expect(await repo.enablePortalUser(randomUUID(), staffId)).toBe(false);
  });

  it("lists the last file events with the client name", async () => {
    const id = await userId();
    await db.insert(schema.portalFileEvents).values({
      portalUserId: id,
      projectId,
      driveFileId: `drive-${run}`,
      fileName: "planos.pdf",
      action: "download",
    });
    const rows = await repo.listProjectActivity(projectId);
    expect(rows[0]).toMatchObject({ clientName: "Ana Cliente", fileName: "planos.pdf", action: "download" });
    expect(typeof rows[0]!.at).toBe("string");
  });

  it("finds the project's 02 Cliente folder id", async () => {
    await expect(repo.findProjectClientFolderId(otherProjectId)).resolves.toBeNull();
    await db
      .update(schema.projects)
      .set({ driveClientFolderId: `client-folder-${run}` })
      .where(eq(schema.projects.id, otherProjectId));
    await expect(repo.findProjectClientFolderId(otherProjectId)).resolves.toBe(`client-folder-${run}`);
  });
});
