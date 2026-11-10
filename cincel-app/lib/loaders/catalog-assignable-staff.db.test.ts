// @vitest-environment node
/**
 * `loadCatalogAssignableStaff` against a real Postgres: with a tramo, each
 * person carries `openCount` / `overdueCount` (their open tasks in that
 * tramo, overdue = due before today in the org time zone); without one the
 * counts are absent. Runs only when TEST_DATABASE_URL points at a migrated
 * database. Every row a test creates carries a per-run marker and is deleted
 * afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);
/** 12:00 in Mexico City on Monday 2026-11-09; far from midnight in any American or European zone. */
const NOW = new Date("2026-11-09T18:00:00Z");

describe.skipIf(!url)("loadCatalogAssignableStaff · per-person load (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { loadCatalogAssignableStaff } = await import("@/lib/loaders/catalog");
  type User = Parameters<typeof loadCatalogAssignableStaff>[0];

  const ids = { staff: [] as string[], projects: [] as string[], workflows: [] as string[], tasks: [] as string[] };
  let ana = "";
  let luis = "";
  let sofia = "";
  let tramo = "";
  let otherTramo = "";
  let project = "";
  let deletedProject = "";

  async function addStaff(label: string): Promise<string> {
    const [row] = await db
      .insert(schema.staff)
      .values({ name: `Carga ${run} ${label}`, email: `carga-${run}-${label}@cincel.example`, role: "Colaborador", active: true, capacity: 8 })
      .returning({ id: schema.staff.id });
    ids.staff.push(row.id);
    return row.id;
  }

  async function addWorkflow(label: string): Promise<string> {
    const [row] = await db
      .insert(schema.workflows)
      .values({ key: `carga-${run}-${label}`, name: `Carga ${run} ${label}`, sortOrder: 90 })
      .returning({ id: schema.workflows.id });
    ids.workflows.push(row.id);
    return row.id;
  }

  async function addProject(label: string): Promise<string> {
    const [row] = await db
      .insert(schema.projects)
      .values({ name: `Carga ${run} ${label}`, managerId: ana, progress: 0, status: "activo" })
      .returning({ id: schema.projects.id });
    ids.projects.push(row.id);
    return row.id;
  }

  async function addTask(label: string, values: Partial<typeof schema.tasks.$inferInsert>): Promise<void> {
    const [row] = await db
      .insert(schema.tasks)
      .values({
        projectId: project,
        workflowId: tramo,
        kind: "usuario",
        title: `Carga ${run} ${label}`,
        createdById: ana,
        ...values,
      })
      .returning({ id: schema.tasks.id });
    ids.tasks.push(row.id);
  }

  const user = { member: { id: "x", name: "x" }, email: "x@cincel.example", access: "Administrador" } as unknown as User;

  beforeAll(async () => {
    ana = await addStaff("ana");
    luis = await addStaff("luis");
    sofia = await addStaff("sofia");
    tramo = await addWorkflow("tramo");
    otherTramo = await addWorkflow("otro");
    project = await addProject("obra");
    deletedProject = await addProject("borrado");

    // Ana: 3 open in the tramo, 2 of them overdue (commitment, else delivery date).
    await addTask("ana vencida compromiso", { managerId: ana, commitmentDate: "2026-11-01" });
    await addTask("ana vencida entrega", { managerId: ana, deliveryDate: "2026-11-02" });
    await addTask("ana a tiempo", { managerId: ana, deliveryDate: "2026-11-30" });
    // Not counted: closed, archived, deleted, another tramo, a deleted project.
    await addTask("ana completada", { managerId: ana, status: "completado", closedAt: new Date(), commitmentDate: "2026-11-01" });
    await addTask("ana archivada", { managerId: ana, archived: true });
    await addTask("ana borrada", { managerId: ana, deletedAt: new Date() });
    await addTask("ana otro tramo", { managerId: ana, workflowId: otherTramo });
    await addTask("ana proyecto borrado", { managerId: ana, projectId: deletedProject });
    await db.update(schema.projects).set({ deletedAt: new Date() }).where(inArray(schema.projects.id, [deletedProject]));
    // Luis: 1 open, due today (not overdue).
    await addTask("luis hoy", { managerId: luis, commitmentDate: "2026-11-09" });
  });

  afterAll(async () => {
    if (ids.tasks.length) await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, ids.tasks));
    if (ids.tasks.length) await db.delete(schema.tasks).where(inArray(schema.tasks.id, ids.tasks));
    if (ids.projects.length) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, ids.projects));
      await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    }
    if (ids.workflows.length) await db.delete(schema.workflows).where(inArray(schema.workflows.id, ids.workflows));
    if (ids.staff.length) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.actorId, ids.staff));
      await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
    }
  });

  it("counts open and overdue tasks per person in the tramo", async () => {
    const rows = await loadCatalogAssignableStaff(user, { workflowId: tramo }, { now: NOW });
    const byId = new Map(rows.map((r) => [r.id, r]));
    expect(byId.get(ana)).toMatchObject({ openCount: 3, overdueCount: 2 });
    expect(byId.get(luis)).toMatchObject({ openCount: 1, overdueCount: 0 });
    expect(byId.get(sofia)).toMatchObject({ openCount: 0, overdueCount: 0 });
  });

  it("counts only the tramo asked for", async () => {
    const rows = await loadCatalogAssignableStaff(user, { workflowId: otherTramo }, { now: NOW });
    expect(rows.find((r) => r.id === ana)).toMatchObject({ openCount: 1, overdueCount: 0 });
  });

  it("has no counts without a tramo", async () => {
    const rows = await loadCatalogAssignableStaff(user, { workflowId: null }, { now: NOW });
    const row = rows.find((r) => r.id === ana);
    expect(row).toBeDefined();
    expect(row).not.toHaveProperty("openCount");
    expect(row).not.toHaveProperty("overdueCount");
  });
});
