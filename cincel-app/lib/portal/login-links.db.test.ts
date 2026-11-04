// @vitest-environment node
/**
 * Portal magic links against a real Postgres (#506): only the token's sha256
 * is stored, a link is consumed once even under concurrency, expired links
 * fail, unknown and disabled emails insert nothing, and sign-in activates an
 * invited user. Runs only when TEST_DATABASE_URL points at a migrated
 * database. Every row a test creates carries a per-run marker and is deleted
 * afterwards.
 */
import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("portal login links (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const links = await import("@/lib/portal/login-links");

  let staffId = "";
  let contactId = "";
  const portalUserIds: string[] = [];

  async function portalUser(status: "invited" | "active" | "disabled" = "invited") {
    const email = `cliente-${run}-${portalUserIds.length}@example.com`;
    const [row] = await db
      .insert(schema.portalUsers)
      .values({ email, name: "Cliente", contactId, status, invitedByStaffId: staffId })
      .returning({ id: schema.portalUsers.id });
    portalUserIds.push(row.id);
    return { id: row.id, email };
  }

  async function linkRow(token: string) {
    const [row] = await db
      .select()
      .from(schema.portalLoginLinks)
      .where(eq(schema.portalLoginLinks.tokenHash, links.hashPortalLinkToken(token)));
    return row ?? null;
  }

  beforeAll(async () => {
    const [s] = await db
      .insert(schema.staff)
      .values({ name: `Portal staff ${run}`, email: `staff-links-${run}@portal.example` })
      .returning({ id: schema.staff.id });
    staffId = s.id;
    const [c] = await db
      .insert(schema.contacts)
      .values({ type: "cliente", name: `Cliente links ${run}` })
      .returning({ id: schema.contacts.id });
    contactId = c.id;
  });

  afterAll(async () => {
    if (portalUserIds.length) await db.delete(schema.portalUsers).where(inArray(schema.portalUsers.id, portalUserIds));
    if (contactId) await db.delete(schema.contacts).where(eq(schema.contacts.id, contactId));
    if (staffId) await db.delete(schema.staff).where(eq(schema.staff.id, staffId));
  });

  it("stores only the sha256 of the token, valid 15 minutes, with return_to and IP", async () => {
    const user = await portalUser();
    const now = new Date();
    const issued = await links.issuePortalLoginLink({
      email: user.email.toUpperCase(),
      returnTo: "/portal/proyectos/1",
      ip: "10.0.0.1",
      now,
    });
    expect(issued?.email).toBe(user.email);
    expect(issued?.token).toMatch(/^[0-9a-f]{64}$/);

    const row = await linkRow(issued!.token);
    expect(row?.tokenHash).toBe(createHash("sha256").update(issued!.token).digest("hex"));
    expect(row?.tokenHash).not.toContain(issued!.token);
    expect(row?.portalUserId).toBe(user.id);
    expect(row?.returnTo).toBe("/portal/proyectos/1");
    expect(row?.requestedIp).toBe("10.0.0.1");
    expect(row!.expiresAt.getTime() - now.getTime()).toBe(links.PORTAL_LOGIN_LINK_TTL_MS);
  });

  it("inserts nothing for unknown and disabled emails", async () => {
    const disabled = await portalUser("disabled");
    expect(await links.issuePortalLoginLink({ email: `nadie-${run}@example.com`, returnTo: null, ip: null })).toBeNull();
    expect(await links.issuePortalLoginLink({ email: disabled.email, returnTo: null, ip: null })).toBeNull();
    const rows = await db
      .select()
      .from(schema.portalLoginLinks)
      .where(eq(schema.portalLoginLinks.portalUserId, disabled.id));
    expect(rows).toHaveLength(0);
  });

  it("consumes a link exactly once, even with concurrent verifies", async () => {
    const user = await portalUser();
    const issued = await links.issuePortalLoginLink({ email: user.email, returnTo: "/portal", ip: null });
    const results = await Promise.all(Array.from({ length: 5 }, () => links.consumePortalLoginLink(issued!.token)));
    const winners = results.filter(Boolean);
    expect(winners).toEqual([{ portalUserId: user.id, returnTo: "/portal" }]);
    expect(await links.consumePortalLoginLink(issued!.token)).toBeNull();
    expect((await linkRow(issued!.token))?.usedAt).toBeInstanceOf(Date);
  });

  it("keeps older unused links valid when a new one is issued", async () => {
    const user = await portalUser();
    const first = await links.issuePortalLoginLink({ email: user.email, returnTo: null, ip: null });
    const second = await links.issuePortalLoginLink({ email: user.email, returnTo: null, ip: null });
    expect(await links.consumePortalLoginLink(first!.token)).not.toBeNull();
    expect(await links.consumePortalLoginLink(second!.token)).not.toBeNull();
  });

  it("rejects an expired link and an unknown token", async () => {
    const user = await portalUser();
    const issued = await links.issuePortalLoginLink({
      email: user.email,
      returnTo: null,
      ip: null,
      now: new Date(Date.now() - links.PORTAL_LOGIN_LINK_TTL_MS - 1000),
    });
    expect(await links.consumePortalLoginLink(issued!.token)).toBeNull();
    expect(await links.consumePortalLoginLink("0".repeat(64))).toBeNull();
  });

  it("activates an invited user once and refuses a disabled one", async () => {
    const invited = await portalUser("invited");
    expect(await links.recordPortalSignIn(invited.id)).toBe(true);
    const [first] = await db.select().from(schema.portalUsers).where(eq(schema.portalUsers.id, invited.id));
    expect(first.status).toBe("active");
    expect(first.activatedAt).toBeInstanceOf(Date);
    expect(first.lastLoginAt).toBeInstanceOf(Date);

    expect(await links.recordPortalSignIn(invited.id)).toBe(true);
    const [second] = await db.select().from(schema.portalUsers).where(eq(schema.portalUsers.id, invited.id));
    expect(second.activatedAt?.getTime()).toBe(first.activatedAt?.getTime());

    const disabled = await portalUser("disabled");
    expect(await links.recordPortalSignIn(disabled.id)).toBe(false);
    const [still] = await db.select().from(schema.portalUsers).where(eq(schema.portalUsers.id, disabled.id));
    expect(still.status).toBe("disabled");
  });

  it("cleans up used and expired links but keeps live ones", async () => {
    const user = await portalUser();
    const used = await links.issuePortalLoginLink({ email: user.email, returnTo: null, ip: null });
    await links.consumePortalLoginLink(used!.token);
    const expired = await links.issuePortalLoginLink({
      email: user.email,
      returnTo: null,
      ip: null,
      now: new Date(Date.now() - links.PORTAL_LOGIN_LINK_TTL_MS - 1000),
    });
    const live = await links.issuePortalLoginLink({ email: user.email, returnTo: null, ip: null });

    await links.cleanupPortalLoginRows();
    expect(await linkRow(used!.token)).toBeNull();
    expect(await linkRow(expired!.token)).toBeNull();
    expect(await linkRow(live!.token)).not.toBeNull();
  });
});
