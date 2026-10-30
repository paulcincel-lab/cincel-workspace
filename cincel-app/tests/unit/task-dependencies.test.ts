// @vitest-environment node
/**
 * Task dependency repository (add / remove / list, error codes and cycle
 * detection) against a real Postgres. Runs only when TEST_DATABASE_URL
 * points at a migrated database; every test runs inside a transaction that
 * is rolled back.
 */
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return holder.db;
  },
}));

import {
  addTaskDependency,
  listTaskDependencies,
  removeTaskDependency,
} from "@/lib/repositories/task-dependencies-repository";

const url = process.env.TEST_DATABASE_URL;

class Rollback extends Error {}

describe.skipIf(!url)("task dependencies (test DB)", () => {
  const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(sql, { schema });

  afterAll(() => sql.end({ timeout: 5 }));

  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  type Ctx = { projectId: string; otherProjectId: string; staffId: string };

  async function inTx(fn: (tx: Tx, ctx: Ctx) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        holder.db = tx;
        const [person] = await tx
          .insert(schema.staff)
          .values({ name: "Ana Prueba" })
          .returning();
        const [client] = await tx
          .insert(schema.contacts)
          .values({ type: "cliente", name: "Cliente Dependencias" })
          .returning();
        const [project, other] = await tx
          .insert(schema.projects)
          .values([
            { name: "Proyecto A", clientId: client.id },
            { name: "Proyecto B", clientId: client.id },
          ])
          .returning();
        await fn(tx, {
          projectId: project.id,
          otherProjectId: other.id,
          staffId: person.id,
        });
        throw new Rollback();
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      })
      .finally(() => {
        holder.db = null;
      });
  }

  async function addTask(
    tx: Tx,
    ctx: Ctx,
    title: string,
    extra: Partial<typeof schema.tasks.$inferInsert> = {},
  ) {
    const [row] = await tx
      .insert(schema.tasks)
      .values({
        projectId: ctx.projectId,
        kind: "usuario",
        title,
        createdById: ctx.staffId,
        managerId: ctx.staffId,
        ...extra,
      })
      .returning();
    return row;
  }

  it("adds a dependency and lists it on both sides as TaskRef", async () => {
    await inTx(async (tx, ctx) => {
      const a = await addTask(tx, ctx, "Obra", {
        commitmentDate: "2026-11-10",
      });
      const b = await addTask(tx, ctx, "Planos", {
        commitmentDate: "2026-11-02",
        status: "en_proceso",
      });
      await addTaskDependency(a.id, b.id);

      await expect(listTaskDependencies(a.id)).resolves.toEqual({
        dependsOn: [
          {
            id: b.id,
            title: "Planos",
            status: "en_proceso",
            managerName: "Ana Prueba",
            commitmentDate: "2026-11-02",
          },
        ],
        blocks: [],
      });
      await expect(listTaskDependencies(b.id)).resolves.toEqual({
        dependsOn: [],
        blocks: [
          {
            id: a.id,
            title: "Obra",
            status: "pendiente",
            managerName: "Ana Prueba",
            commitmentDate: "2026-11-10",
          },
        ],
      });
    });
  });

  it("refuses self, duplicate, other project and missing tasks", async () => {
    await inTx(async (tx, ctx) => {
      const a = await addTask(tx, ctx, "A");
      const b = await addTask(tx, ctx, "B");
      const elsewhere = await addTask(tx, ctx, "Fuera", {
        projectId: ctx.otherProjectId,
      });
      const deleted = await addTask(tx, ctx, "Borrada", {
        deletedAt: new Date(),
      });

      await expect(addTaskDependency(a.id, a.id)).rejects.toThrow(/^SELF/);
      await expect(addTaskDependency(a.id, elsewhere.id)).rejects.toThrow(
        /^OTHER_PROJECT/,
      );
      await expect(addTaskDependency(a.id, deleted.id)).rejects.toThrow(
        /^NOT_FOUND/,
      );
      await expect(
        addTaskDependency(a.id, "00000000-0000-4000-8000-000000000000"),
      ).rejects.toThrow(/^NOT_FOUND/);

      await addTaskDependency(a.id, b.id);
      await expect(addTaskDependency(a.id, b.id)).rejects.toThrow(/^DUPLICATE/);
    });
  });

  it("refuses direct and indirect cycles", async () => {
    await inTx(async (tx, ctx) => {
      const a = await addTask(tx, ctx, "A");
      const b = await addTask(tx, ctx, "B");
      const c = await addTask(tx, ctx, "C");
      await addTaskDependency(a.id, b.id);
      await expect(addTaskDependency(b.id, a.id)).rejects.toThrow(/^CYCLE/);

      await addTaskDependency(b.id, c.id);
      await expect(addTaskDependency(c.id, a.id)).rejects.toThrow(/^CYCLE/);
      // Same direction as the chain is fine.
      await expect(addTaskDependency(a.id, c.id)).resolves.toBeUndefined();
    });
  });

  it("removes a dependency and reports a missing one", async () => {
    await inTx(async (tx, ctx) => {
      const a = await addTask(tx, ctx, "A");
      const b = await addTask(tx, ctx, "B");
      await addTaskDependency(a.id, b.id);
      await removeTaskDependency(a.id, b.id);
      await expect(listTaskDependencies(a.id)).resolves.toEqual({
        dependsOn: [],
        blocks: [],
      });
      await expect(removeTaskDependency(a.id, b.id)).rejects.toThrow(
        /^NOT_FOUND/,
      );
    });
  });

  it("leaves deleted tasks out of the lists", async () => {
    await inTx(async (tx, ctx) => {
      const a = await addTask(tx, ctx, "A");
      const b = await addTask(tx, ctx, "B");
      await addTaskDependency(a.id, b.id);
      await tx
        .update(schema.tasks)
        .set({ deletedAt: new Date() })
        .where(eq(schema.tasks.id, b.id));
      await expect(listTaskDependencies(a.id)).resolves.toEqual({
        dependsOn: [],
        blocks: [],
      });
    });
  });
});
