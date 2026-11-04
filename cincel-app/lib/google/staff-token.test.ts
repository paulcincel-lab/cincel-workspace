// @vitest-environment node
/**
 * Staff token reads and refresh against a real Postgres (backend spec
 * §A.6.2). Runs only when TEST_DATABASE_URL points at a migrated database.
 * Google's refresh endpoint is replaced by a stub.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);
const DRIVE = "https://www.googleapis.com/auth/drive.readonly";

describe.skipIf(!url)("getStaffAccessToken (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { StaffOauthError, StaffOauthInvalidGrantError } = await import("@/lib/google/staff-oauth");
  const { decryptToken, encryptToken } = await import("@/lib/google/token-crypto");
  const { getStaffAccessToken } = await import("./staff-token");

  const staffIds: string[] = [];
  let n = 0;
  const NOW = Date.parse("2026-11-03T12:00:00Z");

  async function staffWithTokens(values: { scope?: string; expiresAt?: Date; googleSub?: string | null } = {}) {
    n += 1;
    const [row] = await db
      .insert(schema.staff)
      .values({ name: `Token ${run} ${n}`, email: `token-${run}-${n}@cincel.example` })
      .returning({ id: schema.staff.id });
    staffIds.push(row.id);
    await db.insert(schema.googleOauthAccounts).values({
      staffId: row.id,
      email: `token-${run}-${n}@cincel.example`,
      accessToken: encryptToken("fake-access-token"),
      refreshToken: encryptToken("fake-refresh-token"),
      scope: values.scope ?? `openid email profile ${DRIVE}`,
      googleSub: values.googleSub === undefined ? `sub-${run}-${n}` : values.googleSub,
      expiresAt: values.expiresAt ?? new Date(NOW + 3600_000),
    });
    return row.id;
  }

  async function account(staffId: string) {
    const [row] = await db
      .select()
      .from(schema.googleOauthAccounts)
      .where(eq(schema.googleOauthAccounts.staffId, staffId));
    return row;
  }

  const now = () => NOW;

  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = "0".repeat(64);
  });

  afterAll(async () => {
    if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
  });

  it("returns the stored token while it is fresh", async () => {
    const staffId = await staffWithTokens();
    const refresh = vi.fn();
    await expect(getStaffAccessToken(staffId, "drive", { refresh, now })).resolves.toEqual({
      status: "ok",
      accessToken: "fake-access-token",
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("needs consent without the scope, or for a legacy row", async () => {
    const noDrive = await staffWithTokens({ scope: "openid email profile" });
    await expect(getStaffAccessToken(noDrive, "drive", { now })).resolves.toEqual({ status: "needs_consent" });
    const legacy = await staffWithTokens({ googleSub: null });
    await expect(getStaffAccessToken(legacy, "drive", { now })).resolves.toEqual({ status: "needs_consent" });
  });

  it("refreshes an expired token and stores it encrypted", async () => {
    const staffId = await staffWithTokens({ expiresAt: new Date(NOW - 1000) });
    const expiresAt = new Date(NOW + 3600_000);
    const refresh = vi.fn().mockResolvedValue({ accessToken: "fake-new-access", expiresAt, scope: null });

    await expect(getStaffAccessToken(staffId, "drive", { refresh, now })).resolves.toEqual({
      status: "ok",
      accessToken: "fake-new-access",
    });
    expect(refresh).toHaveBeenCalledWith("fake-refresh-token");
    const row = await account(staffId);
    expect(decryptToken(row.accessToken)).toBe("fake-new-access");
    expect(row.expiresAt.getTime()).toBe(expiresAt.getTime());
    expect(row.scope).toContain(DRIVE);
  });

  it("clears the tokens and scope on invalid_grant", async () => {
    const staffId = await staffWithTokens({ expiresAt: new Date(NOW - 1000) });
    const refresh = vi.fn().mockRejectedValue(new StaffOauthInvalidGrantError());

    await expect(getStaffAccessToken(staffId, "drive", { refresh, now })).resolves.toEqual({
      status: "needs_consent",
    });
    const row = await account(staffId);
    expect(row).toMatchObject({ accessToken: "", refreshToken: null, scope: "" });
    expect(row.googleSub).not.toBeNull();
    await expect(getStaffAccessToken(staffId, "drive", { refresh, now })).resolves.toEqual({
      status: "needs_consent",
    });
  });

  it("keeps the tokens on any other refresh failure", async () => {
    const staffId = await staffWithTokens({ expiresAt: new Date(NOW - 1000) });
    const refresh = vi.fn().mockRejectedValue(new StaffOauthError("No se pudo renovar el token de Google"));

    await expect(getStaffAccessToken(staffId, "drive", { refresh, now })).rejects.toBeInstanceOf(StaffOauthError);
    expect((await account(staffId)).scope).toContain(DRIVE);
  });
});
