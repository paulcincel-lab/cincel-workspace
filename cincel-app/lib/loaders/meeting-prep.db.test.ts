// @vitest-environment node
/**
 * Meeting prep and the agenda mail (BE §10.2, §11.3) against a real Postgres: the canvas KPIs
 * and agenda, and who may prep or send. Runs only when TEST_DATABASE_URL points at a migrated
 * database. Every row belongs to per-run staff, deleted afterwards.
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

describe.skipIf(!url)("meeting prep (test DB)", async () => {
  const { inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const pageData = await import("@/lib/actions/page-data/calendario-actions");
  const actions = await import("@/lib/actions/calendario-actions");

  const staffIds: string[] = [];
  const projectIds: string[] = [];
  const eventIds: string[] = [];
  let ana = "";
  let beto = "";
  let carla = "";
  let eventId = "";
  let noProjectEventId = "";

  const viewer = (id: string, access: TestViewer["access"] = "Colaborador"): TestViewer => ({ id, access });

  async function makeStaff(label: string): Promise<string> {
    const [row] = await db
      .insert(schema.staff)
      .values({ name: `Prep ${run} ${label}`, googleSub: `prep-${run}-${label}` })
      .returning({ id: schema.staff.id });
    staffIds.push(row!.id);
    return row!.id;
  }

  beforeAll(async () => {
    ana = await makeStaff("ana");
    beto = await makeStaff("beto");
    carla = await makeStaff("carla");
    const [project] = await db
      .insert(schema.projects)
      .values({
        name: `Madrid ${run}`,
        managerId: ana,
        progress: 62,
        status: "activo",
        startDate: "2020-01-01",
        endDate: "2020-01-02",
      })
      .returning({ id: schema.projects.id });
    const projectId = project!.id;
    projectIds.push(projectId);

    const task = (title: string, extra: Partial<typeof schema.tasks.$inferInsert> = {}) => ({
      projectId,
      kind: "usuario" as const,
      title,
      createdById: ana,
      managerId: ana,
      ...extra,
    });
    await db.insert(schema.tasks).values([
      task("Ingenierías", { commitmentDate: "2026-11-09" }),
      task("Renders de cocina", { commitmentDate: "2026-11-10" }),
      task("Proyecto ejecutivo", { commitmentDate: "2026-11-30", deliveryDate: "2026-11-20" }),
      task("Ya cerrada", { commitmentDate: "2026-11-01", status: "completado", closedAt: new Date("2026-11-02T00:00:00Z") }),
      { projectId, kind: "admin" as const, title: "Factura", createdById: ana, managerId: ana, commitmentDate: "2026-11-05" },
    ]);

    const [meeting] = await db
      .insert(schema.calendarEvents)
      .values({
        source: "cincel",
        title: `Revisión ${run}`,
        organizerId: ana,
        projectId,
        location: "Sala 2",
        startsAt: new Date("2026-11-11T16:00:00Z"),
        endsAt: new Date("2026-11-11T17:00:00Z"),
      })
      .returning({ id: schema.calendarEvents.id });
    eventId = meeting!.id;
    eventIds.push(eventId);
    await db.insert(schema.calendarEventAttendees).values([
      { eventId, staffId: ana, email: `ana-${run}@example.test`, name: "Ana", isOrganizer: true },
      { eventId, staffId: beto, email: `beto-${run}@example.test`, name: "Beto" },
      { eventId, staffId: null, email: `cliente-${run}@example.test`, name: "Cliente" },
    ]);

    const [last] = await db
      .insert(schema.calendarEvents)
      .values({
        source: "cincel",
        title: `Junta previa ${run}`,
        organizerId: ana,
        projectId,
        startsAt: new Date("2026-10-28T16:00:00Z"),
        endsAt: new Date("2026-10-28T17:00:00Z"),
      })
      .returning({ id: schema.calendarEvents.id });
    eventIds.push(last!.id);
    const [minutes] = await db
      .insert(schema.meetingMinutes)
      .values({ eventId: last!.id, projectId, notes: "x", openPoints: ["Decisión de acabado de cocina"] })
      .returning({ id: schema.meetingMinutes.id });
    await db.insert(schema.meetingDecisions).values(
      ["a", "b", "c"].map((text, i) => ({ minutesId: minutes!.id, projectId, text, sortOrder: i })),
    );

    const [solo] = await db
      .insert(schema.calendarEvents)
      .values({
        source: "cincel",
        title: `Sin proyecto ${run}`,
        organizerId: ana,
        startsAt: new Date("2026-11-11T18:00:00Z"),
        endsAt: new Date("2026-11-11T19:00:00Z"),
      })
      .returning({ id: schema.calendarEvents.id });
    noProjectEventId = solo!.id;
    eventIds.push(noProjectEventId);
    await db.insert(schema.calendarEventAttendees).values({ eventId: noProjectEventId, staffId: ana, email: `ana2-${run}@example.test`, name: "Ana" });
  });

  afterAll(async () => {
    if (eventIds.length) await db.delete(schema.calendarEvents).where(inArray(schema.calendarEvents.id, eventIds));
    if (projectIds.length) {
      await db.delete(schema.tasks).where(inArray(schema.tasks.projectId, projectIds));
      await db.delete(schema.projects).where(inArray(schema.projects.id, projectIds));
    }
    if (staffIds.length) await db.delete(schema.staff).where(inArray(schema.staff.id, staffIds));
  });

  it("gives the KPIs, Lo vencido and the agenda of the canvas", async () => {
    const prep = await asViewer(viewer(ana), () => pageData.getMeetingPrep(eventId));
    expect(prep).not.toBeNull();
    // Plan ended in 2020: 62 % against 100 %.
    expect(prep!.kpis.progressVsPlan).toBe(-38);
    expect(prep!.kpis.overdue).toBe(2);
    expect(prep!.kpis.open).toBe(3);
    expect(prep!.kpis.lastMeeting).toEqual({ date: "2026-10-28", decisions: 3, open: 1 });
    expect(prep!.overdue.map((t) => [t.title, t.daysLate])).toEqual([
      ["Ingenierías", 2],
      ["Renders de cocina", 1],
    ]);
    expect(prep!.agenda).toEqual([
      "Avance y nueva fecha de Ingenierías",
      "Avance y nueva fecha de Renders de cocina",
      "Decisión de acabado de cocina (pendiente del 28 oct)",
      "Fechas de entrega de proyecto ejecutivo",
    ]);
    expect(prep!.summary).toContain("El proyecto va 38 puntos atrás del plan por Ingenierías (vencida 2 días).");
  });

  it("includes the admin task only for someone who sees admin data", async () => {
    const prep = await asViewer(viewer(ana, "Administrador"), () => pageData.getMeetingPrep(eventId));
    expect(prep!.kpis.overdue).toBe(3);
  });

  it("is open to a staff attendee", async () => {
    const prep = await asViewer(viewer(beto), () => pageData.getMeetingPrep(eventId));
    expect(prep?.eventId).toBe(eventId);
  });

  it("returns null to a viewer who is neither organizer nor attendee", async () => {
    await expect(asViewer(viewer(carla), () => pageData.getMeetingPrep(eventId))).resolves.toBeNull();
    await expect(asViewer(viewer(carla, "Administrador"), () => pageData.getMeetingPrep(eventId))).resolves.toBeNull();
  });

  it("has empty KPIs without a project", async () => {
    const prep = await asViewer(viewer(ana), () => pageData.getMeetingPrep(noProjectEventId));
    expect(prep!.kpis.progressVsPlan).toBeNull();
    expect(prep!.kpis.tramo).toBeNull();
    expect(prep!.kpis.lastMeeting).toBeNull();
  });

  it("refuses to send the agenda to a viewer without access", async () => {
    const result = await asViewer(viewer(carla), () => actions.sendAgendaAction(eventId, ["Punto"]));
    expect(result).toEqual({ ok: false, error: "FORBIDDEN" });
  });

  it("rejects a malformed agenda", async () => {
    const result = await asViewer(viewer(ana), () => actions.sendAgendaAction(eventId, []));
    expect(result.ok).toBe(false);
  });
});
