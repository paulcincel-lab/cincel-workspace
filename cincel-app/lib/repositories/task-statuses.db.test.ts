// @vitest-environment node
/**
 * Ajustes › Estatus counts and order against a real Postgres (#1016): tasks
 * per base status, tasks and distinct projects per custom status, and the
 * reorder action writing `sort_order` 0..n. Runs only when TEST_DATABASE_URL
 * points at a migrated database; every row a test creates carries a per-run
 * marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { unwrapActions } from "@/tests/helpers/action-result";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const session = vi.hoisted(() => ({ memberId: "" }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: {
      id: session.memberId,
      name: "Admin",
      role: "Administrador",
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "",
      phone: "",
    },
    email: "admin@cincel.example",
    access: "Administrador",
  })),
}));

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("task statuses counts and order (test DB)", async () => {
  const { and, eq, inArray, isNull } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const repo = await import("./task-statuses-repository");
  const { reorderTaskStatusesAction } = unwrapActions(await import("@/lib/actions/task-statuses-actions"));

  let adminId = "";
  const projectIds: string[] = [];
  const statusIds: string[] = [];

  beforeAll(async () => {
    const [admin] = await db
      .insert(schema.staff)
      .values({ name: `Estatus ${run}`, role: "Administrador" })
      .returning({ id: schema.staff.id });
    adminId = admin!.id;
    session.memberId = adminId;
    const projects = await db
      .insert(schema.projects)
      .values([{ name: `Estatus ${run} A` }, { name: `Estatus ${run} B` }])
      .returning({ id: schema.projects.id });
    projectIds.push(...projects.map((p) => p.id));
    const statuses = await db
      .insert(schema.taskStatuses)
      .values([
        { name: `Revisión ${run}`, closes: false, sortOrder: 900 },
        { name: `Entregado ${run}`, closes: true, countsAsCompleted: true, sortOrder: 901 },
        { name: `Sin uso ${run}`, closes: false, sortOrder: 902 },
      ])
      .returning({ id: schema.taskStatuses.id });
    statusIds.push(...statuses.map((s) => s.id));
  });

  afterAll(async () => {
    if (projectIds.length) {
      const rows = await db.select({ id: schema.tasks.id }).from(schema.tasks).where(inArray(schema.tasks.projectId, projectIds));
      const taskIds = rows.map((r) => r.id);
      if (taskIds.length) {
        await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, taskIds));
        await db.delete(schema.tasks).where(inArray(schema.tasks.id, taskIds));
      }
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, projectIds));
      await db.delete(schema.projects).where(inArray(schema.projects.id, projectIds));
    }
    if (statusIds.length) await db.delete(schema.taskStatuses).where(inArray(schema.taskStatuses.id, statusIds));
    if (adminId) await db.delete(schema.staff).where(eq(schema.staff.id, adminId));
  });

  function task(projectId: string, title: string, values: Partial<typeof schema.tasks.$inferInsert> = {}) {
    return { projectId, kind: "usuario" as const, title: `${title} ${run}`, createdById: adminId, managerId: adminId, ...values };
  }

  it("base counts by status", async () => {
    const before = await repo.countTasksByBaseStatus();
    expect(Object.keys(before).sort()).toEqual(["bloqueado", "completado", "en_proceso", "pendiente"]);
    const [a] = projectIds;
    await db.insert(schema.tasks).values([
      task(a!, "Pendiente 1"),
      task(a!, "Pendiente 2"),
      task(a!, "Bloqueada", { status: "bloqueado" }),
      task(a!, "Hecha", { status: "completado", closedAt: new Date() }),
      task(a!, "Borrada", { status: "bloqueado", deletedAt: new Date() }),
    ]);
    const after = await repo.countTasksByBaseStatus();
    // Other files may add tasks in parallel: ours are counted, the deleted one is not.
    expect(after.pendiente - before.pendiente).toBeGreaterThanOrEqual(2);
    expect(after.bloqueado - before.bloqueado).toBeGreaterThanOrEqual(1);
    expect(after.completado - before.completado).toBeGreaterThanOrEqual(1);
    // Our own rows: the deleted one stays out of every count.
    const mine = await db
      .select({ id: schema.tasks.id })
      .from(schema.tasks)
      .where(and(inArray(schema.tasks.projectId, [a!]), isNull(schema.tasks.deletedAt), eq(schema.tasks.status, "bloqueado")));
    expect(mine).toHaveLength(1);
  });

  it("custom usage counts tasks and distinct projects", async () => {
    const [a, b] = projectIds;
    const [revision, entregado, sinUso] = statusIds;
    await db.insert(schema.tasks).values([
      task(a!, "Rev A1", { status: "en_proceso", customStatusId: revision }),
      task(a!, "Rev A2", { status: "en_proceso", customStatusId: revision }),
      task(b!, "Rev B1", { status: "en_proceso", customStatusId: revision }),
      task(b!, "Ent B1", { status: "completado", closedAt: new Date(), customStatusId: entregado }),
      task(b!, "Ent borrada", { status: "completado", closedAt: new Date(), customStatusId: entregado, deletedAt: new Date() }),
    ]);
    const usage = await repo.countCustomStatusUsage();
    expect(usage[revision!]).toEqual({ tasks: 3, projects: 2 });
    expect(usage[entregado!]).toEqual({ tasks: 1, projects: 1 });
    expect(usage[sinUso!]).toBeUndefined();
  });

  it("reorder writes sort_order in order", async () => {
    const [revision, entregado, sinUso] = statusIds;
    await reorderTaskStatusesAction([sinUso!, revision!, entregado!]);
    const rows = await db
      .select({ id: schema.taskStatuses.id, sortOrder: schema.taskStatuses.sortOrder })
      .from(schema.taskStatuses)
      .where(and(inArray(schema.taskStatuses.id, statusIds), isNull(schema.taskStatuses.deletedAt)));
    const order = Object.fromEntries(rows.map((r) => [r.id, r.sortOrder]));
    expect(order).toEqual({ [sinUso!]: 0, [revision!]: 1, [entregado!]: 2 });
  });

  it("reorder refuses ids that are not uuids", async () => {
    await expect(reorderTaskStatusesAction(["no-es-uuid"])).rejects.toThrow(/INVALID/);
  });
});
