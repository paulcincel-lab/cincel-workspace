// @vitest-environment node
/**
 * Portal session and project access queries against a real Postgres (BE
 * §B.4.3). Runs only when TEST_DATABASE_URL points at a migrated database.
 * Every row a test creates carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);
const DAY = 24 * 3_600_000;

describe.skipIf(!url)("portal session store (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const store = await import("@/lib/portal/session-store");

  let staffId = "";
  let contactId = "";
  const projectIds: string[] = [];
  const portalUserIds: string[] = [];

  async function project(values: { status?: "activo" | "cancelado"; deletedAt?: Date | null } = {}) {
    const [row] = await db
      .insert(schema.projects)
      .values({ name: `Portal ${run} ${projectIds.length}`, clientId: contactId, ...values })
      .returning({ id: schema.projects.id });
    projectIds.push(row.id);
    return row.id;
  }

  async function portalUser(status: "invited" | "active" | "disabled" = "active") {
    const [row] = await db
      .insert(schema.portalUsers)
      .values({
        email: `cliente-${run}-${portalUserIds.length}@example.com`,
        name: "Cliente",
        contactId,
        status,
        invitedByStaffId: staffId,
      })
      .returning({ id: schema.portalUsers.id });
    portalUserIds.push(row.id);
    return row.id;
  }

  async function grant(projectId: string, portalUserId: string, revoked = false) {
    await db.insert(schema.projectPortalAccess).values({
      projectId,
      portalUserId,
      grantedByStaffId: staffId,
      ...(revoked ? { revokedAt: new Date(), revokedByStaffId: staffId } : {}),
    });
  }

  async function session(portalUserId: string, expiresAt: Date) {
    const token = store.newPortalToken();
    const tokenHash = store.hashPortalToken(token);
    await store.insertPortalSession({ tokenHash, portalUserId, expiresAt, userAgent: null, ip: null });
    return tokenHash;
  }

  beforeAll(async () => {
    const [s] = await db
      .insert(schema.staff)
      .values({ name: `Portal staff ${run}`, email: `staff-${run}@portal.example` })
      .returning({ id: schema.staff.id });
    staffId = s.id;
    const [c] = await db
      .insert(schema.contacts)
      .values({ type: "cliente", name: `Cliente ${run}` })
      .returning({ id: schema.contacts.id });
    contactId = c.id;
  });

  afterAll(async () => {
    if (portalUserIds.length) await db.delete(schema.portalUsers).where(inArray(schema.portalUsers.id, portalUserIds));
    if (projectIds.length) await db.delete(schema.projects).where(inArray(schema.projects.id, projectIds));
    if (contactId) await db.delete(schema.contacts).where(eq(schema.contacts.id, contactId));
    if (staffId) await db.delete(schema.staff).where(eq(schema.staff.id, staffId));
  });

  it("finds a live session of an active user", async () => {
    const userId = await portalUser();
    const hash = await session(userId, new Date(Date.now() + DAY));
    const found = await store.findActivePortalSession(hash, new Date());
    expect(found?.user.id).toBe(userId);
  });

  it("ignores expired sessions, unknown hashes and users that are not active", async () => {
    const userId = await portalUser();
    const expired = await session(userId, new Date(Date.now() - 1000));
    expect(await store.findActivePortalSession(expired, new Date())).toBeNull();
    expect(await store.findActivePortalSession(store.hashPortalToken("nope"), new Date())).toBeNull();

    for (const status of ["invited", "disabled"] as const) {
      const other = await portalUser(status);
      const hash = await session(other, new Date(Date.now() + DAY));
      expect(await store.findActivePortalSession(hash, new Date())).toBeNull();
    }
  });

  it("slides the expiry and refreshed_at", async () => {
    const userId = await portalUser();
    const hash = await session(userId, new Date(Date.now() + DAY));
    const before = await store.findActivePortalSession(hash, new Date());
    const now = new Date();
    const expiresAt = new Date(now.getTime() + store.PORTAL_SESSION_TTL_MS);
    await store.slidePortalSession(before!.sessionId, now, expiresAt);
    const after = await store.findActivePortalSession(hash, new Date());
    expect(after?.expiresAt.getTime()).toBe(expiresAt.getTime());
    expect(after?.refreshedAt.getTime()).toBe(now.getTime());
  });

  it("deletes a session by token hash", async () => {
    const userId = await portalUser();
    const hash = await session(userId, new Date(Date.now() + DAY));
    await store.deletePortalSessionByTokenHash(hash);
    expect(await store.findActivePortalSession(hash, new Date())).toBeNull();
  });

  it("returns project access only for an active row on a live, non-cancelled project", async () => {
    const userId = await portalUser();
    const ok = await project();
    const cancelled = await project({ status: "cancelado" });
    const deleted = await project({ deletedAt: new Date() });
    const revoked = await project();
    const notGranted = await project();
    await grant(ok, userId);
    await grant(cancelled, userId);
    await grant(deleted, userId);
    await grant(revoked, userId, true);

    expect((await store.findPortalProjectAccess(userId, ok))?.projectId).toBe(ok);
    expect(await store.findPortalProjectAccess(userId, cancelled)).toBeNull();
    expect(await store.findPortalProjectAccess(userId, deleted)).toBeNull();
    expect(await store.findPortalProjectAccess(userId, revoked)).toBeNull();
    expect(await store.findPortalProjectAccess(userId, notGranted)).toBeNull();

    const otherUser = await portalUser();
    expect(await store.findPortalProjectAccess(otherUser, ok)).toBeNull();
  });
});
