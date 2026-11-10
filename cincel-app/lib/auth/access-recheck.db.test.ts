// @vitest-environment node
/**
 * Periodic access re-check against a real Postgres (backend spec §A.5, §10,
 * §A.11 #5–7). Runs only when TEST_DATABASE_URL points at a migrated database
 * (`npm run db:migrate`). The Directory is an in-test fake (success, revoked,
 * error) and the group mappings are passed in, so no shared mapping rows are
 * written. Every row a test creates carries a per-run marker and is deleted
 * afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { DirectoryClient, WorkspaceUserStatus } from "@/lib/google/directory";
import type { GroupMappings } from "@/lib/auth/workspace-access";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const DOMAIN = "recheck.example";
const run = randomUUID().slice(0, 8);
const ROLE_GROUP = `recheck-${run}-senior`;
const DIRECCION_GROUP = `recheck-${run}-direccion`;
const HOUR = 3_600_000;

/** What the fake Directory answers, and how often it was asked. */
const fake = vi.hoisted(() => ({
  users: new Map<string, string>(),
  members: new Map<string, Set<string>>(),
  fail: null as null | "timeout" | "http",
  delayMs: 0,
  userCalls: 0,
}));

const mappings: GroupMappings = {
  roles: [
    { groupId: ROLE_GROUP, role: "Arquitecto Senior", rank: 40 },
    { groupId: DIRECCION_GROUP, role: "Dirección", rank: 70 },
  ],
  positions: [],
};

const session = vi.hoisted(() => ({ token: "", redirects: [] as string[], asAdmin: false }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => (session.token ? { value: session.token } : undefined) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (target: string) => {
    session.redirects.push(target);
    throw new Error(`NEXT_REDIRECT ${target}`);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The action's admin check; everything else uses the real helpers.
vi.mock("@/lib/auth/session", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...real,
    getSessionAccess: () =>
      session.asAdmin
        ? Promise.resolve({ status: "active", user: { id: "admin", access: "Administrador" } })
        : real.getSessionAccess(),
  };
});

// The session helpers and the action call the real re-check with this run's
// fake Directory and mappings.
vi.mock("@/lib/auth/access-recheck", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth/access-recheck")>();
  const { DirectoryError } = await import("@/lib/google/directory");
  const directory: DirectoryClient = {
    async getUserStatus(sub) {
      fake.userCalls += 1;
      if (fake.delayMs) await new Promise((resolve) => setTimeout(resolve, fake.delayMs));
      if (fake.fail) throw new DirectoryError("simulada", fake.fail, fake.fail === "http" ? 503 : null);
      const status = fake.users.get(sub) as WorkspaceUserStatus | undefined;
      return status ? { status, primaryEmail: null } : { status: "deleted", primaryEmail: null };
    },
    async hasMember(groupId, email) {
      if (fake.fail) throw new DirectoryError("simulada", fake.fail, fake.fail === "http" ? 503 : null);
      return fake.members.get(groupId)?.has(email) ?? false;
    },
    async getGroup() {
      return null;
    },
    async countMembers() {
      return 0;
    },
  };
  return {
    ...real,
    recheckStaffAccess: (staffId: string, options: Parameters<typeof real.recheckStaffAccess>[1] = {}) =>
      real.recheckStaffAccess(staffId, { directory, mappings, ...options }),
  };
});

