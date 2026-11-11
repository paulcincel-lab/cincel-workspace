// @vitest-environment node
/**
 * Task lists return top-level tasks only, with their subtasks attached
 * (#1047), against a real Postgres. Runs only when TEST_DATABASE_URL points at
 * a migrated database; every test runs inside a transaction that is rolled back.
 *
 * - `topLevelOnly`: no subtask is a row; rows, totals and cursors count parents;
 * - each row carries `subtaskIds` (children order), `subtaskOpenCount`;
 * - a subtask matching Mostrar or the search brings its parent as context,
 *   with `matchedSubtaskIds`;
 * - `subtaskTotal`, the summary and the facets count parents;
 * - `listTaskChildren`: every parent's children in one statement.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, describe, expect, it, vi } from "vitest";

import * as schema from "@/lib/db/schema";
import type { ViewerScope } from "@/lib/types/core";

import { countQueries } from "../helpers/count-queries";

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/db/client", () => ({
  get db() {
    return holder.db;
  },
}));

import { listTaskChildren, listTasksPage, taskFacets, taskSummary } from "@/lib/repositories/tasks-repository";

const url = process.env.TEST_DATABASE_URL;

const ADMIN: ViewerScope = { staffId: "", isAdmin: true };
const MEMBER: ViewerScope = { staffId: "", isAdmin: false };
const TODAY = "2026-11-10";

class Rollback extends Error {}

describe.skipIf(!url)("task lists with subtasks (test DB)", () => {
  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  afterAll(() => client.end({ timeout: 5 }));

  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  type Ctx = { marker: string; managerId: string; projectId: string };
  type Seeded = Awaited<ReturnType<typeof seed>>;

  async function inTx(fn: (tx: Tx, ctx: Ctx, s: Seeded) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        holder.db = tx;
        const marker = `subt-${crypto.randomUUID().slice(0, 8)}`;
        const [manager] = await tx.insert(schema.staff).values({ name: "Ana Subtareas" }).returning();
        const [project] = await tx.insert(schema.projects).values({ name: `Alfa ${marker}` }).returning();
        const ctx = { marker, managerId: manager.id, projectId: project.id };
        await fn(tx, ctx, await seed(tx, ctx));
        throw new Rollback();
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err;
      })
      .finally(() => {
        holder.db = null;
      });
  }

  async function addTask(tx: Tx, ctx: Ctx, title: string, extra: Partial<typeof schema.tasks.$inferInsert> = {}) {
    const [row] = await tx
      .insert(schema.tasks)
      .values({
        projectId: ctx.projectId,
        kind: "usuario",
        title: `${title} ${ctx.marker}`,
        createdById: ctx.managerId,
        managerId: ctx.managerId,
        ...extra,
      })
      .returning();
    return row;
  }

  /**
   * - Padre (open, due later) with 3 live children: Zeta (overdue), Beta
   *   (completado, due earlier), Gamma (no date); plus one archived and one
   *   deleted child that never count;
   * - Uno (overdue) with one open child;
   * - Sola without children;
   * - Huérfana: a child whose parent was soft-deleted (top-level).
   */
  async function seed(tx: Tx, ctx: Ctx) {
    const padre = await addTask(tx, ctx, "Padre", { commitmentDate: "2026-12-01" });
    const zeta = await addTask(tx, ctx, "Zeta", { parentTaskId: padre.id, commitmentDate: "2026-11-05" });
    const beta = await addTask(tx, ctx, "Beta", { parentTaskId: padre.id, commitmentDate: "2026-11-01", status: "completado" });
    const gamma = await addTask(tx, ctx, "Gamma", { parentTaskId: padre.id });
    await addTask(tx, ctx, "Archivada", { parentTaskId: padre.id, archived: true });
    await addTask(tx, ctx, "Borrada", { parentTaskId: padre.id, deletedAt: new Date() });
    const uno = await addTask(tx, ctx, "Uno", { commitmentDate: "2026-11-02" });
    const unoHija = await addTask(tx, ctx, "Hija de uno", { parentTaskId: uno.id, commitmentDate: "2026-12-20" });
    const sola = await addTask(tx, ctx, "Sola", { commitmentDate: "2026-12-10" });
    const gone = await addTask(tx, ctx, "Ida", { deletedAt: new Date() });
    const huerfana = await addTask(tx, ctx, "Huérfana", { parentTaskId: gone.id, commitmentDate: "2026-12-15" });
    return { padre, zeta, beta, gamma, uno, unoHija, sola, huerfana };
  }

  const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

  it("lists top-level tasks only, each with its children's ids and counts", async () => {
    await inTx(async (_tx, ctx, s) => {
      const { result: page, count } = await countQueries(() =>
        listTasksPage({ search: ctx.marker, topLevelOnly: true, today: TODAY }, MEMBER, { cursor: null, limit: 30 })
      );
      // Children ids, open counts and the subtask total come from the page statement itself.
      expect(count).toBe(1);
      expect(ids(page.rows)).toEqual(ids([s.padre, s.uno, s.sola, s.huerfana]));
      expect(page.total).toBe(4);
      expect(page.subtaskTotal).toBe(4);
      const padre = page.rows.find((r) => r.id === s.padre.id)!;
      // Children order: due date, nulls last.
      expect(padre.subtaskIds).toEqual([s.beta.id, s.zeta.id, s.gamma.id]);
      expect(padre).toMatchObject({ subtaskCount: 3, subtaskDone: 1, subtaskOpenCount: 2 });
      expect(padre.matchedSubtaskIds).toBeUndefined();
      const sola = page.rows.find((r) => r.id === s.sola.id)!;
      expect(sola).toMatchObject({ subtaskCount: 0, subtaskIds: [], subtaskOpenCount: 0 });
      expect(page.rows.find((r) => r.id === s.uno.id)!.subtaskIds).toEqual([s.unoHija.id]);
    });
  });

  it("without topLevelOnly the subtasks are rows again", async () => {
    await inTx(async (_tx, ctx, s) => {
      const page = await listTasksPage({ search: ctx.marker, today: TODAY }, MEMBER, { cursor: null, limit: 30 });
      expect(page.total).toBe(8);
      expect(page.subtaskTotal).toBeUndefined();
      expect(page.rows.map((r) => r.id)).toContain(s.zeta.id);
      expect(page.rows.every((r) => r.matchedSubtaskIds === undefined)).toBe(true);
    });
  });

  it("a subtask matching Mostrar brings its parent as context", async () => {
    await inTx(async (_tx, ctx, s) => {
      const page = await listTasksPage(
        { search: ctx.marker, topLevelOnly: true, mostrar: "en_retraso", today: TODAY },
        MEMBER,
        { cursor: null, limit: 30, orderBy: "retraso" }
      );
      // Uno is overdue itself; Padre isn't, its child Zeta is.
      expect(ids(page.rows)).toEqual(ids([s.padre, s.uno]));
      expect(page.total).toBe(2);
      // The "retraso" order reads the parent's own dates: Uno (overdue) first.
      expect(page.rows.map((r) => r.id)).toEqual([s.uno.id, s.padre.id]);
      const padre = page.rows.find((r) => r.id === s.padre.id)!;
      expect(padre.matchedSubtaskIds).toEqual([s.zeta.id]);
      expect(padre.subtaskIds).toEqual([s.beta.id, s.zeta.id, s.gamma.id]);
      expect(page.rows.find((r) => r.id === s.uno.id)!.matchedSubtaskIds).toBeUndefined();
    });
  });

  it("a search matching only a subtask returns its parent with the match", async () => {
    await inTx(async (_tx, ctx, s) => {
      const page = await listTasksPage({ search: `Gamma ${ctx.marker}`, topLevelOnly: true }, MEMBER, {
        cursor: null,
        limit: 30,
      });
      expect(page.rows.map((r) => r.id)).toEqual([s.padre.id]);
      expect(page.rows[0].matchedSubtaskIds).toEqual([s.gamma.id]);
      expect(page.total).toBe(1);
      expect(page.subtaskTotal).toBe(3);
    });
  });

  it("cursors page through the parents only, with the same total", async () => {
    await inTx(async (_tx, ctx, s) => {
      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const page = await listTasksPage({ search: ctx.marker, topLevelOnly: true, today: TODAY }, MEMBER, {
          cursor,
          limit: 1,
          orderBy: "retraso",
        });
        expect(page.total).toBe(4);
        expect(page.subtaskTotal).toBe(4);
        seen.push(...page.rows.map((r) => r.id));
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor && pages < 10);
      expect(pages).toBe(4);
      expect(seen.sort()).toEqual(ids([s.padre, s.uno, s.sola, s.huerfana]));
    });
  });

  it("listTaskChildren returns every parent's children in one statement", async () => {
    await inTx(async (_tx, _ctx, s) => {
      const { result, count } = await countQueries(() => listTaskChildren([s.padre.id, s.uno.id, s.sola.id], MEMBER));
      expect(count).toBe(1);
      expect(result.get(s.padre.id)!.map((r) => r.id)).toEqual([s.beta.id, s.zeta.id, s.gamma.id]);
      expect(result.get(s.uno.id)!.map((r) => r.id)).toEqual([s.unoHija.id]);
      expect(result.get(s.sola.id)).toEqual([]);
      expect(result.get(s.padre.id)![0]).toMatchObject({ parentTaskId: s.padre.id, status: "completado" });
      expect(await listTaskChildren([], MEMBER)).toEqual(new Map());
    });
  });

  it("listTaskChildren hides an admin parent's children from non-administrators", async () => {
    await inTx(async (tx, ctx) => {
      const admin = await addTask(tx, ctx, "Admin", { kind: "admin" });
      const child = await addTask(tx, ctx, "Hija admin", { parentTaskId: admin.id });
      expect((await listTaskChildren([admin.id], MEMBER)).get(admin.id)).toEqual([]);
      expect((await listTaskChildren([admin.id], ADMIN)).get(admin.id)!.map((r) => r.id)).toEqual([child.id]);
    });
  });

  it("the summary and the facets count parents", async () => {
    await inTx(async (_tx, ctx) => {
      const summary = await taskSummary({ search: ctx.marker, topLevelOnly: true }, MEMBER, TODAY);
      expect(summary.totals.total).toBe(4);
      // Overdue reads the parent's own dates: only Uno.
      expect(summary.totals.overdue).toBe(1);
      const all = await taskSummary({ search: ctx.marker }, MEMBER, TODAY);
      expect(all.totals.total).toBe(8);

      const facets = await taskFacets({ search: ctx.marker, topLevelOnly: true, today: TODAY }, MEMBER);
      expect(facets.total).toBe(4);
      // En retraso as the list shows it: Uno and Padre (through Zeta).
      expect(facets.mostrar).toEqual({ todas: 4, abiertas: 4, en_retraso: 2 });
      const late = await taskFacets(
        { search: ctx.marker, topLevelOnly: true, today: TODAY, mostrar: "en_retraso" },
        MEMBER
      );
      expect(late.total).toBe(2);
    });
  });
});
