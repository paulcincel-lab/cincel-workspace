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
    ).toEqual({ email: "admin@example.dev", password: " pw 1 ", name: "Administrador" });
  });

  it("reads BOOTSTRAP_ADMIN_NAME, defaulting to Administrador when blank", () => {
    const base = { BOOTSTRAP_ADMIN_EMAIL: "a@b.dev", BOOTSTRAP_ADMIN_PASSWORD: "x" };
    expect(bootstrapAdminFromEnv({ ...base, BOOTSTRAP_ADMIN_NAME: " Paula Ruiz " })?.name).toBe("Paula Ruiz");
    expect(bootstrapAdminFromEnv({ ...base, BOOTSTRAP_ADMIN_NAME: "  " })?.name).toBe("Administrador");
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

describe("ensureBootstrapAdmin display name", () => {
  type Call = { text: string; values: unknown[] };

  // Fake tagged-template client: answers the staff lookup with `existing` and records every query.
  function fakeSql(existing: Record<string, unknown> | undefined) {
    const calls: Call[] = [];
    const sql = (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?").replace(/\s+/g, " ").trim();
      calls.push({ text, values });
      if (text.startsWith("select id, name, email, role, active from core.staff")) return existing ? [existing] : [];
      if (text.startsWith("insert into core.staff")) {
        return [{ id: "new-id", name: values[0], email: values[1], role: values[2], active: true }];
      }
      return [];
    };
    return { sql, calls };
  }
  const admin = { email: "admin@example.dev", password: "pw", name: "Administrador" };

  it("creates a new admin with the display name, not the email", async () => {
    const { sql, calls } = fakeSql(undefined);
    expect(await ensureBootstrapAdmin(sql, admin)).toContain("staff created");
    const insert = calls.find((c) => c.text.startsWith("insert into core.staff"));
    expect(insert?.values.slice(0, 2)).toEqual(["Administrador", "admin@example.dev"]);
  });

  it("renames an existing row only while its name is still the email", async () => {
    const member = { id: "s1", email: "Admin@Example.dev", role: "Administrador", active: true };
    const renamed = fakeSql({ ...member, name: "Admin@Example.dev" });
    expect(await ensureBootstrapAdmin(renamed.sql, { ...admin, name: "Paula Ruiz" })).toContain("name set");
    const update = renamed.calls.find((c) => c.text.startsWith("update core.staff set name"));
    expect(update?.values).toEqual(["Paula Ruiz", "s1"]);

    const kept = fakeSql({ ...member, name: "Paula Ruiz" });
    expect(await ensureBootstrapAdmin(kept.sql, admin)).not.toContain("name set");
    expect(kept.calls.some((c) => c.text.startsWith("update core.staff set name"))).toBe(false);
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
      select s.id, s.name, s.role, s.active, c.password_hash, c.salt, c.enabled, c.must_change_password
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
      expect(row.name).toBe("Administrador");
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

  it("renames a row still named after its email once, then leaves it alone", async () => {
    await inTx(async (tx) => {
      await tx`insert into core.staff (name, email, role, active) values (${email}, ${email}, 'Administrador', true)`;
      expect(
        await ensureBootstrapAdmin(tx, { email, password: "first-pass", name: "Equipo Cincel" }),
      ).toEqual(["name set", "password set"]);
      expect((await read(tx)).name).toBe("Equipo Cincel");

      await tx`update core.staff set name = 'Paula Ruiz' where lower(email) = ${email}`;
      expect(
        await ensureBootstrapAdmin(tx, { email, password: "first-pass", name: "Equipo Cincel" }),
      ).toEqual([]);
      expect((await read(tx)).name).toBe("Paula Ruiz");
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
