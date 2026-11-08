// @vitest-environment node
/**
 * Agenda assistant tools against a real Postgres (redesign BE §9.9, §10.3):
 * a confirmed event write linked to a project appends one `history_events`
 * comentario "<summary> (vía asistente)" by the caller; event writes without
 * a shared entity write nothing there. Google Calendar is faked. Runs only
 * when TEST_DATABASE_URL points at a migrated database (`npm run db:migrate`).
 * Every row a test creates is deleted afterwards.
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL;

// `lib/db/client` reads DATABASE_URL when it is first imported.
if (url) process.env.DATABASE_URL = url;

const fakes = vi.hoisted(() => ({
  projects: [] as { id: string; name: string; currentWorkflow: null }[],
  staff: [] as { id: string; name: string; email: string | null }[],
  insertPrimaryEvent: vi.fn(),
  getPrimaryEvent: vi.fn(),
  patchPrimaryEvent: vi.fn(),
  deletePrimaryEvent: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/assistant/reads", () => ({
  listViewerProjects: vi.fn(async () => fakes.projects),
  listViewerTasks: vi.fn(async () => []),
}));
vi.mock("@/lib/actions/staff-actions", () => ({
  fetchStaffAction: vi.fn(async () => fakes.staff),
}));
vi.mock("@/lib/actions/tasks-actions", () => ({
  fetchCalendarAction: vi.fn(async () => []),
  fetchTaskAction: vi.fn(async () => null),
  createUserTaskAction: vi.fn(),
  addChecklistItemAction: vi.fn(),
}));
vi.mock("@/lib/actions/workflows-actions", () => ({ fetchWorkflowsAction: vi.fn(async () => []) }));
vi.mock("@/lib/assistant/agenda/google-calendar", () => {
  class CalendarScopeMissingError extends Error {}
  return {
    CALENDAR_EVENTS_GRANT: "calendar_events",
    CALENDAR_EVENTS_SCOPE: "https://www.googleapis.com/auth/calendar.events",
    CalendarScopeMissingError,
    calendarEventsGrantAvailable: () => true,
    listOwnGoogleEvents: vi.fn(async () => ({ connected: false, events: [] })),
    busyIntervalsOf: () => [],
    insertPrimaryEvent: fakes.insertPrimaryEvent,
    getPrimaryEvent: fakes.getPrimaryEvent,
    patchPrimaryEvent: fakes.patchPrimaryEvent,
    deletePrimaryEvent: fakes.deletePrimaryEvent,
  };
});

const run = randomUUID().slice(0, 8);

describe.skipIf(!url)("agenda tools audit (test DB)", async () => {
  const { eq, inArray } = await import("drizzle-orm");
  const { db } = await import("@/lib/db/client");
  const schema = await import("@/lib/db/schema");
  const { tools } = await import("@/lib/assistant/tools/agenda");
  const { summarizeToolCall } = await import("@/lib/assistant/tool-summaries");

  let actorId = "";
  let guestId = "";
  let projectId = "";

  function tool(name: string) {
    const found = tools.find((t) => t.name === name);
    if (!found) throw new Error(`missing tool ${name}`);
    return found.definition;
  }

  function ctx() {
    return {
      user: {
        member: {
          id: actorId,
          name: `Agenda ${run} actor`,
          role: "",
          area: "",
          capacity: 0,
          availability: "",
          active: true,
          institutionalEmail: "",
          phone: "",
        },
        email: `actor-${run}@cincel.example`,
        access: "Colaborador" as const,
      },
      context: { route: "/inicio" },
      threadId: randomUUID(),
    };
  }

  async function exec(name: string, input: unknown) {
    const def = tool(name);
    return def.run(ctx(), def.schema.parse(input)) as Promise<{ ok: boolean }>;
  }

  async function historyOf(entityIds: string[]) {
    return db.select().from(schema.historyEvents).where(inArray(schema.historyEvents.entityId, entityIds));
  }

  beforeAll(async () => {
    const [actor] = await db.insert(schema.staff).values({ name: `Agenda ${run} actor` }).returning({ id: schema.staff.id });
    const [guest] = await db.insert(schema.staff).values({ name: `Agenda ${run} invitado` }).returning({ id: schema.staff.id });
    actorId = actor!.id;
    guestId = guest!.id;
    const [project] = await db.insert(schema.projects).values({ name: `Agenda ${run} Casa` }).returning({ id: schema.projects.id });
    projectId = project!.id;
    fakes.projects = [{ id: projectId, name: `Agenda ${run} Casa`, currentWorkflow: null }];
    fakes.staff = [{ id: guestId, name: `Agenda ${run} invitado`, email: `guest-${run}@cincel.example` }];
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await db.delete(schema.historyEvents).where(inArray(schema.historyEvents.entityId, [projectId, actorId, guestId]));
    await db.delete(schema.historyEvents).where(eq(schema.historyEvents.actorId, actorId));
    await db.delete(schema.projects).where(eq(schema.projects.id, projectId));
    await db.delete(schema.staff).where(inArray(schema.staff.id, [actorId, guestId]));
  });

  it("create_event linked to a project writes one comentario vía asistente by the caller", async () => {
    fakes.insertPrimaryEvent.mockResolvedValue({ id: `evt-${run}`, summary: "Junta" });
    const input = {
      title: "Junta de obra",
      start: "2030-01-07T10:00",
      end: "2030-01-07T11:00",
      attendees: [`Agenda ${run} invitado`],
      project: `Agenda ${run} Casa`,
    };
    const result = await exec("create_event", input);
    expect(result.ok).toBe(true);

    const rows = await historyOf([projectId]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entity: "project",
      entityId: projectId,
      kind: "comentario",
      actorId,
      comment: `${summarizeToolCall("create_event", input)} (vía asistente)`,
    });
  });

  it("cancel_event (the caller's own Google event) writes nothing to history_events", async () => {
    const before = await db.select().from(schema.historyEvents).where(eq(schema.historyEvents.actorId, actorId));
    fakes.getPrimaryEvent.mockResolvedValue({ id: `evt-${run}`, summary: "Junta", organizer: { self: true } });
    fakes.deletePrimaryEvent.mockResolvedValue(undefined);
    const result = await exec("cancel_event", { eventId: `evt-${run}` });
    expect(result.ok).toBe(true);
    const after = await db.select().from(schema.historyEvents).where(eq(schema.historyEvents.actorId, actorId));
    expect(after).toHaveLength(before.length);
  });
});
