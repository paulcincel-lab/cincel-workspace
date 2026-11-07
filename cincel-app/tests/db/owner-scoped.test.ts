// @vitest-environment node
/**
 * Owner-scoped CRUD helper (redesign BE §8.0.3, §16) against a real Postgres:
 * one shared suite, parameterized over every table that is an `ownerScoped`
 * instance. Another staff's row → FORBIDDEN, a missing row → NOT_FOUND, and
 * `staffId` always comes from the session argument. Runs only when
 * TEST_DATABASE_URL points at a migrated database; the two staff rows carry a
 * per-run marker and are deleted afterwards (their rows cascade).
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

type Values = Record<string, unknown>;

/** How the suite builds rows of one table. */
type Fixture = {
  name: string;
  /** Insert values without `staffId`; `n` keeps them distinct. */
  values(n: number): Values;
  /** A patch and the field it changes. */
  patch: { field: string; value: unknown };
  /** An id no row has (format of the table's primary key). */
  missingId(): string;
  softDelete: boolean;
};

const FIXTURES: Fixture[] = [
  {
    name: "notes",
    values: (n) => ({ title: `Nota ${run} ${n}`, body: "Texto" }),
    patch: { field: "title", value: `Nota editada ${run}` },
    missingId: () => randomUUID(),
    softDelete: true,
  },
  {
    name: "checklists",
    values: (n) => ({ title: `Lista ${run} ${n}` }),
    patch: { field: "title", value: `Lista editada ${run}` },
    missingId: () => randomUUID(),
    softDelete: true,
  },
  {
    name: "reminders",
    values: (n) => ({ text: `Recordatorio ${run} ${n}`, dueAt: new Date(Date.now() + (n + 1) * 3_600_000) }),
    patch: { field: "text", value: `Recordatorio editado ${run}` },
    missingId: () => randomUUID(),
    softDelete: false,
  },
  {
    name: "notifications",
    values: (n) => ({ kind: "sistema", title: `Aviso ${run} ${n}`, inApp: true }),
    patch: { field: "title", value: `Aviso editado ${run}` },
    missingId: () => randomUUID(),
    softDelete: false,
  },
  {
    name: "gmailThreads",
    values: (n) => ({
      id: `thread-${run}-${n}-${randomUUID().slice(0, 8)}`,
      subject: `Asunto ${run} ${n}`,
      receivedAt: new Date(Date.now() - n * 60_000),
    }),
    patch: { field: "subject", value: `Asunto editado ${run}` },
    missingId: () => `thread-missing-${run}`,
    softDelete: false,
  },
  {
    name: "assistantThreads",
    values: (n) => ({ id: randomUUID(), title: `Conversación ${run} ${n}` }),
    patch: { field: "title", value: `Conversación editada ${run}` },
    missingId: () => randomUUID(),
    softDelete: true,
  },
  {
    name: "timeEntries",
    values: (n) => {
      const startedAt = new Date(Date.UTC(2030, 0, 1 + n, 15));
      return {
        workDate: `2030-01-${String(1 + n).padStart(2, "0")}`,
        startedAt,
        endedAt: new Date(startedAt.getTime() + 8 * 3_600_000),
        closedBy: "user",
        source: "sidebar",
      };
    },
    patch: { field: "note", value: `Corrección ${run}` },
    missingId: () => randomUUID(),
    softDelete: false,
  },
];

