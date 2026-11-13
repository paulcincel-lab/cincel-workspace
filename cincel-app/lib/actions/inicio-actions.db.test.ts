// @vitest-environment node
/**
 * Inicio against a real Postgres (redesign BE §7.10, §9.7, §16; Query
 * Migration Phase 3, #937): `getInicioPageData` and its loader
 * `loadInicioPage`. The `InicioData` shape, KPI values against fixtures, the
 * dashboard scope and the admin-only filter (no admin task, no `budgetPct`
 * and no client / origin data for a caller without `canSeeAdminData`), a
 * guest → FORBIDDEN, Mi día limited to the caller, the #917 regression
 * (equal to the pre-migration `fetchInicioAction` output), the slim task
 * read (`listTaskRows` only) and the loader's statement count (≤ 22).
 * Runs only when TEST_DATABASE_URL points at a migrated database
 * (`npm run db:migrate`). Every row a test creates carries a per-run marker
 * and is deleted afterwards.
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
    // A guest: the real `requireCapabilityUser` throws FORBIDDEN.
    if (!actor) throw new Error("FORBIDDEN");
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

/** Spies on the task reads, so a test can assert the loader only uses the slim projection. */
vi.mock("@/lib/repositories/tasks-repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/repositories/tasks-repository")>();
  return { ...actual, listTasks: vi.fn(actual.listTasks), listTaskRows: vi.fn(actual.listTaskRows) };
});

const run = randomUUID().slice(0, 8);
const TZ = "America/Mexico_City";

