// @vitest-environment node
/**
 * Meetings in the Calendario range (BE §5.3, §8.2, §8.4) against a real Postgres: day aggregates, items,
 * visibility, overlaps across midnight, the ICS feed rows and the agenda tool parity. Runs only when
 * TEST_DATABASE_URL points at a migrated database; every row belongs to per-run staff deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("meetings in the range (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const repo = await import("@/lib/repositories/calendario-events-range");

  const range = { from: "2026-11-12", to: "2026-11-13" };
  const filters = { mostrar: "todo" as const, quien: "yo" as const, proyectos: [], tramo: null, responsable: null };
  const at = (day: number, hour: number, min = 0) => new Date(Date.UTC(2026, 10, day, hour, min, 0));

  let ana = "";
  let beto = "";
  let carlos = "";
  let projectId = "";
  const eventIds: string[] = [];

  const asUser = (id: string, name: string, access: string) =>
    ({
      member: { id, name, role: access, area: "", capacity: 0, availability: "", active: true, institutionalEmail: "", phone: "" },
      email: `${name.toLowerCase()}-${run}@cincel.test`,
      access,
    }) as never;

  async function addEvent(
    title: string,
    startsAt: Date,
    endsAt: Date,
    extra: Partial<typeof schema.calendarEvents.$inferInsert> & { attendees?: { staffId: string; response?: "acepta" | "rechaza" | "pendiente" }[] } = {},
  ) {
    const { attendees = [], ...cols } = extra;
    const [row] = await db
      .insert(schema.calendarEvents)
      .values({ source: "cincel", title: `${title} ${run}`, startsAt, endsAt, ...cols })
      .returning({ id: schema.calendarEvents.id });
    eventIds.push(row!.id);
    for (const a of attendees) {
      await db.insert(schema.calendarEventAttendees).values({
        eventId: row!.id,
        staffId: a.staffId,
        email: `${a.staffId}@cincel.test`,
        name: `Persona ${a.staffId.slice(0, 4)}`,
        response: a.response ?? "pendiente",
      });
    }
    return row!.id;
  }

  let m1 = "";
  let m3 = "";

  beforeAll(async () => {
    const staff = await db
      .insert(schema.staff)
      .values([{ name: `Reuniones ${run} Ana` }, { name: `Reuniones ${run} Beto` }, { name: `Reuniones ${run} Carlos` }])
      .returning({ id: schema.staff.id });
    [ana, beto, carlos] = staff.map((s) => s.id) as [string, string, string];
    const [project] = await db.insert(schema.projects).values({ name: `Reuniones ${run}` }).returning({ id: schema.projects.id });
    projectId = project!.id;

    // 10:00–11:00 and 10:30–11:30 local (UTC-6) on the 12th: they overlap.
    m1 = await addEvent("M1", at(12, 16), at(12, 17), { organizerId: ana, attendees: [{ staffId: ana, response: "acepta" }] });
    await addEvent("M2", at(12, 16, 30), at(12, 17, 30), { organizerId: beto, attendees: [{ staffId: ana }, { staffId: beto }] });
    // Beto's own meeting on a project Ana is not a member of.
    m3 = await addEvent("M3", at(12, 20), at(12, 21), { organizerId: beto, projectId, attendees: [{ staffId: beto }] });
    // 23:00–01:00 local and 00:30–02:00 local: the overlap belongs to the 13th, the first meeting to the 12th.
    await addEvent("M4", at(13, 5), at(13, 7), { organizerId: ana, attendees: [{ staffId: ana }] });
    await addEvent("M5", at(13, 6, 30), at(13, 8), { organizerId: beto, attendees: [{ staffId: ana }, { staffId: beto }] });
    // Declined by Ana and cancelled: never on her calendar.
    await addEvent("Rechazada", at(12, 22), at(12, 23), { organizerId: beto, attendees: [{ staffId: ana, response: "rechaza" }, { staffId: beto }] });
    await addEvent("Cancelada", at(12, 18), at(12, 19), { organizerId: ana, status: "cancelada", attendees: [{ staffId: ana }] });
    // Google cache: only its owner sees it, administrators included.
    await addEvent("Google de Ana", at(12, 14), at(12, 15), { source: "google", ownerStaffId: ana, googleEventId: `g-ana-${run}` });
    await addEvent("Google de Beto", at(12, 14), at(12, 15), { source: "google", ownerStaffId: beto, googleEventId: `g-beto-${run}` });
  });

  afterAll(async () => {
    await db.delete(schema.calendarEvents).where(inArray(schema.calendarEvents.id, eventIds));
    await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    await db.delete(schema.staff).where(inArray(schema.staff.id, [ana, beto, carlos]));
  });

  const titles = (items: { title: string }[]) => items.map((i) => i.title.replace(` ${run}`, ""));

  it("returns the meetings of the viewer by start, with offset, tramo and attendees", async () => {
    const { items } = await repo.eventItemsInRange(asUser(ana, "Ana", "Colaborador"), range, filters, { canViewTeam: false });
    expect(titles(items)).toEqual(["Google de Ana", "M1", "M2", "M4", "M5"]);
    const m1Item = items.find((i) => i.eventId === m1)!;
    expect(m1Item).toMatchObject({ kind: "event", date: "2026-11-12", start: "2026-11-12T10:00:00-06:00", end: "2026-11-12T11:00:00-06:00", canEdit: true, minutes: "ninguna" });
    expect(m1Item.attendeeCount).toBe(1);
  });

  it("counts meetings, hours and overlaps per day, also across midnight", async () => {
    const days = await repo.eventDayAggregates(asUser(ana, "Ana", "Colaborador"), range, filters, { canViewTeam: false });
    // 12th: Google de Ana, M1, M2, M4 (starts 23:00 local). 13th: M5 only.
    expect(days.get("2026-11-12")).toMatchObject({ events: 4, overlaps: 1 });
    expect(days.get("2026-11-13")).toMatchObject({ events: 1, overlaps: 1 });
    expect(days.get("2026-11-12")!.meetingHours).toBeCloseTo(1 + 1 + 1 + 2, 5);
    const kpis = await repo.eventKpis(asUser(ana, "Ana", "Colaborador"), range, filters, { canViewTeam: false });
    expect(kpis.meetings).toBe(5);
    expect(kpis.meetingHours).toBeCloseTo(6.5, 5);
  });

  it("hides declined and cancelled meetings and other people's Google cache", async () => {
    const { items } = await repo.eventItemsInRange(asUser(ana, "Ana", "Administrador"), range, { ...filters, quien: "todos" }, { canViewTeam: true });
    const names = titles(items);
    expect(names).not.toContain("Rechazada");
    expect(names).not.toContain("Cancelada");
    expect(names).not.toContain("Google de Beto");
    // In "Todos" an administrator also sees Beto's Cincel meeting.
    expect(names).toContain("M3");
  });

  it("returns nothing to a viewer without access, also when asking for Todos", async () => {
    const carl = asUser(carlos, "Carlos", "Colaborador");
    const mine = await repo.eventItemsInRange(carl, range, filters, { canViewTeam: false });
    expect(mine.items).toEqual([]);
    const todos = await repo.eventItemsInRange(carl, range, { ...filters, quien: "todos" }, { canViewTeam: false });
    expect(todos.items).toEqual([]);
    const days = await repo.eventDayAggregates(carl, range, { ...filters, quien: "todos" }, { canViewTeam: false });
    expect(days.size).toBe(0);
  });

  it("shows a project member the project's meetings in Todos only", async () => {
    await db.insert(schema.projectMembers).values({ projectId, staffId: carlos });
    const carl = asUser(carlos, "Carlos", "Colaborador");
    const yo = await repo.eventItemsInRange(carl, range, filters, { canViewTeam: false });
    expect(yo.items).toEqual([]);
    const todos = await repo.eventItemsInRange(carl, range, { ...filters, quien: "todos" }, { canViewTeam: true });
    expect(titles(todos.items)).toEqual(["M3"]);
    await db.delete(schema.projectMembers).where(eq(schema.projectMembers.staffId, carlos));
  });

  it("mostrar = tareas returns no meetings", async () => {
    const out = await repo.eventItemsInRange(asUser(ana, "Ana", "Colaborador"), range, { ...filters, mostrar: "tareas" }, { canViewTeam: false });
    expect(out.items).toEqual([]);
  });

  it("limits the items per day and says it truncated", async () => {
    const out = await repo.eventItemsInRange(asUser(ana, "Ana", "Colaborador"), range, filters, { canViewTeam: false }, { perDayLimit: 2 });
    expect(out.items.filter((i) => i.date === "2026-11-12")).toHaveLength(2);
    expect(out.truncated).toBe(true);
  });

  it("the agenda tools read the same items as the page for the same range", async () => {
    const user = asUser(ana, "Ana", "Colaborador");
    const page = await repo.eventItemsInRange(user, range, filters, { canViewTeam: false });
    const tool = await repo.listEventItemsForTools(user, range, { canViewTeam: false });
    expect(tool).toEqual(page.items);
  });

  it("busy windows carry times only for the named people and the viewer's own Google cache", async () => {
    const busy = await repo.busyWindowsOf(ana, [beto], { timeMin: at(12, 0).toISOString(), timeMax: at(14, 0).toISOString() }, { includeOwnGoogle: false });
    // Beto: M2, M3, M5 and the declined-by-Ana meeting (Beto did not decline); never his Google cache.
    expect(busy).toHaveLength(4);
    expect(busy.some((b) => b.start === at(12, 14).toISOString())).toBe(false);
    const own = await repo.busyWindowsOf(ana, [ana], { timeMin: at(12, 0).toISOString(), timeMax: at(14, 0).toISOString() }, { includeOwnGoogle: true });
    expect(own.some((b) => b.start === at(12, 14).toISOString())).toBe(true);
  });

  it("the ICS feed rows are the person's confirmed Cincel meetings, not Google, declined or cancelled ones", async () => {
    const rows = await repo.listFeedMeetings(ana, at(1, 0));
    expect(titles(rows).sort()).toEqual(["M1", "M2", "M4", "M5"]);
    expect(rows.find((r) => r.id === m1)).toMatchObject({ startsAt: at(12, 16), endsAt: at(12, 17) });
    const betoRows = await repo.listFeedMeetings(beto, at(1, 0));
    expect(titles(betoRows)).toContain("M3");
    expect(betoRows.some((r) => r.id === m3)).toBe(true);
  });
});
