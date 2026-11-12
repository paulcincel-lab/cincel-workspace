// @vitest-environment node
/**
 * Planear mi semana against a real Postgres (BE §10.4). Runs only when
 * TEST_DATABASE_URL points at a migrated database; every row carries a per-run
 * marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("server-only", () => ({}));

const run = randomUUID().slice(0, 8);
const WEEK = "2026-11-16";

describe.skipIf(!url)("Planear mi semana (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { collectPlanWeek, computePlanWeek, loadPlanWeekData } = await import("@/lib/calendario/plan-week-data");
  const { notifyPlanWeekOwners, planWeekChanges } = await import("@/lib/calendario/plan-week-proposal");

  const ids = { staff: [] as string[], projects: [] as string[] };
  const lead = { id: "", user: null as unknown };
  let anaId = "";
  let guestId = "";
  let projectId = "";
  let taskIds: string[] = [];

  const userOf = (id: string, access: string, name: string) =>
    ({ member: { id, name, role: access, area: "", capacity: 0, availability: "", active: true, institutionalEmail: "", phone: "" }, email: "", access }) as never;

  beforeAll(async () => {
    const people = await db
      .insert(schema.staff)
      .values([
        { name: `Jefa ${run}`, email: `jefa-pw-${run}@cincel.example`, capacity: 10 },
        { name: `Ana ${run}`, email: `ana-pw-${run}@cincel.example`, capacity: 10 },
        { name: `Colaborador ${run}`, email: `colab-pw-${run}@cincel.example`, capacity: 10 },
      ])
      .returning({ id: schema.staff.id });
    [lead.id, anaId, guestId] = people.map((p) => p.id) as [string, string, string];
    ids.staff.push(...people.map((p) => p.id));
    lead.user = userOf(lead.id, "Administrador", `Jefa ${run}`);

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Madrid 22 ${run}`, status: "activo", managerId: lead.id })
      .returning({ id: schema.projects.id });
    projectId = project!.id;
    ids.projects.push(projectId);

    const created = await db
      .insert(schema.tasks)
      .values([
        { projectId, kind: "usuario", title: `Sin fecha ${run}`, createdById: lead.id, managerId: anaId, estimatedHours: 2 },
        { projectId, kind: "usuario", title: `Cerrada ${run}`, createdById: lead.id, managerId: anaId, status: "completado", closedAt: new Date() },
        { projectId, kind: "usuario", title: `Con fecha ${run}`, createdById: lead.id, managerId: anaId, commitmentDate: "2026-11-18" },
        { projectId, kind: "usuario", title: `De otra persona ${run}`, createdById: lead.id, managerId: guestId },
      ])
      .returning({ id: schema.tasks.id });
    taskIds = created.map((t) => t.id);
  });

  afterAll(async () => {
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  it("the backlog holds the open undated tasks of the lane only", async () => {
    const data = await loadPlanWeekData(userOf(anaId, "Colaborador", `Ana ${run}`), { weekStart: WEEK });
    expect(data.days).toHaveLength(5);
    expect(data.people.map((p) => p.staffId)).toEqual([anaId]);
    expect(data.backlog.map((t) => t.taskId)).toEqual([taskIds[0]]);
    expect(data.backlog[0]?.hours).toBe(2);
    expect(data.cells).toHaveLength(5);
  });

  it("planning another person's lane without permission is FORBIDDEN", async () => {
    await expect(loadPlanWeekData(userOf(guestId, "Colaborador", `Colaborador ${run}`), { weekStart: WEEK, staffIds: [anaId] })).rejects.toThrow("FORBIDDEN");
    await expect(collectPlanWeek(userOf(guestId, "Colaborador", `Colaborador ${run}`), { weekStart: WEEK, staffIds: [anaId] })).rejects.toThrow("FORBIDDEN");
  });

  it("a lead plans the team and dropped tasks join the backlog", async () => {
    const { collected, plan } = await computePlanWeek(lead.user as never, { weekStart: WEEK, staffIds: [anaId], taskIds: [taskIds[2]!] }, new Date("2026-11-16T15:00:00Z"));
    expect(collected.backlog.map((t) => t.taskId).sort()).toEqual([taskIds[0], taskIds[2]].sort());
    expect(plan.placements).toHaveLength(2);
    for (const cell of plan.cells) expect(cell.after).toBeLessThanOrEqual(cell.workday);
    const changes = planWeekChanges(collected, plan);
    expect(changes.every((c) => c.type === "task_date" && c.staffId === anaId)).toBe(true);
  });

  it("apply notifies each other owner once", async () => {
    const { collected, plan } = await computePlanWeek(lead.user as never, { weekStart: WEEK, staffIds: [anaId] }, new Date("2026-11-16T15:00:00Z"));
    const proposal = { id: randomUUID(), kind: "planear_semana" as const, changes: planWeekChanges(collected, plan) };
    const first = await notifyPlanWeekOwners(lead.user as never, proposal);
    expect(first.notified).toBe(1);
    const again = await notifyPlanWeekOwners(lead.user as never, proposal);
    expect(again.notified).toBe(0);
    const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.staffId, anaId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "asignacion", title: "Tu semana cambió" });
    expect(rows[0]?.body).toContain("planeó 1 tarea tuya para la semana del 16 nov.");
  });
});
