// @vitest-environment node
/**
 * `fetchInicioAction` against a real Postgres (redesign BE §7.10, §9.7, §16):
 * the `InicioData` shape, KPI values against fixtures, the dashboard scope and
 * the admin-only filter (no admin task and no client / origin data for a
 * caller without `canSeeAdminData`). Runs only when TEST_DATABASE_URL points
 * at a migrated database (`npm run db:migrate`). Every row a test creates
 * carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

type Actor = { id: string; name: string; access: "Administrador" | "Colaborador" };
const session = vi.hoisted(() => ({ actor: null as null | Actor, dataScope: "managed_projects" as string }));

vi.mock("@/lib/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/session")>()),
  requireCapabilityUser: vi.fn(async () => {
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
        institutionalEmail: "",
        phone: "",
      },
      email: `${actor.id}@cincel.example`,
      access: actor.access,
    };
  }),
}));

vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    resolveDashboardCapabilities: () => ({
      dataScope: session.dataScope,
      sections: { showProjectAssignments: true, showProjectRisk: true, showTeamWorkload: true },
    }),
  };
});

const run = randomUUID().slice(0, 8);
const TZ = "America/Mexico_City";

describe.skipIf(!url)("fetchInicioAction (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { localIsoDate } = await import("@/lib/dashboard/task-trend");
  const { shiftIsoDate } = await import("@/lib/dashboard/inicio");
  const { fetchInicioAction } = await import("./dashboard-actions");
  const { IMPLEMENTED } = await import("./dashboard-actions.flags");

  const today = localIsoDate(new Date(), TZ);
  const clientName = `Cliente inicio ${run}`;
  const origin = `Origen inicio ${run}`;
  const ids = { staff: [] as string[], contacts: [] as string[], projects: [] as string[], tasks: [] as string[] };
  const t = {} as Record<"overdue" | "blocked" | "review" | "dueToday" | "done" | "admin" | "adminToday", string>;
  let colab: Actor;
  let admin: Actor;
  let projectId = "";

  async function addStaff(label: string, access: Actor["access"]): Promise<Actor> {
    const name = `Inicio ${run} ${label}`;
    const [row] = await db
      .insert(schema.staff)
      .values({ name, email: `inicio-${run}-${label}@cincel.example`, role: access, active: true, capacity: 8 })
      .returning({ id: schema.staff.id });
    ids.staff.push(row.id);
    return { id: row.id, name, access };
  }

  async function addTask(
    label: string,
    values: Partial<typeof schema.tasks.$inferInsert> & { kind?: "usuario" | "admin" }
  ): Promise<string> {
    const [row] = await db
      .insert(schema.tasks)
      .values({
        projectId,
        kind: "usuario",
        title: `Inicio ${run} ${label}`,
        createdById: admin.id,
        managerId: colab.id,
        ...values,
      })
      .returning({ id: schema.tasks.id });
    ids.tasks.push(row.id);
    return row.id;
  }

  beforeAll(async () => {
    colab = await addStaff("colab", "Colaborador");
    admin = await addStaff("jefa", "Administrador");

    const [contact] = await db
      .insert(schema.contacts)
      .values({ type: "cliente", name: clientName })
      .returning({ id: schema.contacts.id });
    ids.contacts.push(contact.id);

    const [project] = await db
      .insert(schema.projects)
      .values({
        name: `Inicio ${run} proyecto`,
        managerId: colab.id,
        clientId: contact.id,
        origin,
        originStaffId: admin.id,
        progress: 30,
        status: "activo",
      })
      .returning({ id: schema.projects.id });
    projectId = project.id;
    ids.projects.push(project.id);

    t.overdue = await addTask("vencida", { commitmentDate: shiftIsoDate(today, -3) });
    t.blocked = await addTask("bloqueada", { status: "bloqueado", commitmentDate: shiftIsoDate(today, 10) });
    t.review = await addTask("revision", { reviewDate: shiftIsoDate(today, 3), commitmentDate: shiftIsoDate(today, 20) });
    t.dueToday = await addTask("hoy", { status: "en_proceso", commitmentDate: today });
    t.done = await addTask("hecha", { status: "completado", closedAt: new Date() });
    t.admin = await addTask("admin vencida", { kind: "admin", commitmentDate: shiftIsoDate(today, -5) });
    t.adminToday = await addTask("admin hoy", { kind: "admin", commitmentDate: today });

    await db.insert(schema.historyEvents).values([
      {
        entity: "task",
        entityId: t.done,
        kind: "cambio",
        actorId: colab.id,
        field: "status",
        beforeValue: "pendiente",
        afterValue: "completado",
      },
      {
        entity: "task",
        entityId: t.blocked,
        kind: "cambio",
        actorId: colab.id,
        field: "status",
        beforeValue: "pendiente",
        afterValue: "bloqueado",
      },
    ]);
  });

  beforeEach(() => {
    session.actor = colab;
    session.dataScope = "managed_projects";
  });

  afterAll(async () => {
    const historyIds = [...ids.projects, ...ids.tasks];
    if (historyIds.length) await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, historyIds));
    // Cascades the tasks.
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.contacts.length) await db.delete(schema.contacts).where(inArray(schema.contacts.id, ids.contacts));
    if (ids.staff.length) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.actorId, ids.staff));
      await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
    }
  });

  const adminIds = () => [t.admin, t.adminToday];
  const mentionsAny = (value: unknown, needles: string[]) => {
    const json = JSON.stringify(value);
    return needles.filter((n) => json.includes(n));
  };

  it("is flagged as implemented", () => {
    expect(IMPLEMENTED.fetchInicioAction).toBe(true);
  });

  it("returns every InicioData field", async () => {
    const data = await fetchInicioAction();
    expect(Object.keys(data).sort()).toEqual(
      ["attention", "kpis", "myDay", "projectsProgress", "tasksByTramo", "weeklyPace", "workload"].sort()
    );
  });

  it("computes the KPIs from the fixtures; completadas_semana only in Analítico", async () => {
    const { kpis } = await fetchInicioAction();
    expect(kpis.map((k) => k.key)).toEqual([
      "proyectos_activos",
      "vencidas",
      "bloqueadas",
      "revisiones_7d",
      "completadas_semana",
    ]);
    const value = Object.fromEntries(kpis.map((k) => [k.key, k.value]));
    expect(value).toEqual({
      proyectos_activos: 1,
      vencidas: 1,
      bloqueadas: 1,
      revisiones_7d: 1,
      completadas_semana: 1,
    });
    for (const kpi of kpis) {
      expect(kpi.series7).toHaveLength(7);
      expect(kpi.series7?.[6]).toBe(kpi.value);
      expect(kpi.delta?.caption).toBe("vs. semana pasada");
      // The Visual chip always has text and a tone; every card has a context line.
      expect(kpi.delta?.label).toMatch(/^(sin cambio|[+−]\d.* (vs\. semana|este mes))$/);
      expect(["good", "bad", "neutral"]).toContain(kpi.delta?.tone);
      expect(kpi.caption).toBeTruthy();
      if (kpi.key === "completadas_semana") expect(kpi.visibleIn).toEqual(["analitico"]);
      else expect(kpi.visibleIn).toBeUndefined();
    }
  });

  it("returns 8 ascending weeks of pace and tramo groups with diasProm", async () => {
    const { weeklyPace, tasksByTramo } = await fetchInicioAction();
    expect(weeklyPace).toHaveLength(8);
    for (let i = 1; i < weeklyPace.length; i++) expect(weeklyPace[i].weekStart > weeklyPace[i - 1].weekStart).toBe(true);
    expect(weeklyPace[7]).toMatchObject({ created: 5, completed: 1 });
    expect(weeklyPace.slice(0, 7).every((w) => w.created === 0 && w.completed === 0)).toBe(true);

    expect(tasksByTramo).toEqual([
      expect.objectContaining({ key: "sin-tramo", label: "Sin tramo", value: 4, secondary: 1, extra: { diasProm: 0 } }),
    ]);
  });

  it("builds attention, Mi día, progress and workload from the caller's scope", async () => {
    const data = await fetchInicioAction();

    expect(data.attention.map((a) => a.id).sort()).toEqual([t.overdue, t.blocked, t.dueToday].sort());
    expect(data.attention.find((a) => a.id === t.overdue)).toMatchObject({ tone: "critical", daysLate: 3 });

    expect(data.myDay.some((item) => item.id.includes(t.dueToday))).toBe(true);
    expect(data.myDay.some((item) => item.id.includes(t.review))).toBe(false);

    expect(data.projectsProgress).toEqual([
      expect.objectContaining({
        id: projectId,
        real: 30,
        plan: null,
        budgetPct: null,
        next: { title: `Inicio ${run} hoy`, date: today },
      }),
    ]);

    expect(data.workload).toEqual([expect.objectContaining({ id: colab.id, open: 4, overdue: 1 })]);
  });

  it("never gives a non-admin an admin task or client / origin data", async () => {
    for (const scope of ["managed_projects", "global"]) {
      session.dataScope = scope;
      const data = await fetchInicioAction();
      for (const field of ["kpis", "attention", "myDay", "projectsProgress", "workload", "tasksByTramo"] as const) {
        expect(mentionsAny(data[field], [...adminIds(), `Inicio ${run} admin`]), `${scope} ${field}`).toEqual([]);
        expect(mentionsAny(data[field], [clientName, origin]), `${scope} ${field}`).toEqual([]);
      }
      expect(data.tasksByTramo.some((s) => s.key === "admin")).toBe(false);
      expect(data.workload.find((p) => p.id === colab.id)).toMatchObject({ open: 4, overdue: 1 });
    }
  });

  it("includes admin tasks for a caller with canSeeAdminData", async () => {
    session.actor = admin;
    session.dataScope = "global";
    const data = await fetchInicioAction();
    expect(data.attention.map((a) => a.id)).toEqual(expect.arrayContaining([t.overdue, t.admin, t.adminToday]));
    expect(data.tasksByTramo.some((s) => s.key === "admin")).toBe(true);
    // Shapes never carry client or origin fields, even for admins.
    expect(mentionsAny(data, [clientName, origin])).toEqual([]);
  });

  it("drops the deleted project from the scope", async () => {
    await db.update(schema.projects).set({ deletedAt: new Date() }).where(eq(schema.projects.id, projectId));
    try {
      const data = await fetchInicioAction();
      expect(data.projectsProgress).toEqual([]);
      expect(data.attention).toEqual([]);
      expect(data.kpis.find((k) => k.key === "proyectos_activos")?.value).toBe(0);
    } finally {
      await db.update(schema.projects).set({ deletedAt: null }).where(eq(schema.projects.id, projectId));
    }
  });
});
