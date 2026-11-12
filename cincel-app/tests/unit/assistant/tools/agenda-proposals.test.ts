// @vitest-environment node
/**
 * create_event / update_event / cancel_event as proposals (Calendario BE §11.2,
 * D12): they resolve names, apply the meeting defaults and hand a draft to the
 * proposal builders; they never write a meeting or call Google.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchStaffAction: vi.fn(),
  listViewerProjects: vi.fn(),
  listViewerTasks: vi.fn(),
  getEventItem: vi.fn(),
  createEvent: vi.fn(),
  insertPrimaryEvent: vi.fn(),
  proposeCreateEvent: vi.fn(),
  proposeUpdateEvent: vi.fn(),
  proposeCancelEvent: vi.fn(),
  defaultAttendees: vi.fn(),
  googleConnected: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actions/tasks-actions", () => ({
  fetchCalendarAction: vi.fn(),
  listSubtasksAction: vi.fn(),
  createUserTaskAction: vi.fn(),
  createSubtaskAction: vi.fn(),
}));
vi.mock("@/lib/actions/staff-actions", () => ({ fetchStaffAction: mocks.fetchStaffAction }));
vi.mock("@/lib/assistant/reads", () => ({ listViewerProjects: mocks.listViewerProjects, listViewerTasks: mocks.listViewerTasks }));
vi.mock("@/lib/actions/time-tracking-actions", () => ({ fetchTimeTrackingSettingsAction: vi.fn() }));
vi.mock("@/lib/actions/workflows-actions", () => ({ fetchWorkflowsAction: vi.fn() }));
vi.mock("@/lib/vacations/approved-absences", () => ({ approvedAbsences: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ db: {}, schema: {} }));
vi.mock("@/lib/google/calendar-events-sync", () => ({ freeBusy: vi.fn() }));
vi.mock("@/lib/repositories/calendario-events-range", () => ({ listEventItemsForTools: vi.fn(), busyWindowsOf: vi.fn() }));
vi.mock("@/lib/repositories/calendar-events-repository", () => ({
  getEventItem: mocks.getEventItem,
  createEvent: mocks.createEvent,
  setGoogleSyncState: vi.fn(),
}));
vi.mock("@/lib/assistant/agenda/google-calendar", () => {
  class CalendarScopeMissingError extends Error {}
  return {
    CALENDAR_EVENTS_GRANT: "calendar_events",
    CalendarScopeMissingError,
    calendarEventsGrantAvailable: () => false,
    listOwnGoogleEvents: vi.fn(),
    insertPrimaryEvent: mocks.insertPrimaryEvent,
    deletePrimaryEvent: vi.fn(),
    busyIntervalsOf: () => [],
  };
});
vi.mock("@/lib/calendario/propose", async (importActual) => ({
  ...(await importActual<typeof import("@/lib/calendario/propose")>()),
  proposeCreateEvent: mocks.proposeCreateEvent,
  proposeUpdateEvent: mocks.proposeUpdateEvent,
  proposeCancelEvent: mocks.proposeCancelEvent,
  defaultAttendees: mocks.defaultAttendees,
  googleConnected: mocks.googleConnected,
}));

import type { ToolRunContext } from "@/lib/assistant/define-tool";
import { tools } from "@/lib/assistant/tools/agenda";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";

const ME = "11111111-1111-4111-8111-111111111111";
const LUIS = "22222222-2222-4222-8222-222222222222";
const PROJECT_ID = "44444444-4444-4444-8444-444444444444";
const EVENT_ID = "99999999-9999-4999-8999-999999999999";

const user: AuthenticatedUser = {
  member: { id: ME, name: "Ana Pérez", role: "Colaborador", area: "", capacity: 0, availability: "", active: true, institutionalEmail: "ana@cincel.mx", phone: "" },
  email: "ana@cincel.mx",
  access: "Colaborador",
};
const ctx: ToolRunContext = { user, context: { route: "/calendario" }, threadId: null };

function run(name: string, input: unknown) {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`missing ${name}`);
  return tool.definition.run(ctx, tool.definition.schema.parse(input)) as Promise<Record<string, unknown>>;
}

const PROPOSAL = { id: "p-1", kind: "crear_reunion", title: "Nueva reunión", line: "x", changes: [], deferred: [] };
const PROJECT = { id: PROJECT_ID, name: "Madrid 22", manager: { id: LUIS, name: "Luis Gómez" }, coordinator: null, clientId: null };

const ITEM = {
  kind: "event",
  id: `e:${EVENT_ID}`,
  eventId: EVENT_ID,
  source: "cincel",
  title: "Junta",
  date: "2026-11-12",
  start: "2026-11-12T16:00:00.000Z",
  end: "2026-11-12T17:00:00.000Z",
  organizer: { id: ME, name: "Ana Pérez" },
  attendees: [],
  canEdit: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchStaffAction.mockResolvedValue([
    { id: LUIS, name: "Luis Gómez", email: "luis@cincel.mx" },
    { id: "33333333-3333-4333-8333-333333333333", name: "Marta Ríos", email: null },
  ]);
  mocks.listViewerProjects.mockResolvedValue([PROJECT]);
  mocks.googleConnected.mockResolvedValue(true);
  mocks.defaultAttendees.mockResolvedValue({
    attendees: [
      { staffId: LUIS, email: "luis@cincel.mx", name: "Luis Gómez" },
      { contactId: "c-1", email: "cliente@example.com", name: "Cliente" },
    ],
    names: ["Luis Gómez"],
    withClient: true,
  });
  mocks.proposeCreateEvent.mockResolvedValue(PROPOSAL);
  mocks.proposeUpdateEvent.mockResolvedValue({ ...PROPOSAL, kind: "editar_reunion" });
  mocks.proposeCancelEvent.mockResolvedValue({ ...PROPOSAL, kind: "cancelar_reunion" });
});

describe("create_event", () => {
  it("is offered without the Google grant and never asks for approval", () => {
    const def = tools.find((t) => t.name === "create_event")!.definition;
    expect(def.available({ user, context: ctx.context })).toBe(true);
    expect(def.confirm).toBe(false);
    expect(def.write).toBe(false);
  });

  it("proposes a 60-minute meeting with the project team and Meet when no end and no guests are given", async () => {
    const result = await run("create_event", { title: "Junta con el cliente de Madrid 22", start: "2026-11-12T10:00", project: "Madrid 22" });
    expect(result).toMatchObject({ ok: true, proposalId: "p-1", kind: "crear_reunion" });
    const [source, draft, extra] = mocks.proposeCreateEvent.mock.calls[0];
    expect(source).toEqual({ user, threadId: null });
    // 10:00 in Ciudad de México (UTC-6 in November) → 16:00Z, one hour long.
    expect(draft).toMatchObject({
      title: "Junta con el cliente de Madrid 22",
      start: "2026-11-12T16:00:00.000Z",
      end: "2026-11-12T17:00:00.000Z",
      projectId: PROJECT_ID,
      meet: true,
      location: null,
    });
    expect(draft.attendees.map((a: { email: string }) => a.email)).toEqual(["luis@cincel.mx", "cliente@example.com"]);
    expect(extra).toEqual({ names: ["Luis Gómez"], withClient: true });
    expect(mocks.insertPrimaryEvent).not.toHaveBeenCalled();
    expect(mocks.createEvent).not.toHaveBeenCalled();
  });

  it("turns Meet off without Google or when asked, and keeps the guests that were named", async () => {
    mocks.googleConnected.mockResolvedValue(false);
    await run("create_event", { title: "Junta", start: "2026-11-12T10:00", end: "2026-11-12T11:30", attendees: ["Luis"], project: "Madrid 22" });
    const draft = mocks.proposeCreateEvent.mock.calls[0][1];
    expect(draft.meet).toBe(false);
    expect(draft.end).toBe("2026-11-12T17:30:00.000Z");
    expect(draft.attendees).toEqual([{ staffId: LUIS, email: "luis@cincel.mx", name: "Luis Gómez" }]);
    expect(mocks.defaultAttendees).not.toHaveBeenCalled();

    mocks.googleConnected.mockResolvedValue(true);
    await run("create_event", { title: "Junta", start: "2026-11-12T10:00", meet: false });
    expect(mocks.proposeCreateEvent.mock.calls[1][1].meet).toBe(false);
  });

  it("adds the project team to named guests with inviteProjectTeam, without duplicates", async () => {
    await run("create_event", { title: "Junta", start: "2026-11-12T10:00", attendees: ["Luis"], projectId: PROJECT_ID, inviteProjectTeam: true });
    const draft = mocks.proposeCreateEvent.mock.calls[0][1];
    expect(draft.attendees.map((a: { email: string }) => a.email)).toEqual(["luis@cincel.mx", "cliente@example.com"]);
  });

  it("refuses an end before the start and a teammate without email", async () => {
    expect(await run("create_event", { title: "Junta", start: "2026-11-12T10:00", end: "2026-11-12T09:00" })).toMatchObject({ ok: false, error: "INVALID" });
    expect(await run("create_event", { title: "Junta", start: "2026-11-12T10:00", attendees: ["Marta"] })).toMatchObject({ ok: false, error: "INVALID" });
    expect(mocks.proposeCreateEvent).not.toHaveBeenCalled();
  });
});

describe("update_event and cancel_event", () => {
  it("propose a change to a meeting the caller organizes, by uuid or by the e- id of list_events", async () => {
    mocks.getEventItem.mockResolvedValue(ITEM);
    const updated = await run("update_event", { eventId: `e-${EVENT_ID}`, patch: { start: "2026-11-13T10:00" } });
    expect(updated).toMatchObject({ ok: true, kind: "editar_reunion" });
    expect(mocks.getEventItem).toHaveBeenCalledWith(user, EVENT_ID);
    expect(mocks.proposeUpdateEvent.mock.calls[0][2]).toEqual({ start: "2026-11-13T16:00:00.000Z" });

    const cancelled = await run("cancel_event", { eventId: EVENT_ID });
    expect(cancelled).toMatchObject({ ok: true, kind: "cancelar_reunion" });
  });

  it("refuse a meeting somebody else organizes with NOT_ORGANIZER", async () => {
    mocks.getEventItem.mockResolvedValue({ ...ITEM, organizer: { id: LUIS, name: "Luis Gómez" } });
    expect(await run("update_event", { eventId: EVENT_ID, patch: { title: "Otro" } })).toMatchObject({ ok: false, error: "NOT_ORGANIZER" });
    expect(await run("cancel_event", { eventId: EVENT_ID })).toMatchObject({ ok: false, error: "NOT_ORGANIZER" });
    expect(mocks.proposeUpdateEvent).not.toHaveBeenCalled();
    expect(mocks.proposeCancelEvent).not.toHaveBeenCalled();
  });

  it("answer NOT_FOUND for a meeting that is not visible and for a Google id that is not a meeting", async () => {
    mocks.getEventItem.mockResolvedValue(null);
    expect(await run("cancel_event", { eventId: EVENT_ID })).toMatchObject({ ok: false, error: "NOT_FOUND" });
    expect(await run("cancel_event", { eventId: "g-abc" })).toMatchObject({ ok: false, error: "NOT_FOUND" });
  });

  it("refuse a new end before the current start", async () => {
    mocks.getEventItem.mockResolvedValue(ITEM);
    expect(await run("update_event", { eventId: EVENT_ID, patch: { end: "2026-11-12T09:00" } })).toMatchObject({ ok: false, error: "INVALID" });
  });
});
