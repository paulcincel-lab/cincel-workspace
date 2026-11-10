// @vitest-environment node
/**
 * Inicio Visual data (#989) against a real Postgres: `loadInicio`'s hero,
 * the `abiertas` and `horas_semana` KPIs, the open shifts, today's agenda,
 * the admin-only `budgetPct` and the `showTeamWorkload` rule. Runs only when
 * TEST_DATABASE_URL points at a migrated database. Every row a test creates
 * carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

type Actor = { id: string; name: string; access: "Administrador" | "Colaborador" };
const session = vi.hoisted(() => ({
  actor: null as null | Actor,
  dataScope: "managed_projects" as string,
  showTeamWorkload: true,
}));

vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    resolveDashboardCapabilities: () => ({
      dataScope: session.dataScope,
      sections: { showProjectAssignments: true, showProjectRisk: true, showTeamWorkload: session.showTeamWorkload },
    }),
  };
});

const run = randomUUID().slice(0, 8);
const TZ = "America/Mexico_City";

describe.skipIf(!url)("loadInicio · Inicio Visual (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { localIsoDate } = await import("@/lib/dashboard/task-trend");
  const { shiftIsoDate } = await import("@/lib/dashboard/inicio");
  const { mondayOf } = await import("@/lib/time-tracking/local-time");
  const { loadInicio } = await import("@/lib/loaders/inicio");
  type User = Parameters<typeof loadInicio>[0];

  const today = localIsoDate(new Date(), TZ);
  const weekStart = mondayOf(today);
  const ids = { staff: [] as string[], projects: [] as string[], tasks: [] as string[], entries: [] as string[] };
  const t = {} as Record<"lateA1" | "lateA2" | "lateB" | "dueToday" | "parent" | "subDone" | "subOpen", string>;
  let colab: Actor;
  let admin: Actor;
  let outsider: Actor;
  let projectA = "";
  let projectB = "";

  const userOf = (actor: Actor): User =>
    ({
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
    }) as unknown as User;

  const load = () => loadInicio(userOf(session.actor!));

  async function addStaff(label: string, access: Actor["access"]): Promise<Actor> {
    const name = `Visual ${run} ${label}`;
    const [row] = await db
      .insert(schema.staff)
      .values({ name, email: `visual-${run}-${label}@cincel.example`, role: access, active: true, capacity: 8 })
      .returning({ id: schema.staff.id });
    ids.staff.push(row.id);
    return { id: row.id, name, access };
  }

  async function addProject(label: string, values: Partial<typeof schema.projects.$inferInsert> = {}): Promise<string> {
    const [row] = await db
      .insert(schema.projects)
      .values({ name: `Visual ${run} ${label}`, managerId: colab.id, progress: 40, status: "activo", ...values })
      .returning({ id: schema.projects.id });
    ids.projects.push(row.id);
    return row.id;
  }

  async function addTask(label: string, values: Partial<typeof schema.tasks.$inferInsert>): Promise<string> {
    const [row] = await db
      .insert(schema.tasks)
      .values({
        projectId: projectA,
        kind: "usuario",
        title: `Visual ${run} ${label}`,
        createdById: admin.id,
        managerId: colab.id,
        ...values,
      })
      .returning({ id: schema.tasks.id });
    ids.tasks.push(row.id);
    return row.id;
  }

  /** A closed entry of `hours` on `workDate` (local noon start). */
  async function addEntry(staffId: string, workDate: string, hours: number | null) {
    const startedAt = new Date(`${workDate}T15:00:00Z`);
    const endedAt = hours === null ? null : new Date(startedAt.getTime() + hours * 3_600_000);
    const [row] = await db
      .insert(schema.timeEntries)
      .values({ staffId, workDate, startedAt, endedAt, source: "sidebar", closedBy: endedAt ? "user" : null })
      .returning({ id: schema.timeEntries.id });
    ids.entries.push(row.id);
  }

  beforeAll(async () => {
    colab = await addStaff("colab", "Colaborador");
    admin = await addStaff("jefa", "Administrador");
    outsider = await addStaff("fuera", "Colaborador");

    projectA = await addProject("Polanco", { endDate: shiftIsoDate(today, 20), coordinatorId: admin.id });
    projectB = await addProject("Roma");

    t.lateA1 = await addTask("A vencida 1", { commitmentDate: shiftIsoDate(today, -2) });
    t.lateA2 = await addTask("A vencida 2", { commitmentDate: shiftIsoDate(today, -4) });
    // Project B has one task, but the most days late: A still wins on count.
    t.lateB = await addTask("B vencida", { projectId: projectB, commitmentDate: shiftIsoDate(today, -12) });
    t.dueToday = await addTask("A hoy", { commitmentDate: today });
    t.parent = await addTask("A padre", { commitmentDate: shiftIsoDate(today, -1) });
    t.subDone = await addTask("A sub hecha", { parentTaskId: t.parent, status: "completado", closedAt: new Date() });
    t.subOpen = await addTask("A sub abierta", { parentTaskId: t.parent });

    // Open shift today for colab; the outsider is in no scoped task or project.
    await addEntry(colab.id, today, null);
    await addEntry(outsider.id, today, null);
    // Last week: 4 h on its Monday; this week: 3 h on Monday (if it is not today, else today's open entry counts).
    await addEntry(colab.id, shiftIsoDate(weekStart, -7), 4);
    if (weekStart !== today) await addEntry(colab.id, weekStart, 3);
  });

  beforeEach(() => {
    session.actor = colab;
    session.dataScope = "managed_projects";
    session.showTeamWorkload = true;
  });

  afterAll(async () => {
    if (ids.entries.length) await db.delete(schema.timeEntries).where(inArray(schema.timeEntries.id, ids.entries));
    const historyIds = [...ids.projects, ...ids.tasks];
    if (historyIds.length) await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, historyIds));
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.staff.length) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.actorId, ids.staff));
      await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
    }
  });

  it("hero counts and focus project", async () => {
    const { hero } = await load();
    expect(hero.dueToday).toBe(1);
    // lateA1, lateA2, lateB and the parent.
    expect(hero.overdue).toBe(4);
    expect(hero.overdueProjects).toBe(2);
    expect(hero.focusProject).toEqual({ id: projectA, name: `Visual ${run} Polanco`, href: `/proyectos/${projectA}` });
  });

  it("abiertas series and delta", async () => {
    const { kpis } = await load();
    const abiertas = kpis.find((k) => k.key === "abiertas")!;
    // Six open tasks: the four overdue, the one due today and the open subtask.
    expect(abiertas.value).toBe(6);
    expect(abiertas.series7).toHaveLength(7);
    expect(abiertas.series7?.[6]).toBe(6);
    expect(abiertas.delta?.caption).toBe("vs. semana pasada");
    // Every task was created today, so the week before had none: +6, and up is bad.
    expect(abiertas.delta?.value).toBe(6);
    expect(abiertas.delta?.tone).toBe("bad");
    expect(abiertas.visibleIn).toEqual(["visual", "analitico"]);
  });

  it("horas_semana totals this and last week", async () => {
    const { kpis } = await load();
    const horas = kpis.find((k) => k.key === "horas_semana")!;
    expect(horas.label).toBe("Horas esta semana");
    expect(horas.series7).toHaveLength(7);
    // Last week's Monday entry is 4 h (no lunch deduction under 5 h).
    expect(horas.caption).toBe("4 h la semana pasada");
    if (weekStart !== today) {
      // This week: 3 h on Monday plus today's open entry, which counts until now.
      expect(horas.value).toBeGreaterThanOrEqual(3);
    }
    expect(horas.display).toMatch(/ h$/);
    expect(horas.delta?.value).toBeCloseTo(horas.value - 4, 1);
  });

  it("openShifts lists open entries of today in scope", async () => {
    const { openShifts } = await load();
    expect(openShifts).not.toBeNull();
    const people = openShifts!.people.map((p) => p.id);
    expect(people).toContain(colab.id);
    // Outside the managed scope: no scoped task or project names them.
    expect(people).not.toContain(outsider.id);
    expect(openShifts!.count).toBe(openShifts!.people.length);
    expect(openShifts!.people.find((p) => p.id === colab.id)?.initials).toBe("VC");
  });

  it("todayAgenda merges events and deliveries", async () => {
    const { todayAgenda } = await load();
    const entrega = todayAgenda.find((item) => item.kind === "entrega" && item.href?.includes(t.dueToday));
    expect(entrega).toBeDefined();
    expect(entrega?.assignee?.id).toBe(colab.id);
    for (const item of todayAgenda) expect(["evento", "entrega"]).toContain(item.kind);
    const starts = todayAgenda.map((item) => item.start);
    expect([...starts].sort()).toEqual(starts);
  });

  it("fills the attention subtasks and the project pass-through fields", async () => {
    const data = await load();
    const parent = data.attention.find((a) => a.id === t.parent);
    expect(parent).toMatchObject({ subtasks: { done: 1, total: 2 }, progressPct: 50 });
    expect(data.attention.find((a) => a.id === t.lateA1)).toMatchObject({ subtasks: null, progressPct: 0 });
    const polanco = data.projectsProgress.find((p) => p.id === projectA)!;
    expect(polanco).toMatchObject({ overdue: 3, deliveryDate: shiftIsoDate(today, 20) });
    expect(polanco.team?.map((p) => p.id)).toEqual([colab.id, admin.id]);
  });

  it("non-admin has no budgetPct", async () => {
    for (const scope of ["managed_projects", "global"]) {
      session.dataScope = scope;
      const data = await load();
      expect(data.projectsProgress.length).toBeGreaterThan(0);
      for (const item of data.projectsProgress) expect(item.budgetPct).toBeNull();
    }
  });

  it("without showTeamWorkload openShifts is null", async () => {
    session.showTeamWorkload = false;
    const data = await load();
    expect(data.openShifts).toBeNull();
    const horas = data.kpis.find((k) => k.key === "horas_semana")!;
    expect(horas.label).toBe("Mis horas esta semana");
  });
});
