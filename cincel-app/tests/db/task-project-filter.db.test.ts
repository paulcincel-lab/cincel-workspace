// @vitest-environment node
/**
 * The Tareas Proyecto multi-select (#1045) against a real Postgres. Runs only
 * when TEST_DATABASE_URL points at a migrated database; every test runs
 * inside a transaction that is rolled back.
 *
 * - `projectIds`: the rows, totals and summary of any of those projects, ANDed
 *   with `projectId`;
 * - `taskFacets`: the options ignore the selection, the chip counts follow it,
 *   and each project carries its open and overdue tasks.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import type { ViewerScope } from "@/lib/types/core";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return holder.db;
  },
}));

import { listTasksPage, taskFacets, taskSummary } from "@/lib/repositories/tasks-repository";

const url = process.env.TEST_DATABASE_URL;

const MEMBER: ViewerScope = { staffId: "", isAdmin: false };
const TODAY = "2026-11-10";

class Rollback extends Error {}

describe.skipIf(!url)("Tareas Proyecto filter (test DB)", () => {
  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  afterAll(() => client.end({ timeout: 5 }));

  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  type Ctx = { marker: string; alfa: string; beta: string; gama: string };

  async function inTx(fn: (tx: Tx, ctx: Ctx) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        holder.db = tx;
        const marker = `pf-${crypto.randomUUID().slice(0, 8)}`;
        const [manager] = await tx.insert(schema.staff).values({ name: "Ana Proyectos" }).returning();
        const projects = await tx
          .insert(schema.projects)
          .values([{ name: `Alfa ${marker}` }, { name: `Beta ${marker}` }, { name: `Gama ${marker}` }])
          .returning();
        const [alfa, beta, gama] = projects.map((p) => p.id);
        const add = (projectId: string, title: string, extra: Partial<typeof schema.tasks.$inferInsert> = {}) =>
          tx.insert(schema.tasks).values({
            projectId,
            kind: "usuario",
            title: `${title} ${marker}`,
            createdById: manager.id,
            managerId: manager.id,
            ...extra,
          });
        // Alfa: 2 open (1 overdue) + 1 completado; Beta: 1 open; Gama: 1 overdue.
        await add(alfa, "A1", { commitmentDate: "2026-11-01" });
        await add(alfa, "A2", { commitmentDate: "2026-12-01" });
        await add(alfa, "A3", { status: "completado" });
        await add(beta, "B1", { commitmentDate: "2026-12-05" });
        await add(gama, "G1", { commitmentDate: "2026-11-02" });
        await fn(tx, { marker, alfa, beta, gama });
        throw new Rollback();
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      })
      .finally(() => {
        holder.db = null;
      });
  }

  it("lists and counts the tasks of any of the selected projects", async () => {
    await inTx(async (_tx, ctx) => {
      const page = await listTasksPage(
        { search: ctx.marker, projectIds: [ctx.alfa, ctx.gama], today: TODAY },
        MEMBER,
        { cursor: null, limit: 30 }
      );
      expect(page.rows.map((r) => r.title.split(" ")[0]).sort()).toEqual(["A1", "A2", "A3", "G1"]);
      expect(page.total).toBe(4);

      // ANDed with the single-project scope (an etapa group).
      const group = await listTasksPage(
        { search: ctx.marker, projectIds: [ctx.alfa, ctx.gama], projectId: ctx.beta },
        MEMBER,
        { cursor: null, limit: 30 }
      );
      expect(group.rows).toEqual([]);

      const summary = await taskSummary({ search: ctx.marker, projectIds: [ctx.alfa, ctx.gama] }, MEMBER, TODAY);
      expect(summary.projects.map((p) => p.project.id).sort()).toEqual([ctx.alfa, ctx.gama].sort());
      expect(summary.totals).toMatchObject({ total: 4, open: 3, overdue: 2, projects: 2 });
    });
  });

  it("facets keep every project as an option with its open and overdue counts", async () => {
    await inTx(async (_tx, ctx) => {
      const facets = await taskFacets(
        { search: ctx.marker, projectIds: [ctx.alfa, ctx.gama], today: TODAY },
        MEMBER,
        { workflowKey: null, projectId: null, projectIds: [ctx.alfa, ctx.gama] }
      );
      const byId = new Map(facets.projects.map((p) => [p.id, p]));
      expect(byId.get(ctx.alfa)).toMatchObject({ count: 3, open: 2, overdue: 1 });
      expect(byId.get(ctx.beta)).toMatchObject({ count: 1, open: 1, overdue: 0 });
      expect(byId.get(ctx.gama)).toMatchObject({ count: 1, open: 1, overdue: 1 });
      // The chip counts follow the selection.
      expect(facets.total).toBe(4);
      expect(facets.mostrar).toEqual({ todas: 4, abiertas: 3, en_retraso: 2 });
    });
  });
});