describe.skipIf(!url)("Inicio page data (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { localIsoDate } = await import("@/lib/dashboard/task-trend");
  const { shiftIsoDate } = await import("@/lib/dashboard/inicio");
  const { getInicioPageData } = await import("./page-data/inicio-actions");
  const { loadInicioPage } = await import("@/lib/loaders/inicio");
  const { requireCapabilityUser } = await import("@/lib/auth/session");
  const tasksRepository = await import("@/lib/repositories/tasks-repository");
  const { countQueries } = await import("../../tests/helpers/count-queries");
  const { legacyFetchInicio } = await import("../../tests/helpers/inicio-legacy");
  const { IMPLEMENTED } = await import("./dashboard-actions.flags");

  /** What the Inicio query returns for the current test actor. */
  const fetchInicio = async () => (await getInicioPageData({})).inicio;

  const today = localIsoDate(new Date(), TZ);
  const clientName = `Cliente inicio ${run}`;
  const origin = `Origen inicio ${run}`;
  const ids = { staff: [] as string[], contacts: [] as string[], projects: [] as string[], tasks: [] as string[] };
  const t = {} as Record<"overdue" | "blocked" | "review" | "dueToday" | "done" | "admin" | "adminToday", string>;
  let colab: Actor;
  let admin: Actor;
  /** A second colaborador with no tasks, only a reminder of today. */
  let other: Actor;
  const reminders = { colab: "", other: "" };
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
    other = await addStaff("otra", "Colaborador");

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

  beforeAll(async () => {
    // Reminders of today (Mexico City noon, so the local day matches).
    const dueAt = new Date(`${today}T18:00:00Z`);
    const rows = await db
      .insert(schema.reminders)
      .values([
        { staffId: colab.id, text: `Inicio ${run} recordatorio colab`, dueAt },
        { staffId: other.id, text: `Inicio ${run} recordatorio otra`, dueAt },
      ])
      .returning({ id: schema.reminders.id });
    reminders.colab = rows[0].id;
    reminders.other = rows[1].id;
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
    const data = await fetchInicio();
    expect(Object.keys(data).sort()).toEqual(
      [
        "attention",
        "kpis",
        "hero",
        "myAttention",
        "myDay",
        "myWeek",
        "openShifts",
        "paceScope",
        "projectsProgress",
        "sections",
        "tasksByTramo",
        "tasksByTramoAssignee",
        "todayAgenda",
        "weeklyPace",
        "workload",
      ].sort()
    );
  });

  it("computes the KPIs from the fixtures; completadas_semana only in Analítico", async () => {
    const { kpis } = await fetchInicio();
    expect(kpis.map((k) => k.key)).toEqual([
      "proyectos_activos",
      "vencidas",
      "bloqueadas",
      "revisiones_7d",
      "completadas_semana",
      "abiertas",
      "horas_semana",
      "retraso_promedio",
    ]);
    const value = Object.fromEntries(kpis.map((k) => [k.key, k.value]));
    expect(value).toEqual({
      proyectos_activos: 1,
      vencidas: 1,
      bloqueadas: 1,
      revisiones_7d: 1,
      completadas_semana: 1,
      abiertas: 4,
      horas_semana: 0,
      retraso_promedio: 3,
    });
    for (const kpi of kpis) {
      expect(kpi.series7).toHaveLength(7);
      expect(kpi.series7?.[6]).toBe(kpi.value);
      expect(kpi.delta?.caption).toBe("vs. semana pasada");
      // The Visual chip always has text and a tone; every card has a context line.
      expect(kpi.delta?.label).toMatch(/^(sin cambio|[+−]\d.* (vs\. semana|este mes))$/);
      expect(["good", "bad", "neutral"]).toContain(kpi.delta?.tone);
      expect(kpi.caption).toBeTruthy();
      if (kpi.key === "completadas_semana" || kpi.key === "retraso_promedio") expect(kpi.visibleIn).toEqual(["analitico"]);
      else if (kpi.key === "abiertas") expect(kpi.visibleIn).toEqual(["visual", "analitico"]);
      else if (kpi.key === "horas_semana") expect(kpi.visibleIn).toEqual(["visual"]);
      else expect(kpi.visibleIn).toBeUndefined();
    }
  });

  it("returns 12 ascending weeks of pace and etapa groups with diasProm", async () => {
    const { weeklyPace, tasksByTramo } = await fetchInicio();
    expect(weeklyPace).toHaveLength(12);
    for (let i = 1; i < weeklyPace.length; i++) expect(weeklyPace[i].weekStart > weeklyPace[i - 1].weekStart).toBe(true);
    expect(weeklyPace[11]).toMatchObject({ created: 5, completed: 1 });
    expect(weeklyPace.slice(0, 11).every((w) => w.created === 0 && w.completed === 0)).toBe(true);

    expect(tasksByTramo).toEqual([
      expect.objectContaining({ key: "sin-tramo", label: "Sin etapa", value: 4, secondary: 1, extra: { diasProm: 0 } }),
    ]);
  });

  it("builds attention, Mi día, progress and workload from the caller's scope", async () => {
    const data = await fetchInicio();

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
      const data = await fetchInicio();
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
    const data = await fetchInicio();
    expect(data.attention.map((a) => a.id)).toEqual(expect.arrayContaining([t.overdue, t.admin, t.adminToday]));
    expect(data.tasksByTramo.some((s) => s.key === "admin")).toBe(true);
    // Shapes never carry client or origin fields, even for admins.
    expect(mentionsAny(data, [clientName, origin])).toEqual([]);
  });

  it("drops the deleted project from the scope", async () => {
    await db.update(schema.projects).set({ deletedAt: new Date() }).where(eq(schema.projects.id, projectId));
    try {
      const data = await fetchInicio();
      expect(data.projectsProgress).toEqual([]);
      expect(data.attention).toEqual([]);
      expect(data.kpis.find((k) => k.key === "proyectos_activos")?.value).toBe(0);
    } finally {
      await db.update(schema.projects).set({ deletedAt: null }).where(eq(schema.projects.id, projectId));
    }
  });

  it("returns the page data: the widgets and the banner flag", async () => {
    const page = await getInicioPageData({});
    expect(Object.keys(page).sort()).toEqual(["firstLogin", "inicio"]);
    expect(page.firstLogin).toEqual({ showGoogleSetupBanner: false });
  });

  it("rejects a guest with FORBIDDEN", async () => {
    session.actor = null;
    await expect(getInicioPageData({})).rejects.toThrow("FORBIDDEN");
  });

  it("gives a staff member only their own Mi día reminders", async () => {
    const mine = (await fetchInicio()).myDay.map((item) => item.id).join(" ");
    expect(mine).toContain(reminders.colab);
    expect(mine).not.toContain(reminders.other);

    session.actor = other;
    const theirs = (await fetchInicio()).myDay.map((item) => item.id).join(" ");
    expect(theirs).toContain(reminders.other);
    expect(theirs).not.toContain(reminders.colab);
    // `other` is involved in no task: no task reaches their agenda.
    for (const id of ids.tasks) expect(theirs).not.toContain(id);
  });

  it("strips the admin-only fields from a non-admin's dehydrated data", async () => {
    for (const scope of ["managed_projects", "global"]) {
      session.dataScope = scope;
      const page = await loadInicioPage(await requireCapabilityUser());
      // What `<Hydrate>` serializes into the HTML.
      const html = JSON.stringify(page);
      expect(mentionsAny(html, [...adminIds(), `Inicio ${run} admin`, clientName, origin]), scope).toEqual([]);
      expect(page.inicio.projectsProgress.length).toBeGreaterThan(0);
      for (const item of page.inicio.projectsProgress) expect(item.budgetPct).toBeNull();
    }
  });

  it.each(["colab", "admin"] as const)(
    "equals the pre-migration fetchInicioAction output for the %s (#917)",
    async (who) => {
      session.actor = who === "admin" ? admin : colab;
      session.dataScope = who === "admin" ? "global" : "managed_projects";
      const user = await requireCapabilityUser();
      const before = await legacyFetchInicio(user);
      const loaded = (await loadInicioPage(user)).inicio;
      // Only the fields the frozen reference has: Inicio Visual (#989), Esencial (#990) and Analítico (#991)
      // added fields and KPIs later (the reference shares the widget builders, so their new fields are on both sides).
      const legacyKeys = new Set(before.kpis.map((k) => k.key));
      const after = {
        ...Object.fromEntries(Object.keys(before).map((key) => [key, loaded[key as keyof typeof loaded]])),
        kpis: loaded.kpis.filter((k) => legacyKeys.has(k.key)),
        attention: loaded.attention.map(({ subtasks: _s, progressPct: _p, ...item }) => item),
        projectsProgress: loaded.projectsProgress.map(({ deliveryDate: _d, team: _t, atRisk: _r, ...item }) => item),
      } as typeof before;
      expect(after).toEqual(before);
      // The parts #917 lost: delta chips, context lines and sparklines.
      expect(after.kpis.map((k) => [k.key, k.delta, k.caption, k.series7])).toEqual(
        before.kpis.map((k) => [k.key, k.delta, k.caption, k.series7])
      );
      for (const kpi of after.kpis) {
        expect(kpi.delta?.label).toBeTruthy();
        expect(kpi.caption).toBeTruthy();
        expect(kpi.series7).toHaveLength(7);
      }
    }
  );

  it("reads tasks only through the slim listTaskRows projection", async () => {
    const listTasks = vi.mocked(tasksRepository.listTasks);
    const listTaskRows = vi.mocked(tasksRepository.listTaskRows);
    listTasks.mockClear();
    listTaskRows.mockClear();
    await loadInicioPage(await requireCapabilityUser());
    expect(listTasks).not.toHaveBeenCalled();
    expect(listTaskRows).toHaveBeenCalledTimes(1);
  });

  it("runs at most 22 statements per load", async () => {
    const user = await requireCapabilityUser();
    const { count, statements } = await countQueries(() => loadInicioPage(user));
    // Recorded in the PR; fetchInicioAction ran ≤ 18, Inicio Visual (#989) adds open shifts, the hours settings and two week-hours reads.
    console.info(`[inicio] loadInicioPage statements: ${count}`);
    expect(count, statements.map((st) => st.sql).join("\n")).toBeLessThanOrEqual(22);
  });
});
