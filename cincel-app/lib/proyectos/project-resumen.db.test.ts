// @vitest-environment node
/**
 * `teamLoad` of the Proyecto · Resumen (`loadProjectResumen`, #995) against a
 * real Postgres. Runs only when TEST_DATABASE_URL points at a migrated
 * database (`npm run db:migrate`). Every row it creates carries a per-run
 * marker and is deleted afterwards.
 *
 * - Each team member's load counts open tasks across every project
 *   (responsable or support) against `staff.capacity`.
 * - Admin tasks count only for administrators.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);

/** No Drive folder in the test DB. */
vi.mock("@/lib/google/staff-files-app", () => ({
  getStaffFilesProject: vi.fn(async () => null),
  listStaffProjectFiles: vi.fn(async () => {
    throw new Error("Drive called");
  }),
}));

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("Proyecto · Resumen team load (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { asViewer } = await import("@/lib/query/test-utils");
  const { requireCapabilityUser } = await import("@/lib/auth/session");
  const { loadProjectResumen } = await import("@/lib/proyectos/project-resumen");

  const ids = { projects: [] as string[], staff: [] as string[] };
  let viewerId = "";
  let managerId = "";
  let supportId = "";
  let projectId = "";

  beforeAll(async () => {
    const people = await db
      .insert(schema.staff)
      .values([
        { name: `Visor ${run}`, email: `visor-load-${run}@cincel.example`, capacity: 10 },
        { name: `Responsable ${run}`, email: `resp-load-${run}@cincel.example`, capacity: 4 },
        { name: `Apoyo ${run}`, email: `apoyo-load-${run}@cincel.example`, capacity: 0 },
      ])
      .returning({ id: schema.staff.id });
    [viewerId, managerId, supportId] = people.map((p) => p.id);
    ids.staff.push(...people.map((p) => p.id));

    const projects = await db
      .insert(schema.projects)
      .values([
        { name: `Carga ${run}`, status: "activo", managerId },
        { name: `Otra obra ${run}`, status: "activo" },
      ])
      .returning({ id: schema.projects.id });
    projectId = projects[0]!.id;
    const otherId = projects[1]!.id;
    ids.projects.push(...projects.map((p) => p.id));
    await db.insert(schema.projectMembers).values([
      { projectId, staffId: viewerId },
      { projectId, staffId: supportId },
    ]);

    const task = (project: string, title: string, extra: Record<string, unknown> = {}) => ({
      projectId: project,
      kind: "usuario" as const,
      title: `${title} ${run}`,
      createdById: viewerId,
      managerId,
      ...extra,
    });
    const created = await db
      .insert(schema.tasks)
      .values([
        // Open, this project and another one: both count.
        task(projectId, "Abierta aquí"),
        task(otherId, "Abierta en otra obra"),
        // Closed or archived: never count.
        task(projectId, "Cerrada", { status: "completado" }),
        task(otherId, "Archivada", { archived: true }),
        // Admin task: only for administrators.
        task(otherId, "Administrativa", { kind: "admin" }),
      ])
      .returning({ id: schema.tasks.id });
    // The support person helps on the open task of the other project.
    await db.insert(schema.taskSupport).values({ taskId: created[1]!.id, staffId: supportId });
  });

  afterAll(async () => {
    if (ids.projects.length) {
      await db.delete(schema.tasks).where(inArray(schema.tasks.projectId, ids.projects));
      await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    }
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  it("teamLoad counts open tasks across projects against capacity", async () => {
    const user = await asViewer({ id: viewerId, access: "Administrador" }, () => requireCapabilityUser());
    const data = await loadProjectResumen(projectId, user);
    expect(data).not.toBeNull();
    // Responsable: 2 open + 1 admin (admins see admin tasks) of capacity 4.
    expect(data!.teamLoad[managerId]).toEqual({ openTotal: 3, capacity: 4, loadPct: 75 });
    // Support counts too; capacity 0 gives 0 %.
    expect(data!.teamLoad[supportId]).toEqual({ openTotal: 1, capacity: 0, loadPct: 0 });
    expect(data!.teamLoad[viewerId]).toEqual({ openTotal: 0, capacity: 10, loadPct: 0 });
    // Only the project's team.
    expect(Object.keys(data!.teamLoad).sort()).toEqual([managerId, supportId, viewerId].sort());
  });

  it("admin tasks excluded for non-admins", async () => {
    const user = await asViewer({ id: viewerId, access: "Colaborador" }, () => requireCapabilityUser());
    const data = await loadProjectResumen(projectId, user);
    expect(data).not.toBeNull();
    expect(data!.teamLoad[managerId]).toEqual({ openTotal: 2, capacity: 4, loadPct: 50 });
  });
});
