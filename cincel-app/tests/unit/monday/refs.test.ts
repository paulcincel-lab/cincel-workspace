// @vitest-environment node
/**
 * lib/import/refs.ts against a real Postgres. Runs only when TEST_DATABASE_URL
 * points at a migrated database (`npm run db:migrate`); every test works
 * inside a transaction that is rolled back, so the database is left as found.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import * as schema from "@/lib/db/schema";
import {
  DuplicateImportRefError,
  IMPORT_REFS_CHUNK,
  findImportRef,
  findImportRefs,
  insertImportRef,
  insertImportRefs,
  type ImportDb,
} from "@/lib/import/refs";

const url = process.env.TEST_DATABASE_URL;

class Rollback extends Error {}

describe("lib/import has no app-only imports", () => {
  it("never imports server-only or lib/db/client", () => {
    const dir = join(__dirname, "../../../lib/import");
    for (const file of readdirSync(dir)) {
      const src = readFileSync(join(dir, file), "utf8");
      expect(src, file).not.toMatch(/from\s+["']server-only["']|import\s+["']server-only["']/);
      expect(src, file).not.toMatch(/(from|import)\s+["'][^"']*db\/client["']/);
    }
  });
});

describe.skipIf(!url)("import_refs helpers (test DB)", () => {
  const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(sql, { schema });

  afterAll(() => sql.end({ timeout: 5 }));

  /** Runs `fn` in a transaction with a fresh batch, then rolls it back. */
  async function inBatch(fn: (tx: ImportDb, batchId: string) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        const [admin] = await tx
          .insert(schema.staff)
          .values({ name: "Import admin" })
          .returning({ id: schema.staff.id });
        const [batch] = await tx
          .insert(schema.importBatches)
          .values({
            accountId: "acc-1",
            exportedAt: new Date("2026-10-01T00:00:00Z"),
            exportPath: "exports/acme",
            mapping: {},
            appliedById: admin.id,
          })
          .returning({ id: schema.importBatches.id });
        await fn(tx, batch.id);
        throw new Rollback();
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      });
  }

  const rowId = () => crypto.randomUUID();

  beforeAll(async () => {
    await sql`select 1 from core.import_refs limit 0`;
  });

  it("inserts one ref and looks it up by key, carrying row_updated_at and data", async () => {
    await inBatch(async (tx, batchId) => {
      const updatedAt = new Date("2026-10-02T10:00:00Z");
      const id = rowId();
      const inserted = await insertImportRef(tx, {
        source: "monday",
        entity: "task",
        externalId: "111",
        rowId: id,
        batchId,
        data: { source: { boardId: "9", groupId: "g1" } },
        rowUpdatedAt: updatedAt,
      });
      expect(inserted.rowId).toBe(id);
      expect(inserted.createdAt).toBeInstanceOf(Date);

      const found = await findImportRef(tx, { source: "monday", entity: "task", externalId: "111" });
      expect(found).toMatchObject({ rowId: id, batchId, rowUpdatedAt: updatedAt });
      expect(found?.data).toEqual({ source: { boardId: "9", groupId: "g1" } });

      expect(
        await findImportRef(tx, { source: "monday", entity: "project", externalId: "111" }),
      ).toBeNull();
      expect(
        await findImportRef(tx, { source: "monday", entity: "task", externalId: "112" }),
      ).toBeNull();
    });
  });

  it("defaults data and row_updated_at to null", async () => {
    await inBatch(async (tx, batchId) => {
      const row = await insertImportRef(tx, {
        source: "monday",
        entity: "history_event",
        externalId: "u1",
        rowId: rowId(),
        batchId,
      });
      expect(row.data).toBeNull();
      expect(row.rowUpdatedAt).toBeNull();
    });
  });

  it("refuses a duplicate key with DuplicateImportRefError", async () => {
    await inBatch(async (tx, batchId) => {
      const ref = { source: "monday", entity: "task" as const, externalId: "dup", batchId };
      await insertImportRef(tx, { ...ref, rowId: rowId() });

      // A savepoint keeps the outer transaction usable after the failure.
      const err = await tx
        .transaction((sp) => insertImportRef(sp, { ...ref, rowId: rowId() }))
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(DuplicateImportRefError);
      expect((err as DuplicateImportRefError).keys).toEqual([
        { source: "monday", entity: "task", externalId: "dup" },
      ]);

      // Same external id under another entity is a different key.
      await insertImportRef(tx, { ...ref, entity: "checklist_item", rowId: rowId() });
    });
  });

  it("inserts a batch across chunks and returns rows in input order", async () => {
    await inBatch(async (tx, batchId) => {
      const n = IMPORT_REFS_CHUNK + 5;
      const refs = Array.from({ length: n }, (_, i) => ({
        source: "monday",
        entity: "task" as const,
        externalId: `item-${i}`,
        rowId: rowId(),
        batchId,
        rowUpdatedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, i % 60)),
      }));
      const rows = await insertImportRefs(tx, refs);
      expect(rows.map((r) => r.externalId)).toEqual(refs.map((r) => r.externalId));

      const ids = [...refs.map((r) => r.externalId), "missing", "item-0"];
      const found = await findImportRefs(tx, "monday", "task", ids);
      expect(found.size).toBe(n);
      expect(found.get("item-7")?.rowId).toBe(refs[7].rowId);
      expect(found.get("item-7")?.rowUpdatedAt).toEqual(refs[7].rowUpdatedAt);
      expect(found.has("missing")).toBe(false);

      expect((await findImportRefs(tx, "monday", "project", ids)).size).toBe(0);
      expect((await findImportRefs(tx, "monday", "task", [])).size).toBe(0);
      expect(await insertImportRefs(tx, [])).toEqual([]);
    });
  });

  it("refuses a batch that repeats a key before writing anything", async () => {
    await inBatch(async (tx, batchId) => {
      const base = { source: "monday", entity: "task" as const, batchId };
      const err = await insertImportRefs(tx, [
        { ...base, externalId: "a", rowId: rowId() },
        { ...base, externalId: "b", rowId: rowId() },
        { ...base, externalId: "a", rowId: rowId() },
      ]).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(DuplicateImportRefError);
      expect((err as DuplicateImportRefError).keys).toEqual([
        { source: "monday", entity: "task", externalId: "a" },
      ]);
      expect((await findImportRefs(tx, "monday", "task", ["a", "b"])).size).toBe(0);
    });
  });

  it("refuses a batch that hits an existing key", async () => {
    await inBatch(async (tx, batchId) => {
      const base = { source: "monday", entity: "contact" as const, batchId };
      await insertImportRef(tx, { ...base, externalId: "c1", rowId: rowId() });

      const err = await tx
        .transaction((sp) =>
          insertImportRefs(sp, [
            { ...base, externalId: "c2", rowId: rowId() },
            { ...base, externalId: "c1", rowId: rowId() },
          ]),
        )
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(DuplicateImportRefError);
      expect((await findImportRefs(tx, "monday", "contact", ["c1", "c2"])).size).toBe(1);
    });
  });
});
