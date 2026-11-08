// @vitest-environment node
/**
 * Proyectos list, Resumen and Tareas page data (Query Migration 5a, #959)
 * against a real Postgres. Runs only when TEST_DATABASE_URL points at a
 * migrated database (`npm run db:migrate`). Every row it creates carries a
 * per-run marker and is deleted afterwards; other rows are ignored by
 * filtering on the fixture ids.
 *
 * - `loadProyectosPage` runs ≤ 8 statements (`countQueries`).
 * - `presaleAutoStart()` equals the old `fetchWorkflowsAction` derivation.
 * - Non-admins never get admin data: `budgetSpentPct` null (list and
 *   Resumen), Resumen `schedule.payments` = `[]`, staff `{id,name}` (+
 *   `puesto`) without `email`; admins get them.
 * - Resumen staff covers the project's team only.
 * - Out of scope (no `canViewProjects`) or a deleted project → null.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);

/** The Resumen's root listing: no Drive folder in the test DB. */
const drive = vi.hoisted(() => ({
  getStaffFilesProject: vi.fn(async () => null),
  listStaffProjectFiles: vi.fn(async () => {
    throw new Error("Drive called");
  }),
}));
vi.mock("@/lib/google/staff-files-app", () => drive);

/** Turns `canViewProjects` off for the viewer, as a role override would. */
const perms = vi.hoisted(() => ({ noProjects: false }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    resolveProjectsCapabilities: (user: Parameters<typeof actual.resolveProjectsCapabilities>[0]) => {
      const caps = actual.resolveProjectsCapabilities(user);
      return perms.noProjects ? { ...caps, canViewProjects: false } : caps;
    },
  };
});

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("Proyectos list, Resumen and Tareas page data (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { asViewer } = await import("@/lib/query/test-utils");
  const { requireCapabilityUser } = await import("@/lib/auth/session");
  const { countQueries } = await import("../helpers/count-queries");
  const { getProyectoResumenData, getProyectoTareasData, getProyectosPageData } = await import(
    "@/lib/actions/page-data/proyectos-actions"
  );
  const { loadProyectosPage } = await import("@/lib/loaders/proyectos");
  const workflowsRepository = await import("@/lib/repositories/workflows-repository");

  const ids = { projects: [] as string[], staff: [] as string[] };
  let viewerId = "";
  let memberId = "";
  let outsiderId = "";
  let projectId = "";
  let deletedProject = "";

  const admin = () => ({ id: viewerId, access: "Administrador" as const });
  const colaborador = () => ({ id: viewerId, access: "Colaborador" as const });

  beforeAll(async () => {
    const people = await db
      .insert(schema.staff)
      .values([
        { name: `Visor ${run}`, email: `visor-${run}@cincel.example` },
        { name: `Miembro ${run}`, lastName: "Equipo", email: `miembro-${run}@cincel.example`, role: "Colaborador" },
        { name: `Ajeno ${run}`, email: `ajeno-${run}@cincel.example` },
      ])
      .returning({ id: schema.staff.id });
    [viewerId, memberId, outsiderId] = people.map((p) => p.id);
    ids.staff.push(...people.map((p) => p.id));

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Resumen ${run}`, status: "activo", managerId: memberId })
      .returning({ id: schema.projects.id });
    projectId = project.id;
    ids.projects.push(project.id);
    await db.insert(schema.projectMembers).values({ projectId, staffId: viewerId });

    const task = (title: string, extra: Record<string, unknown> = {}) => ({
      projectId,
      kind: "usuario" as const,
      title: `${title} ${run}`,
      createdById: viewerId,
      managerId: memberId,
      ...extra,
    });
    const [parent] = await db
      .insert(schema.tasks)
      .values([task("Uno"), task("Dos", { status: "completado" }), task("Admin", { kind: "admin" })])
      .returning({ id: schema.tasks.id });
    await db.insert(schema.tasks).values(task("Subtarea", { parentTaskId: parent.id }));

    const [schedule] = await db
      .insert(schema.projectSchedules)
      .values({ projectId })
      .returning({ id: schema.projectSchedules.id });
    await db.insert(schema.scheduleTasks).values({
      scheduleId: schedule.id,
      stableKey: `r-${run}`,
      planta: "PB",
      seccion: "Obra negra",
      seccionOrder: 1,
      inicio: "2019-12-01",
      fin: "2020-01-01",
      tarea: `Hecha ${run}`,
      status: "done",
      sortOrder: 1,
    });
    await db
      .insert(schema.schedulePaymentRows)
      .values({ scheduleId: schedule.id, fecha: "2020-01-01", pagadoPct: "30.00", avancePct: "40.00" });

    const [deleted] = await db
      .insert(schema.projects)
      .values({ name: `Resumen ${run} borrado`, status: "activo", deletedAt: new Date() })
      .returning({ id: schema.projects.id });
    deletedProject = deleted.id;
    ids.projects.push(deleted.id);
  });

  afterAll(async () => {
    if (ids.projects.length) {
      await db.delete(schema.tasks).where(inArray(schema.tasks.projectId, ids.projects));
      await db.delete(schema.projectSchedules).where(inArray(schema.projectSchedules.projectId, ids.projects));
      await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    }
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  beforeEach(() => {
    perms.noProjects = false;
    drive.getStaffFilesProject.mockClear();
  });

  it("loadProyectosPage runs ≤ 8 statements", async () => {
    const user = await asViewer(admin(), () => requireCapabilityUser());
    const { result, count } = await countQueries(() => loadProyectosPage(user));
    expect(count).toBeLessThanOrEqual(8);
    expect(result.projects.some((p) => p.id === projectId)).toBe(true);
    expect(result.portfolio.some((row) => row.projectId === projectId)).toBe(true);
  });

  it("presaleAutoStart() equals the old derivation over the full workflows list", async () => {
    const workflows = await workflowsRepository.listWorkflows({});
    const old = workflows.some((w) => w.key === "presale" && w.active && w.autoStart === "on_create");
    expect(await workflowsRepository.presaleAutoStart()).toBe(old);
  });

  it("getProyectosPageData for a non-admin: no admin fields, canSeeAdminData false, every budget null", async () => {
    const data = await asViewer(colaborador(), () => getProyectosPageData({}));
    expect(Object.keys(data).sort()).toEqual(
      ["canCreateProject", "canSeeAdminData", "portfolio", "presaleAutoStart", "projects", "tramos"].sort(),
    );
    expect(data.canSeeAdminData).toBe(false);
    for (const row of data.portfolio) expect(row.budgetSpentPct).toBeNull();
    const ours = data.projects.find((p) => p.id === projectId);
    expect(ours?.client).toBeNull();
  });

  it("getProyectosPageData for an admin carries the budget", async () => {
    const data = await asViewer(admin(), () => getProyectosPageData({}));
    expect(data.canSeeAdminData).toBe(true);
    expect(data.portfolio.find((row) => row.projectId === projectId)?.budgetSpentPct).toBe(30);
  });

  it("Resumen as a non-admin: no payments, no budget, staff without email", async () => {
    const data = await asViewer(colaborador(), () => getProyectoResumenData({ id: projectId }));
    expect(data).not.toBeNull();
    expect(data?.schedule?.tasks).toHaveLength(1);
    expect(data?.schedule?.payments).toEqual([]);
    expect(data?.portfolio?.budgetSpentPct).toBeNull();
    expect(data?.showBudget).toBe(false);
    for (const info of Object.values(data?.staff ?? {})) {
      expect(info).not.toHaveProperty("email");
      expect(Object.keys(info).every((key) => ["id", "name", "puesto"].includes(key))).toBe(true);
    }
    expect(data?.staff[memberId]).toMatchObject({ id: memberId, name: `Miembro ${run} Equipo` });
  });

  it("Resumen as an admin: payments, budget and staff emails present", async () => {
    const data = await asViewer(admin(), () => getProyectoResumenData({ id: projectId }));
    expect(data?.schedule?.payments).toEqual([{ fecha: "2020-01-01", pagadoPct: 30, avancePct: 40 }]);
    expect(data?.portfolio?.budgetSpentPct).toBe(30);
    expect(data?.staff[memberId]?.email).toBe(`miembro-${run}@cincel.example`);
  });

  it("Resumen staff holds only the project's team (members and manager), never other staff", async () => {
    const data = await asViewer(admin(), () => getProyectoResumenData({ id: projectId }));
    expect(Object.keys(data?.staff ?? {}).sort()).toEqual([memberId, viewerId].sort());
    expect(data?.staff).not.toHaveProperty(outsiderId);
  });

  it("Resumen task stats count top-level tasks, admin ones only for admins", async () => {
    const asColaborador = await asViewer(colaborador(), () => getProyectoResumenData({ id: projectId }));
    expect(asColaborador?.taskStats).toMatchObject({ total: 2, done: 1, open: 1 });
    const asAdmin = await asViewer(admin(), () => getProyectoResumenData({ id: projectId }));
    expect(asAdmin?.taskStats.total).toBeGreaterThanOrEqual(2);
  });

  it("Resumen's portfolio row equals the list's row for the project", async () => {
    const list = await asViewer(admin(), () => getProyectosPageData({}));
    const resumen = await asViewer(admin(), () => getProyectoResumenData({ id: projectId }));
    expect(resumen?.portfolio).toEqual(list.portfolio.find((row) => row.projectId === projectId));
  });

  it("Tareas returns the slim rows of the project (admin tasks only for admins)", async () => {
    const asColaborador = await asViewer(colaborador(), () => getProyectoTareasData({ id: projectId }));
    expect(asColaborador?.includeAdmin).toBe(false);
    expect(asColaborador?.tasks.every((t) => t.projectId === projectId && t.kind !== "admin")).toBe(true);
    expect(asColaborador?.tasks.every((t) => !("notes" in t))).toBe(true);
    const asAdmin = await asViewer(admin(), () => getProyectoTareasData({ id: projectId }));
    expect(asAdmin?.includeAdmin).toBe(true);
    expect(asAdmin?.tasks.some((t) => t.kind === "admin")).toBe(true);
  });

  it("is null for a viewer without canViewProjects", async () => {
    perms.noProjects = true;
    expect(await asViewer(colaborador(), () => getProyectoResumenData({ id: projectId }))).toBeNull();
    expect(await asViewer(colaborador(), () => getProyectoTareasData({ id: projectId }))).toBeNull();
    const list = await asViewer(colaborador(), () => getProyectosPageData({}));
    expect(list.projects).toEqual([]);
    expect(list.portfolio).toEqual([]);
  });

  it("is null for a deleted project, even for an admin", async () => {
    expect(await asViewer(admin(), () => getProyectoResumenData({ id: deletedProject }))).toBeNull();
    expect(await asViewer(admin(), () => getProyectoTareasData({ id: deletedProject }))).toBeNull();
  });

  it("is null for an unknown project", async () => {
    expect(await asViewer(admin(), () => getProyectoResumenData({ id: randomUUID() }))).toBeNull();
    expect(await asViewer(admin(), () => getProyectoTareasData({ id: randomUUID() }))).toBeNull();
  });

  it("a guest gets FORBIDDEN", async () => {
    await expect(asViewer(null, () => getProyectoResumenData({ id: projectId }))).rejects.toThrow("FORBIDDEN");
    await expect(asViewer(null, () => getProyectosPageData({}))).rejects.toThrow("FORBIDDEN");
  });
});
