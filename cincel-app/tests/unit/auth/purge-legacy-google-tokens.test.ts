// @vitest-environment node
/**
 * Cleanup migration for legacy Google token rows (BE §A.3, §A.8 step 5).
 *
 * The static checks always run. The integration block needs TEST_DATABASE_URL
 * pointing at a migrated database; it seeds rows, runs the migration SQL again
 * inside a transaction and rolls it back.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import * as schema from "@/lib/db/schema";
import journal from "@/lib/db/migrations/meta/_journal.json";

const MIGRATIONS = join(__dirname, "../../../lib/db/migrations");
const TAG = "0021_purge_legacy_google_tokens";
const SQL_TEXT = readFileSync(join(MIGRATIONS, `${TAG}.sql`), "utf8");

/** Statements of the migration, split on drizzle's breakpoint marker, comments dropped. */
const statements = SQL_TEXT.split("--> statement-breakpoint")
  .map((s) =>
    s
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n")
      .trim(),
  )
  .filter(Boolean);

describe("purge legacy google_oauth_accounts migration", () => {
  it("is registered in the drizzle journal after the portal migration", () => {
    const tags = journal.entries.map((e) => e.tag);
    expect(tags).toContain(TAG);
    expect(tags.indexOf(TAG)).toBeGreaterThan(tags.indexOf("0020_portal"));
  });

  it("only deletes google_oauth_accounts rows whose google_sub is null", () => {
    expect(statements).toEqual([`DELETE FROM "core"."google_oauth_accounts" WHERE "google_sub" IS NULL;`]);
  });

  it("does not change the schema", () => {
    expect(SQL_TEXT).not.toMatch(/\b(ALTER|DROP|CREATE|TRUNCATE)\b/i);
  });
});

const url = process.env.TEST_DATABASE_URL;

class Rollback extends Error {}

const LEGACY = "33333333-3333-4333-8333-333333333333";
const LINKED = "44444444-4444-4444-8444-444444444444";

describe.skipIf(!url)("purge legacy google_oauth_accounts migration (test DB)", () => {
  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  afterAll(() => client.end({ timeout: 5 }));

  it("removes rows without google_sub and keeps rows with it", async () => {
    await db
      .transaction(async (tx) => {
        await tx.insert(schema.staff).values([
          { id: LEGACY, name: "Legacy Token", email: "legacy.474@example.com" },
          { id: LINKED, name: "Linked Token", email: "linked.474@example.com" },
        ]);
        const expiresAt = new Date(Date.now() + 3600_000);
        await tx.insert(schema.googleOauthAccounts).values([
          {
            staffId: LEGACY,
            email: "legacy.474@example.com",
            accessToken: "legacy-access",
            refreshToken: "legacy-refresh",
            scope: "https://www.googleapis.com/auth/drive.readonly",
            googleSub: null,
            expiresAt,
          },
          {
            staffId: LINKED,
            email: "linked.474@example.com",
            accessToken: "enc:linked-access",
            refreshToken: "enc:linked-refresh",
            scope: "https://www.googleapis.com/auth/drive.readonly",
            googleSub: "sub-474",
            expiresAt,
          },
        ]);

        for (const statement of statements) await tx.execute(sql.raw(statement));

        const nullLeft = await tx.execute(
          sql`select count(*)::int as n from core.google_oauth_accounts where google_sub is null`,
        );
        expect(Number((nullLeft as unknown as { n: number }[])[0].n)).toBe(0);

        const rows = await tx
          .select()
          .from(schema.googleOauthAccounts)
          .where(inArray(schema.googleOauthAccounts.staffId, [LEGACY, LINKED]));
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          staffId: LINKED,
          googleSub: "sub-474",
          accessToken: "enc:linked-access",
          refreshToken: "enc:linked-refresh",
        });

        // Running it on a table with no legacy rows is a no-op.
        for (const statement of statements) await tx.execute(sql.raw(statement));
        const again = await tx
          .select()
          .from(schema.googleOauthAccounts)
          .where(inArray(schema.googleOauthAccounts.staffId, [LEGACY, LINKED]));
        expect(again).toHaveLength(1);

        throw new Rollback();
      })
      .catch((e) => {
        if (!(e instanceof Rollback)) throw e;
      });
  });
});
