// @vitest-environment node
/**
 * Personas aggregates against a real Postgres (redesign BE §7.11, §9.7): hours
 * privacy, admin-task filtering, approved absences and NOT_FOUND. Runs only
 * when TEST_DATABASE_URL points at a migrated database (`npm run db:migrate`).
 * Every row a test creates carries a per-run marker and is deleted afterwards.
 *
 * The capability rule `canViewTeamHours` (Administrador, Dirección) and the
 * Phase 1 read helpers are pinned here so the test exercises this action's
 * own rules: hours come back as zeros (no time entries yet) and absences are
 * read straight from `vacation_requests` with status `aprobada`.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const session = vi.hoisted(() => ({ access: "Administrador" as string, memberId: "" }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: {
      id: session.memberId,
      name: "Viewer",
      role: session.access,
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "",
      phone: "",
    },
    email: "viewer@cincel.example",
    access: session.access,
  })),
}));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  canViewTeamHours: (user: { access: string } | null) =>
    user?.access === "Administrador" || user?.access === "Dirección",
}));
vi.mock("@/lib/time-tracking/settings", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/time-tracking/settings")>();
  return { ...original, getTimeTrackingSettings: async () => original.DEFAULT_TIME_TRACKING_SETTINGS };
});
vi.mock("@/lib/time-tracking/week-hours", () => ({
  weekHours: async (_db: unknown, staffIds: string[], weekStart: string) => {
    const start = new Date(`${weekStart}T00:00:00Z`);
    const days = [0, 1, 2, 3, 4].map((n) => {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + n);
      return { date: d.toISOString().slice(0, 10), hours: 0 };
    });
    return new Map(staffIds.map((id) => [id, { days, total: 0 }]));
  },
}));
vi.mock("@/lib/vacations/approved-absences", () => ({
  approvedAbsences: async (
    executor: import("@/lib/repositories/owner-scoped").OwnerDb,
    range: { from: string; to: string; staffIds?: string[] }
  ) => {
    const { and, eq, gte, inArray, lte } = await import("drizzle-orm");
    const { vacationRequests } = await import("@/lib/db/schema");
    const rows = await executor
      .select()
      .from(vacationRequests)
      .where(
        and(
          eq(vacationRequests.status, "aprobada"),
          lte(vacationRequests.fromDate, range.to),
          gte(vacationRequests.toDate, range.from),
          range.staffIds ? inArray(vacationRequests.staffId, range.staffIds) : undefined
        )
      );
    return rows.map((r) => ({ staffId: r.staffId, from: r.fromDate, to: r.toDate, kind: r.kind }));
  },
}));

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("people actions (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const actions = await import("@/lib/actions/people-actions");
  const { addIsoDays, localIsoDate, workWeek } = await import("@/lib/people/aggregates");
  const { TIME_TRACKING_TIME_ZONE } = await import("@/lib/time-tracking/settings");

  const today = localIsoDate(new Date(), TIME_TRACKING_TIME_ZONE);
  const week = workWeek(today);

  let adminId = "";
  let directorId = "";
  let colaboradorId = "";
  let workerId = "";
  let vacationerId = "";
  let inactiveId = "";
  let projectId = "";
  let otherProjectId = "";
  const vacationIds: string[] = [];

  beforeAll(async () => {
    const members = await db
      .insert(schema.staff)
      .values([
        { name: `Admin ${run}`, role: "Administrador" },
        { name: `Dirección ${run}`, role: "Dirección" },
        { name: `Colaborador ${run}`, role: "Colaborador" },
        { name: `Trabajadora ${run}`, lastName: "Pérez", role: "Colaborador", capacity: 10 },
        { name: `Vacaciones ${run}`, role: "Colaborador", capacity: 5 },
        { name: `Inactiva ${run}`, role: "Colaborador", active: false },
      ])
      .returning({ id: schema.staff.id });
    [adminId, directorId, colaboradorId, workerId, vacationerId, inactiveId] = members.map((m) => m.id);

    const projectRows = await db
      .insert(schema.projects)
      .values([
        { name: `Personas ${run} A`, managerId: workerId, progress: 30 },
        { name: `Personas ${run} B`, coordinatorId: workerId, status: "pausado" },
      ])
      .returning({ id: schema.projects.id });
    projectId = projectRows[0]!.id;
    otherProjectId = projectRows[1]!.id;
    await db.insert(schema.projectMembers).values({ projectId, staffId: vacationerId });

    const tasks = await db
      .insert(schema.tasks)
      .values([
        // Worker: 2 open user tasks (one overdue), 1 completed, 1 admin, 1 deleted.
        { projectId, kind: "usuario", title: `Vencida ${run}`, createdById: adminId, managerId: workerId, commitmentDate: addIsoDays(today, -3) },
        { projectId, kind: "usuario", title: `Abierta ${run}`, createdById: adminId, managerId: workerId, commitmentDate: addIsoDays(today, 2) },
        { projectId, kind: "usuario", title: `Hecha ${run}`, createdById: adminId, managerId: workerId, status: "completado", closedAt: new Date() },
        { projectId, kind: "admin", title: `Admin ${run}`, createdById: adminId, managerId: workerId, commitmentDate: addIsoDays(today, -1) },
        { projectId, kind: "usuario", title: `Borrada ${run}`, createdById: adminId, managerId: workerId, deletedAt: new Date() },
        // Vacationer: support on a task due every week day.
        { projectId, kind: "usuario", title: `Apoyo ${run}`, createdById: adminId, commitmentDate: week[0]! },
      ])
      .returning({ id: schema.tasks.id });
    await db.insert(schema.taskSupport).values({ taskId: tasks[5]!.id, staffId: vacationerId });

    const vacations = await db
      .insert(schema.vacationRequests)
      .values([
        { staffId: vacationerId, fromDate: week[0]!, toDate: week[4]!, kind: "vacaciones", days: 5, status: "aprobada" },
        { staffId: workerId, fromDate: week[0]!, toDate: week[4]!, kind: "vacaciones", days: 5, status: "pendiente" },
      ])
      .returning({ id: schema.vacationRequests.id });
    vacationIds.push(...vacations.map((v) => v.id));
  });

  afterAll(async () => {
    const ids = [adminId, directorId, colaboradorId, workerId, vacationerId, inactiveId].filter(Boolean);
    if (vacationIds.length) await db.delete(schema.vacationRequests).where(inArray(schema.vacationRequests.id, vacationIds));
    const projectIds = [projectId, otherProjectId].filter(Boolean);
    if (projectIds.length) {
      const taskRows = await db
        .select({ id: schema.tasks.id })
        .from(schema.tasks)
        .where(inArray(schema.tasks.projectId, projectIds));
      const taskIds = taskRows.map((r) => r.id);
      if (taskIds.length) {
        await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, taskIds));
        await db.delete(schema.taskSupport).where(inArray(schema.taskSupport.taskId, taskIds));
        await db.delete(schema.tasks).where(inArray(schema.tasks.id, taskIds));
      }
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, projectIds));
      await db.delete(schema.projectMembers).where(inArray(schema.projectMembers.projectId, projectIds));
      await db.delete(schema.projects).where(inArray(schema.projects.id, projectIds));
    }
    if (ids.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids));
  });

  beforeEach(() => {
    session.access = "Administrador";
    session.memberId = adminId;
  });

  const rowOf = async (staffId: string) => (await actions.fetchPeopleOverviewAction()).find((r) => r.staffId === staffId);

  it("returns one row per active staff member", async () => {
    const rows = await actions.fetchPeopleOverviewAction();
    const ids = rows.map((r) => r.staffId);
    for (const id of [adminId, directorId, colaboradorId, workerId, vacationerId]) expect(ids).toContain(id);
    expect(ids).not.toContain(inactiveId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("counts admin tasks only for callers with canSeeAdminData", async () => {
    session.access = "Administrador";
    expect(await rowOf(workerId)).toMatchObject({ open: 3, overdue: 2, activeProjects: 1, occupancyPct: 30 });
    const adminDetail = await actions.fetchPersonaDetailAction(workerId);
    expect(adminDetail.tasks.map((t) => t.title)).toContain(`Admin ${run}`);

    session.access = "Dirección";
    session.memberId = directorId;
    expect(await rowOf(workerId)).toMatchObject({ open: 2, overdue: 1, occupancyPct: 20 });
    const detail = await actions.fetchPersonaDetailAction(workerId);
    expect(detail.tasks.map((t) => t.title)).toEqual([`Vencida ${run}`, `Abierta ${run}`]);
    expect(detail.tasks[0]).toMatchObject({ tone: "critical", daysLate: 3 });
    expect(detail.stats.find((s) => s.key === "abiertas")!.value).toBe(2);
    expect(detail.stats.find((s) => s.key === "vencidas")!.value).toBe(1);
  });

  it("returns hours only to canViewTeamHours viewers or the person themself", async () => {
    session.access = "Dirección";
    session.memberId = directorId;
    expect((await rowOf(workerId))!.weekHours).toBe(0);
    expect((await actions.fetchPersonaDetailAction(workerId)).weekHours).toHaveLength(5);

    session.access = "Colaborador";
    session.memberId = colaboradorId;
    expect((await rowOf(workerId))!.weekHours).toBeNull();
    expect((await rowOf(colaboradorId))!.weekHours).toBe(0);
    const other = await actions.fetchPersonaDetailAction(workerId);
    expect(other.weekHours).toBeNull();
    expect(other.person.weekHours).toBeNull();
    expect(other.stats.some((s) => s.key === "horas_semana")).toBe(false);

    session.memberId = workerId;
    const self = await actions.fetchPersonaDetailAction(workerId);
    expect(self.weekHours).toHaveLength(5);
    expect(self.stats.some((s) => s.key === "horas_semana")).toBe(true);
  });

  it("shows approved absences as vacaciones and ignores pending ones", async () => {
    expect((await rowOf(vacationerId))!.availability).toEqual(Array(5).fill("vacaciones"));
    expect((await rowOf(workerId))!.availability).not.toContain("vacaciones");
  });

  it("lists active projects with the person's role", async () => {
    const worker = await actions.fetchPersonaDetailAction(workerId);
    expect(worker.projects).toEqual([
      expect.objectContaining({ id: projectId, sublabel: "responsable", real: 30, href: `/proyectos/${projectId}` }),
    ]);
    const vacationer = await actions.fetchPersonaDetailAction(vacationerId);
    expect(vacationer.projects.map((p) => p.sublabel)).toEqual(["miembro"]);
    expect(vacationer.tasks.map((t) => t.title)).toEqual([`Apoyo ${run}`]);
  });

  it("returns NOT_FOUND for an unknown staff id", async () => {
    await expect(actions.fetchPersonaDetailAction(randomUUID())).rejects.toThrow("NOT_FOUND");
    const [deleted] = await db
      .update(schema.staff)
      .set({ deletedAt: new Date() })
      .where(eq(schema.staff.id, inactiveId))
      .returning({ id: schema.staff.id });
    await expect(actions.fetchPersonaDetailAction(deleted!.id)).rejects.toThrow("NOT_FOUND");
  });

  it("lists the person's recent activity, admin items only with canSeeAdminData", async () => {
    const taskRows = await db
      .select({ id: schema.tasks.id, title: schema.tasks.title })
      .from(schema.tasks)
      .where(inArray(schema.tasks.title, [`Vencida ${run}`, `Admin ${run}`, `Borrada ${run}`]));
    const taskId = (title: string) => taskRows.find((t) => t.title === title)!.id;
    const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);
    await db.insert(schema.historyEvents).values([
      { entity: "task", entityId: taskId(`Vencida ${run}`), kind: "cambio", actorId: workerId, field: "status", beforeValue: "pendiente", afterValue: "en_proceso", eventAt: at(1) },
      { entity: "project", entityId: projectId, kind: "cambio", actorId: workerId, field: "progress", beforeValue: "30", afterValue: "90", eventAt: at(2) },
      { entity: "task", entityId: taskId(`Admin ${run}`), kind: "comentario", actorId: workerId, comment: "Revisado", eventAt: at(3) },
      { entity: "project", entityId: projectId, kind: "cambio", actorId: workerId, field: "contractAmountMxn", beforeValue: null, afterValue: "100000", eventAt: at(4) },
      // A deleted task and someone else's event never show.
      { entity: "task", entityId: taskId(`Borrada ${run}`), kind: "comentario", actorId: workerId, comment: "Hola", eventAt: at(5) },
      { entity: "task", entityId: taskId(`Vencida ${run}`), kind: "comentario", actorId: adminId, comment: "Otro", eventAt: at(6) },
    ]);

    session.access = "Administrador";
    const admin = await actions.fetchPersonaDetailAction(workerId);
    expect(admin.recentActivity.map((a) => a.text)).toEqual([
      `Movió “Vencida ${run}” a En proceso`,
      `Movió “Personas ${run} A” a 90%`,
      `Comentó en “Admin ${run}”`,
      `Editó “Personas ${run} A”`,
    ]);
    expect(admin.recentActivity[0]).toMatchObject({ href: `/tareas?tarea=${taskId(`Vencida ${run}`)}` });
    expect(admin.recentActivity[1]).toMatchObject({ href: `/proyectos/${projectId}` });
    expect(admin.recentActivity[0]!.when).toMatch(/^(hoy|ayer) \d{1,2}:\d{2}$/);

    session.access = "Dirección";
    session.memberId = directorId;
    const director = await actions.fetchPersonaDetailAction(workerId);
    expect(director.recentActivity.map((a) => a.text)).toEqual([
      `Movió “Vencida ${run}” a En proceso`,
      `Movió “Personas ${run} A” a 90%`,
    ]);
  });
});
