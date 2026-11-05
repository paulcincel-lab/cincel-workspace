// @vitest-environment node
/**
 * monday people (#689): init ignores deleted users and bots and matches staff by email, then name; "Crear integrante"
 * creates a pending staff member; a rollback removes it unless it has been used since.
 *
 * The DB cases need TEST_DATABASE_URL pointing at a migrated database; each runs in a transaction that is rolled back.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";

import * as schema from "@/lib/db/schema";
import type { ImportDb } from "@/lib/import/refs";
import {
  createdStaffIds,
  createStaffFromMonday,
  CreateStaffRefused,
  keepVerifiedCreatedStaff,
  removeUnusedCreatedStaff,
} from "@/scripts/monday/created-staff";
import { createDbLookups, peopleTargets } from "@/scripts/monday/init";
import { Mapping } from "@/scripts/monday/mapping.schema";

const ANA = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const BETO = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

describe("init people (#689)", () => {
  it("ignores deleted users and bots, matches by email first and then by name", () => {
    const users = [
      { id: "1", name: "Ana Prueba", email: "ANA@example.test", kind: "member" },
      { id: "2", name: "Beto Ejemplo", email: "beto.otro@example.test", kind: "member" },
      { id: "3", name: "Usuario eliminado", email: "u1@deleted.user", kind: "member" },
      { id: "4", name: "monday AI", email: "ai-agent@example.test", kind: "member" },
      { id: "5", name: "Invitada Uno", email: "invitada@example.test", kind: "guest" },
      { id: "6", name: "Nadie Igual", email: "nadie@example.test", kind: "member" },
    ];
    const targets = peopleTargets(
      users,
      new Map([["ana@example.test", ANA]]),
      new Map([
        ["beto ejemplo", BETO],
        ["ana prueba", BETO],
      ]),
    );
    expect(targets).toEqual({
      "1": { action: "staff", staffId: ANA },
      "2": { action: "staff", staffId: BETO },
      "3": { action: "ignore" },
      "4": { action: "ignore" },
      "5": { action: "contact" },
      "6": null,
    });
  });

  it("keeps the created mark through the mapping schema and reads it back", () => {
    const mapping = Mapping.parse({
      version: 1,
      boards: [],
      people: {
        "1": { action: "staff", staffId: ANA, created: true },
        "2": { action: "staff", staffId: BETO },
        "3": { action: "ignore" },
        "4": null,
      },
      options: {},
    });
    expect(mapping.people["1"]).toEqual({ action: "staff", staffId: ANA, created: true });
    expect(createdStaffIds(mapping)).toEqual([ANA]);
    expect(createdStaffIds(null)).toEqual([]);
  });

  it("drops the created mark from staff the run didn't create", () => {
    const mapping = {
      version: 1,
      people: {
        "1": { action: "staff", staffId: ANA, created: true },
        "2": { action: "staff", staffId: BETO, created: true },
        "3": { action: "ignore" },
      },
    };
    const kept = keepVerifiedCreatedStaff(mapping, new Set([BETO]));
    expect(kept.people).toEqual({
      "1": { action: "staff", staffId: ANA },
      "2": { action: "staff", staffId: BETO, created: true },
      "3": { action: "ignore" },
    });
    expect(createdStaffIds(kept)).toEqual([BETO]);
    expect(keepVerifiedCreatedStaff(mapping, new Set([ANA, BETO]))).toBe(mapping);
  });
});

const url = process.env.TEST_DATABASE_URL;

class Rollback extends Error {}

type Row = Record<string, unknown>;

describe.skipIf(!url)("Crear integrante and rollback (test DB)", () => {
  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  afterAll(() => client.end({ timeout: 5 }));

  async function inTx(fn: (tx: ImportDb) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        await fn(tx);
        throw new Rollback();
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      });
  }

  async function one(tx: ImportDb, query: ReturnType<typeof sql>): Promise<Row | undefined> {
    const result = (await tx.execute(query)) as unknown;
    const rows = Array.isArray(result) ? (result as Row[]) : ((result as { rows?: Row[] }).rows ?? []);
    return rows[0];
  }

  /** An applied batch whose mapping marks these staff ids as created by the wizard. */
  async function batchFor(tx: ImportDb, staffIds: string[], status: "applied" | "rolled_back" = "applied") {
    const [admin] = await tx
      .insert(schema.staff)
      .values({ name: `Admin Prueba ${Math.random()}`, email: `admin.${Date.now()}.${Math.random()}@example.test` })
      .returning();
    const people = Object.fromEntries(staffIds.map((id, i) => [`u${i}`, { action: "staff", staffId: id, created: true }]));
    const [batch] = await tx
      .insert(schema.importBatches)
      .values({
        accountId: "created-staff-689",
        exportedAt: new Date("2026-11-01T00:00:00.000Z"),
        exportPath: "/tmp/created-staff-689",
        mapping: { version: 1, boards: [], people, options: {} },
        appliedById: admin.id,
        status,
      })
      .returning();
    return batch.id;
  }

  it("creates a pending staff member from the monday name and email", async () => {
    await inTx(async (tx) => {
      const created = await createStaffFromMonday(tx, {
        id: "m1",
        name: " Persona Nueva 689 ",
        email: "Persona.Nueva.689@Example.test",
        kind: "member",
      });
      expect(created).toMatchObject({ name: "Persona Nueva 689", email: "persona.nueva.689@example.test" });
      const [row] = await tx.select().from(schema.staff).where(eq(schema.staff.id, created.id));
      expect(row).toMatchObject({ kind: "empleado", active: true, googleSub: null, lastLoginAt: null, deletedAt: null });
    });
  });

  it("refuses a name or email already in the team, and deleted users or bots", async () => {
    await inTx(async (tx) => {
      const [taken] = await tx
        .insert(schema.staff)
        .values({ name: "Ocupada 689", email: "ocupada.689@example.test" })
        .returning();
      const byEmail = createStaffFromMonday(tx, { id: "m1", name: "Otro 689", email: "OCUPADA.689@example.test" });
      await expect(byEmail).rejects.toBeInstanceOf(CreateStaffRefused);
      await expect(byEmail).rejects.toMatchObject({ existingId: taken.id });
      await expect(createStaffFromMonday(tx, { id: "m2", name: "ocupada 689", email: null })).rejects.toThrow(
        /ese nombre/,
      );
      await expect(
        createStaffFromMonday(tx, { id: "m3", name: "Eliminado 689", email: "x689@deleted.user" }),
      ).rejects.toBeInstanceOf(CreateStaffRefused);
    });
  });

  it("removes unused created staff on rollback and keeps the ones used since", async () => {
    await inTx(async (tx) => {
      const make = (n: string) => createStaffFromMonday(tx, { id: n, name: `Creada ${n} 689`, email: null });
      const unused = await make("a");
      const signedIn = await make("b");
      const edited = await make("c");
      const pointed = await make("d");
      const shared = await make("e");

      await tx.execute(sql`update core.staff set google_sub = 'sub-689', last_login_at = now() where id = ${signedIn.id}`);
      await tx.execute(sql`update core.staff set updated_at = created_at + interval '1 minute' where id = ${edited.id}`);
      await tx.insert(schema.historyEvents).values({
        entity: "task",
        entityId: unused.id,
        kind: "comentario",
        comment: "Comentario de prueba",
        actorId: pointed.id,
      });
      await batchFor(tx, [shared.id]);
      const batchId = await batchFor(tx, [unused.id, signedIn.id, edited.id, pointed.id, shared.id]);

      const result = await removeUnusedCreatedStaff(tx, batchId);
      expect(result.removed).toEqual([unused.id]);
      expect(result.kept.sort()).toEqual([signedIn.id, edited.id, pointed.id, shared.id].sort());

      const gone = await one(tx, sql`select deleted_at is not null as gone from core.staff where id = ${unused.id}`);
      expect(gone?.gone).toBe(true);
      const live = await tx
        .select({ id: schema.staff.id })
        .from(schema.staff)
        .where(
          and(isNull(schema.staff.deletedAt), inArray(schema.staff.id, [signedIn.id, edited.id, pointed.id, shared.id])),
        );
      expect(live).toHaveLength(4);
    });
  });

  it("ignores a rolled-back batch's mapping when deciding whether staff is still used", async () => {
    await inTx(async (tx) => {
      const member = await createStaffFromMonday(tx, { id: "f", name: "Creada f 689", email: null });
      await batchFor(tx, [member.id], "rolled_back");
      const batchId = await batchFor(tx, [member.id]);
      expect(await removeUnusedCreatedStaff(tx, batchId)).toEqual({ removed: [member.id], kept: [] });
    });
  });

  it("finds a monday person's staff by name in init's DB lookups", async () => {
    await inTx(async (tx) => {
      const [s] = await tx.insert(schema.staff).values({ name: "Init Por Nombre 689" }).returning();
      const found = await createDbLookups(tx).staffByName?.([" init por nombre 689", "Nadie 689"]);
      expect(found).toEqual(new Map([["init por nombre 689", s.id]]));
    });
  });

  it("leaves out a name two live staff share, so init doesn't pick one of them", async () => {
    await inTx(async (tx) => {
      await tx.insert(schema.staff).values([{ name: "Doble Nombre 689" }, { name: "doble nombre 689" }]);
      const [s] = await tx.insert(schema.staff).values({ name: "Unico Nombre 689" }).returning();
      const found = await createDbLookups(tx).staffByName?.(["Doble Nombre 689", "Unico Nombre 689"]);
      expect(found).toEqual(new Map([["unico nombre 689", s.id]]));
      const targets = peopleTargets([{ id: "9", name: "Doble Nombre 689", email: null, kind: "member" }], new Map(), found);
      expect(targets).toEqual({ "9": null });
    });
  });
});
