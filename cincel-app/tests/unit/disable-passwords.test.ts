// @vitest-environment node
/**
 * scripts/disable-passwords.ts against TEST_DATABASE_URL (a migrated database),
 * each case inside a transaction that is rolled back. Skipped without it.
 */
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import { disablePasswords } from "@/scripts/disable-passwords";

const url = process.env.TEST_DATABASE_URL;

class Rollback extends Error {}

describe.skipIf(!url)("disablePasswords (test DB)", () => {
  const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
  afterAll(() => sql.end());

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

  async function addStaff(tx: postgres.TransactionSql, email: string, googleSub: string | null) {
    const [row] = await tx<{ id: string }[]>`
      insert into core.staff (name, email, role, active, google_sub)
      values (${email}, ${email}, 'Colaborador', true, ${googleSub})
      returning id`;
    await tx`
      insert into core.auth_credentials (staff_id, password_hash, salt, enabled, must_change_password)
      values (${row.id}, 'hash', 'salt', true, true)`;
    return row.id;
  }

  async function credential(tx: postgres.TransactionSql, staffId: string) {
    const [row] = await tx<{ enabled: boolean; must_change_password: boolean; password_hash: string }[]>`
      select enabled, must_change_password, password_hash from core.auth_credentials where staff_id = ${staffId}`;
    return row;
  }

  it("disables only staff with google_sub, and a second run changes nothing", async () => {
    await inTx(async (tx) => {
      const linked = await addStaff(tx, "disable-pw-linked@example.dev", "google-sub-disable-pw-test");
      const unlinked = await addStaff(tx, "disable-pw-unlinked@example.dev", null);

      const first = await disablePasswords(tx);
      expect(first).toContain(linked);
      expect(first).not.toContain(unlinked);
      expect(await credential(tx, linked)).toEqual({ enabled: false, must_change_password: false, password_hash: "hash" });
      expect(await credential(tx, unlinked)).toEqual({ enabled: true, must_change_password: true, password_hash: "hash" });

      expect(await disablePasswords(tx)).toEqual([]);
      expect(await credential(tx, linked)).toEqual({ enabled: false, must_change_password: false, password_hash: "hash" });
      expect(await credential(tx, unlinked)).toEqual({ enabled: true, must_change_password: true, password_hash: "hash" });
    });
  });
});
