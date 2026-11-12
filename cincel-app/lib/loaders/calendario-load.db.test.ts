// @vitest-environment node
/**
 * Calendario load per person and day (BE §9) against a real Postgres: planned hours against the
 * workday, overlaps, and the viewer rule for other people. Runs only when TEST_DATABASE_URL points
 * at a migrated database. Every row belongs to per-run staff, deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { asViewer, type TestViewer } from "@/lib/query/test-utils";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/session", async (importOriginal) =>
  (await import("@/lib/query/test-utils")).mockSessionModule(await importOriginal()),
);

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("getCalendarioLoad (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const pageData = await import("@/lib/actions/page-data/calendario-actions");

  const staffIds: string[] = [];
  const projectIds: string[] = [];
  const eventIds: string[] = [];
  let ana = "";
  let beto = "";
  let admin = "";

  const viewer = (id: string, access: TestViewer["access"] = "Colaborador"): TestViewer => ({ id, access });

  async function makeStaff(label: string): Promise<string> {
    const [row] = await db
      .insert(schema.staff)
      .values({ name: `Carga ${run} ${label}`, googleSub: `carga-${run}-${label}` })
      .returning({ id: schema.staff.id });
    staffIds.push(row!.id);
    return row!.id;
  }

  beforeAll(async () => {
    ana = await makeStaff("ana");
    beto = await makeStaff("beto");
    admin = await makeStaff("admin");
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Carga ${run}`, managerId: ana, progress: 0, status: "activo" })
      .returning({ id: schema.projects.id });
    projectIds.push(project!.id);
    const task = (title: string, hours: number | null, extra: Partial<typeof schema.tasks.$inferInsert> = {}) => ({
      projectId: project!.id,
      kind: "usuario" as const,
      title: `${run} ${title}`,
      createdById: ana,
      managerId: ana,
      commitmentDate: "2026-11-12",
      estimatedHours: hours,
      ...extra,
    });
    await db.insert(schema.tasks).values([
      task("a", 4),
      task("b", 3.5),
      task("c", null),
      task("cerrada", 8, { status: "completado" }),
      task("otro dia", 5, { commitmentDate: "2026-11-13" }),
    ]);
    const [meeting] = await db
      .insert(schema.calendarEvents)
      .values({
        source: "cincel",
        title: `Reunión ${run}`,
        organizerId: ana,
        startsAt: new Date("2026-11-12T16:00:00Z"),
        endsAt: new Date("2026-11-12T17:00:00Z"),
      })
      .returning({ id: schema.calendarEvents.id });
    eventIds.push(meeting!.id);
    await db.insert(schema.calendarEventAttendees).values({ eventId: meeting!.id, staffId: ana, email: `ana-${run}@example.test`, name: "Ana" });
  });

  afterAll(async () => {
    if (eventIds.length) await db.delete(schema.calendarEvents).where(inArray(schema.calendarEvents.id, eventIds));
    if (projectIds.length) {
      await db.delete(schema.tasks).where(inArray(schema.tasks.projectId, projectIds));
      await db.delete(schema.projects).where(inArray(schema.projects.id, projectIds));
    }
    if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
  });

  it("sums open task hours (task value, template default, else 1 h) and meeting hours against the workday", async () => {
    const load = await asViewer(viewer(ana), () => pageData.getCalendarioLoad({ from: "2026-11-12", to: "2026-11-13" }));
    const day = load.find((d) => d.date === "2026-11-12" && d.staffId === ana)!;
    expect(day.tasks).toHaveLength(3);
    expect(day.meetings).toHaveLength(1);
    expect(day.hours).toBe(9.5);
    expect(day.workday).toBe(6);
    expect(day.label).toBe("sobrecargado");
    expect(load.find((d) => d.date === "2026-11-13")!.hours).toBe(5);
  });

  it("refuses another person's load without the team permission or a shared project", async () => {
    await expect(
      asViewer(viewer(beto), () => pageData.getCalendarioLoad({ from: "2026-11-12", to: "2026-11-12", staffIds: [ana] })),
    ).rejects.toThrow("FORBIDDEN");
  });

  it("allows others to a viewer who can see the team calendar", async () => {
    const load = await asViewer(viewer(admin, "Administrador"), () =>
      pageData.getCalendarioLoad({ from: "2026-11-12", to: "2026-11-12", staffIds: [ana] }),
    );
    expect(load[0]?.hours).toBe(9.5);
  });

  it("allows others who share an active project", async () => {
    const projectId = projectIds[0]!;
    await db.insert(schema.projectMembers).values([
      { projectId, staffId: ana },
      { projectId, staffId: beto },
    ]);
    const load = await asViewer(viewer(beto), () => pageData.getCalendarioLoad({ from: "2026-11-12", to: "2026-11-12", staffIds: [ana] }));
    expect(load[0]?.staffId).toBe(ana);
    await db.delete(schema.projectMembers).where(eq(schema.projectMembers.projectId, projectId));
  });
});
