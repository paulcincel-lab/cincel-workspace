// @vitest-environment node
/**
 * Staff Google sign-in against a real Postgres (backend spec §A.4, §10).
 * Runs only when TEST_DATABASE_URL points at a migrated database
 * (`npm run db:migrate`). The Directory is the GOOGLE_FAKE in-memory fake.
 * Every row a test creates carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const DOMAIN = "cincel.example";
const run = randomUUID().slice(0, 8);
const groupId = (name: string) => `test-${run}-${name}`;
const GROUPS = { senior: groupId("senior"), direccion: groupId("direccion"), area: groupId("area") };

describe.skipIf(!url)("signInWithGoogle (test DB)", async () => {
  const { eq, inArray, sql } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { setFakeDirectoryState } = await import("@/lib/google/fake-directory");
  const { decryptToken, isEncryptedToken } = await import("@/lib/google/token-crypto");
  const { signInWithGoogle } = await import("./google-sign-in");
  const { getGoogleOauthAccount } = await import("@/lib/repositories/google-oauth-repository");

  const staffIds: string[] = [];
  const subs: string[] = [];
  let areaId = "";
  let n = 0;

  const meta = { ip: "203.0.113.7", userAgent: "vitest" };
  const tokens = () => ({
    accessToken: "fake-access-token",
    refreshToken: "fake-refresh-token",
    scope: "openid email profile",
    expiresAt: new Date(Date.now() + 3600_000),
  });

  function person(overrides: { name?: string } = {}) {
    n += 1;
    const sub = `sub-${run}-${n}`;
    subs.push(sub);
    return {
      sub,
      email: `persona-${run}-${n}@${DOMAIN}`,
      name: overrides.name ?? `Persona ${run} ${n}`,
      hd: DOMAIN,
    };
  }

  function directory(members: { sub: string; email: string; groups: string[] }[]) {
    setFakeDirectoryState({
      users: members.map((m) => ({ id: m.sub, primaryEmail: m.email })),
      groups: Object.values(GROUPS).map((id) => ({
        id,
        email: `${id}@${DOMAIN}`,
        members: members.filter((m) => m.groups.includes(id)).map((m) => m.email),
      })),
    });
  }

  async function insertStaff(values: { name: string; email: string; googleSub?: string; active?: boolean }) {
    const [row] = await db.insert(schema.staff).values(values).returning({ id: schema.staff.id });
    staffIds.push(row.id);
    return row.id;
  }

  async function staffRow(id: string) {
    const [row] = await db.select().from(schema.staff).where(eq(schema.staff.id, id));
    return row;
  }

  async function events(email: string) {
    return db.select().from(schema.authEvents).where(eq(schema.authEvents.email, email));
  }

  async function sessionCount(staffId: string) {
    const rows = await db.select().from(schema.sessions).where(eq(schema.sessions.staffId, staffId));
    return rows.length;
  }

  beforeAll(async () => {
    process.env.GOOGLE_FAKE = "1";
    process.env.GOOGLE_WORKSPACE_DOMAIN = DOMAIN;
    process.env.TOKEN_ENCRYPTION_KEY = "0".repeat(64);
    const [area] = await db
      .insert(schema.areas)
      .values({ name: `Área ${run}` })
      .returning({ id: schema.areas.id });
    areaId = area.id;
    await db.insert(schema.workspaceGroupMappings).values([
      {
        groupEmail: `${GROUPS.senior}@${DOMAIN}`,
        groupId: GROUPS.senior,
        kind: "role",
        role: "Arquitecto Senior",
        rank: 40,
      },
      {
        groupEmail: `${GROUPS.direccion}@${DOMAIN}`,
        groupId: GROUPS.direccion,
        kind: "role",
        role: "Dirección",
        rank: 70,
      },
      { groupEmail: `${GROUPS.area}@${DOMAIN}`, groupId: GROUPS.area, kind: "area", areaId },
    ]);
  });

  afterEach(() => setFakeDirectoryState(null));

  afterAll(async () => {
    const created = await db
      .select({ id: schema.staff.id })
      .from(schema.staff)
      .where(inArray(schema.staff.googleSub, subs.length ? subs : ["-"]));
    const ids = [...new Set([...staffIds, ...created.map((r) => r.id)])];
    await db.delete(schema.authEvents).where(sql`${schema.authEvents.email} like ${`%-${run}-%`}`);
    await db
      .delete(schema.workspaceGroupMappings)
      .where(sql`${schema.workspaceGroupMappings.groupId} like ${`test-${run}-%`}`);
    if (ids.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids));
    await db.delete(schema.areas).where(eq(schema.areas.id, areaId));
    delete process.env.GOOGLE_FAKE;
  });

  it("links an existing password staff row by email first, then finds it by sub", async () => {
    const who = person();
    const staffId = await insertStaff({ name: `${who.name} (password)`, email: who.email.toUpperCase() });
    await db.insert(schema.authCredentials).values({ staffId, passwordHash: "x", salt: "y", mustChangePassword: true });
    directory([{ ...who, groups: [GROUPS.senior, GROUPS.area] }]);

    const first = await signInWithGoogle(who, tokens(), meta);
    expect(first).toEqual({ status: "allowed", staffId });

    const linked = await staffRow(staffId);
    expect(linked.googleSub).toBe(who.sub);
    expect(linked.role).toBe("Arquitecto Senior");
    expect(linked.lastLoginAt).not.toBeNull();
    expect(linked.accessCheckedAt).not.toBeNull();

    const [credential] = await db
      .select()
      .from(schema.authCredentials)
      .where(eq(schema.authCredentials.staffId, staffId));
    expect(credential.mustChangePassword).toBe(false);

    const areaRows = await db.select().from(schema.areaMembers).where(eq(schema.areaMembers.staffId, staffId));
    expect(areaRows).toEqual([expect.objectContaining({ areaId, source: "workspace" })]);

    const [account] = await db
      .select()
      .from(schema.googleOauthAccounts)
      .where(eq(schema.googleOauthAccounts.staffId, staffId));
    expect(account.googleSub).toBe(who.sub);
    expect(isEncryptedToken(account.accessToken)).toBe(true);
    expect(decryptToken(account.accessToken)).toBe("fake-access-token");
    expect(decryptToken(account.refreshToken ?? "")).toBe("fake-refresh-token");
    // The old connect flow (picker, Calendar sync) never reads the encrypted row.
    await expect(getGoogleOauthAccount(staffId)).resolves.toBeNull();

    // The Google account's email changes: the link holds through `sub`.
    const renamed = { ...who, email: `renombrada-${run}-${n}@${DOMAIN}` };
    directory([{ ...renamed, groups: [GROUPS.direccion] }]);
    const second = await signInWithGoogle(renamed, tokens(), meta);
    expect(second).toEqual({ status: "allowed", staffId });
    expect((await staffRow(staffId)).role).toBe("Dirección");

    const allowed = await events(who.email);
    expect(allowed).toEqual([expect.objectContaining({ kind: "staff_login_allowed", staffId, ip: meta.ip })]);
    expect(await events(renamed.email)).toEqual([expect.objectContaining({ kind: "staff_login_allowed", staffId })]);
  });

  it("creates a staff row for a new domain user in a role group", async () => {
    const who = person();
    directory([{ ...who, groups: [GROUPS.senior] }]);

    const result = await signInWithGoogle(who, tokens(), meta);
    expect(result.status).toBe("allowed");
    const created = await staffRow((result as { staffId: string }).staffId);
    staffIds.push(created.id);
    expect(created).toMatchObject({
      name: who.name,
      email: who.email,
      kind: "empleado",
      active: true,
      googleSub: who.sub,
    });
  });

  it("refuses with no_role_group, records it and creates nothing", async () => {
    const who = person();
    directory([{ ...who, groups: [GROUPS.area] }]);

    await expect(signInWithGoogle(who, tokens(), meta)).resolves.toEqual({
      status: "denied",
      reason: "no_role_group",
      staffId: null,
    });
    const rows = await db.select().from(schema.staff).where(eq(schema.staff.googleSub, who.sub));
    expect(rows).toEqual([]);
    expect(await events(who.email)).toEqual([
      expect.objectContaining({ kind: "staff_login_denied", reason: "no_role_group" }),
    ]);
  });

  it("refuses with needs_link when the name is taken by a staff row without this email", async () => {
    const existingId = await insertStaff({ name: `Ana ${run}`, email: `otra-${run}@${DOMAIN}` });
    const who = person({ name: `ana ${run}` });
    directory([{ ...who, groups: [GROUPS.senior] }]);

    await expect(signInWithGoogle(who, tokens(), meta)).resolves.toMatchObject({
      status: "denied",
      reason: "needs_link",
    });
    expect((await staffRow(existingId)).googleSub).toBeNull();
    expect(await sessionCount(existingId)).toBe(0);
    expect(await events(who.email)).toEqual([
      expect.objectContaining({ kind: "staff_login_denied", reason: "needs_link" }),
    ]);
  });

  it("maps a unique violation during the upsert to needs_link", async () => {
    const who = person();
    const fn = sql.raw(`core.test_${run}_race`);
    const trigger = sql.raw(`test_${run}_race`);
    // A concurrent request takes the same name between our checks and the insert: the trigger
    // inserts a row with the same lower(name) first, so the insert hits staff_name_lower_uq.
    await db.execute(sql`
      create function ${fn}() returns trigger language plpgsql as $$
      begin
        if new.name = ${sql.raw(`'${who.name}'`)} then
          insert into core.staff (name) values (upper(new.name));
        end if;
        return new;
      end $$`);
    await db.execute(sql`create trigger ${trigger} before insert on core.staff for each row execute function ${fn}()`);
    directory([{ ...who, groups: [GROUPS.senior] }]);
    try {
      await expect(signInWithGoogle(who, tokens(), meta)).resolves.toMatchObject({
        status: "denied",
        reason: "needs_link",
      });
    } finally {
      await db.execute(sql`drop trigger if exists ${trigger} on core.staff`);
      await db.execute(sql`drop function if exists ${fn}()`);
    }
    const rows = await db
      .select()
      .from(schema.staff)
      .where(sql`lower(${schema.staff.name}) = lower(${who.name})`);
    expect(rows).toEqual([]);
    expect(await events(who.email)).toEqual([
      expect.objectContaining({ kind: "staff_login_denied", reason: "needs_link" }),
    ]);
  });

  it("refuses with sub_mismatch when the email row is linked to another Google account", async () => {
    const who = person();
    const staffId = await insertStaff({ name: who.name, email: who.email, googleSub: `otro-${run}` });
    directory([{ ...who, groups: [GROUPS.senior] }]);

    await expect(signInWithGoogle(who, tokens(), meta)).resolves.toEqual({
      status: "denied",
      reason: "sub_mismatch",
      staffId,
    });
    expect((await staffRow(staffId)).googleSub).toBe(`otro-${run}`);
  });

  it("refuses with inactive for a deactivated staff row, whatever the groups", async () => {
    const who = person();
    const staffId = await insertStaff({ name: who.name, email: who.email, active: false });
    directory([{ ...who, groups: [GROUPS.senior] }]);

    await expect(signInWithGoogle(who, tokens(), meta)).resolves.toEqual({
      status: "denied",
      reason: "inactive",
      staffId,
    });
    expect((await staffRow(staffId)).googleSub).toBeNull();
  });

  it("asks for a retry on a Directory outage and writes nothing", async () => {
    const who = person();
    setFakeDirectoryState({ failWith: "timeout" });
    await expect(signInWithGoogle(who, tokens(), meta)).resolves.toEqual({ status: "retry" });
    expect(await events(who.email)).toEqual([]);
  });

  it("leaves a legacy plaintext token row of the old connect flow untouched", async () => {
    const who = person();
    const staffId = await insertStaff({ name: who.name, email: who.email });
    await db.insert(schema.googleOauthAccounts).values({
      staffId,
      email: "personal@example.com",
      accessToken: "legacy-plain-access",
      refreshToken: "legacy-plain-refresh",
      scope: "https://www.googleapis.com/auth/drive.readonly",
      expiresAt: new Date(),
    });
    directory([{ ...who, groups: [GROUPS.senior] }]);

    await expect(signInWithGoogle(who, tokens(), meta)).resolves.toEqual({ status: "allowed", staffId });
    const [account] = await db
      .select()
      .from(schema.googleOauthAccounts)
      .where(eq(schema.googleOauthAccounts.staffId, staffId));
    expect(account).toMatchObject({ googleSub: null, accessToken: "legacy-plain-access" });
    await expect(getGoogleOauthAccount(staffId)).resolves.toMatchObject({ accessToken: "legacy-plain-access" });
  });
});
