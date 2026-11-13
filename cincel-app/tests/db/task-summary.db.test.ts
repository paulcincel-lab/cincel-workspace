// @vitest-environment node
/**
 * Tareas Analítico counts (`taskSummary`, #988) against a real Postgres.
 * Runs only when TEST_DATABASE_URL points at a migrated database; every test
 * runs inside a transaction that is rolled back.
 *
 * - one grouping-sets statement returns the etapa, project and total levels;
 * - overdue is `coalesce(commitment, delivery)` before today in America/Mexico_City;
 * - blocked and the days-late sum;
 * - `unfiltered` ignores `mostrar`;
 * - admin tasks only for administrators who ask for them.
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

import { taskSummary } from "@/lib/repositories/tasks-repository";
import { todayInAppTimeZone } from "@/lib/project-flow/admin-tasks";
import { SIN_ETAPA_LABEL, pctVencidas, retrasoPromedio } from "@/lib/tareas/summary";

const url = process.env.TEST_DATABASE_URL;

const ADMIN: ViewerScope = { staffId: "", isAdmin: true };
const MEMBER: ViewerScope = { staffId: "", isAdmin: false };
const TODAY = "2026-11-09";

class Rollback extends Error {}

describe.skipIf(!url)("taskSummary (test DB)", () => {
  const client = postgres(url ?? "", { max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  afterAll(() => client.end({ timeout: 5 }));

  type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
  type Ctx = {
    marker: string;
    managerId: string;
    alpha: string;
    beta: string;
    diseno: string;
    obra: string;
  };

  async function inTx(fn: (tx: Tx, ctx: Ctx) => Promise<void>) {
    await db
      .transaction(async (tx) => {
        holder.db = tx;
        const marker = `resumen-${crypto.randomUUID().slice(0, 8)}`;
        const [manager] = await tx.insert(schema.staff).values({ name: "Ana Resumen" }).returning();
        const [alpha] = await tx.insert(schema.projects).values({ name: `Alfa ${marker}` }).returning();
        const [beta] = await tx.insert(schema.projects).values({ name: `Beta ${marker}` }).returning();
        const [diseno] = await tx
          .insert(schema.workflows)
          .values({ key: `dis-${marker}`, name: "Diseño", sortOrder: 1 })
          .returning();
        const [obra] = await tx
          .insert(schema.workflows)
          .values({ key: `obr-${marker}`, name: "Obra", sortOrder: 2 })
          .returning();
        await fn(tx, { marker, managerId: manager.id, alpha: alpha.id, beta: beta.id, diseno: diseno.id, obra: obra.id });
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
        projectId: ctx.alpha,
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
   * Alfa · Diseño: 2 overdue (3 and 9 days), 1 open on time, 1 completado.
   * Alfa · Obra: 1 overdue by delivery date (12 days), blocked.
   * Alfa · Sin etapa: 1 open without a date.
   * Beta · Diseño: 1 open on time, 1 closed by a custom status that was overdue.
   */
  async function seed(tx: Tx, ctx: Ctx) {
    const [closing] = await tx
      .insert(schema.taskStatuses)
      .values({ name: `Cierra ${ctx.marker}`, closes: true })
      .returning();
    await addTask(tx, ctx, "Planos", { workflowId: ctx.diseno, commitmentDate: "2026-11-06" });
    await addTask(tx, ctx, "Render", { workflowId: ctx.diseno, commitmentDate: "2026-10-31" });
    await addTask(tx, ctx, "Memoria", { workflowId: ctx.diseno, commitmentDate: "2026-11-20" });
    await addTask(tx, ctx, "Hecha", { workflowId: ctx.diseno, commitmentDate: "2026-10-01", status: "completado" });
    await addTask(tx, ctx, "Cimbra", { workflowId: ctx.obra, deliveryDate: "2026-10-28", status: "bloqueado" });
    await addTask(tx, ctx, "Libre", {});
    await addTask(tx, ctx, "Beta abierta", { projectId: ctx.beta, workflowId: ctx.diseno, commitmentDate: "2026-12-01" });
    await addTask(tx, ctx, "Beta cerrada", {
      projectId: ctx.beta,
      workflowId: ctx.diseno,
      commitmentDate: "2026-10-01",
      customStatusId: closing.id,
    });
  }

  it("grouping sets return etapa, project and total rows", async () => {
    await inTx(async (tx, ctx) => {
      await seed(tx, ctx);
      const { result: summary, count } = await countQueries(() => taskSummary({ search: ctx.marker }, MEMBER, TODAY));
      expect(count).toBe(1);

      expect(summary.totals).toEqual({ total: 8, open: 6, overdue: 3, blocked: 1, daysLateSum: 24, projects: 2 });
      // Projects by overdue desc, then name.
      expect(summary.projects.map((p) => p.project.id)).toEqual([ctx.alpha, ctx.beta]);
      const [alpha, beta] = summary.projects;
      expect(alpha).toMatchObject({ total: 6, open: 5, overdue: 3, blocked: 1, daysLateSum: 24 });
      // Etapas by sort order, Sin etapa last.
      expect(alpha.etapas.map((t) => t.etapa.name)).toEqual(["Diseño", "Obra", SIN_ETAPA_LABEL]);
      expect(alpha.etapas[0]).toMatchObject({ total: 4, open: 3, overdue: 2, blocked: 0, daysLateSum: 12 });
      expect(alpha.etapas[2].etapa).toEqual({ id: null, key: null, name: SIN_ETAPA_LABEL, sortOrder: 2147483647 });
      expect(beta).toMatchObject({ total: 2, open: 1, overdue: 0, daysLateSum: 0 });
      // The levels add up.
      for (const p of summary.projects) {
        expect(p.etapas.reduce((sum, t) => sum + t.total, 0)).toBe(p.total);
      }
      expect(pctVencidas(summary.totals)).toBe(50);
      expect(retrasoPromedio(summary.totals)).toBe(8);
    });
  });

  it("overdue uses commitment then delivery in Mexico City", async () => {
    await inTx(async (tx, ctx) => {
      // 03:00 UTC on Nov 10 is still Nov 9 in Mexico City.
      const today = todayInAppTimeZone(new Date("2026-11-10T03:00:00Z"));
      expect(today).toBe("2026-11-09");
      await addTask(tx, ctx, "Vence hoy", { workflowId: ctx.diseno, commitmentDate: "2026-11-09" });
      await addTask(tx, ctx, "Venció ayer", { workflowId: ctx.diseno, commitmentDate: "2026-11-08" });
      // The commitment wins over an earlier delivery date.
      await addTask(tx, ctx, "Compromiso futuro", {
        workflowId: ctx.diseno,
        commitmentDate: "2026-11-15",
        deliveryDate: "2026-11-01",
      });
      await addTask(tx, ctx, "Solo entrega", { workflowId: ctx.diseno, deliveryDate: "2026-11-05" });
      const summary = await taskSummary({ search: ctx.marker }, MEMBER, today);
      expect(summary.totals.overdue).toBe(2);
      expect(summary.totals.daysLateSum).toBe(1 + 4);
    });
  });

  it("blocked and daysLateSum", async () => {
    await inTx(async (tx, ctx) => {
      await seed(tx, ctx);
      const summary = await taskSummary({ search: ctx.marker }, MEMBER, TODAY);
      const obra = summary.projects[0].etapas.find((t) => t.etapa.id === ctx.obra)!;
      expect(obra).toMatchObject({ total: 1, open: 1, overdue: 1, blocked: 1, daysLateSum: 12 });
      // A closed task past its date is neither overdue nor late.
      const beta = summary.projects.find((p) => p.project.id === ctx.beta)!;
      expect(beta.daysLateSum).toBe(0);
      expect(retrasoPromedio(beta)).toBeNull();
    });
  });

  it("unfiltered ignores mostrar", async () => {
    await inTx(async (tx, ctx) => {
      await seed(tx, ctx);
      const late = await taskSummary({ search: ctx.marker, mostrar: "en_retraso" }, MEMBER, TODAY);
      expect(late.totals).toMatchObject({ total: 3, overdue: 3, projects: 1 });
      expect(late.projects.map((p) => p.project.id)).toEqual([ctx.alpha]);
      // Etapas without overdue tasks drop out too.
      expect(late.projects[0].etapas.map((t) => t.etapa.id)).toEqual([ctx.diseno, ctx.obra]);
      expect(late.unfiltered).toMatchObject({ projects: 2, total: 8 });
      const alpha = late.unfiltered.projectList!.find((p) => p.id === ctx.alpha)!;
      expect(alpha.total).toBe(6);
      expect(alpha.byEtapa[ctx.diseno]).toBe(4);
      expect(alpha.byEtapa[""]).toBe(1);

      const open = await taskSummary({ search: ctx.marker, mostrar: "abiertas" }, MEMBER, TODAY);
      expect(open.totals).toMatchObject({ total: 6, open: 6, projects: 2 });
      expect(open.unfiltered).toMatchObject({ projects: 2, total: 8 });

      const all = await taskSummary({ search: ctx.marker }, MEMBER, TODAY);
      expect(all.unfiltered).toMatchObject({ projects: 2, total: 8 });
    });
  });

  it("admin tasks only for admins", async () => {
    await inTx(async (tx, ctx) => {
      await seed(tx, ctx);
      await addTask(tx, ctx, "Administrativa", { kind: "admin", commitmentDate: "2026-11-01" });
      const member = await taskSummary({ search: ctx.marker, kind: ["workflow", "usuario", "admin"] }, MEMBER, TODAY);
      expect(member.totals.total).toBe(8);
      const admin = await taskSummary({ search: ctx.marker, kind: ["workflow", "usuario", "admin"] }, ADMIN, TODAY);
      expect(admin.totals).toMatchObject({ total: 9, overdue: 4 });
      // Without asking, an administrator gets no admin task either (the default kinds).
      const plain = await taskSummary({ search: ctx.marker }, ADMIN, TODAY);
      expect(plain.totals.total).toBe(8);
    });
  });
});