describe.skipIf(!url)("access re-check (test DB)", async () => {
  const { eq, inArray, sql } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { recheckStaffAccess, isAccessCheckDue, RECHECK_BACKOFF_MS } = await import("@/lib/auth/access-recheck");
  const { createSessionRecord } = await import("@/lib/repositories/auth-repository");
  const { getSessionAccess, SIGNOUT_REVOKED_PATH } = await import("@/lib/auth/session");
  const { loadGoogleHealth } = await import("@/lib/auth/google-health");

  const staffIds: string[] = [];
  let n = 0;

  async function googleStaff(options: { groups?: string[]; status?: WorkspaceUserStatus | null; checkedAt?: Date | null } = {}) {
    n += 1;
    const sub = `sub-${run}-${n}`;
    const email = `persona-${run}-${n}@${DOMAIN}`;
    const [row] = await db
      .insert(schema.staff)
      .values({
        name: `Recheck ${run} ${n}`,
        email,
        role: "Colaborador",
        googleSub: sub,
        accessCheckedAt: options.checkedAt === undefined ? new Date(Date.now() - 5 * HOUR) : options.checkedAt,
      })
      .returning({ id: schema.staff.id });
    staffIds.push(row.id);
    if (options.status !== null) fake.users.set(sub, options.status ?? "active");
    for (const group of options.groups ?? [ROLE_GROUP]) {
      if (!fake.members.has(group)) fake.members.set(group, new Set());
      fake.members.get(group)!.add(email);
    }
    return { id: row.id, sub, email };
  }

  async function staffRow(id: string) {
    const [row] = await db.select().from(schema.staff).where(eq(schema.staff.id, id));
    return row;
  }

  async function sessionCount(staffId: string) {
    const rows = await db.select().from(schema.sessions).where(eq(schema.sessions.staffId, staffId));
    return rows.length;
  }

  async function events(staffId: string) {
    return db.select().from(schema.authEvents).where(eq(schema.authEvents.staffId, staffId));
  }

  beforeAll(() => {
    process.env.GOOGLE_WORKSPACE_DOMAIN = DOMAIN;
    delete process.env.ACCESS_RECHECK_HOURS;
  });

  beforeEach(() => {
    fake.fail = null;
    fake.delayMs = 0;
    fake.userCalls = 0;
    session.token = "";
    session.redirects = [];
    session.asAdmin = false;
  });

  afterAll(async () => {
    if (staffIds.length) {
      await db.delete(schema.authEvents).where(inArray(schema.authEvents.staffId, staffIds));
      await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
    }
    await db.delete(schema.authEvents).where(sql`${schema.authEvents.email} like ${`%-${run}-%`}`);
  });

  it("keeps an allowed user and refreshes the role from Workspace", async () => {
    const who = await googleStaff({ groups: [ROLE_GROUP, DIRECCION_GROUP] });
    await expect(recheckStaffAccess(who.id)).resolves.toEqual({ status: "kept" });
    const row = await staffRow(who.id);
    expect(row.role).toBe("Dirección");
    expect(row.accessRevokedAt).toBeNull();
    expect(Date.now() - row.accessCheckedAt!.getTime()).toBeLessThan(60_000);
    expect((await events(who.id)).map((e) => e.kind)).toEqual(["staff_recheck_kept"]);
  });

  it("revokes a user removed from every role group: sessions deleted and auth_events written", async () => {
    const who = await googleStaff({ groups: [] });
    await createSessionRecord(who.id);
    await createSessionRecord(who.id);
    expect(await sessionCount(who.id)).toBe(2);

    await expect(recheckStaffAccess(who.id)).resolves.toEqual({ status: "revoked", reason: "no_role_group" });

    expect(await sessionCount(who.id)).toBe(0);
    const row = await staffRow(who.id);
    expect(row.accessRevokedAt).not.toBeNull();
    expect(row.accessRevokedReason).toBe("no_role_group");
    expect(await events(who.id)).toEqual([
      expect.objectContaining({ kind: "staff_recheck_revoked", reason: "no_role_group", email: who.email }),
    ]);
  });

  it("revokes a suspended user", async () => {
    const who = await googleStaff({ status: "suspended" });
    await createSessionRecord(who.id);
    await expect(recheckStaffAccess(who.id)).resolves.toEqual({ status: "revoked", reason: "workspace_suspended" });
    expect(await sessionCount(who.id)).toBe(0);
  });

  it("signs out through the session helper and lands on the revoked denial page", async () => {
    const who = await googleStaff({ groups: [] });
    session.token = (await createSessionRecord(who.id)).token;

    await expect(getSessionAccess()).rejects.toThrow("NEXT_REDIRECT");
    expect(session.redirects).toEqual([SIGNOUT_REVOKED_PATH]);
    expect(await sessionCount(who.id)).toBe(0);

    // The next request finds no session: a guest, no redirect loop.
    session.redirects = [];
    await expect(getSessionAccess()).resolves.toEqual({ status: "guest", user: null });
    expect(session.redirects).toEqual([]);
  });

  it("signs out on the next request when access_revoked_at is already set, without asking the Directory", async () => {
    const who = await googleStaff({ checkedAt: new Date() });
    await db.update(schema.staff).set({ accessRevokedAt: new Date(), accessRevokedReason: "no_role_group" }).where(eq(schema.staff.id, who.id));
    session.token = (await createSessionRecord(who.id)).token;

    await expect(getSessionAccess()).rejects.toThrow("NEXT_REDIRECT");
    expect(session.redirects).toEqual([SIGNOUT_REVOKED_PATH]);
    expect(await sessionCount(who.id)).toBe(0);
    expect(fake.userCalls).toBe(0);
  });

  it("a Directory outage signs nobody out and backs off 5 minutes", async () => {
    const who = await googleStaff();
    session.token = (await createSessionRecord(who.id)).token;
    fake.fail = "http";
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(getSessionAccess()).resolves.toMatchObject({ status: "active", user: { id: who.id } });
    expect(await sessionCount(who.id)).toBe(1);

    const row = await staffRow(who.id);
    expect(row.accessRevokedAt).toBeNull();
    // access_checked_at = now - 4 h + 5 min: not due now, due 5 minutes from now.
    const checkedAt = row.accessCheckedAt!;
    expect(Math.abs(Date.now() - 4 * HOUR + RECHECK_BACKOFF_MS - checkedAt.getTime())).toBeLessThan(60_000);
    expect(isAccessCheckDue(checkedAt, 4)).toBe(false);
    expect(isAccessCheckDue(checkedAt, 4, new Date(Date.now() + RECHECK_BACKOFF_MS + 1_000))).toBe(true);
    expect(await events(who.id)).toEqual([expect.objectContaining({ kind: "staff_recheck_error", reason: "http 503" })]);

    // The next request inside the back-off doesn't call the Directory.
    fake.userCalls = 0;
    await expect(getSessionAccess()).resolves.toMatchObject({ status: "active" });
    expect(fake.userCalls).toBe(0);
  });

  it("concurrent requests: exactly one claimer calls the Directory", async () => {
    const who = await googleStaff();
    fake.delayMs = 100;

    const outcomes = await Promise.all(Array.from({ length: 6 }, () => recheckStaffAccess(who.id)));

    expect(fake.userCalls).toBe(1);
    expect(outcomes.filter((o) => o.status === "kept")).toHaveLength(1);
    expect(outcomes.filter((o) => o.status === "not_claimed")).toHaveLength(5);
  });

  it("does not re-check before the interval, and never staff without google_sub", async () => {
    const recent = await googleStaff({ checkedAt: new Date(Date.now() - HOUR) });
    await expect(recheckStaffAccess(recent.id)).resolves.toEqual({ status: "not_claimed" });

    const [password] = await db
      .insert(schema.staff)
      .values({ name: `Recheck ${run} password`, email: `password-${run}-x@${DOMAIN}` })
      .returning({ id: schema.staff.id });
    staffIds.push(password.id);
    await expect(recheckStaffAccess(password.id, { force: true })).resolves.toEqual({ status: "not_google_linked" });
    expect(fake.userCalls).toBe(0);
  });

  describe("recheckStaffAccessAction", async () => {
    const { recheckStaffAccessAction } = await import("@/lib/actions/workspace-access-actions");
    beforeEach(() => {
      session.asAdmin = true;
    });

    it("revokes at once, ignoring the interval", async () => {
      const who = await googleStaff({ groups: [], checkedAt: new Date() });
      await createSessionRecord(who.id);
      await expect(recheckStaffAccess(who.id)).resolves.toEqual({ status: "not_claimed" });

      await expect(recheckStaffAccessAction(who.id)).resolves.toEqual({
        ok: true,
        allowed: false,
        reason: "no_role_group",
      });
      expect(await sessionCount(who.id)).toBe(0);
      expect((await staffRow(who.id)).accessRevokedReason).toBe("no_role_group");
    });

    it("reports a kept access", async () => {
      const who = await googleStaff({ checkedAt: new Date() });
      await expect(recheckStaffAccessAction(who.id)).resolves.toEqual({ ok: true, allowed: true });
    });
  });

  it("health reports Google-linked staff and the last Directory error without exposing secrets", async () => {
    const who = await googleStaff({ checkedAt: new Date() });
    await db.insert(schema.authEvents).values({
      kind: "staff_login_error",
      staffId: who.id,
      reason: "http 403",
      at: new Date(Date.now() + 24 * HOUR),
    });
    const secret = "-----BEGIN PRIVATE KEY-----secret";
    const health = await loadGoogleHealth({
      GOOGLE_WORKSPACE_DOMAIN: " Cincel.MX ",
      GOOGLE_OAUTH_CLIENT_ID: "client",
      GOOGLE_OAUTH_CLIENT_SECRET: "client-secret",
      GOOGLE_SA_CLIENT_EMAIL: "sa@project.iam.gserviceaccount.com",
      GOOGLE_SA_PRIVATE_KEY: secret,
      GOOGLE_SHARED_DRIVE_ID: "drive-1",
      TOKEN_ENCRYPTION_KEY: "a".repeat(64),
    });

    expect(health).toMatchObject({
      workspaceDomain: "cincel.mx",
      oauthClientConfigured: true,
      serviceAccountEmail: "sa@project.iam.gserviceaccount.com",
      sharedDriveId: "drive-1",
      tokenKeyConfigured: true,
      lastDirectoryError: { source: "sign_in", kind: "http", status: 403 },
    });
    expect(health.googleLinkedStaff).toBeGreaterThanOrEqual(1);
    expect(health.activeStaff).toBeGreaterThanOrEqual(health.googleLinkedStaff);
    expect(Object.keys(health).sort()).toEqual(
      [
        "activeStaff",
        "googleLinkedStaff",
        "pendingGoogleStaff",
        "projectsWithFolder",
        "projectsWithoutFolder",
        "groupMappingCount",
        "lastDirectoryError",
        "lastDriveError",
        "oauthClientConfigured",
        "roleGroupMappingCount",
        "serviceAccountEmail",
        "sharedDriveId",
        "tokenKeyConfigured",
        "workspaceDomain",
      ].sort(),
    );
    const json = JSON.stringify(health);
    expect(json).not.toContain(secret);
    expect(json).not.toContain("client-secret");
    expect(json).not.toContain("a".repeat(64));

    const empty = await loadGoogleHealth({});
    expect(empty).toMatchObject({
      workspaceDomain: null,
      oauthClientConfigured: false,
      serviceAccountEmail: null,
      sharedDriveId: null,
      tokenKeyConfigured: false,
    });
  });

  it("pendingGoogleStaff lists active staff without google_sub", async () => {
    const linked = await googleStaff();
    const insertStaff = async (label: string, active: boolean) => {
      const [row] = await db
        .insert(schema.staff)
        .values({ name: `Pendiente ${run} ${label}`, lastName: "Prueba", role: "Colaborador", active })
        .returning({ id: schema.staff.id });
      staffIds.push(row.id);
      return row.id;
    };
    const pendingB = await insertStaff("B", true);
    const pendingA = await insertStaff("A", true);
    const inactive = await insertStaff("C", false);

    const health = await loadGoogleHealth({});
    const ids = health.pendingGoogleStaff.map((person) => person.id);
    expect(ids).toContain(pendingA);
    expect(ids).toContain(pendingB);
    expect(ids).not.toContain(inactive);
    expect(ids).not.toContain(linked.id);
    // By name, with the last name joined.
    expect(ids.indexOf(pendingA)).toBeLessThan(ids.indexOf(pendingB));
    expect(health.pendingGoogleStaff.find((person) => person.id === pendingA)?.name).toBe(`Pendiente ${run} A Prueba`);
  });
});
