// @vitest-environment node
/**
 * Token row rule (backend spec §A.6.2, review NB 5) against a real Postgres:
 * the staff_token mode reads only rows with `google_sub` set (encrypted) and
 * never a leftover row with `google_sub` null.
 * Runs only when TEST_DATABASE_URL points at a migrated database.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);
const DRIVE = "https://www.googleapis.com/auth/drive.readonly";

describe.skipIf(!url)("google_oauth_accounts row rule (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { encryptToken } = await import("@/lib/google/token-crypto");
  const { getStaffAccessToken } = await import("@/lib/google/staff-token");
  const repo = await import("./google-oauth-repository");

  const staffIds: string[] = [];
  let n = 0;
  const NOW = Date.parse("2026-11-03T12:00:00Z");
  const now = () => NOW;
  const later = new Date(NOW + 3600_000);

  async function newStaff() {
    n += 1;
    const [row] = await db
      .insert(schema.staff)
      .values({ name: `Rows ${run} ${n}`, email: `rows-${run}-${n}@cincel.example` })
      .returning({ id: schema.staff.id });
    staffIds.push(row.id);
    return row.id;
  }

  /** A row written by Google sign-in or consent: `google_sub` set, encrypted tokens. */
  async function staffTokenRow() {
    const staffId = await newStaff();
    await db.insert(schema.googleOauthAccounts).values({
      staffId,
      email: `rows-${run}-${n}@cincel.example`,
      accessToken: encryptToken("staff-access-token"),
      refreshToken: encryptToken("staff-refresh-token"),
      scope: `openid email profile ${DRIVE}`,
      googleSub: `sub-${run}-${n}`,
      expiresAt: later,
    });
    return staffId;
  }

  /** A row of the old connect flow: `google_sub` null, plaintext tokens. */
  async function legacyRow() {
    const staffId = await newStaff();
    await db.insert(schema.googleOauthAccounts).values({
      staffId,
      email: `legacy-${run}-${n}@gmail.example`,
      accessToken: "legacy-access-token",
      refreshToken: "legacy-refresh-token",
      scope: DRIVE,
      googleSub: null,
      expiresAt: later,
    });
    return staffId;
  }

  async function row(staffId: string) {
    const [found] = await db
      .select()
      .from(schema.googleOauthAccounts)
      .where(eq(schema.googleOauthAccounts.staffId, staffId));
    return found;
  }

  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = "0".repeat(64);
  });

  afterAll(async () => {
    if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
  });

  describe("staff_token mode", () => {
    it("reads a staff-token row", async () => {
      const staffId = await staffTokenRow();
      await expect(getStaffAccessToken(staffId, "drive", { now })).resolves.toEqual({
        status: "ok",
        accessToken: "staff-access-token",
      });
    });

    it("skips a legacy row (plaintext, google_sub null)", async () => {
      const staffId = await legacyRow();
      await expect(getStaffAccessToken(staffId, "drive", { now })).resolves.toEqual({ status: "needs_consent" });
      expect((await row(staffId)).accessToken).toBe("legacy-access-token");
    });

    it("status lookup returns the staff-token row's email and scope, and nothing for a legacy row", async () => {
      const staffId = await staffTokenRow();
      await expect(repo.getStaffTokenAccount(staffId)).resolves.toEqual({
        email: `rows-${run}-${n}@cincel.example`,
        scope: `openid email profile ${DRIVE}`,
      });
      await expect(repo.getStaffTokenAccount(await legacyRow())).resolves.toBeNull();
    });
  });
});
