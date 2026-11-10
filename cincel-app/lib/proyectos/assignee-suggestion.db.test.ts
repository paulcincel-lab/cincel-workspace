// @vitest-environment node
/**
 * `suggestAssignee` against a real Postgres (#997): who the Resumen
 * Analítico quick-add proposes instead of an overloaded responsable. Runs
 * only when TEST_DATABASE_URL points at a migrated database
 * (`npm run db:migrate`).
 *
 * The capability resolvers and the project visibility read are mocked; the
 * query runs for real. Every row carries a per-run marker and is deleted
 * afterwards. The fase is created by the test, so no other staff in the
 * database has completed it.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveProjectsCapabilities: () => ({ canViewProjects: true }),
  resolveActivitiesCapabilities: () => ({ canViewActivities: true, canCreateActivity: true }),
}));
vi.mock("@/lib/projects/project-tab-shell", () => ({
  getProjectForViewer: vi.fn(async (id: string) => ({ id })),
}));

function userAs(id: string, access: "Administrador" | "Colaborador") {
  return {
    member: {
      id,
      name: `Viewer ${run}`,
      role: access,
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: `viewer-${run}@test.local`,
      phone: "",
    },
    email: `viewer-${run}@test.local`,
    access,
  } as unknown as import("@/lib/auth/auth-service").AuthenticatedUser;
}

describe.skipIf(!url)("suggestAssignee (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { suggestAssignee } = await import("./assignee-suggestion");

  const staffIds: string[] = [];
  const projectIds: string[] = [];
  let workflowId = "";
  let phaseId = "";
  let emptyPhaseId = "";
  let hereId = "";
  const ids: Record<"over" | "ana" | "beto" | "carla" | "elena" | "here", string> = {
    over: "",
    ana: "",
    beto: "",
    carla: "",
    elena: "",
    here: "",
  };

  beforeAll(async () => {
    const [workflow] = await db
      .insert(schema.workflows)
      .values({ key: `sugerencia-${run}`, name: `Tramo ${run}`, sortOrder: 90 })
      .returning({ id: schema.workflows.id });
    workflowId = workflow!.id;
    const phases = await db
      .insert(schema.workflowPhases)
      .values([
        { workflowId, name: `Acabados ${run}`, sortOrder: 1 },
        { workflowId, name: `Vacía ${run}`, sortOrder: 2 },
      ])
      .returning({ id: schema.workflowPhases.id });
    phaseId = phases[0]!.id;
    emptyPhaseId = phases[1]!.id;

    const people = await db
      .insert(schema.staff)
      .values([
        { name: `Saturado ${run}`, capacity: 10 },
        { name: `Ana ${run}`, capacity: 10 },
        { name: `Beto ${run}`, capacity: 10 },
        { name: `Carla ${run}`, capacity: 10 },
        { name: `Elena ${run}`, capacity: 10 },
        { name: `Solo aquí ${run}`, capacity: 10 },
      ])
      .returning({ id: schema.staff.id });
    staffIds.push(...people.map((p) => p.id));
    [ids.over, ids.ana, ids.beto, ids.carla, ids.elena, ids.here] = people.map((p) => p.id) as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];

    const created = await db
      .insert(schema.projects)
      .values([{ name: `Aquí ${run}` }, { name: `Casa Roble ${run}` }, { name: `Local Norte ${run}` }])
      .returning({ id: schema.projects.id });
    projectIds.push(...created.map((p) => p.id));
    hereId = created[0]!.id;
    const [, roble, norte] = created.map((p) => p.id) as [string, string, string];

    const closedAt = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000);
    const done = (managerId: string, projectId: string, daysAgo: number, title: string) => ({
      projectId,
      createdById: managerId,
      managerId,
      kind: "usuario" as const,
      workflowId,
      phaseId,
      status: "completado" as const,
      closedAt: closedAt(daysAgo),
      title: `${title} ${run}`,
    });
    const open = (managerId: string, n: number, kind: "usuario" | "admin" = "usuario") =>
      Array.from({ length: n }, (_, i) => ({
        projectId: hereId,
        createdById: managerId,
        managerId,
        kind,
        title: `Abierta ${kind} ${i} ${run}`,
      }));

    await db.insert(schema.tasks).values([
      // Ana: 20 %, one completion in Casa Roble.
      done(ids.ana, roble, 3, "Ana acabados"),
      ...open(ids.ana, 2),
      // Beto: 30 %, one completion in Local Norte (ties with Ana; Ana is less loaded).
      done(ids.beto, norte, 1, "Beto acabados"),
      ...open(ids.beto, 3),
      // Carla: the most completions, but at 70 %.
      done(ids.carla, roble, 1, "Carla 1"),
      done(ids.carla, norte, 2, "Carla 2"),
      done(ids.carla, norte, 4, "Carla 3"),
      ...open(ids.carla, 7),
      // Elena: two completions; 50 % without admin tasks, 70 % with them.
      done(ids.elena, roble, 2, "Elena 1"),
      done(ids.elena, norte, 5, "Elena 2"),
      ...open(ids.elena, 5),
      ...open(ids.elena, 2, "admin"),
      // Completed the fase only in this project: never a candidate.
      done(ids.here, hereId, 1, "Aquí mismo"),
    ]);
  });

  afterAll(async () => {
    if (projectIds.length) await db.delete(schema.tasks).where(inArray(schema.tasks.projectId, projectIds));
    if (projectIds.length) await db.delete(schema.projects).where(inArray(schema.projects.id, projectIds));
    if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
    if (workflowId) {
      await db.delete(schema.workflowPhases).where(inArray(schema.workflowPhases.workflowId, [workflowId]));
      await db.delete(schema.workflows).where(inArray(schema.workflows.id, [workflowId]));
    }
  });

  const admin = () => userAs(ids.over, "Administrador");
  const colaborador = () => userAs(ids.over, "Colaborador");

  it("suggests the least-loaded person who completed the fase elsewhere", async () => {
    // Admin view: Elena is at 70 % with her admin tasks, Carla at 70 %; Ana and Beto tie on completions.
    const suggestion = await suggestAssignee(admin(), { projectId: hereId, phaseId, excludeStaffId: ids.over });
    expect(suggestion).toEqual({
      staffId: ids.ana,
      name: `Ana ${run}`,
      loadPct: 20,
      phaseName: `Acabados ${run}`,
      projectName: `Casa Roble ${run}`,
    });
  });

  it("skips people at ≥ 60 %", async () => {
    const suggestion = await suggestAssignee(admin(), { projectId: hereId, phaseId, excludeStaffId: ids.ana });
    // Carla (3 completions, 70 %) and Elena (70 % for an admin) are skipped; Beto is next.
    expect(suggestion?.staffId).toBe(ids.beto);
    expect(suggestion?.loadPct).toBe(30);
  });

  it("returns null when nobody qualifies", async () => {
    expect(await suggestAssignee(admin(), { projectId: hereId, phaseId: emptyPhaseId, excludeStaffId: ids.over })).toBeNull();
  });

  it("excludes admin tasks for non-admins", async () => {
    // Without admin tasks Elena is at 50 % and has two completions: she wins over Ana and Beto.
    const suggestion = await suggestAssignee(colaborador(), { projectId: hereId, phaseId, excludeStaffId: ids.over });
    expect(suggestion?.staffId).toBe(ids.elena);
    expect(suggestion?.loadPct).toBe(50);
    expect(suggestion?.projectName).toBe(`Casa Roble ${run}`);
  });
});
