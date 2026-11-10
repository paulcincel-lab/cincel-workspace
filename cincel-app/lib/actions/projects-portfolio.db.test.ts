// @vitest-environment node
/**
 * `fetchProjectsPortfolioAction` against a real Postgres (redesign BE §7.12,
 * §9.7, §16): scope, admin-task exclusion, budget only for admins, the next
 * delivery never naming an admin task, and the 7-day open-task series. Runs
 * only when TEST_DATABASE_URL points at a migrated database
 * (`npm run db:migrate`).
 *
 * The action runs with its real repositories; only the session, the project
 * capability resolver, revalidation, `after()` and Drive are mocked. Every row
 * the test creates carries a per-run marker and is deleted afterwards; other
 * projects in the database are ignored by filtering on the fixture ids.
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
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: vi.fn(),
}));
vi.mock("@/lib/google/project-folders-app", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/google/project-folders-app")>()),
  syncProjectFolders: vi.fn(async () => undefined),
  syncProjectFolderName: vi.fn(async () => undefined),
  retryProjectFolders: vi.fn(async () => undefined),
}));

const DAY_MS = 86_400_000;

describe.skipIf(!url)("fetchProjectsPortfolioAction (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { TASK_TREND_TIME_ZONE, localIsoDate } = await import("@/lib/dashboard/task-trend");
  const { addDaysIso } = await import("@/lib/projects/portfolio-metrics");
  const { fetchProjectsPortfolioAction } = await import("./projects-actions");

  let admin: Actor;
  let colaborador: Actor;
  let plainProjectId = "";
  let scheduledProjectId = "";
  let deletedProjectId = "";
  const staffIds: string[] = [];
  const projectIds: string[] = [];

  const now = new Date();
  const todayIso = localIsoDate(now, TASK_TREND_TIME_ZONE);
  const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);

  async function rowsFor(actor: Actor) {
    session.actor = actor;
    const rows = await fetchProjectsPortfolioAction();
    return {
      all: rows,
      plain: rows.find((r) => r.projectId === plainProjectId),
      scheduled: rows.find((r) => r.projectId === scheduledProjectId),
    };
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
      .values([
        { name: `Portafolio A ${run}`, progress: 40, endDate: addDaysIso(todayIso, 10) },
        { name: `Portafolio B ${run}`, progress: 5 },
        { name: `Portafolio borrado ${run}`, deletedAt: now },
      ])
      .returning({ id: schema.projects.id });
    plainProjectId = created[0]!.id;
    scheduledProjectId = created[1]!.id;
    deletedProjectId = created[2]!.id;
    projectIds.push(plainProjectId, scheduledProjectId, deletedProjectId);

    const base = { projectId: plainProjectId, createdById: admin.id };
    await db.insert(schema.tasks).values([
      // Open, overdue, non-admin.
      { ...base, kind: "usuario", title: `Vencida ${run}`, commitmentDate: addDaysIso(todayIso, -2), createdAt: ago(10) },
      // Open, the next non-admin delivery; open since 3 days ago.
      { ...base, kind: "usuario", title: `Entrega ${run}`, commitmentDate: addDaysIso(todayIso, 5), createdAt: ago(3) },
      // Admin tasks: an earlier delivery and an overdue one.
      { ...base, kind: "admin", title: `Admin próxima ${run}`, commitmentDate: addDaysIso(todayIso, 1), createdAt: ago(10) },
      { ...base, kind: "admin", title: `Admin vencida ${run}`, commitmentDate: addDaysIso(todayIso, -1), createdAt: ago(10) },
      // Completed 2 days ago: open on the first four days of the series only.
      {
        ...base,
        kind: "usuario",
        title: `Completada ${run}`,
        status: "completado",
        closedAt: ago(2),
        commitmentDate: addDaysIso(todayIso, 2),
        createdAt: ago(10),
      },
      // Deleted and archived tasks never count.
      { ...base, kind: "usuario", title: `Borrada ${run}`, commitmentDate: addDaysIso(todayIso, 3), createdAt: ago(10), deletedAt: now },
      { ...base, kind: "usuario", title: `Archivada ${run}`, commitmentDate: addDaysIso(todayIso, 3), createdAt: ago(10), archived: true },
    ]);

    const [schedule] = await db
      .insert(schema.projectSchedules)
      .values({ projectId: scheduledProjectId })
      .returning({ id: schema.projectSchedules.id });
    await db.insert(schema.scheduleTasks).values([
      {
        scheduleId: schedule!.id,
        stableKey: `a-${run}`,
        planta: "PB",
        seccion: "Obra negra",
        seccionOrder: 1,
        inicio: "2019-12-01",
        fin: "2020-01-01",
        tarea: `Hecha ${run}`,
        status: "done",
        sortOrder: 1,
      },
      {
        scheduleId: schedule!.id,
        stableKey: `b-${run}`,
        planta: "PB",
        seccion: "Acabados",
        seccionOrder: 2,
        inicio: "2098-12-01",
        fin: "2099-01-01",
        tarea: `Pendiente ${run}`,
        status: "pending",
        sortOrder: 2,
      },
    ]);
    await db
      .insert(schema.schedulePaymentRows)
      .values({ scheduleId: schedule!.id, fecha: "2020-01-01", pagadoPct: "30.00", avancePct: "40.00" });
  });

  afterAll(async () => {
    if (projectIds.length) {
      await db.delete(schema.tasks).where(inArray(schema.tasks.projectId, projectIds));
      await db.delete(schema.projectSchedules).where(inArray(schema.projectSchedules.projectId, projectIds));
      await db.delete(schema.projects).where(inArray(schema.projects.id, projectIds));
    }
    if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
  });

  beforeEach(() => {
    session.canViewProjects = true;
  });

  it("returns one row per live project, the same scope as fetchProjectsAction", async () => {
    const { fetchProjectsAction } = await import("./projects-actions");
    session.actor = colaborador;
    // Other test files may create projects concurrently: compare on the fixture ids.
    const ours = (ids: string[]) => ids.filter((id) => projectIds.includes(id)).sort();
    const listed = ours((await fetchProjectsAction()).map((p) => p.id));
    const { all } = await rowsFor(colaborador);
    expect(ours(all.map((r) => r.projectId))).toEqual(listed);
    expect(listed).toEqual([plainProjectId, scheduledProjectId].sort());
    expect(all.filter((r) => r.projectId === plainProjectId)).toHaveLength(1);
    expect(all.filter((r) => r.projectId === scheduledProjectId)).toHaveLength(1);
    expect(all.some((r) => r.projectId === deletedProjectId)).toBe(false);
  });

  it("returns nothing without projects.canViewProjects", async () => {
    session.canViewProjects = false;
    const { all } = await rowsFor(admin);
    expect(all).toEqual([]);
  });

  it("excludes admin tasks from open and overdue for non-admins", async () => {
    const { plain } = await rowsFor(colaborador);
    expect(plain?.open).toBe(2);
    expect(plain?.overdue).toBe(1);
  });

  it("counts admin tasks for callers with canSeeAdminData", async () => {
    const { plain } = await rowsFor(admin);
    expect(plain?.open).toBe(4);
    expect(plain?.overdue).toBe(2);
  });

  it("never names an admin task as the next delivery", async () => {
    for (const actor of [colaborador, admin]) {
      const { plain } = await rowsFor(actor);
      expect(plain?.nextDelivery).toEqual({ title: `Entrega ${run}`, date: addDaysIso(todayIso, 5) });
    }
  });

  it("returns budgetSpentPct only to callers with canSeeAdminData", async () => {
    expect((await rowsFor(colaborador)).scheduled?.budgetSpentPct).toBeNull();
    expect((await rowsFor(admin)).scheduled?.budgetSpentPct).toBe(30);
    expect((await rowsFor(admin)).plain?.budgetSpentPct).toBeNull();
  });

  it("keeps budgetSpentPct null for non-admins with a projectIds filter too (Resumen, 5a)", async () => {
    const { listPortfolioRows } = await import("@/lib/repositories/projects-portfolio-repository");
    const [asColaborador] = await listPortfolioRows({ includeAdminData: false, now, projectIds: [scheduledProjectId] });
    const [asAdmin] = await listPortfolioRows({ includeAdminData: true, now, projectIds: [scheduledProjectId] });
    expect(asColaborador?.budgetSpentPct).toBeNull();
    expect(asAdmin?.budgetSpentPct).toBe(30);
  });

  it("the row for one project (projectIds) equals the old full-portfolio .find", async () => {
    const { listPortfolioRows } = await import("@/lib/repositories/projects-portfolio-repository");
    for (const [actor, includeAdminData] of [
      [colaborador, false],
      [admin, true],
    ] as const) {
      const full = await rowsFor(actor);
      for (const id of [plainProjectId, scheduledProjectId]) {
        const one = await listPortfolioRows({ includeAdminData, now, projectIds: [id] });
        expect(one).toHaveLength(1);
        expect(one[0]).toEqual(full.all.find((row) => row.projectId === id));
      }
    }
  });

  it("projectIds leaves deleted projects out and an empty list reads nothing", async () => {
    const { listPortfolioRows } = await import("@/lib/repositories/projects-portfolio-repository");
    expect(await listPortfolioRows({ includeAdminData: true, now, projectIds: [deletedProjectId] })).toEqual([]);
    const { countQueries } = await import("@/tests/helpers/count-queries");
    const { result, count } = await countQueries(() => listPortfolioRows({ includeAdminData: true, now, projectIds: [] }));
    expect(result).toEqual([]);
    expect(count).toBe(0);
  });

  it("reads the portfolio in at most 3 statements, with no schedule task or payment row loaded", async () => {
    const { listPortfolioRows } = await import("@/lib/repositories/projects-portfolio-repository");
    const { countQueries } = await import("@/tests/helpers/count-queries");
    const { count, statements } = await countQueries(() => listPortfolioRows({ includeAdminData: true, now }));
    expect(count).toBeLessThanOrEqual(3);
    // Schedules are aggregated in SQL: no statement selects schedule rows from the top level.
    for (const { sql } of statements) {
      // `[^()]*`: a FROM inside a subquery of the select list doesn't count.
      expect(sql.trim().toLowerCase()).not.toMatch(/^select [^()]* from (?:"core"\.)?"schedule_tasks"/);
      expect(sql.trim().toLowerCase()).not.toMatch(/^select [^()]* from (?:"core"\.)?"schedule_payment_rows"/);
    }
  });

  it("uses the Cronograma for real and plan when a schedule exists, else projects.progress", async () => {
    const { plain, scheduled } = await rowsFor(colaborador);
    expect(scheduled).toMatchObject({ real: 50, plan: 50, deviation: 0 });
    expect(plain).toMatchObject({ real: 40, plan: null, deviation: null });
  });

  it("counts days to projects.end_date", async () => {
    const { plain, scheduled } = await rowsFor(colaborador);
    expect(plain?.daysToDelivery).toBe(10);
    expect(scheduled?.daysToDelivery).toBeNull();
    expect(scheduled?.nextDelivery).toBeNull();
  });

  it("series7 has 7 entries: open tasks per day over the last 7 days", async () => {
    const asColaborador = await rowsFor(colaborador);
    // Vencida every day, Completada until it closed, Entrega from 3 days ago.
    expect(asColaborador.plain?.series7).toEqual([2, 2, 2, 3, 2, 2, 2]);
    expect(asColaborador.scheduled?.series7).toEqual([0, 0, 0, 0, 0, 0, 0]);

    const asAdmin = await rowsFor(admin);
    expect(asAdmin.plain?.series7).toEqual([4, 4, 4, 5, 4, 4, 4]);
    for (const row of asAdmin.all) expect(row.series7).toHaveLength(7);
  });

  describe("mean delay and overdue a week ago (#994)", () => {
    let delayedProjectId = "";
    let onTimeProjectId = "";

    beforeAll(async () => {
      const created = await db
        .insert(schema.projects)
        .values([{ name: `Portafolio retraso ${run}` }, { name: `Portafolio al día ${run}` }])
        .returning({ id: schema.projects.id });
      delayedProjectId = created[0]!.id;
      onTimeProjectId = created[1]!.id;
      const base = { projectId: delayedProjectId, createdById: admin.id };
      await db.insert(schema.tasks).values([
        // Open and 3 days late; not yet due a week ago.
        { ...base, kind: "usuario", title: `Tarde 3 ${run}`, commitmentDate: addDaysIso(todayIso, -3), createdAt: ago(20) },
        // Open and 10 days late; 3 days late a week ago.
        { ...base, kind: "usuario", title: `Tarde 10 ${run}`, commitmentDate: addDaysIso(todayIso, -10), createdAt: ago(20) },
        // Created 3 days ago, 9 days late: did not exist a week ago.
        { ...base, kind: "usuario", title: `Nueva tarde ${run}`, commitmentDate: addDaysIso(todayIso, -9), createdAt: ago(3) },
        // Completed 2 days ago: not open today, open and 5 days late a week ago.
        {
          ...base,
          kind: "usuario",
          title: `Cerrada ${run}`,
          status: "completado",
          closedAt: ago(2),
          commitmentDate: addDaysIso(todayIso, -12),
          createdAt: ago(30),
        },
        // Admin task, 20 days late (13 a week ago).
        { ...base, kind: "admin", title: `Admin tarde ${run}`, commitmentDate: addDaysIso(todayIso, -20), createdAt: ago(30) },
        // Deleted and archived tasks never count.
        { ...base, kind: "usuario", title: `Borrada tarde ${run}`, commitmentDate: addDaysIso(todayIso, -30), createdAt: ago(40), deletedAt: now },
        { ...base, kind: "usuario", title: `Archivada tarde ${run}`, commitmentDate: addDaysIso(todayIso, -30), createdAt: ago(40), archived: true },
        // The other project: only a future commitment.
        {
          projectId: onTimeProjectId,
          createdById: admin.id,
          kind: "usuario",
          title: `A tiempo ${run}`,
          commitmentDate: addDaysIso(todayIso, 4),
          createdAt: ago(20),
        },
      ]);
    });

    afterAll(async () => {
      const ids = [delayedProjectId, onTimeProjectId].filter(Boolean);
      if (ids.length === 0) return;
      await db.delete(schema.tasks).where(inArray(schema.tasks.projectId, ids));
      await db.delete(schema.projects).where(inArray(schema.projects.id, ids));
    });

    async function delayed(includeAdminData: boolean) {
      const { listPortfolioRows } = await import("@/lib/repositories/projects-portfolio-repository");
      const rows = await listPortfolioRows({ includeAdminData, now, projectIds: [delayedProjectId, onTimeProjectId] });
      return { delayedRow: rows.find((r) => r.projectId === delayedProjectId), onTimeRow: rows.find((r) => r.projectId === onTimeProjectId) };
    }

    it("avgDelayDays averages days late of open overdue tasks", async () => {
      const { delayedRow } = await delayed(false);
      // (3 + 10 + 9) / 3, one decimal.
      expect(delayedRow?.overdue).toBe(3);
      expect(delayedRow?.avgDelayDays).toBe(7.3);
    });

    it("overdueWeekAgo counts tasks open and overdue a week ago", async () => {
      const { delayedRow } = await delayed(false);
      // Tarde 10 (3 days late then) and Cerrada (5 days late then); Nueva tarde did not exist.
      expect(delayedRow?.overdueWeekAgo).toBe(2);
      expect(delayedRow?.avgDelayWeekAgo).toBe(4);
    });

    it("admin tasks are excluded for non-admins", async () => {
      const asAdmin = (await delayed(true)).delayedRow;
      // (3 + 10 + 9 + 20) / 4 today; (3 + 5 + 13) / 3 a week ago.
      expect(asAdmin).toMatchObject({ overdue: 4, avgDelayDays: 10.5, overdueWeekAgo: 3, avgDelayWeekAgo: 7 });
      const asColaborador = (await delayed(false)).delayedRow;
      expect(asColaborador).toMatchObject({ overdue: 3, avgDelayDays: 7.3, overdueWeekAgo: 2, avgDelayWeekAgo: 4 });
    });

    it("null delay when nothing is overdue", async () => {
      for (const includeAdminData of [false, true]) {
        const { onTimeRow } = await delayed(includeAdminData);
        expect(onTimeRow).toMatchObject({ overdue: 0, avgDelayDays: null, overdueWeekAgo: 0, avgDelayWeekAgo: null });
      }
    });
  });

  it("ignores the deleted project's tasks", async () => {
    const rows = await db.select({ id: schema.projects.id }).from(schema.projects).where(eq(schema.projects.id, deletedProjectId));
    expect(rows).toHaveLength(1);
    const { all } = await rowsFor(admin);
    expect(all.find((r) => r.projectId === deletedProjectId)).toBeUndefined();
  });
});
