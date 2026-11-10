// @vitest-environment node
/**
 * `listTasksPage` with `orderBy: "retraso"` (Tareas Analítico, #988) against
 * a real Postgres. Runs only when TEST_DATABASE_URL points at a migrated
 * database; every test runs inside a transaction that is rolled back.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import type { TaskListRow, ViewerScope } from "@/lib/types/core";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return holder.db;
  },
}));

import { listTasksPage } from "@/lib/repositories/tasks-repository";

const url = process.env.TEST_DATABASE_URL;

const MEMBER: ViewerScope = { staffId: "", isAdmin: false };
const TODAY = "2026-11-09";

class Rollback extends Error {}

describe.skipIf(!url)("listTasksPage orderBy retraso (test DB)", () => {
  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  afterAll(() => client.end({ timeout: 5 }));

  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

  async function inTx(fn: (tx: Tx, ctx: { marker: string; projectId: string; staffId: string }) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        holder.db = tx;
        const marker = `retraso-${crypto.randomUUID().slice(0, 8)}`;
        const [manager] = await tx.insert(schema.staff).values({ name: "Ana Retraso" }).returning();
        const [project] = await tx.insert(schema.projects).values({ name: `Proyecto ${marker}` }).returning();
        await fn(tx, { marker, projectId: project.id, staffId: manager.id });
        throw new Rollback();
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      })
      .finally(() => {
        holder.db = null;
      });
  }

  it("orderBy retraso sorts days late desc, then due, then closed", async () => {
    await inTx(async (tx, ctx) => {
      const add = async (title: string, extra: Partial<typeof schema.tasks.$inferInsert>) => {
        await tx.insert(schema.tasks).values({
          projectId: ctx.projectId,
          kind: "usuario",
          title: `${title} ${ctx.marker}`,
          createdById: ctx.staffId,
          ...extra,
        });
      };
      await add("a-tiempo-lejos", { commitmentDate: "2026-12-01" });
      await add("cerrada-vieja", { commitmentDate: "2026-09-01", status: "completado" });
      await add("tarde-3", { commitmentDate: "2026-11-06" });
      await add("sin-fecha", {});
      await add("tarde-12-entrega", { deliveryDate: "2026-10-28" });
      await add("a-tiempo-cerca", { commitmentDate: "2026-11-12" });
      await add("cerrada-nueva", { commitmentDate: "2026-11-20", status: "completado" });
      await add("tarde-9", { commitmentDate: "2026-10-31" });

      const expected = [
        "tarde-12-entrega",
        "tarde-9",
        "tarde-3",
        "a-tiempo-cerca",
        "a-tiempo-lejos",
        "sin-fecha",
        "cerrada-vieja",
        "cerrada-nueva",
      ];

      // One page.
      const page = await listTasksPage({ search: ctx.marker, today: TODAY }, MEMBER, {
        cursor: null,
        limit: 50,
        orderBy: "retraso",
      });
      const names = (rows: TaskListRow[]) => rows.map((r) => r.title.replace(` ${ctx.marker}`, ""));
      expect(names(page.rows)).toEqual(expected);
      expect(page.total).toBe(8);
      expect(page.nextCursor).toBeNull();

      // Pages of 3 continue the same order without gaps or repeats.
      const rows: TaskListRow[] = [];
      let cursor: string | null = null;
      for (let guard = 0; guard < 10; guard++) {
        const next = await listTasksPage({ search: ctx.marker, today: TODAY }, MEMBER, {
          cursor,
          limit: 3,
          orderBy: "retraso",
        });
        expect(next.total).toBe(8);
        rows.push(...next.rows);
        cursor = next.nextCursor;
        if (!cursor) break;
      }
      expect(names(rows)).toEqual(expected);
    });
  });

  it("rejects a cursor of the other order", async () => {
    await inTx(async (tx, ctx) => {
      for (let i = 0; i < 3; i++) {
        await tx.insert(schema.tasks).values({
          projectId: ctx.projectId,
          kind: "usuario",
          title: `t${i} ${ctx.marker}`,
          createdById: ctx.staffId,
        });
      }
      const first = await listTasksPage({ search: ctx.marker }, MEMBER, { cursor: null, limit: 1 });
      expect(first.nextCursor).not.toBeNull();
      await expect(
        listTasksPage({ search: ctx.marker }, MEMBER, { cursor: first.nextCursor, limit: 1, orderBy: "retraso" }),
      ).rejects.toThrow("INVALID");
    });
  });
});
