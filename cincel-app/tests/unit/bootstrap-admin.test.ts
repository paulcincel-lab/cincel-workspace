// @vitest-environment node
/**
 * scripts/bootstrap-admin.mjs. The env parsing always runs; the database cases
 * run only when TEST_DATABASE_URL points at a migrated database, each inside a
 * transaction that is rolled back.
 */
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { verifyPassword } from "@/lib/auth/password";
import {
  bootstrapAdminFromEnv,
  ensureBootstrapAdmin,
  passwordAuthEnabledFromEnv,
} from "@/scripts/bootstrap-admin.mjs";

const url = process.env.TEST_DATABASE_URL;

class Rollback extends Error {}

describe("bootstrapAdminFromEnv", () => {
  it("is null when both are empty", () => {
    expect(bootstrapAdminFromEnv({})).toBeNull();
    expect(
      bootstrapAdminFromEnv({
        BOOTSTRAP_ADMIN_EMAIL: " ",
        BOOTSTRAP_ADMIN_PASSWORD: "",
      }),
    ).toBeNull();
  });

  it("normalizes the email and keeps the password as given", () => {
    expect(
      bootstrapAdminFromEnv({
        BOOTSTRAP_ADMIN_EMAIL: " Admin@Example.dev ",
        BOOTSTRAP_ADMIN_PASSWORD: " pw 1 ",
      }),
    ).toEqual({ email: "admin@example.dev", password: " pw 1 " });
  });

  it("refuses only one of the two, or a malformed email", () => {
    expect(() =>
      bootstrapAdminFromEnv({ BOOTSTRAP_ADMIN_EMAIL: "a@b.dev" }),
    ).toThrow(/set together/);
    expect(() =>
      bootstrapAdminFromEnv({ BOOTSTRAP_ADMIN_PASSWORD: "x" }),
    ).toThrow(/set together/);
    expect(() =>
      bootstrapAdminFromEnv({
        BOOTSTRAP_ADMIN_EMAIL: "nope",
        BOOTSTRAP_ADMIN_PASSWORD: "x",
      }),
    ).toThrow(/not an email/);
  });
});

describe("passwordAuthEnabledFromEnv", () => {
  it("is true unless AUTH_PASSWORD_ENABLED is false", () => {
    expect(passwordAuthEnabledFromEnv({})).toBe(true);
    expect(passwordAuthEnabledFromEnv({ AUTH_PASSWORD_ENABLED: "true" })).toBe(true);
    expect(passwordAuthEnabledFromEnv({ AUTH_PASSWORD_ENABLED: "off" })).toBe(true);
    expect(passwordAuthEnabledFromEnv({ AUTH_PASSWORD_ENABLED: "" })).toBe(true);
    expect(passwordAuthEnabledFromEnv({ AUTH_PASSWORD_ENABLED: "false" })).toBe(false);
    expect(passwordAuthEnabledFromEnv({ AUTH_PASSWORD_ENABLED: " False " })).toBe(false);
  });
});

describe("ensureBootstrapAdmin with passwords disabled", () => {
  it("skips without touching the database", async () => {
    const sql = () => {
      throw new Error("no query expected");
    };
    expect(
      await ensureBootstrapAdmin(sql, { email: "a@b.dev", password: "x" }, { passwordEnabled: false }),
    ).toEqual(["skipped, passwords disabled"]);
  });
});

describe.skipIf(!url)("ensureBootstrapAdmin (test DB)", () => {
  const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
  afterAll(() => sql.end());

  const email = "bootstrap-admin-test@example.dev";

  async function inTx(fn: (tx: postgres.TransactionSql) => Promise<void>) {
    await sql
      .begin(async (tx) => {
        await fn(tx);
        throw new Rollback();
      })
      .catch((error) => {
        if (!(error instanceof Rollback)) throw error;
      });
  }

  async function read(tx: postgres.TransactionSql) {
    const [row] = await tx`
      select s.id, s.role, s.active, c.password_hash, c.salt, c.enabled, c.must_change_password
      from core.staff s left join core.auth_credentials c on c.staff_id = s.id
      where lower(s.email) = ${email} and s.deleted_at is null`;
    return row;
  }

  it("creates the admin and a working password, then does nothing on repeat", async () => {
    await inTx(async (tx) => {
      expect(
        await ensureBootstrapAdmin(tx, { email, password: "first-pass" }),
      ).toEqual(["staff created", "password set"]);
      const row = await read(tx);
      expect(row.role).toBe("Administrador");
      expect(row.active).toBe(true);
      expect(row.enabled).toBe(true);
      expect(row.must_change_password).toBe(false);
      expect(
        await verifyPassword("first-pass", row.password_hash, row.salt),
      ).toBe(true);

      expect(
        await ensureBootstrapAdmin(tx, { email, password: "first-pass" }),
      ).toEqual([]);
    });
  });

  it("promotes an existing member and replaces a changed or disabled password", async () => {
    await inTx(async (tx) => {
      await tx`insert into core.staff (name, email, role, active) values ('Bootstrap Test', ${email}, 'Colaborador', false)`;
      expect(
        await ensureBootstrapAdmin(tx, { email, password: "first-pass" }),
      ).toEqual(["staff set to Administrador", "password set"]);

      expect(
        await ensureBootstrapAdmin(tx, { email, password: "second-pass" }),
      ).toEqual(["password updated"]);
      let row = await read(tx);
      expect(row.role).toBe("Administrador");
      expect(row.active).toBe(true);
      expect(
        await verifyPassword("second-pass", row.password_hash, row.salt),
      ).toBe(true);

      await tx`update core.auth_credentials set enabled = false where staff_id = ${row.id}`;
      expect(
        await ensureBootstrapAdmin(tx, { email, password: "second-pass" }),
      ).toEqual(["password updated"]);
      row = await read(tx);
      expect(row.enabled).toBe(true);
    });
  });

  it("does not create or re-enable the credential when passwords are disabled", async () => {
    await inTx(async (tx) => {
      expect(
        await ensureBootstrapAdmin(tx, { email, password: "first-pass" }, { passwordEnabled: false }),
      ).toEqual(["skipped, passwords disabled"]);
      expect(await read(tx)).toBeUndefined();

      await ensureBootstrapAdmin(tx, { email, password: "first-pass" });
      let row = await read(tx);
      await tx`update core.auth_credentials set enabled = false where staff_id = ${row.id}`;
      expect(
        await ensureBootstrapAdmin(tx, { email, password: "other-pass" }, { passwordEnabled: false }),
      ).toEqual(["skipped, passwords disabled"]);
      row = await read(tx);
      expect(row.enabled).toBe(false);
      expect(await verifyPassword("first-pass", row.password_hash, row.salt)).toBe(true);
    });
  });
});
