// @vitest-environment node
/**
 * Mi espacio's task counts and lists (#1051) against a real Postgres:
 * `getMyTasksSummary` counts in one grouped statement what the three
 * layouts showed from the full list before (KPIs, Tramo chips, board
 * columns, Esencial cards, Analítico groups), and `getMyTasksPage` pages
 * each list on the server. Runs only when TEST_DATABASE_URL points at a
 * migrated database. Every row belongs to per-run staff and projects that
 * are deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { asViewer, type TestViewer } from "@/lib/query/test-utils";

import { countQueries } from "../helpers/count-queries";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("Mi espacio tasks (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const actions = await import("@/lib/actions/page-data/mi-espacio-actions");
  const { todayInAppTimeZone } = await import("@/lib/project-flow/admin-tasks");
  const { addDays } = await import("@/lib/time-tracking/local-time");
  const { sundayOf } = await import("@/lib/my-space/my-tasks");
  const { SIN_TRAMO_KEY } = await import("@/lib/tareas/summary");
  const s = await import("@/lib/my-space/my-tasks-summary");

  const today = todayInAppTimeZone();
  const sunday = sundayOf(today);
  const staffIds: string[] = [];
  const projectIds: string[] = [];
  const workflowIds: string[] = [];
  const statusIds: string[] = [];
  let ana = "";
  let beto = "";
  let lomas = "";
  let torre = "";
  let bodega = "";
  let diseno = { id: "", key: "" };
  let obra = { id: "", key: "" };

  const viewer = (id: string): TestViewer => ({ id, access: "Colaborador" });

  async function addTask(title: string, extra: Partial<typeof schema.tasks.$inferInsert>) {
    const [row] = await db
      .insert(schema.tasks)
      .values({ projectId: lomas, kind: "usuario", title: `${title} ${run}`, createdById: ana, managerId: ana, ...extra })
      .returning({ id: schema.tasks.id });
    return row!.id;
  }

  beforeAll(async () => {
    const staff = await db
      .insert(schema.staff)
      .values([
        { name: `Ana tareas ${run}`, googleSub: `mis-tareas-${run}-ana` },
        { name: `Beto tareas ${run}`, googleSub: `mis-tareas-${run}-beto` },
      ])
      .returning({ id: schema.staff.id });
    [ana, beto] = staff.map((r) => r.id) as [string, string];
    staffIds.push(ana, beto);
    const projects = await db
      .insert(schema.projects)
      .values([{ name: `Casa Lomas ${run}` }, { name: `Torre Sur ${run}` }, { name: `Bodega ${run}` }])
      .returning({ id: schema.projects.id });
    [lomas, torre, bodega] = projects.map((r) => r.id) as [string, string, string];
    projectIds.push(lomas, torre, bodega);
    const tramos = await db
      .insert(schema.workflows)
      .values([
        { key: `dis${run}`, name: `Diseño ${run}`, sortOrder: 901 },
        { key: `obr${run}`, name: `Obra ${run}`, sortOrder: 902 },
      ])
      .returning({ id: schema.workflows.id, key: schema.workflows.key });
    [diseno, obra] = tramos as [typeof diseno, typeof obra];
    workflowIds.push(diseno.id, obra.id);
    const [closing] = await db.insert(schema.taskStatuses).values({ name: `Entregada ${run}`, closes: true }).returning();
    statusIds.push(closing!.id);

    // Casa Lomas · Diseño: overdue 3 d (blocked) and 9 d, one today, one this week (if any day is left), one closed.
    await addTask("Planos", { workflowId: diseno.id, commitmentDate: addDays(today, -3), status: "bloqueado" });
    await addTask("Render", { workflowId: diseno.id, commitmentDate: addDays(today, -9) });
    await addTask("Cotizar", { workflowId: diseno.id, commitmentDate: today });
    await addTask("Hecha", { workflowId: diseno.id, commitmentDate: addDays(today, -20), status: "completado" });
    // Casa Lomas · Obra: later; only a delivery date counts as undated here (commitment only).
    await addTask("Cimbra", { workflowId: obra.id, commitmentDate: addDays(sunday, 3) });
    await addTask("Entrega", { workflowId: obra.id, deliveryDate: addDays(today, -5) });
    // Casa Lomas · Sin tramo: undated.
    await addTask("Libre", {});
    // Torre Sur: Beto's task with Ana as apoyo (mine too), and Beto's own (not mine).
    const apoyo = await addTask("Apoyo", { projectId: torre, managerId: beto, workflowId: diseno.id, commitmentDate: addDays(today, 1) });
    await db.insert(schema.taskSupport).values({ taskId: apoyo, staffId: ana });
    await addTask("Ajena", { projectId: torre, managerId: beto, commitmentDate: addDays(today, -1) });
    // Bodega: one closed by a custom status, nothing open.
    await addTask("Cerrada", { projectId: bodega, workflowId: obra.id, customStatusId: closing!.id, status: "completado" });
    // Deleted and archived tasks never count.
    await addTask("Borrada", { commitmentDate: addDays(today, -1), deletedAt: new Date() });
    await addTask("Archivada", { commitmentDate: addDays(today, -1), archived: true });
  });

  afterAll(async () => {
    if (projectIds.length) {
      await db.delete(schema.tasks).where(inArray(schema.tasks.projectId, projectIds));
      await db.delete(schema.projects).where(inArray(schema.projects.id, projectIds));
    }
    if (statusIds.length) await db.delete(schema.taskStatuses).where(inArray(schema.taskStatuses.id, statusIds));
    if (workflowIds.length) await db.delete(schema.workflows).where(inArray(schema.workflows.id, workflowIds));
    if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
  });

  const summaryOf = (input: Parameters<typeof actions.getMyTasksSummary>[0]) =>
    asViewer(viewer(ana), () => actions.getMyTasksSummary(input));
  const pageOf = (filters: Parameters<typeof actions.getMyTasksPage>[0]["filters"], cursor: string | null = null) =>
    asViewer(viewer(ana), () => actions.getMyTasksPage({ filters, cursor }));
  const titles = (rows: { title: string }[]) => rows.map((r) => r.title.replace(` ${run}`, ""));

  it("KPIs, columns and chips count every open task of mine (Responsable or apoyo) by the commitment date", async () => {
    const summary = await summaryOf({ tramo: null, q: null });
    // Open: Planos, Render, Cotizar, Cimbra, Entrega, Libre, Apoyo.
    expect(summary.all).toMatchObject({ open: 7, overdue: 2, dueToday: 1, projects: 2 });
    const semana = today === sunday ? 0 : 1; // Apoyo is tomorrow: Esta semana unless today is Sunday.
    expect(summary.all.buckets).toEqual({ hoy: 3, semana, despues: 4 - semana });
    expect(summary.tramos.map((t) => [t.key, t.open])).toEqual([
      [diseno.key, 4],
      [obra.key, 2],
    ]);
    expect(summary.shown).toMatchObject({ open: 7, overdue: 2, blocked: 1, daysLateSum: 12, maxDaysLate: 9, closed: 2, projects: 2 });
  });

  it("is one SQL statement (plus the tramo lookup when a tramo is chosen)", async () => {
    const plain = await countQueries(() => summaryOf({ tramo: null, q: null }));
    expect(plain.count).toBe(1);
    const tramo = await countQueries(() => summaryOf({ tramo: diseno.key, q: null }));
    expect(tramo.count).toBe(2);
  });

  it("Analítico groups: overdue projects first, tramos by order with Sin tramo last, closed counted apart", async () => {
    const summary = await summaryOf({ tramo: null, q: null });
    expect(summary.projects.map((p) => p.project.id)).toEqual([lomas, bodega, torre]);
    const [casa, bod, tor] = summary.projects;
    expect(casa).toMatchObject({ open: 6, overdue: 2, maxDaysLate: 9, closed: 1 });
    expect(casa!.tramos.map((t) => [t.tramo.id, t.open, t.overdue, t.blocked, t.closed])).toEqual([
      [diseno.id, 3, 2, 1, 1],
      [obra.id, 2, 0, 0, 0],
      [null, 1, 0, 0, 0],
    ]);
    expect(bod).toMatchObject({ open: 0, closed: 1 });
    expect(tor).toMatchObject({ open: 1, overdue: 0 });
    // Esencial: projects with open tasks, overdue first, then the nearest date.
    expect(summary.esencial.map((p) => [p.project.id, p.open, p.overdue])).toEqual([
      [lomas, 6, 2],
      [torre, 1, 0],
    ]);
    expect(summary.esencial[0]!.nearestDue).toBe(addDays(today, -9));
  });

  it("the filters narrow the groups and the header, never the KPIs or the chips", async () => {
    const tramo = await summaryOf({ tramo: diseno.key, q: null });
    expect(tramo.all.open).toBe(7);
    expect(tramo.tramos).toHaveLength(2);
    expect(tramo.shown).toMatchObject({ open: 4, overdue: 2, projects: 2 });
    expect(tramo.projects.map((p) => p.project.id)).toEqual([lomas, torre]);

    const late = await summaryOf({ tramo: null, q: null, retraso: true });
    expect(late.shown).toMatchObject({ open: 2, overdue: 2, daysLateSum: 12 });
    expect(late.projects.map((p) => p.project.id)).toEqual([lomas]);

    const search = await summaryOf({ tramo: null, q: "planos" });
    expect(search.shown).toMatchObject({ open: 1, overdue: 1, blocked: 1 });

    // A key no live tramo has: nothing matches, the KPIs still count.
    const unknown = await summaryOf({ tramo: "no-existe", q: null });
    expect(unknown.shown.open).toBe(0);
    expect(unknown.all.open).toBe(7);
  });

  it("the search ignores accents and case, in the counts and in the lists", async () => {
    // The titles have no accents: search them with some.
    const accented = await summaryOf({ tramo: null, q: "PLÁNOS" });
    expect(accented.shown).toMatchObject({ open: 1, overdue: 1, blocked: 1 });
    const page = await pageOf({ q: "rénder", orderBy: "retraso" });
    expect(titles(page.rows)).toEqual(["Render"]);
    // LIKE wildcards are matched as text.
    expect((await pageOf({ q: "%", orderBy: "retraso" })).total).toBe(0);
  });

  it("lists: a tramo group in the retraso order, closed ones last with cerradas", async () => {
    const open = await pageOf(s.meTasksGroupFilters({ tramo: null, q: null }, lomas, diseno.key, false));
    expect(titles(open.rows)).toEqual(["Render", "Planos", "Cotizar"]);
    expect(open.total).toBe(3);
    const withClosed = await pageOf(s.meTasksGroupFilters({ tramo: null, q: null }, lomas, diseno.key, true));
    expect(titles(withClosed.rows)).toEqual(["Render", "Planos", "Cotizar", "Hecha"]);
    const sin = await pageOf(s.meTasksGroupFilters({ tramo: null, q: null }, lomas, null, false));
    expect(titles(sin.rows)).toEqual(["Libre"]);
    expect(sin.rows[0]!.workflowId).toBeNull();
    expect((await pageOf({ proyecto: lomas, tramo: SIN_TRAMO_KEY, orderBy: "retraso" })).total).toBe(1);
  });

  it("lists: board columns by commitment date, 5 first then 30 per page", async () => {
    const hoy = await pageOf(s.meTasksBucketFilters("hoy"));
    expect(titles(hoy.rows)).toEqual(["Render", "Planos", "Cotizar"]);
    const despues = await pageOf(s.meTasksBucketFilters("despues"));
    expect(despues.total).toBe(today === sunday ? 4 : 3);
    expect(titles(despues.rows)).toContain("Entrega");
    expect(titles(despues.rows)).toContain("Libre");

    // An Esencial card: 4 first, then the rest after the cursor.
    const first = await pageOf(s.meTasksProjectFilters(lomas));
    expect(first.rows).toHaveLength(4);
    expect(first.total).toBe(6);
    expect(first.nextCursor).not.toBeNull();
    const next = await pageOf(s.meTasksProjectFilters(lomas), first.nextCursor);
    expect(next.rows).toHaveLength(2);
    expect(next.nextCursor).toBeNull();
    expect(new Set([...first.rows, ...next.rows].map((r) => r.id)).size).toBe(6);
  });

  it("owner-scoped: Beto sees his own tasks only, a guest gets FORBIDDEN", async () => {
    const summary = await asViewer(viewer(beto), () => actions.getMyTasksSummary({ tramo: null, q: null }));
    expect(summary.all.open).toBe(2);
    expect(summary.esencial.map((p) => p.project.id)).toEqual([torre]);
    await expect(asViewer(null, () => actions.getMyTasksSummary({ tramo: null, q: null }))).rejects.toThrow(/FORBIDDEN/);
    await expect(asViewer(viewer(ana), () => actions.getMyTasksPage({ filters: { vence: "otro" as never }, cursor: null }))).rejects.toThrow(
      /INVALID/,
    );
  });
});
