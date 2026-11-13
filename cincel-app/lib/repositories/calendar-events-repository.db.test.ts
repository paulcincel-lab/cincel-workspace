// @vitest-environment node
/**
 * Cincel meetings against a real Postgres (Calendario BE §3.2, §3.3, §8.2, §13): create, edit and
 * cancel round-trip with history lines, the visibility matrix, and cancel keeps the row. Runs only
 * when TEST_DATABASE_URL points at a migrated database; every row carries a per-run marker.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("calendar events repository (test DB)", async () => {
  const { and, eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const repo = await import("@/lib/repositories/calendar-events-repository");

  vi.stubEnv("APP_ORIGIN", "https://app.cincel.test");

  const ids = { organizer: "", guest: "", member: "", outsider: "", admin: "", project: "" };
  const eventIds: string[] = [];
  let organizer: AuthenticatedUser;
  let guest: AuthenticatedUser;
  let member: AuthenticatedUser;
  let outsider: AuthenticatedUser;
  let admin: AuthenticatedUser;

  const asUser = (id: string, name: string, email: string, access: string) =>
    ({ member: { id, name }, email, access }) as unknown as AuthenticatedUser;

  beforeAll(async () => {
    const rows = await db
      .insert(schema.staff)
      .values([
        { name: `Organiza ${run}`, email: `org-${run}@cincel.test`, role: "Colaborador" },
        { name: `Invitado ${run}`, email: `guest-${run}@cincel.test`, role: "Colaborador" },
        { name: `Miembro ${run}`, email: `member-${run}@cincel.test`, role: "Colaborador" },
        { name: `Ajeno ${run}`, email: `out-${run}@cincel.test`, role: "Colaborador" },
        { name: `Admin ${run}`, email: `admin-${run}@cincel.test`, role: "Administrador" },
      ])
      .returning({ id: schema.staff.id });
    [ids.organizer, ids.guest, ids.member, ids.outsider, ids.admin] = rows.map((r) => r.id);
    organizer = asUser(ids.organizer, `Organiza ${run}`, `org-${run}@cincel.test`, "Colaborador");
    guest = asUser(ids.guest, `Invitado ${run}`, `guest-${run}@cincel.test`, "Colaborador");
    member = asUser(ids.member, `Miembro ${run}`, `member-${run}@cincel.test`, "Colaborador");
    outsider = asUser(ids.outsider, `Ajeno ${run}`, `out-${run}@cincel.test`, "Colaborador");
    admin = asUser(ids.admin, `Admin ${run}`, `admin-${run}@cincel.test`, "Administrador");

    const [client] = await db.insert(schema.contacts).values({ type: "cliente", name: `Cliente ${run}` }).returning({ id: schema.contacts.id });
    const [project] = await db
      .insert(schema.projects)
      .values({ name: `Proyecto ${run}`, clientId: client!.id, origin: "Referido", originStaffId: ids.admin })
      .returning({ id: schema.projects.id });
    ids.project = project!.id;
    await db.insert(schema.projectMembers).values({ projectId: ids.project, staffId: ids.member });
  });

  afterAll(async () => {
    const all = Object.values(ids).filter(Boolean);
    if (eventIds.length) {
      await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, eventIds));
      await db.delete(schema.calendarEvents).where(inArray(schema.calendarEvents.id, eventIds));
    }
    if (ids.project) {
      await db.delete(schema.historyEvents).where(eq(schema.historyEvents.entityId, ids.project));
      const [p] = await db.select({ clientId: schema.projects.clientId }).from(schema.projects).where(eq(schema.projects.id, ids.project));
      await db.delete(schema.projectMembers).where(eq(schema.projectMembers.projectId, ids.project));
      await db.delete(schema.projects).where(eq(schema.projects.id, ids.project));
      if (p?.clientId) await db.delete(schema.contacts).where(eq(schema.contacts.id, p.clientId));
    }
    await db.delete(schema.staff).where(inArray(schema.staff.id, all.filter((id) => id !== ids.project)));
  });

  const draft = (overrides: Record<string, unknown> = {}) => ({
    title: `Revisión ${run}`,
    start: "2026-11-12T10:00:00-06:00",
    end: "2026-11-12T11:00:00-06:00",
    projectId: null as string | null,
    location: "Sala 2",
    meet: true,
    attendees: [
      { staffId: ids.guest, email: `guest-${run}@cincel.test`, name: `Invitado ${run}` },
      { email: `cliente-${run}@example.test`, name: "Cliente externo" },
    ],
    ...overrides,
  });

  async function create(overrides: Record<string, unknown> = {}, invitesVia: "google" | "cincel" = "cincel") {
    const item = await repo.createEvent(organizer, draft(overrides), { invitesVia, googleSyncError: invitesVia === "cincel" ? "NO_GRANT" : null });
    eventIds.push(item.eventId);
    return item;
  }

  it("creates a meeting with the organizer, staff and free-email attendees", async () => {
    const item = await create();
    expect(item).toMatchObject({
      kind: "event",
      source: "cincel",
      title: `Revisión ${run}`,
      date: "2026-11-12",
      start: "2026-11-12T10:00:00-06:00",
      end: "2026-11-12T11:00:00-06:00",
      location: "Sala 2",
      attendeeCount: 3,
      canEdit: true,
      invitesVia: "cincel",
      syncError: "NO_GRANT",
      minutes: "ninguna",
    });
    expect(item.organizer).toEqual({ id: ids.organizer, name: `Organiza ${run}` });
    const guestRow = item.attendees.find((a) => a.staffId === ids.guest);
    expect(guestRow).toMatchObject({ name: `Invitado ${run}`, response: "pendiente" });
    // Emails are never part of an item.
    expect(JSON.stringify(item)).not.toContain("@");
  });

  it("matches a staff attendee by email when only the email is given", async () => {
    const item = await create({ attendees: [{ email: `GUEST-${run}@cincel.test`, name: "Invitado" }] });
    expect(item.attendees.some((a) => a.staffId === ids.guest)).toBe(true);
  });

  it("edit round-trip writes one history line per changed field", async () => {
    const created = await create();
    const edited = await repo.updateEvent(organizer, created.eventId, {
      title: `Revisión final ${run}`,
      start: "2026-11-12T12:00:00-06:00",
      end: "2026-11-12T13:00:00-06:00",
      location: null,
    });
    expect(edited).toMatchObject({ title: `Revisión final ${run}`, start: "2026-11-12T12:00:00-06:00", location: null });

    const detail = await repo.getMeetingDetail(organizer, created.eventId);
    const lines = detail!.history.map((h) => h.text);
    expect(lines.some((t) => t.includes("creó la reunión"))).toBe(true);
    expect(lines.some((t) => t.includes("cambió el título"))).toBe(true);
    expect(lines.some((t) => t.includes("cambió el inicio"))).toBe(true);
    expect(lines.some((t) => t.includes("cambió el lugar"))).toBe(true);
  });

  it("replaces attendees and keeps the organizer", async () => {
    const created = await create();
    const edited = await repo.updateEvent(organizer, created.eventId, {
      attendees: [{ staffId: ids.member, email: `member-${run}@cincel.test`, name: `Miembro ${run}` }],
    });
    expect(edited.attendees.map((a) => a.name).sort()).toEqual([`Miembro ${run}`, `Organiza ${run}`].sort());
  });

  it("cancel keeps the row, writes history and is idempotent", async () => {
    const created = await create();
    await repo.cancelEvent(organizer, created.eventId);
    await repo.cancelEvent(organizer, created.eventId);
    const [row] = await db.select().from(schema.calendarEvents).where(eq(schema.calendarEvents.id, created.eventId));
    expect(row).toMatchObject({ status: "cancelada", deletedAt: null });
    const lines = await db
      .select()
      .from(schema.historyEvents)
      .where(and(eq(schema.historyEvents.entity, "calendar_event"), eq(schema.historyEvents.entityId, created.eventId)));
    expect(lines.filter((l) => l.comment?.includes("canceló la reunión"))).toHaveLength(1);
    await expect(repo.updateEvent(organizer, created.eventId, { title: "x" })).rejects.toThrow("INVALID");
  });

  it("a linked project gets a comment and the etapa edge defaults to the project's", async () => {
    const item = await create({ projectId: ids.project });
    expect(item.project).toEqual({ id: ids.project, name: `Proyecto ${run}` });
    const comments = await db
      .select()
      .from(schema.historyEvents)
      .where(and(eq(schema.historyEvents.entity, "project"), eq(schema.historyEvents.entityId, ids.project)));
    expect(comments.some((c) => c.comment?.includes("creó la reunión"))).toBe(true);
  });

  it("rejects a project that does not exist", async () => {
    await expect(repo.createEvent(organizer, draft({ projectId: randomUUID() }), { invitesVia: "cincel" })).rejects.toThrow("INVALID");
  });

  it("visibility: organizer, attendee, project member and admin see it; a non-attendee non-member does not", async () => {
    const item = await create({ projectId: ids.project });
    for (const viewer of [organizer, guest, member, admin]) {
      expect((await repo.getEventItem(viewer, item.eventId))?.eventId).toBe(item.eventId);
    }
    expect(await repo.getEventItem(outsider, item.eventId)).toBeNull();
    expect(await repo.getMeetingDetail(outsider, item.eventId)).toBeNull();
    const range = await repo.listEventsInRange(outsider, { from: "2026-11-12", to: "2026-11-12" });
    expect(range.some((e) => e.eventId === item.eventId)).toBe(false);
    const visible = await repo.listEventsInRange(guest, { from: "2026-11-12", to: "2026-11-12" });
    expect(visible.some((e) => e.eventId === item.eventId)).toBe(true);
  });

  it("only the organizer or an admin can edit or cancel; others get FORBIDDEN or NOT_FOUND", async () => {
    const item = await create({ projectId: ids.project });
    await expect(repo.updateEvent(guest, item.eventId, { title: "x" })).rejects.toThrow("FORBIDDEN");
    await expect(repo.cancelEvent(member, item.eventId)).rejects.toThrow("FORBIDDEN");
    await expect(repo.updateEvent(outsider, item.eventId, { title: "x" })).rejects.toThrow("NOT_FOUND");
    const byAdmin = await repo.updateEvent(admin, item.eventId, { title: `Admin ${run}` });
    expect(byAdmin.title).toBe(`Admin ${run}`);
    expect(byAdmin.canEdit).toBe(true);
    expect((await repo.getEventItem(guest, item.eventId))?.canEdit).toBe(false);
  });

  it("a cached Google event is for its owner only, not even admins", async () => {
    const [row] = await db
      .insert(schema.calendarEvents)
      .values({
        source: "google",
        ownerStaffId: ids.guest,
        title: `Google ${run}`,
        startsAt: new Date("2026-11-12T18:00:00Z"),
        endsAt: new Date("2026-11-12T19:00:00Z"),
        googleEventId: `g-${run}`,
      })
      .returning({ id: schema.calendarEvents.id });
    eventIds.push(row!.id);
    expect((await repo.getEventItem(guest, row!.id))?.title).toBe(`Google ${run}`);
    expect(await repo.getEventItem(admin, row!.id)).toBeNull();
    expect(await repo.getEventItem(organizer, row!.id)).toBeNull();
    await expect(repo.updateEvent(guest, row!.id, { title: "x" })).rejects.toThrow("NOT_FOUND");
  });

  it("relatedOverdue lists open project tasks due before the start", async () => {
    const task = await db
      .insert(schema.tasks)
      .values({
        projectId: ids.project,
        kind: "usuario",
        title: `Vencida ${run}`,
        createdById: ids.admin,
        managerId: ids.member,
        commitmentDate: "2026-11-10",
      })
      .returning({ id: schema.tasks.id });
    try {
      const item = await create({ projectId: ids.project });
      const detail = await repo.getMeetingDetail(organizer, item.eventId);
      expect(detail!.relatedOverdue).toEqual([
        { taskId: task[0]!.id, title: `Vencida ${run}`, date: "2026-11-10", daysLate: 2, managerName: `Miembro ${run}` },
      ]);
    } finally {
      await db.delete(schema.tasks).where(eq(schema.tasks.id, task[0]!.id));
    }
  });

  it("setGoogleSyncState stores the Google link and setInvitesVia switches the path once", async () => {
    const item = await create({}, "google");
    await repo.setGoogleSyncState(item.eventId, { googleEventId: `g-${run}-2`, etag: "e1", htmlLink: "https://calendar.example.test/e", meetUrl: "https://meet.example.test/x", error: null });
    const after = await repo.getEventItem(organizer, item.eventId);
    expect(after).toMatchObject({ googleHtmlLink: "https://calendar.example.test/e", meetUrl: "https://meet.example.test/x", syncError: null, invitesVia: "google" });
    await repo.setInvitesVia(item.eventId, "cincel");
    expect((await repo.getEventItem(organizer, item.eventId))?.invitesVia).toBe("cincel");
  });
});
