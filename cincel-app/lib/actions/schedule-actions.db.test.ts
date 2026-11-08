// @vitest-environment node
/**
 * `fetchScheduleAction` against a real Postgres (#946): schedule payments
 * reach admins only, a soft-deleted project and a caller without project
 * access get null. Runs only when TEST_DATABASE_URL points at a migrated
 * database (`npm run db:migrate`).
 *
 * The action runs with its real repository; only the session and the project
 * capability resolver are mocked. Every row the test creates carries a
 * per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

type Actor = { id: string; name: string; email: string; access: "Administrador" | "Colaborador" };
const session = vi.hoisted(() => ({ actor: null as null | Actor, canViewProjects: true }));

function sessionUser() {
  const actor = session.actor;
  if (!actor) throw new Error("no test actor");
  return {
    member: {
      id: actor.id,
      name: actor.name,
      role: actor.access,
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: actor.email,
      phone: "",
    },
    email: actor.email,
    access: actor.access,
  };
}

vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  requireCapabilityUser: vi.fn(async () => sessionUser()),
}));

vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveProjectsCapabilities: () =>
    new Proxy({} as Record<string, unknown>, {
      get: (_target, key) =>
        key === "then" ? undefined : key === "canViewProjects" ? session.canViewProjects : true,
    }),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

describe.skipIf(!url)("fetchScheduleAction (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { fetchScheduleAction } = await import("./schedule-actions");

  let admin: Actor;
  let colaborador: Actor;
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
    admin = { id: members[0]!.id, name: `Admin ${run}`, email: `admin-${run}@test.local`, access: "Administrador" };
    colaborador = {
      id: members[1]!.id,
      name: `Colaborador ${run}`,
      email: `colab-${run}@test.local`,
      access: "Colaborador",
    };

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
    session.canViewProjects = true;
  });

  it("returns no schedule payments to a non-admin", async () => {
    session.actor = colaborador;
    const result = await fetchScheduleAction(liveProjectId);
    expect(result).not.toBeNull();
    expect(result!.data.payments).toEqual([]);
    // The rest of the schedule still reaches them.
    expect(result!.data.tasks.map((t) => t.tarea)).toEqual([`Tarea ${run}`]);
  });

  it("returns the schedule payments to an admin", async () => {
    session.actor = admin;
    const result = await fetchScheduleAction(liveProjectId);
    expect(result!.data.payments).toEqual([
      { fecha: "2026-01-10", pagadoPct: 30, avancePct: 40 },
      { fecha: "2026-02-10", pagadoPct: 60, avancePct: 70 },
    ]);
  });

  it("returns null for a soft-deleted project, for admins too", async () => {
    for (const actor of [colaborador, admin]) {
      session.actor = actor;
      expect(await fetchScheduleAction(deletedProjectId)).toBeNull();
    }
  });

  it("returns null for a project the caller cannot see", async () => {
    session.actor = colaborador;
    session.canViewProjects = false;
    expect(await fetchScheduleAction(liveProjectId)).toBeNull();
  });

  it("returns null for a project that does not exist", async () => {
    session.actor = admin;
    expect(await fetchScheduleAction(randomUUID())).toBeNull();
  });
});
