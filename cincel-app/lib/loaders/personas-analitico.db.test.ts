// @vitest-environment node
/**
 * `loadPeopleOverview` against a real Postgres (Personas Analítico, #1000):
 * open tasks grouped per project with overdue and the 4 load weeks, and
 * `sharesProjectWithViewer` from the active project roles, both from the
 * existing reads (no extra statement). Runs only when TEST_DATABASE_URL points
 * at a migrated database (`npm run db:migrate`). Every row carries a per-run
 * marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/time-tracking/settings", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/time-tracking/settings")>();
  return { ...original, getTimeTrackingSettings: async () => original.DEFAULT_TIME_TRACKING_SETTINGS };
});
vi.mock("@/lib/time-tracking/week-hours", () => ({
  weekHours: async (_db: unknown, staffIds: string[]) => new Map(staffIds.map((id) => [id, { days: [], total: 0 }])),
}));
vi.mock("@/lib/vacations/approved-absences", () => ({
  approvedAbsences: async (
    executor: import("@/lib/repositories/owner-scoped").OwnerDb,
    range: { from: string; to: string; staffIds?: string[] },
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
          range.staffIds ? inArray(vacationRequests.staffId, range.staffIds) : undefined,
        ),
      );
    return rows.map((r) => ({ staffId: r.staffId, from: r.fromDate, to: r.toDate, kind: r.kind }));
  },
}));

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("loadPeopleOverview projects and sharesProjectWithViewer (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { loadPeopleOverview } = await import("@/lib/loaders/personas");
  const { addIsoDays, localIsoDate, workWeek } = await import("@/lib/people/aggregates");
  const { TIME_TRACKING_TIME_ZONE } = await import("@/lib/time-tracking/settings");
  type Staff = import("@/lib/types/core").Staff;
  type AuthenticatedUser = import("@/lib/auth/auth-service").AuthenticatedUser;

  const today = localIsoDate(new Date(), TIME_TRACKING_TIME_ZONE);
  const monday = workWeek(today)[0]!;
  const mondays = [0, 7, 14, 21].map((n) => addIsoDays(monday, n));

  const ids = { viewer: "", manager: "", coordinator: "", member: "", outsider: "", solo: "" };
  const projectIds: string[] = [];
  let projectA = "";
  let projectC = "";

  const staffOf = (...list: string[]) =>
    list.map((id) => ({ id, active: true, capacity: 5 }) as unknown as Staff);
  const viewerUser = (id: string) =>
    ({ member: { id, role: "Administrador" }, email: "", access: "Administrador" }) as unknown as AuthenticatedUser;
  const everyone = () => staffOf(ids.viewer, ids.manager, ids.coordinator, ids.member, ids.outsider, ids.solo);

  beforeAll(async () => {
    const members = await db
      .insert(schema.staff)
      .values([
        { name: `Viewer ${run}`, role: "Colaborador", capacity: 5 },
        { name: `Manager ${run}`, role: "Colaborador", capacity: 5 },
        { name: `Coordinator ${run}`, role: "Colaborador", capacity: 5 },
        { name: `Member ${run}`, role: "Colaborador", capacity: 5 },
        { name: `Outsider ${run}`, role: "Colaborador", capacity: 5 },
        { name: `Solo ${run}`, role: "Colaborador", capacity: 5 },
      ])
      .returning({ id: schema.staff.id });
    [ids.viewer, ids.manager, ids.coordinator, ids.member, ids.outsider, ids.solo] = members.map((m) => m.id);

    const projects = await db
      .insert(schema.projects)
      .values([
        // A: managed by Manager; Viewer and Member are members.
        { name: `Analitico ${run} A`, managerId: ids.manager },
        // B: managed by Viewer, coordinated by Coordinator.
        { name: `Analitico ${run} B`, managerId: ids.viewer, coordinatorId: ids.coordinator },
        // C: Outsider only.
        { name: `Analitico ${run} C`, managerId: ids.outsider },
        // D: paused, so it shares nothing.
        { name: `Analitico ${run} D`, managerId: ids.outsider, status: "pausado" },
      ])
      .returning({ id: schema.projects.id });
    projectIds.push(...projects.map((p) => p.id));
    projectA = projects[0]!.id;
    projectC = projects[2]!.id;
    await db.insert(schema.projectMembers).values([
      { projectId: projectA, staffId: ids.viewer },
      { projectId: projectA, staffId: ids.member },
      { projectId: projects[3]!.id, staffId: ids.viewer },
    ]);

    const task = (projectId: string, title: string, commitmentDate: string | null) => ({
      projectId,
      kind: "usuario" as const,
      title: `${title} ${run}`,
      createdById: ids.viewer,
      managerId: ids.manager,
      commitmentDate,
    });
    await db.insert(schema.tasks).values([
      // Project A: overdue + undated (week 1), week 2, week 4, after week 4.
      task(projectA, "Vencida", addIsoDays(today, -3)),
      task(projectA, "Sin fecha", null),
      task(projectA, "Semana 2", addIsoDays(mondays[1]!, 2)),
      task(projectA, "Semana 4", mondays[3]!),
      task(projectA, "Lejana", addIsoDays(mondays[3]!, 10)),
      // Project C: one task in week 3.
      task(projectC, "Semana 3", addIsoDays(mondays[2]!, 1)),
    ]);
  });

  afterAll(async () => {
    if (projectIds.length) {
      await db.delete(schema.tasks).where(inArray(schema.tasks.projectId, projectIds));
      await db.delete(schema.projectMembers).where(inArray(schema.projectMembers.projectId, projectIds));
      await db.delete(schema.projects).where(inArray(schema.projects.id, projectIds));
    }
    const staffIds = Object.values(ids).filter(Boolean);
    if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
  });

  it("groups open tasks per project with overdue and weeks", async () => {
    const rows = await loadPeopleOverview(viewerUser(ids.viewer), everyone());
    const manager = rows.find((r) => r.staffId === ids.manager)!;
    expect(manager.open).toBe(6);
    expect(manager.projects).toEqual([
      { projectId: projectA, name: `Analitico ${run} A`, tramo: null, open: 5, overdue: 1, weeks: [2, 1, 0, 1] },
      { projectId: projectC, name: `Analitico ${run} C`, tramo: null, open: 1, overdue: 0, weeks: [0, 0, 1, 0] },
    ]);
    expect(rows.find((r) => r.staffId === ids.solo)!.projects).toEqual([]);
  });

  it("sharesProjectWithViewer via manager, coordinator and member", async () => {
    const rows = await loadPeopleOverview(viewerUser(ids.viewer), everyone());
    const shares = Object.fromEntries(rows.map((r) => [r.staffId, r.sharesProjectWithViewer]));
    expect(shares[ids.manager]).toBe(true);
    expect(shares[ids.coordinator]).toBe(true);
    expect(shares[ids.member]).toBe(true);
    expect(shares[ids.outsider]).toBe(false);
    expect(shares[ids.solo]).toBe(false);
  });

  it("viewer row is true", async () => {
    const own = await loadPeopleOverview(viewerUser(ids.viewer), everyone());
    expect(own.find((r) => r.staffId === ids.viewer)!.sharesProjectWithViewer).toBe(true);

    // A viewer without projects: only their own row.
    const solo = await loadPeopleOverview(viewerUser(ids.solo), everyone());
    expect(solo.filter((r) => r.sharesProjectWithViewer).map((r) => r.staffId)).toEqual([ids.solo]);

    // A viewer outside the listed team: nobody.
    const outside = await loadPeopleOverview(viewerUser(randomUUID()), everyone());
    expect(outside.every((r) => r.sharesProjectWithViewer === false)).toBe(true);
  });

  it("no extra statement for projects", async () => {
    const select = vi.spyOn(db, "select");
    try {
      await loadPeopleOverview(viewerUser(ids.viewer), everyone());
      // Open tasks, active projects and approved absences: one statement each.
      expect(select).toHaveBeenCalledTimes(3);
    } finally {
      select.mockRestore();
    }
  });
});
