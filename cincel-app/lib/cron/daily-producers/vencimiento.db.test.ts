// @vitest-environment node
/**
 * `vencimiento` daily producer against a real Postgres (BE §8.3, §9.3, §13):
 * due tomorrow, overdue, dedupe per day, admin tasks to administrators only,
 * closed tasks and inactive staff excluded. Runs only when TEST_DATABASE_URL
 * points at a migrated database; every test runs inside a transaction that is
 * rolled back, and assertions only look at the rows this test created.
 */
import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
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

import { produceVencimientos, vencimientoProducer } from "./vencimiento";

const url = process.env.TEST_DATABASE_URL;

/** 08:00 in Mexico City on 2026-11-09: today = 2026-11-09, tomorrow = 2026-11-10. */
const NOW = new Date("2026-11-09T14:00:00Z");
const NEXT_DAY = new Date("2026-11-10T14:00:00Z");
const TOMORROW = "2026-11-10";
const OVERDUE = "2026-11-05";

class Rollback extends Error {}

describe.skipIf(!url)("vencimiento producer (test DB)", () => {
  const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(sql, { schema });

  afterAll(() => sql.end({ timeout: 5 }));

  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  type Ctx = {
    managerId: string;
    inactiveId: string;
    adminId: string;
    projectId: string;
    staffIds: string[];
  };

  const run = randomUUID().slice(0, 8);

  async function inTx(fn: (tx: Tx, ctx: Ctx) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        holder.db = tx;
        const [manager, inactive, admin] = await tx
          .insert(schema.staff)
          .values([
            { name: `Ana Vencimiento ${run}`, role: "Colaborador" },
            { name: `Beto Inactivo ${run}`, role: "Colaborador", active: false },
            { name: `Carla Admin ${run}`, role: "Administrador" },
          ])
          .returning();
        const [project] = await tx
          .insert(schema.projects)
          .values({ name: `Proyecto Vencimiento ${run}` })
          .returning();
        await fn(tx, {
          managerId: manager.id,
          inactiveId: inactive.id,
          adminId: admin.id,
          projectId: project.id,
          staffIds: [manager.id, inactive.id, admin.id],
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
    values: Partial<typeof schema.tasks.$inferInsert> & { commitmentDate: string | null },
  ): Promise<string> {
    const [row] = await tx
      .insert(schema.tasks)
      .values({
        projectId: ctx.projectId,
        kind: "usuario",
        title: `Tarea ${randomUUID().slice(0, 6)}`,
        createdById: ctx.managerId,
        managerId: ctx.managerId,
        ...values,
      })
      .returning({ id: schema.tasks.id });
    return row.id;
  }

  async function rowsFor(tx: Tx, taskId: string) {
    return tx
      .select()
      .from(schema.notifications)
      .where(and(eq(schema.notifications.entityId, taskId), eq(schema.notifications.kind, "vencimiento")));
  }

  it("notifies the manager of a task due tomorrow exactly once per day", async () => {
    await inTx(async (tx, ctx) => {
      const taskId = await addTask(tx, ctx, { commitmentDate: TOMORROW });

      await produceVencimientos(tx, NOW);
      await produceVencimientos(tx, NOW);

      const rows = await rowsFor(tx, taskId);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        staffId: ctx.managerId,
        dedupeKey: `vencimiento:${taskId}:2026-11-09`,
        entity: "task",
        url: `/tareas/${taskId}`,
        inApp: true,
        digest: true,
      });
      expect(rows[0].title.startsWith("Vence mañana:")).toBe(true);
    });
  });

  it("re-running through the producer contract creates no duplicates", async () => {
    await inTx(async (tx, ctx) => {
      const taskId = await addTask(tx, ctx, { commitmentDate: TOMORROW });
      const ctxJob = { db: tx, now: NOW, traceId: "test", budgetMs: 10_000 };

      const first = await vencimientoProducer.run(ctxJob);
      const second = await vencimientoProducer.run(ctxJob);

      expect(first.count).toBeGreaterThanOrEqual(1);
      expect(await rowsFor(tx, taskId)).toHaveLength(1);
      // Rows of other live tasks in the DB were deduped too: nothing new on the second run.
      expect(second.count).toBe(0);
    });
  });

  it("notifies an overdue task once per day while it stays overdue", async () => {
    await inTx(async (tx, ctx) => {
      const taskId = await addTask(tx, ctx, { commitmentDate: OVERDUE });

      await produceVencimientos(tx, NOW);
      await produceVencimientos(tx, NOW);
      await produceVencimientos(tx, NEXT_DAY);

      const rows = await rowsFor(tx, taskId);
      expect(rows.map((r) => r.dedupeKey).sort()).toEqual([
        `vencimiento:${taskId}:2026-11-09`,
        `vencimiento:${taskId}:2026-11-10`,
      ]);
      expect(rows.every((r) => r.staffId === ctx.managerId)).toBe(true);
      expect(rows[0].title.startsWith("Tarea vencida:")).toBe(true);
    });
  });

  it("skips tasks due today, later or without a date", async () => {
    await inTx(async (tx, ctx) => {
      const today = await addTask(tx, ctx, { commitmentDate: "2026-11-09" });
      const later = await addTask(tx, ctx, { commitmentDate: "2026-11-20" });
      const undated = await addTask(tx, ctx, { commitmentDate: null });

      await produceVencimientos(tx, NOW);

      for (const id of [today, later, undated]) expect(await rowsFor(tx, id)).toHaveLength(0);
    });
  });

  it("sends admin tasks to administrators only", async () => {
    await inTx(async (tx, ctx) => {
      // Admin task with a non-admin manager: the manager gets nothing, administrators do.
      const nonAdminManaged = await addTask(tx, ctx, { kind: "admin", commitmentDate: TOMORROW });
      // Admin task managed by an administrator: only that administrator.
      const adminManaged = await addTask(tx, ctx, {
        kind: "admin",
        commitmentDate: OVERDUE,
        managerId: ctx.adminId,
      });

      await produceVencimientos(tx, NOW);

      const first = await rowsFor(tx, nonAdminManaged);
      expect(first.some((r) => r.staffId === ctx.adminId)).toBe(true);
      expect(first.some((r) => r.staffId === ctx.managerId)).toBe(false);
      expect(first.some((r) => r.staffId === ctx.inactiveId)).toBe(false);

      const recipients = await tx
        .select({ id: schema.staff.id, role: schema.staff.role })
        .from(schema.staff)
        .where(
          inArray(
            schema.staff.id,
            first.map((r) => r.staffId),
          ),
        );
      expect(recipients.every((r) => r.role?.toLowerCase() === "administrador")).toBe(true);

      const second = await rowsFor(tx, adminManaged);
      expect(second.map((r) => r.staffId)).toEqual([ctx.adminId]);
    });
  });

  it("produces nothing for completed, closing-status, archived or deleted tasks", async () => {
    await inTx(async (tx, ctx) => {
      const [closing] = await tx
        .insert(schema.taskStatuses)
        .values({ name: `Cerrada ${run}`, closes: true })
        .returning();
      const ids = [
        await addTask(tx, ctx, { commitmentDate: TOMORROW, status: "completado", closedAt: NOW }),
        await addTask(tx, ctx, { commitmentDate: OVERDUE, customStatusId: closing.id }),
        await addTask(tx, ctx, { commitmentDate: OVERDUE, archived: true }),
        await addTask(tx, ctx, { commitmentDate: TOMORROW, deletedAt: NOW }),
      ];

      await produceVencimientos(tx, NOW);

      for (const id of ids) expect(await rowsFor(tx, id)).toHaveLength(0);
    });
  });

  it("produces nothing for inactive managers", async () => {
    await inTx(async (tx, ctx) => {
      const taskId = await addTask(tx, ctx, { commitmentDate: TOMORROW, managerId: ctx.inactiveId });

      await produceVencimientos(tx, NOW);

      expect(await rowsFor(tx, taskId)).toHaveLength(0);
      const forInactive = await tx
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.staffId, ctx.inactiveId));
      expect(forInactive).toHaveLength(0);
    });
  });
});
