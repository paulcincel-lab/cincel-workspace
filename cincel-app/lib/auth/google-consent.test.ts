// @vitest-environment node
/**
 * Incremental Google consent against a real Postgres (backend spec §A.6.2,
 * §A.11 #16, review NB 6). Runs only when TEST_DATABASE_URL points at a
 * migrated database (`npm run db:migrate`). The Directory is the GOOGLE_FAKE
 * in-memory fake. Every row a test creates carries a per-run marker and is
 * deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const DOMAIN = "cincel.example";
const run = randomUUID().slice(0, 8);
const SENIOR_GROUP = `test-${run}-senior`;
const DRIVE = "https://www.googleapis.com/auth/drive.readonly";
const CALENDAR = "https://www.googleapis.com/auth/calendar.app.created";

describe.skipIf(!url)("grantGoogleScope (test DB)", async () => {
  const { eq, inArray, sql } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { setFakeDirectoryState } = await import("@/lib/google/fake-directory");
  const { decryptToken, isEncryptedToken } = await import("@/lib/google/token-crypto");
  const { grantGoogleScope } = await import("./google-consent");

  const staffIds: string[] = [];
  let n = 0;

  const meta = { ip: "203.0.113.7", userAgent: "vitest" };
  const tokens = (scope: string, refreshToken: string | null = "fake-refresh-token") => ({
    accessToken: "fake-access-token",
    refreshToken,
    scope: `openid email profile ${scope}`,
    expiresAt: new Date(Date.now() + 3600_000),
  });

  function person() {
    n += 1;
    return { sub: `sub-${run}-${n}`, email: `persona-${run}-${n}@${DOMAIN}`, name: `Persona ${run} ${n}`, hd: DOMAIN };
  }

  function directory(members: { sub: string; email: string; inRoleGroup: boolean }[]) {
    setFakeDirectoryState({
      // Other DB test files map their own groups at the same time.
      unknownGroups: "empty",
      users: members.map((m) => ({ id: m.sub, primaryEmail: m.email })),
      groups: [
        {
          id: SENIOR_GROUP,
          email: `${SENIOR_GROUP}@${DOMAIN}`,
          members: members.filter((m) => m.inRoleGroup).map((m) => m.email),
        },
      ],
    });
  }

  async function insertStaff(values: { name: string; email: string; googleSub?: string }) {
    const [row] = await db.insert(schema.staff).values(values).returning({ id: schema.staff.id });
    staffIds.push(row.id);
    return row.id;
  }

  async function staffRow(id: string) {
    const [row] = await db.select().from(schema.staff).where(eq(schema.staff.id, id));
    return row;
  }

  async function account(staffId: string) {
    const [row] = await db
      .select()
      .from(schema.googleOauthAccounts)
      .where(eq(schema.googleOauthAccounts.staffId, staffId));
    return row ?? null;
  }

  beforeAll(async () => {
    process.env.GOOGLE_FAKE = "1";
    process.env.GOOGLE_WORKSPACE_DOMAIN = DOMAIN;
    process.env.TOKEN_ENCRYPTION_KEY = "0".repeat(64);
    await db.insert(schema.workspaceGroupMappings).values({
      groupEmail: `${SENIOR_GROUP}@${DOMAIN}`,
      groupId: SENIOR_GROUP,
      kind: "role",
      role: "Arquitecto Senior",
      rank: 40,
    });
  });

  afterEach(() => setFakeDirectoryState(null));

  afterAll(async () => {
    await db.delete(schema.authEvents).where(sql`${schema.authEvents.email} like ${`%-${run}-%`}`);
    await db.delete(schema.workspaceGroupMappings).where(eq(schema.workspaceGroupMappings.groupId, SENIOR_GROUP));
    if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
    delete process.env.GOOGLE_FAKE;
  });

  it("stores Drive, then Calendar, for a linked staff member", async () => {
    const who = person();
    const staffId = await insertStaff({ name: who.name, email: who.email, googleSub: who.sub });

    await expect(grantGoogleScope(staffId, "drive", who, tokens(DRIVE), meta)).resolves.toEqual({
      status: "granted",
      staffId,
      linked: false,
    });
    const drive = await account(staffId);
    expect(drive?.googleSub).toBe(who.sub);
    expect(drive?.scope).toContain(DRIVE);
    expect(isEncryptedToken(drive?.accessToken ?? "")).toBe(true);

    // Google sends no refresh token on a later grant: the stored one is kept.
    const later = tokens(`${DRIVE} ${CALENDAR}`, null);
    await expect(grantGoogleScope(staffId, "calendar", who, later, meta)).resolves.toEqual({
      status: "granted",
      staffId,
      linked: false,
    });
    const both = await account(staffId);
    expect(both?.scope).toContain(DRIVE);
    expect(both?.scope).toContain(CALENDAR);
    expect(decryptToken(both?.refreshToken ?? "")).toBe("fake-refresh-token");
  });

  it("reports scope_missing when the box was unchecked", async () => {
    const who = person();
    const staffId = await insertStaff({ name: who.name, email: who.email, googleSub: who.sub });
    await expect(grantGoogleScope(staffId, "drive", who, tokens(""), meta)).resolves.toEqual({
      status: "scope_missing",
      staffId,
    });
  });

  it("refuses another Google account (sub mismatch) and stores nothing", async () => {
    const who = person();
    const staffId = await insertStaff({ name: who.name, email: who.email, googleSub: who.sub });
    const other = { ...person(), email: who.email };

    await expect(grantGoogleScope(staffId, "drive", other, tokens(DRIVE), meta)).resolves.toEqual({
      status: "denied",
      reason: "sub_mismatch",
    });
    expect(await account(staffId)).toBeNull();
  });

  it("links a password-session staff member after consent (§A.11 #16), replacing a legacy row", async () => {
    const who = person();
    const staffId = await insertStaff({ name: who.name, email: who.email.toUpperCase() });
    await db.insert(schema.authCredentials).values({ staffId, passwordHash: "x", salt: "y", mustChangePassword: true });
    await db.insert(schema.googleOauthAccounts).values({
      staffId,
      email: who.email,
      accessToken: "legacy-plain-access",
      refreshToken: "legacy-plain-refresh",
      scope: "openid",
      expiresAt: new Date(),
    });
    directory([{ ...who, inRoleGroup: true }]);

    await expect(grantGoogleScope(staffId, "drive", who, tokens(DRIVE, null), meta)).resolves.toEqual({
      status: "granted",
      staffId,
      linked: true,
    });
    const linked = await staffRow(staffId);
    expect(linked.googleSub).toBe(who.sub);
    expect(linked.role).toBe("Arquitecto Senior");
    const [credential] = await db
      .select()
      .from(schema.authCredentials)
      .where(eq(schema.authCredentials.staffId, staffId));
    expect(credential.mustChangePassword).toBe(false);
    const stored = await account(staffId);
    expect(stored?.googleSub).toBe(who.sub);
    expect(decryptToken(stored?.accessToken ?? "")).toBe("fake-access-token");
    // The legacy plaintext refresh token is never kept next to encrypted tokens.
    expect(stored?.refreshToken).toBeNull();
  });

  it("refuses a password-session staff member whose Google email is not theirs", async () => {
    const who = person();
    const staffId = await insertStaff({ name: who.name, email: who.email });
    const other = person();
    directory([{ ...other, inRoleGroup: true }]);

    await expect(grantGoogleScope(staffId, "drive", other, tokens(DRIVE), meta)).resolves.toEqual({
      status: "denied",
      reason: "sub_mismatch",
    });
    expect((await staffRow(staffId)).googleSub).toBeNull();
  });

  it("on a gate denial keeps the password session, stores nothing and records it", async () => {
    const who = person();
    const staffId = await insertStaff({ name: who.name, email: who.email });
    const [session] = await db
      .insert(schema.sessions)
      .values({ staffId, tokenHash: `hash-${run}-${n}`, expiresAt: new Date(Date.now() + 3600_000) })
      .returning({ id: schema.sessions.id });
    directory([{ ...who, inRoleGroup: false }]);

    await expect(grantGoogleScope(staffId, "drive", who, tokens(DRIVE), meta)).resolves.toEqual({
      status: "denied",
      reason: "no_role_group",
    });
    expect((await staffRow(staffId)).googleSub).toBeNull();
    expect(await account(staffId)).toBeNull();
    const sessions = await db.select().from(schema.sessions).where(eq(schema.sessions.id, session.id));
    expect(sessions).toHaveLength(1);
    const events = await db.select().from(schema.authEvents).where(eq(schema.authEvents.email, who.email));
    expect(events).toEqual([expect.objectContaining({ kind: "staff_google_consent_denied", reason: "no_role_group" })]);
  });
});
