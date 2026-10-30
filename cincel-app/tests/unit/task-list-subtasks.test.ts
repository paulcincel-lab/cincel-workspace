// @vitest-environment node
/**
 * Task list DTO fields for subtasks and dependencies (parentTaskId,
 * parentTitle, subtaskCount, subtaskDoneCount, waitingOn) against a real
 * Postgres. Runs only when TEST_DATABASE_URL points at a migrated database;
 * every test runs inside a transaction that is rolled back.
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
  listBoard,
  listMyTasks,
  listTasks,
} from "@/lib/repositories/tasks-repository";

const url = process.env.TEST_DATABASE_URL;

class Rollback extends Error {}

describe.skipIf(!url)(
  "task list subtask and dependency fields (test DB)",
  () => {
    const sql = postgres(url ?? "", { max: 1, onnotice: () => {} });
    const db = drizzle(sql, { schema });

    afterAll(() => sql.end({ timeout: 5 }));

    type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

    async function inTx(
      fn: (
        tx: Tx,
        ctx: { projectId: string; staffId: string },
      ) => Promise<void>,
    ) {
      await db
        .transaction(async (tx) => {
          holder.db = tx;
          const [person] = await tx
            .insert(schema.staff)
            .values({ name: "Ana Prueba" })
            .returning();
          const [client] = await tx
            .insert(schema.contacts)
            .values({ type: "cliente", name: "Cliente DTO" })
            .returning();
          const [project] = await tx
            .insert(schema.projects)
            .values({ name: "Proyecto DTO", clientId: client.id })
            .returning();
          await fn(tx, { projectId: project.id, staffId: person.id });
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
      ctx: { projectId: string; staffId: string },
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

    const byTitle = <T extends { title: string }>(rows: T[], title: string) => {
      const found = rows.find((r) => r.title === title);
      if (!found) throw new Error(`missing ${title}`);
      return found;
    };

    it("counts live subtasks and the completed ones, and links children to their parent", async () => {
      await inTx(async (tx, ctx) => {
        const parent = await addTask(tx, ctx, "Padre");
        await addTask(tx, ctx, "Hija 1", {
          parentTaskId: parent.id,
          status: "completado",
        });
        await addTask(tx, ctx, "Hija 2", { parentTaskId: parent.id });
        await addTask(tx, ctx, "Hija 3", {
          parentTaskId: parent.id,
          status: "en_proceso",
        });
        await addTask(tx, ctx, "Hija borrada", {
          parentTaskId: parent.id,
          deletedAt: new Date(),
        });
        await addTask(tx, ctx, "Hija archivada", {
          parentTaskId: parent.id,
          archived: true,
          status: "completado",
        });

        const rows = await listTasks({ projectId: ctx.projectId });
        const p = byTitle(rows, "Padre");
        expect(p).toMatchObject({
          parentTaskId: null,
          parentTitle: null,
          subtaskCount: 3,
          subtaskDoneCount: 1,
        });

        const child = byTitle(rows, "Hija 2");
        expect(child).toMatchObject({
          parentTaskId: parent.id,
          parentTitle: "Padre",
          subtaskCount: 0,
          subtaskDoneCount: 0,
        });

        const mine = await listMyTasks(ctx.staffId, {
          projectId: ctx.projectId,
        });
        expect(byTitle(mine, "Padre")).toMatchObject({
          subtaskCount: 3,
          subtaskDoneCount: 1,
        });
        expect(byTitle(mine, "Hija 1")).toMatchObject({ parentTitle: "Padre" });
      });
    });

    it("keeps parentTaskId but no parentTitle when the parent was deleted", async () => {
      await inTx(async (tx, ctx) => {
        const parent = await addTask(tx, ctx, "Padre eliminado", {
          deletedAt: new Date(),
        });
        await addTask(tx, ctx, "Huérfana", { parentTaskId: parent.id });

        const rows = await listTasks({ projectId: ctx.projectId });
        expect(rows.map((r) => r.title)).toEqual(["Huérfana"]);
        expect(rows[0]).toMatchObject({
          parentTaskId: parent.id,
          parentTitle: null,
        });
      });
    });

    it("waitingOn ignores completado, deleted and archived dependencies", async () => {
      await inTx(async (tx, ctx) => {
        const waiting = await addTask(tx, ctx, "En espera");
        const open1 = await addTask(tx, ctx, "Abierta", {
          status: "pendiente",
        });
        const open2 = await addTask(tx, ctx, "Bloqueada", {
          status: "bloqueado",
        });
        const done = await addTask(tx, ctx, "Terminada", {
          status: "completado",
        });
        const deleted = await addTask(tx, ctx, "Eliminada", {
          deletedAt: new Date(),
        });
        const archived = await addTask(tx, ctx, "Archivada", {
          archived: true,
        });
        const free = await addTask(tx, ctx, "Libre");
        const onlyClosed = await addTask(tx, ctx, "Solo cerradas");

        await tx.insert(schema.taskDependencies).values([
          { taskId: waiting.id, dependsOnTaskId: open1.id },
          { taskId: waiting.id, dependsOnTaskId: open2.id },
          { taskId: waiting.id, dependsOnTaskId: done.id },
          { taskId: waiting.id, dependsOnTaskId: deleted.id },
          { taskId: waiting.id, dependsOnTaskId: archived.id },
          { taskId: onlyClosed.id, dependsOnTaskId: done.id },
          { taskId: onlyClosed.id, dependsOnTaskId: deleted.id },
        ]);

        const rows = await listTasks({ projectId: ctx.projectId });
        expect(byTitle(rows, "En espera").waitingOn).toBe(2);
        expect(byTitle(rows, "Solo cerradas").waitingOn).toBe(0);
        expect(byTitle(rows, "Libre").waitingOn).toBe(0);
        // The blocking side isn't counted as waiting.
        expect(byTitle(rows, "Abierta").waitingOn).toBe(0);

        await tx
          .update(schema.tasks)
          .set({ status: "completado" })
          .where(eq(schema.tasks.id, open1.id));
        const after = await listTasks({ projectId: ctx.projectId });
        expect(byTitle(after, "En espera").waitingOn).toBe(1);
        expect(free.id).toBeTruthy();
      });
    });

    it("still lists every task once, so board and calendar counts don't change", async () => {
      await inTx(async (tx, ctx) => {
        const parent = await addTask(tx, ctx, "Padre", {
          commitmentDate: "2026-11-02",
        });
        await addTask(tx, ctx, "Hija A", {
          parentTaskId: parent.id,
          commitmentDate: "2026-11-03",
        });
        const childB = await addTask(tx, ctx, "Hija B", {
          parentTaskId: parent.id,
          status: "completado",
        });
        await tx
          .insert(schema.taskDependencies)
          .values({ taskId: parent.id, dependsOnTaskId: childB.id });

        const rows = await listTasks({ projectId: ctx.projectId });
        expect(rows).toHaveLength(3);

        const board = await listBoard({ projectId: ctx.projectId });
        expect(board.pendiente).toHaveLength(2);
        expect(board.completado).toHaveLength(1);
      });
    });
  },
);
