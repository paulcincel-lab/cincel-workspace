// @vitest-environment node
/**
 * Minutes against a real Postgres (Calendario BE §3.4, §8.3, §16): notes autosave, access,
 * decisions in the project history, undo retraction and the tasks linked to the minutes.
 * Runs only when TEST_DATABASE_URL points at a migrated database. Every row a test creates
 * carries a per-run marker and is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("meeting minutes (test DB)", async () => {
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { and, eq, inArray } = await import("drizzle-orm");
  const repo = await import("./meeting-minutes-repository");

  let organizer = "";
  let outsider = "";
  let projectId = "";
  let eventId = "";
  let taskId = "";

  const asUser = (id: string): AuthenticatedUser =>
    ({ member: { id, name: `Persona ${run}` }, email: `${id}@example.test`, access: "Administrador" }) as unknown as AuthenticatedUser;

  beforeAll(async () => {
    const [a] = await db.insert(schema.staff).values({ name: `Organizador ${run}`, email: `org-${run}@example.test` }).returning({ id: schema.staff.id });
    const [b] = await db.insert(schema.staff).values({ name: `Ajeno ${run}`, email: `ajeno-${run}@example.test` }).returning({ id: schema.staff.id });
    organizer = a.id;
    outsider = b.id;
    const [project] = await db.insert(schema.projects).values({ name: `Proyecto minuta ${run}` }).returning({ id: schema.projects.id });
    projectId = project.id;
    const [event] = await db
      .insert(schema.calendarEvents)
      .values({
        source: "cincel",
        organizerId: organizer,
        title: `Junta ${run}`,
        startsAt: new Date("2026-11-11T16:00:00Z"),
        endsAt: new Date("2026-11-11T17:00:00Z"),
        projectId,
      })
      .returning({ id: schema.calendarEvents.id });
    eventId = event.id;
    await db.insert(schema.calendarEventAttendees).values({ eventId, staffId: organizer, email: `org-${run}@example.test`, name: "Organizador", isOrganizer: true });
    const [task] = await db.insert(schema.tasks).values({ projectId, kind: "usuario", title: `Tarea minuta ${run}`, createdById: organizer }).returning({ id: schema.tasks.id });
    taskId = task.id;
  });

  afterAll(async () => {
    await db.delete(schema.historyEvents).where(and(eq(schema.historyEvents.entityId, projectId)));
    await db.delete(schema.calendarEvents).where(eq(schema.calendarEvents.id, eventId));
    await db.delete(schema.tasks).where(eq(schema.tasks.id, taskId));
    await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    await db.delete(schema.staff).where(inArray(schema.staff.id, [organizer, outsider]));
  });

  it("returns null and refuses writes to a viewer without access", async () => {
    expect(await repo.getMinutes(asUser(outsider), eventId)).toBeNull();
    await expect(repo.saveNotes(asUser(outsider), eventId, "x")).rejects.toThrow("NOT_FOUND");
  });

  it("creates the row on the first save and keeps one row per event", async () => {
    const empty = await repo.getMinutes(asUser(organizer), eventId);
    expect(empty?.minutesId).toBeNull();
    const first = await repo.saveNotes(asUser(organizer), eventId, "primera");
    const second = await repo.saveNotes(asUser(organizer), eventId, "segunda");
    expect(second.minutesId).toBe(first.minutesId);
    expect((await repo.getMinutes(asUser(organizer), eventId))?.notes).toBe("segunda");
  });

  it("saves decisions to the project history and retracts them", async () => {
    const { minutesId } = await repo.ensureMinutes(asUser(organizer), eventId);
    const { decisionIds } = await repo.saveDecisions(minutesId, projectId, ["Cocina en cuarzo blanco"], organizer);
    expect(decisionIds).toHaveLength(1);
    const comments = await db.select().from(schema.historyEvents).where(eq(schema.historyEvents.entityId, projectId));
    expect(comments.map((c) => c.comment)).toContain("Decisión: Cocina en cuarzo blanco");
    expect((await repo.getMinutes(asUser(organizer), eventId))?.decisions).toHaveLength(1);

    expect(await repo.retractDecision(decisionIds[0], organizer)).toBe(true);
    expect((await repo.getMinutes(asUser(organizer), eventId))?.decisions).toHaveLength(0);
    const after = await db.select().from(schema.historyEvents).where(eq(schema.historyEvents.entityId, projectId));
    expect(after.map((c) => c.comment)).toContain("Decisión retirada: Cocina en cuarzo blanco");
  });

  it("links tasks, hides soft-deleted ones and marks the minutes lista then enviada", async () => {
    const { minutesId } = await repo.ensureMinutes(asUser(organizer), eventId);
    await repo.linkMinuteTasks(minutesId, [taskId]);
    await repo.setMinutesStatus(minutesId, "lista", ["Acabado"]);
    const ready = await repo.getMinutes(asUser(organizer), eventId);
    expect(ready?.status).toBe("lista");
    expect(ready?.openPoints).toEqual(["Acabado"]);
    expect(ready?.tasks.map((t) => t.taskId)).toEqual([taskId]);

    await repo.setMinutesStatus(minutesId, "enviada");
    expect((await repo.getMinutes(asUser(organizer), eventId))?.sentAt).not.toBeNull();

    await db.update(schema.tasks).set({ deletedAt: new Date() }).where(eq(schema.tasks.id, taskId));
    expect((await repo.getMinutes(asUser(organizer), eventId))?.tasks).toEqual([]);
  });
});
