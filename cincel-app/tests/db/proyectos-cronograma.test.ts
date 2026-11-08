// @vitest-environment node
/**
 * `getProyectoCronogramaData` against a real Postgres (#961, plan §4.8 rule 3):
 * schedule payments reach admins only; a soft-deleted project, a viewer
 * without project access and a missing project get null; a guest gets
 * FORBIDDEN; `loadProyectoCronograma` stays within 6 statements. Runs only
 * when TEST_DATABASE_URL points at a migrated database (`npm run db:migrate`).
 *
 * The session is served by `asViewer`; only the project capability resolver
 * is mocked (to take `canViewProjects` away). Every row the test creates
 * carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { TestViewer } from "@/lib/query/test-utils";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

const caps = vi.hoisted(() => ({ canViewProjects: true }));

vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);

vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...real,
    resolveProjectsCapabilities: (user: Parameters<typeof real.resolveProjectsCapabilities>[0]) => ({
      ...real.resolveProjectsCapabilities(user),
      canViewProjects: caps.canViewProjects,
    }),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

/** Any Drive read fails the test: the Cronograma tab never lists files. */
const drive = vi.hoisted(() => ({
  getStaffFilesProject: vi.fn(async () => {
    throw new Error("Drive called");
  }),
  listStaffProjectFiles: vi.fn(async () => {
    throw new Error("Drive called");
  }),
}));
vi.mock("@/lib/google/staff-files-app", () => drive);

describe.skipIf(!url)("getProyectoCronogramaData (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { asViewer } = await import("@/lib/query/test-utils");
  const { countQueries } = await import("../helpers/count-queries");
  const { getProyectoCronogramaData } = await import("@/lib/actions/page-data/proyectos-actions");

  let admin: TestViewer;
  let colaborador: TestViewer;
  let liveProjectId = "";
  let deletedProjectId = "";
  const staffIds: string[] = [];
  const projectIds: string[] = [];

  async function seedSchedule(projectId: string) {
    const [schedule] = await db
      .insert(schema.projectSchedules)
      .values({ projectId })
      .returning({ id: schema.projectSchedules.id });
    await db.insert(schema.scheduleTasks).values({
      scheduleId: schedule!.id,
      stableKey: `a-${run}`,
      planta: "PB",
      seccion: "Obra negra",
      seccionOrder: 1,
      inicio: "2026-01-01",
      fin: "2026-01-15",
      tarea: `Tarea ${run}`,
      status: "progress",
      sortOrder: 1,
    });
    await db.insert(schema.schedulePaymentRows).values([
      { scheduleId: schedule!.id, fecha: "2026-01-10", pagadoPct: "30.00", avancePct: "40.00" },
      { scheduleId: schedule!.id, fecha: "2026-02-10", pagadoPct: "60.00", avancePct: "70.00" },
    ]);
  }

  beforeAll(async () => {
    const members = await db
      .insert(schema.staff)
      .values([
        { name: `Admin ${run}`, role: "Administrador" },
        { name: `Colaborador ${run}`, role: "Colaborador" },
      ])
      .returning({ id: schema.staff.id });
    staffIds.push(...members.map((m) => m.id));
    admin = { id: members[0]!.id, access: "Administrador", email: `admin-${run}@test.local` };
    colaborador = { id: members[1]!.id, access: "Colaborador", email: `colab-${run}@test.local` };

    const created = await db
      .insert(schema.projects)
      .values([{ name: `Cronograma ${run}` }, { name: `Cronograma borrado ${run}`, deletedAt: new Date() }])
      .returning({ id: schema.projects.id });
    liveProjectId = created[0]!.id;
    deletedProjectId = created[1]!.id;
    projectIds.push(liveProjectId, deletedProjectId);

    await seedSchedule(liveProjectId);
    await seedSchedule(deletedProjectId);
  });

  afterAll(async () => {
    if (projectIds.length) {
      await db.delete(schema.projectSchedules).where(inArray(schema.projectSchedules.projectId, projectIds));
      await db.delete(schema.projects).where(inArray(schema.projects.id, projectIds));
    }
    if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
  });

  beforeEach(() => {
    caps.canViewProjects = true;
  });

  it("a non-admin gets data.payments = [] and the rest of the schedule", async () => {
    const result = await asViewer(colaborador, () => getProyectoCronogramaData({ id: liveProjectId }));
    expect(result).not.toBeNull();
    expect(result!.data.payments).toEqual([]);
    expect(result!.data.tasks.map((t) => t.tarea)).toEqual([`Tarea ${run}`]);
    expect(result!.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("an admin gets the payments", async () => {
    const result = await asViewer(admin, () => getProyectoCronogramaData({ id: liveProjectId }));
    expect(result!.data.payments).toEqual([
      { fecha: "2026-01-10", pagadoPct: 30, avancePct: 40 },
      { fecha: "2026-02-10", pagadoPct: 60, avancePct: 70 },
    ]);
  });

  it("a soft-deleted project is null, for admins too", async () => {
    for (const viewer of [colaborador, admin]) {
      expect(await asViewer(viewer, () => getProyectoCronogramaData({ id: deletedProjectId }))).toBeNull();
    }
  });

  it("a viewer without project access gets null", async () => {
    caps.canViewProjects = false;
    expect(await asViewer(colaborador, () => getProyectoCronogramaData({ id: liveProjectId }))).toBeNull();
  });

  it("a project that does not exist is null", async () => {
    expect(await asViewer(admin, () => getProyectoCronogramaData({ id: randomUUID() }))).toBeNull();
  });

  it("a guest gets FORBIDDEN", async () => {
    await expect(asViewer(null, () => getProyectoCronogramaData({ id: liveProjectId }))).rejects.toThrow("FORBIDDEN");
  });

  it("loadProyectoCronograma sends at most 6 statements (admin, with payments)", async () => {
    const { count, result } = await countQueries(() =>
      asViewer(admin, () => getProyectoCronogramaData({ id: liveProjectId })),
    );
    expect(result).not.toBeNull();
    expect(count).toBeLessThanOrEqual(6);
    expect(drive.getStaffFilesProject).not.toHaveBeenCalled();
    expect(drive.listStaffProjectFiles).not.toHaveBeenCalled();
  });
});
