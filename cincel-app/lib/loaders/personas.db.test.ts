// @vitest-environment node
/**
 * `loadPeopleOverview` 4-week load (Personas Visual) against a real Postgres:
 * every active person gets 4 `weeks` from this Monday and the approved
 * absences that overlap them, and the tasks are still read with one
 * statement. Runs only when TEST_DATABASE_URL points at a migrated database
 * (`npm run db:migrate`). Every row it creates carries a per-run marker and
 * is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("loadPeopleOverview weeks (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db, schema } = await import("@/lib/db/client");
  const { asViewer } = await import("@/lib/query/test-utils");
  const { requireCapabilityUser } = await import("@/lib/auth/session");
  const { countQueries } = await import("@/tests/helpers/count-queries");
  const { listStaff } = await import("@/lib/repositories/staff-repository");
  const { addIsoDays, fourWeeks, localIsoDate } = await import("@/lib/people/aggregates");
  const { TIME_TRACKING_TIME_ZONE } = await import("@/lib/time-tracking/settings");
  const { loadPeopleOverview } = await import("@/lib/loaders/personas");

  const ids = { staff: [] as string[], projects: [] as string[] };
  let adminId = "";
  let workerId = "";
  const today = localIsoDate(new Date(), TIME_TRACKING_TIME_ZONE);
  const mondays = fourWeeks(today);

  beforeAll(async () => {
    const members = await db
      .insert(schema.staff)
      .values([
        { name: `Admin semanas ${run}`, email: `admin-semanas-${run}@cincel.example`, role: "Administrador", capacity: 10 },
        { name: `Worker semanas ${run}`, email: `worker-semanas-${run}@cincel.example`, role: "Colaborador", capacity: 10 },
      ])
      .returning({ id: schema.staff.id });
    [adminId, workerId] = members.map((m) => m.id);
    ids.staff.push(...members.map((m) => m.id));

    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Semanas ${run}`, status: "activo", managerId: workerId })
      .returning({ id: schema.projects.id });
    ids.projects.push(project.id);
    const task = (title: string, commitmentDate: string | null) => ({
      projectId: project.id,
      kind: "usuario" as const,
      title: `${title} ${run}`,
      createdById: adminId,
      managerId: workerId,
      commitmentDate,
    });
    await db.insert(schema.tasks).values([
      task("Sin fecha", null),
      task("Vencida", addIsoDays(mondays[0]!, -3)),
      task("Semana 2", addIsoDays(mondays[1]!, 2)),
      task("Semana 4", addIsoDays(mondays[3]!, 6)),
      task("Fuera", addIsoDays(mondays[3]!, 7)),
    ]);

    await db.insert(schema.vacationRequests).values([
      // The whole third week: "Vac." in the heatmap.
      { staffId: workerId, fromDate: mondays[2]!, toDate: addIsoDays(mondays[2]!, 4), kind: "vacaciones", days: 5, status: "aprobada" },
      // Starts before the window and ends on its first Monday.
      { staffId: workerId, fromDate: addIsoDays(mondays[0]!, -10), toDate: mondays[0]!, kind: "personal", days: 7, status: "aprobada" },
      // After the 4 weeks, and a pending one inside them: neither is returned.
      { staffId: workerId, fromDate: addIsoDays(mondays[3]!, 7), toDate: addIsoDays(mondays[3]!, 8), kind: "vacaciones", days: 2, status: "aprobada" },
      { staffId: workerId, fromDate: mondays[1]!, toDate: mondays[1]!, kind: "vacaciones", days: 1, status: "pendiente" },
    ]);
  });

  afterAll(async () => {
    if (ids.projects.length) await db.delete(schema.projects).where(inArray(schema.projects.id, ids.projects));
    if (ids.staff.length) await db.delete(schema.staff).where(inArray(schema.staff.id, ids.staff));
  });

  async function overview() {
    const user = await asViewer({ id: adminId, access: "Administrador" }, () => requireCapabilityUser());
    const staff = await listStaff();
    return countQueries(() => loadPeopleOverview(user, staff));
  }

  it("returns 4 weeks and the absences that overlap them", async () => {
    const { result } = await overview();
    const row = result.find((r) => r.staffId === workerId)!;
    expect(row.weeks?.map((w) => w.weekStart)).toEqual(mondays);
    // Week 1: undated + overdue; week 2: one; week 3: none (all absent); week 4: the Sunday one.
    expect(row.weeks?.map((w) => w.open)).toEqual([2, 1, 0, 1]);
    expect(row.weeks?.map((w) => w.absentDays)).toEqual([1, 0, 5, 0]);
    expect(row.weeks?.[2]?.occupancyPct).toBe(0);
    expect(row.absences?.map((a) => [a.from, a.to])).toEqual([
      [addIsoDays(mondays[0]!, -10), mondays[0]],
      [mondays[2], addIsoDays(mondays[2]!, 4)],
    ]);
    expect(row.open).toBe(5);
  });

  it("keeps one tasks statement", async () => {
    const { statements } = await overview();
    const taskReads = statements.filter((s) => /\bfrom\s+(?:"[a-z_]+"\.)?"tasks"/i.test(s.sql));
    expect(taskReads).toHaveLength(1);
  });
});