describe.skipIf(!url)("ownerScoped helper (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { ownerScoped, nextOwnerCursor } = await import("@/lib/repositories/owner-scoped");

  let ownerId = "";
  let otherId = "";

  beforeAll(async () => {
    const members = await db
      .insert(schema.staff)
      .values([
        { name: `Dueño ${run}`, role: "Colaborador" },
        { name: `Otra persona ${run}`, role: "Colaborador" },
      ])
      .returning({ id: schema.staff.id });
    ownerId = members[0]!.id;
    otherId = members[1]!.id;
  });

  afterAll(async () => {
    const ids = [ownerId, otherId].filter(Boolean);
    if (ids.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids));
  });

  it("covers every owner-scoped table of BE §8.0.3", () => {
    expect(FIXTURES.map((f) => f.name).sort()).toEqual(
      ["assistantThreads", "checklists", "gmailThreads", "notes", "notifications", "reminders", "timeEntries"].sort(),
    );
  });

  describe.each(FIXTURES)("$name", (fixture) => {
    const table = (schema as unknown as Record<string, Parameters<typeof ownerScoped>[0]>)[fixture.name]!;
    const repo = ownerScoped(table);
    let seq = 0;
    const next = () => fixture.values(seq++);
    const field = (row: unknown, key: string) => (row as Values)[key];

    it("insert takes staffId from the session argument, never from the values", async () => {
      const row = await repo.insert(db, ownerId, { ...next(), staffId: otherId } as never);
      expect(field(row, "staffId")).toBe(ownerId);
    });

    it("list returns only the caller's rows", async () => {
      const own = await repo.insert(db, ownerId, next() as never);
      const foreign = await repo.insert(db, otherId, next() as never);
      const ids = (await repo.list(db, ownerId)).map((r) => field(r, "id"));
      expect(ids).toContain(field(own, "id"));
      expect(ids).not.toContain(field(foreign, "id"));
      for (const row of await repo.list(db, ownerId)) expect(field(row, "staffId")).toBe(ownerId);
    });

    it("list honours where, limit and cursor", async () => {
      const all = await repo.list(db, ownerId);
      expect(all.length).toBeGreaterThanOrEqual(2);
      const first = await repo.list(db, ownerId, { limit: 1 });
      expect(first).toHaveLength(1);
      const cursor = nextOwnerCursor({ limit: 1 }, first);
      expect(cursor).toBe("1");
      const second = await repo.list(db, ownerId, { limit: 1, cursor: cursor! });
      expect(second).toHaveLength(1);
      expect(field(second[0], "id")).not.toBe(field(first[0], "id"));

      const target = all[0]!;
      const idColumn = (table as unknown as { id: Parameters<typeof eq>[0] }).id;
      const filtered = await repo.list(db, ownerId, { where: eq(idColumn, field(target, "id")) });
      expect(filtered.map((r) => field(r, "id"))).toEqual([field(target, "id")]);
      await expect(repo.list(db, ownerId, { cursor: "x" })).rejects.toThrow(/^INVALID/);
    });

    it("get returns the caller's row, FORBIDDEN for another staff's, NOT_FOUND when missing", async () => {
      const own = await repo.insert(db, ownerId, next() as never);
      const foreign = await repo.insert(db, otherId, next() as never);
      expect(field(await repo.get(db, ownerId, field(own, "id") as string), "id")).toBe(field(own, "id"));
      await expect(repo.get(db, ownerId, field(foreign, "id") as string)).rejects.toThrow(/^FORBIDDEN/);
      await expect(repo.get(db, ownerId, fixture.missingId())).rejects.toThrow(/^NOT_FOUND/);
      await expect(repo.get(db, ownerId, "not-an-id")).rejects.toThrow(/^NOT_FOUND/);
    });

    it("update patches the caller's row and keeps the owner; refuses other staff's and missing rows", async () => {
      const own = await repo.insert(db, ownerId, next() as never);
      const foreign = await repo.insert(db, otherId, next() as never);
      const { field: key, value } = fixture.patch;

      const updated = await repo.update(db, ownerId, field(own, "id") as string, {
        [key]: value,
        staffId: otherId,
      } as never);
      expect(field(updated, key)).toBe(value);
      expect(field(updated, "staffId")).toBe(ownerId);

      await expect(
        repo.update(db, ownerId, field(foreign, "id") as string, { [key]: value } as never),
      ).rejects.toThrow(/^FORBIDDEN/);
      const untouched = await repo.get(db, otherId, field(foreign, "id") as string);
      expect(field(untouched, key)).toBe(field(foreign, key));

      await expect(repo.update(db, ownerId, fixture.missingId(), { [key]: value } as never)).rejects.toThrow(
        /^NOT_FOUND/,
      );
    });

    it("lockForUpdate locks the caller's row inside a transaction with the same owner rules", async () => {
      const own = await repo.insert(db, ownerId, next() as never);
      const foreign = await repo.insert(db, otherId, next() as never);
      await db.transaction(async (tx) => {
        const locked = await repo.lockForUpdate(tx, ownerId, field(own, "id") as string);
        expect(field(locked, "id")).toBe(field(own, "id"));
      });
      await expect(
        db.transaction((tx) => repo.lockForUpdate(tx, ownerId, field(foreign, "id") as string)),
      ).rejects.toThrow(/^FORBIDDEN/);
      await expect(db.transaction((tx) => repo.lockForUpdate(tx, ownerId, fixture.missingId()))).rejects.toThrow(
        /^NOT_FOUND/,
      );
    });

    if (fixture.softDelete) {
      it("softDelete hides the caller's row, can be undone, and refuses other staff's and missing rows", async () => {
        const own = await repo.insert(db, ownerId, next() as never);
        const foreign = await repo.insert(db, otherId, next() as never);
        const id = field(own, "id") as string;

        await repo.softDelete(db, ownerId, id);
        await expect(repo.get(db, ownerId, id)).rejects.toThrow(/^NOT_FOUND/);
        expect((await repo.list(db, ownerId)).map((r) => field(r, "id"))).not.toContain(id);
        expect(field(await repo.get(db, ownerId, id, { includeDeleted: true }), "deletedAt")).toBeInstanceOf(Date);
        await expect(repo.softDelete(db, ownerId, id)).rejects.toThrow(/^NOT_FOUND/);

        const restored = await repo.update(db, ownerId, id, { deletedAt: null } as never, { includeDeleted: true });
        expect(field(restored, "deletedAt")).toBeNull();
        expect(field(await repo.get(db, ownerId, id), "id")).toBe(id);

        await expect(repo.softDelete(db, ownerId, field(foreign, "id") as string)).rejects.toThrow(/^FORBIDDEN/);
        expect(field(await repo.get(db, otherId, field(foreign, "id") as string), "deletedAt")).toBeNull();
        await expect(repo.softDelete(db, ownerId, fixture.missingId())).rejects.toThrow(/^NOT_FOUND/);
      });
    } else {
      it("softDelete refuses a table without deleted_at and leaves the row", async () => {
        const own = await repo.insert(db, ownerId, next() as never);
        await expect(repo.softDelete(db, ownerId, field(own, "id") as string)).rejects.toThrow(/^INVALID/);
        expect(field(await repo.get(db, ownerId, field(own, "id") as string), "id")).toBe(field(own, "id"));
      });
    }
  });

  it("gmail_threads: the same Gmail thread id in two mailboxes stays separate", async () => {
    const repo = ownerScoped(schema.gmailThreads);
    const id = `thread-shared-${run}`;
    await repo.insert(db, ownerId, { id, subject: "Mío", receivedAt: new Date() });
    await repo.insert(db, otherId, { id, subject: "Suyo", receivedAt: new Date() });

    expect((await repo.get(db, ownerId, id)).subject).toBe("Mío");
    await repo.update(db, ownerId, id, { subject: "Mío editado" });
    expect((await repo.get(db, otherId, id)).subject).toBe("Suyo");
    expect((await repo.get(db, ownerId, id)).subject).toBe("Mío editado");
  });
});
