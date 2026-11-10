// @vitest-environment node
/**
 * Tareas Visual summary (#986) against a real Postgres: `loadTareasTrend`'s
 * four KPI tiles (7-day series and deltas), the people at work, the week
 * strip with its dominant tramo, and the viewer scoping (admin tasks only
 * where the board shows them). Runs only when TEST_DATABASE_URL points at a
 * migrated database. Every row a test creates carries a per-run marker and is
 * deleted afterwards; each test reads only its own rows through `q`.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

type Actor = { id: string; name: string; access: "Administrador" | "Colaborador" };

const run = randomUUID().slice(0, 8);
const TZ = "America/Mexico_City";
const NO_FILTERS = { tramo: null, proyecto: null, responsable: null, estado: null, q: null };

describe.skipIf(!url)("loadTareasTrend · Tareas Visual (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { localIsoDate } = await import("@/lib/dashboard/task-trend");
  const { shiftIsoDate } = await import("@/lib/dashboard/inicio");
  const { loadTareasTrend } = await import("@/lib/loaders/tareas");
  type User = Parameters<typeof loadTareasTrend>[0];

  const today = localIsoDate(new Date(), TZ);
  const monday = shiftIsoDate(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
  /** Local noon of a `YYYY-MM-DD` in Mexico City (UTC−6). */
  const localNoon = (day: string) => new Date(`${day}T18:00:00Z`);

  const ids = { staff: [] as string[], projects: [] as string[], tasks: [] as string[], workflows: [] as string[] };
  let admin: Actor;
  let colab: Actor;
  let projectId = "";
  const tramoA = `ta${run}`;
  const tramoB = `tb${run}`;
  let tramoAId = "";
  let tramoBId = "";

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

  async function addStaff(label: string, access: Actor["access"]): Promise<Actor> {
    const name = `Trend ${run} ${label}`;
    const [row] = await db
      .insert(schema.staff)
      .values({ name, email: `trend-${run}-${label}@cincel.example`, role: access, active: true })
      .returning({ id: schema.staff.id });
    ids.staff.push(row.id);
    return { id: row.id, name, access };
  }

  async function addTask(label: string, values: Partial<typeof schema.tasks.$inferInsert>): Promise<string> {
    const [row] = await db
      .insert(schema.tasks)
      .values({
        projectId,
        kind: "usuario",
        title: `Trend ${run} ${label}`,
        createdById: admin.id,
        managerId: colab.id,
        createdAt: daysAgo(10),
        ...values,
      })
      .returning({ id: schema.tasks.id });
    ids.tasks.push(row.id);
    return row.id;
  }

  /** A `status` change en_proceso → completado at `at`. */
  async function completedAt(taskId: string, at: Date) {
    await db.insert(schema.historyEvents).values({
      entity: "task",
      entityId: taskId,
      kind: "cambio",
      field: "status",
      beforeValue: "en_proceso",
      afterValue: "completado",
      actorId: admin.id,
      eventAt: at,
    });
  }

  beforeAll(async () => {
    admin = await addStaff("admin", "Administrador");
    colab = await addStaff("colab", "Colaborador");
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Trend ${run}`, managerId: admin.id, status: "activo" })
      .returning({ id: schema.projects.id });
    projectId = project.id;
    ids.projects.push(projectId);
    const tramos = await db
      .insert(schema.workflows)
      .values([
        { key: tramoA, name: `Tramo A ${run}`, sortOrder: 90 },
        { key: tramoB, name: `Tramo B ${run}`, sortOrder: 91 },
      ])
      .returning({ id: schema.workflows.id });
    tramoAId = tramos[0].id;
    tramoBId = tramos[1].id;
    ids.workflows.push(tramoAId, tramoBId);

    // KPI rows ("kpi"): A pendiente, B en proceso (colab), C overdue for days, G overdue since today,
    // D and F completed today, E completed a week ago.
    await addTask("kpi A", { status: "pendiente" });
    await addTask("kpi B", { status: "en_proceso" });
    await addTask("kpi C", { status: "pendiente", commitmentDate: shiftIsoDate(today, -20) });
    await addTask("kpi G", { status: "pendiente", commitmentDate: shiftIsoDate(today, -1) });
    const d = await addTask("kpi D", { status: "completado", managerId: admin.id });
    const f = await addTask("kpi F", { status: "completado", managerId: admin.id });
    const e = await addTask("kpi E", { status: "completado", managerId: admin.id });
    await completedAt(d, new Date());
    await completedAt(f, new Date());
    await completedAt(e, localNoon(shiftIsoDate(today, -7)));

    // Week rows ("week"): Monday 2 × tramo A + 1 × tramo B open and 1 closed; Wednesday 1 × tramo B by delivery date.
    await addTask("week 1", { workflowId: tramoAId, commitmentDate: monday });
    await addTask("week 2", { workflowId: tramoAId, commitmentDate: monday });
    await addTask("week 3", { workflowId: tramoBId, commitmentDate: monday });
    await addTask("week 4", { workflowId: tramoAId, commitmentDate: monday, status: "completado" });
    await addTask("week 5", { workflowId: tramoBId, deliveryDate: shiftIsoDate(monday, 2) });

    // Scope rows ("scope"): one user task and one admin task, both managed by the admin.
    await addTask("scope user", { managerId: admin.id });
    await addTask("scope admin", { kind: "admin", managerId: admin.id });
  });

  afterAll(async () => {
    if (ids.tasks.length) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, ids.tasks));
      await db.delete(schema.tasks).where(inArray(schema.tasks.id, ids.tasks));
    }
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.workflows.length) await db.delete(schema.workflows).where(inArray(schema.workflows.id, ids.workflows));
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  it("series7 and deltas for the four keys", async () => {
    const trend = await loadTareasTrend(userOf(admin), { filters: { ...NO_FILTERS, q: `Trend ${run} kpi` } });
    expect(trend.kpis.map((k) => k.key)).toEqual(["abiertas", "vencidas", "en_proceso", "completadas"]);
    const kpi = Object.fromEntries(trend.kpis.map((k) => [k.key, k]));
    for (const k of trend.kpis) expect(k.series7).toHaveLength(7);

    // Open now: A, B, C, G. Before Monday D and F were still open (E closed a week ago): 6 → −2, good.
    expect(kpi.abiertas.value).toBe(4);
    expect(kpi.abiertas.series7?.at(-1)).toBe(4);
    expect(kpi.abiertas.delta).toMatchObject({ value: -2, good: true, label: "−2 esta semana" });

    // Overdue now: C and G; G only since today: +1, bad.
    expect(kpi.vencidas.value).toBe(2);
    expect(kpi.vencidas.delta).toMatchObject({ value: 1, good: false, label: "+1 desde el lunes" });

    // En proceso: B now; yesterday D and F were en proceso too.
    expect(kpi.en_proceso.value).toBe(1);
    expect(kpi.en_proceso.series7?.at(-2)).toBe(3);
    expect(kpi.en_proceso.delta).toBeUndefined();
    expect(kpi.en_proceso.caption).toBe("1 persona trabajando");
    expect(trend.activeAssignees).toBe(1);

    // Completadas: D and F this week, E in the same span last week: +1, good.
    expect(kpi.completadas.value).toBe(2);
    expect(kpi.completadas.series7?.at(-1)).toBe(2);
    expect(kpi.completadas.delta).toMatchObject({ value: 1, good: true, label: "+1 vs. semana pasada" });
  });

  it("week days with dominant tramo", async () => {
    const trend = await loadTareasTrend(userOf(admin), { filters: { ...NO_FILTERS, q: `Trend ${run} week` } });
    expect(trend.week.from).toBe(monday);
    expect(trend.week.to).toBe(shiftIsoDate(monday, 6));
    expect(trend.week.days.map((d) => d.date)).toEqual(Array.from({ length: 7 }, (_, i) => shiftIsoDate(monday, i)));
    expect(trend.week.days[0]).toEqual({ date: monday, due: 3, tramoKey: tramoA });
    expect(trend.week.days[1]).toEqual({ date: shiftIsoDate(monday, 1), due: 0, tramoKey: null });
    expect(trend.week.days[2]).toEqual({ date: shiftIsoDate(monday, 2), due: 1, tramoKey: tramoB });
    expect(trend.week.total).toBe(4);
    expect(trend.week.days.reduce((sum, d) => sum + d.due, 0)).toBe(trend.week.total);
  });

  it("respects ViewerScope and admin kind", async () => {
    const scope = { ...NO_FILTERS, q: `Trend ${run} scope` };
    const member = await loadTareasTrend(userOf(colab), { filters: scope });
    expect(member.kpis.find((k) => k.key === "abiertas")?.value).toBe(1);

    const adminAll = await loadTareasTrend(userOf(admin), { filters: scope });
    expect(adminAll.kpis.find((k) => k.key === "abiertas")?.value).toBe(1);

    // An administrator's "Responsable: Yo" includes their admin tasks, as on the board.
    const adminMine = await loadTareasTrend(userOf(admin), { filters: { ...scope, responsable: "yo" } });
    expect(adminMine.kpis.find((k) => k.key === "abiertas")?.value).toBe(2);
  });
});
