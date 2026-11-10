// @vitest-environment node
/**
 * The Tareas "Mostrar" filter in the tasks repository against a real
 * Postgres (#986): `abiertas` leaves out completado and closing custom
 * statuses, `en_retraso` compares the commitment date (else the delivery
 * date) with today in America/Mexico_City, and `taskFacets` counts each
 * choice and the viewer's own tasks. Runs only when TEST_DATABASE_URL points
 * at a migrated database. Every row a test creates carries a per-run marker
 * and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);
const TZ = "America/Mexico_City";

describe.skipIf(!url)("tasks repository: Mostrar (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const repo = await import("@/lib/repositories/tasks-repository");
  const { localIsoDate } = await import("@/lib/dashboard/task-trend");
  const { shiftIsoDate } = await import("@/lib/dashboard/inicio");
  type ViewerScope = import("@/lib/types/core").ViewerScope;

  const ids = { staff: [] as string[], tasks: [] as string[], statuses: [] as string[] };
  let projectId = "";
  let meId = "";
  let otherId = "";
  let viewer: ViewerScope = { staffId: "", isAdmin: true };
  const t = {} as Record<string, string>;

  async function addTask(key: string, values: Partial<typeof schema.tasks.$inferInsert>) {
    const [row] = await db
      .insert(schema.tasks)
      .values({ projectId, kind: "usuario", title: `Mostrar ${run} ${key}`, createdById: meId, managerId: otherId, ...values })
      .returning({ id: schema.tasks.id });
    ids.tasks.push(row.id);
    t[key] = row.id;
  }

  const idsOf = async (mostrar: "abiertas" | "en_retraso", today?: string) =>
    (await repo.listTaskRows({ search: `Mostrar ${run}`, mostrar, ...(today ? { today } : {}) }, viewer))
      .map((r) => r.id)
      .sort();
  const sorted = (...keys: string[]) => keys.map((k) => t[k]).sort();

  beforeAll(async () => {
    const people = await db
      .insert(schema.staff)
      .values([
        { name: `Mostrar ${run} yo`, role: "Administrador" },
        { name: `Mostrar ${run} otra`, role: "Colaborador" },
      ])
      .returning({ id: schema.staff.id });
    meId = people[0].id;
    otherId = people[1].id;
    ids.staff.push(meId, otherId);
    viewer = { staffId: meId, isAdmin: true };
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Mostrar ${run}` })
      .returning({ id: schema.projects.id });
    projectId = project.id;
    const [closing] = await db
      .insert(schema.taskStatuses)
      .values({ name: `Cerrada ${run}`, closes: true })
      .returning({ id: schema.taskStatuses.id });
    ids.statuses.push(closing.id);

    const today = localIsoDate(new Date(), TZ);
    await addTask("open", { status: "pendiente", managerId: meId });
    await addTask("done", { status: "completado", commitmentDate: "2020-01-01" });
    await addTask("closingCustom", { status: "en_proceso", customStatusId: closing.id, commitmentDate: "2020-01-01" });
    // Fixed dates against `today` = 2026-11-10.
    await addTask("lateCommit", { status: "pendiente", commitmentDate: "2026-11-09" });
    await addTask("lateDelivery", { status: "en_proceso", deliveryDate: "2026-11-09", managerId: meId });
    await addTask("commitWins", { status: "pendiente", commitmentDate: "2026-11-12", deliveryDate: "2026-11-01" });
    await addTask("dueToday", { status: "bloqueado", commitmentDate: "2026-11-10" });
    // Against the real Mexico City date.
    await addTask("mxYesterday", { status: "pendiente", commitmentDate: shiftIsoDate(today, -1) });
    await addTask("mxToday", { status: "pendiente", commitmentDate: today });
  });

  afterAll(async () => {
    if (ids.tasks.length) await db.delete(schema.tasks).where(inArray(schema.tasks.id, ids.tasks));
    if (projectId) await db.delete(schema.projects).where(inArray(schema.projects.id, [projectId]));
    if (ids.statuses.length) await db.delete(schema.taskStatuses).where(inArray(schema.taskStatuses.id, ids.statuses));
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  it("mostrar abiertas excludes closed and custom closing statuses", async () => {
    const open = await idsOf("abiertas");
    expect(open).not.toContain(t.done);
    expect(open).not.toContain(t.closingCustom);
    expect(open).toEqual(
      sorted("open", "lateCommit", "lateDelivery", "commitWins", "dueToday", "mxYesterday", "mxToday"),
    );
  });

  it("en_retraso uses commitment then delivery date in Mexico City", async () => {
    // With a fixed today: commitment first, delivery when there is no commitment; due today is not late.
    const fixed = await idsOf("en_retraso", "2026-11-10");
    expect(fixed).toContain(t.lateCommit);
    expect(fixed).toContain(t.lateDelivery);
    expect(fixed).not.toContain(t.commitWins);
    expect(fixed).not.toContain(t.dueToday);
    expect(fixed).not.toContain(t.done);
    expect(fixed).not.toContain(t.closingCustom);

    // Without one, today is the Mexico City date.
    const live = await idsOf("en_retraso");
    expect(live).toContain(t.mxYesterday);
    expect(live).not.toContain(t.mxToday);
  });

  it("facets counts mostrar and mine", async () => {
    const facets = await repo.taskFacets({ search: `Mostrar ${run}`, today: "2026-11-10" }, viewer);
    // 9 tasks, 7 of them open; en_retraso equals what the filter returns for the same day.
    expect(facets.mostrar?.todas).toBe(9);
    expect(facets.mostrar?.abiertas).toBe(7);
    const fixedLate = await idsOf("en_retraso", "2026-11-10");
    expect(facets.mostrar?.en_retraso).toBe(fixedLate.length);
    // Mine: the tasks the viewer manages (open and lateDelivery).
    expect(facets.mine).toBe(2);

    // With a Mostrar choice the chip counts stay the same; `mine` follows the choice.
    const late = await repo.taskFacets({ search: `Mostrar ${run}`, today: "2026-11-10", mostrar: "en_retraso" }, viewer);
    expect(late.mostrar).toEqual(facets.mostrar);
    expect(late.mine).toBe(1);
    expect(late.total).toBe(fixedLate.length);
  });
});
