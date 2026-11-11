// @vitest-environment node
/**
 * Ajustes personal page data (Query Migration 9a, #963) against a real
 * Postgres. Runs only when TEST_DATABASE_URL points at a migrated database
 * (`npm run db:migrate`). Every row it creates carries a per-run marker and
 * is deleted afterwards.
 *
 * - Each of the four page-data actions without a staff session → FORBIDDEN.
 * - `getAjustesPerfilPageData` returns the caller's own profile only, and
 *   only the `PerfilData` fields (no HR data).
 * - The Perfil page data runs ≤ 6 statements (`countQueries`).
 * - `getAjustesIntegracionesPageData` makes no OAuth token refresh and no DB
 *   write, even with an expired Drive token.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);
// The org appearance read opts out of prerendering with `connection()`; there is no request scope here.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => undefined,
}));

/** A token refresh fails the test: page data must never call Google. */
const oauth = vi.hoisted(() => ({
  refreshStaffAccessToken: vi.fn(async () => {
    throw new Error("token refresh called");
  }),
}));
vi.mock("@/lib/google/staff-oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/google/staff-oauth")>()),
  refreshStaffAccessToken: oauth.refreshStaffAccessToken,
}));

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("ajustes personal page data (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { asViewer } = await import("@/lib/query/test-utils");
  const { countQueries } = await import("../helpers/count-queries");
  const actions = await import("@/lib/actions/page-data/ajustes-actions");

  const staffIds: string[] = [];
  let me = "";
  let other = "";

  const viewer = (id: string) => ({ id, access: "Colaborador" as const, email: `ajustes-${run}@cincel.example` });

  beforeAll(async () => {
    const rows = await db
      .insert(schema.staff)
      .values([
        { name: `Ajustes ${run}`, email: `ajustes-${run}@cincel.example`, phone: "555-0101" },
        { name: `Ajeno ${run}`, email: `ajeno-${run}@cincel.example`, phone: "555-0202" },
      ])
      .returning({ id: schema.staff.id });
    me = rows[0].id;
    other = rows[1].id;
    staffIds.push(me, other);
    await db.insert(schema.staffProfiles).values([
      { staffId: me, emailSignature: "Ana · Cincel", curp: null, rfc: null },
      { staffId: other, emailSignature: "Firma ajena", personalEmail: `privado-${run}@example.com` },
    ]);
    // An expired Drive token with a refresh token: a render that refreshed it would call Google.
    await db.insert(schema.googleOauthAccounts).values({
      staffId: me,
      googleSub: `sub-${run}`,
      email: `ajustes-${run}@cincel.example`,
      accessToken: "encrypted-access",
      refreshToken: "encrypted-refresh",
      scope: "openid email https://www.googleapis.com/auth/drive.readonly",
      expiresAt: new Date(Date.now() - 60 * 60_000),
    } as typeof schema.googleOauthAccounts.$inferInsert);
  });

  afterAll(async () => {
    if (staffIds.length) {
      await db.delete(schema.googleOauthAccounts).where(inArray(schema.googleOauthAccounts.staffId, staffIds));
      await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
    }
  });

  it.each<readonly [string, () => Promise<unknown>]>([
    ["getAjustesAparienciaPageData", () => actions.getAjustesAparienciaPageData({})],
    ["getAjustesNotificacionesPageData", () => actions.getAjustesNotificacionesPageData({})],
    ["getAjustesPerfilPageData", () => actions.getAjustesPerfilPageData({})],
    ["getAjustesIntegracionesPageData", () => actions.getAjustesIntegracionesPageData({})],
  ])("%s without a staff session → FORBIDDEN", async (_name, call) => {
    await expect(asViewer(null, call)).rejects.toThrow(/^FORBIDDEN/);
  });

  it("Perfil returns only the caller's own profile fields", async () => {
    const mine = await asViewer(viewer(me), () => actions.getAjustesPerfilPageData({}));
    expect(Object.keys(mine)).toEqual(["profile"]);
    expect(Object.keys(mine.profile).sort()).toEqual(
      ["email", "emailSignature", "name", "phone", "puesto", "staffId", "week"].sort(),
    );
    expect(mine.profile).toMatchObject({
      staffId: me,
      name: `Ajustes ${run}`,
      phone: "555-0101",
      email: `ajustes-${run}@cincel.example`,
      emailSignature: "Ana · Cincel",
    });
    expect(JSON.stringify(mine)).not.toContain(other);
    expect(JSON.stringify(mine)).not.toContain("Firma ajena");

    const theirs = await asViewer(viewer(other), () => actions.getAjustesPerfilPageData({}));
    expect(theirs.profile.staffId).toBe(other);
    // HR data stays on the server.
    expect(JSON.stringify(theirs)).not.toContain(`privado-${run}@example.com`);
  });

  it("Perfil page data runs at most 6 statements", async () => {
    const { count } = await countQueries(() => asViewer(viewer(me), () => actions.getAjustesPerfilPageData({})));
    expect(count).toBeLessThanOrEqual(6);
  });

  it("Notificaciones returns one row per kind for the caller", async () => {
    const data = await asViewer(viewer(me), () => actions.getAjustesNotificacionesPageData({}));
    expect(data.preferences.rows).toHaveLength(8);
  });

  it("Integraciones reads the DB only: no token refresh, no write", async () => {
    const before = await db
      .select({ accessToken: schema.googleOauthAccounts.accessToken, expiresAt: schema.googleOauthAccounts.expiresAt })
      .from(schema.googleOauthAccounts)
      .where(eq(schema.googleOauthAccounts.staffId, me));

    const { result, statements } = await countQueries(() =>
      asViewer(viewer(me), () => actions.getAjustesIntegracionesPageData({})),
    );

    expect(oauth.refreshStaffAccessToken).not.toHaveBeenCalled();
    expect(statements.every((s) => /^\s*(select|with)\b/i.test(s.sql))).toBe(true);
    expect(Object.keys(result).sort()).toEqual(["drive", "gmail"]);
    expect(Object.keys(result.drive).sort()).toEqual(["configured", "hasDriveGrant"]);

    const after = await db
      .select({ accessToken: schema.googleOauthAccounts.accessToken, expiresAt: schema.googleOauthAccounts.expiresAt })
      .from(schema.googleOauthAccounts)
      .where(eq(schema.googleOauthAccounts.staffId, me));
    expect(after).toEqual(before);
  });
});
