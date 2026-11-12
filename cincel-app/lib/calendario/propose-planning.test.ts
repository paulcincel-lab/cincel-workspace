// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/client", () => ({ db: {} }));

const repo = vi.hoisted(() => ({
  openTasksDueOn: vi.fn(),
  eventsWithAttendees: vi.fn(),
  staffBusyIntervals: vi.fn(),
  staffDisplayName: vi.fn(),
}));
vi.mock("@/lib/repositories/calendario-planning-repository", () => repo);
const load = vi.hoisted(() => ({ dayLoadRows: vi.fn() }));
vi.mock("@/lib/repositories/calendario-repository", () => load);
const proposals = vi.hoisted(() => ({ createProposal: vi.fn() }));
vi.mock("@/lib/repositories/proposals-repository", () => proposals);
const google = vi.hoisted(() => ({ freeBusy: vi.fn() }));
vi.mock("@/lib/google/calendar-events-sync", () => google);
vi.mock("@/lib/vacations/approved-absences", () => ({ approvedAbsences: vi.fn(async () => []) }));
vi.mock("@/lib/time-tracking/settings", () => ({
  TIME_TRACKING_TIME_ZONE: "America/Mexico_City",
  getTimeTrackingSettings: vi.fn(async () => ({ dayStart: "09:00", dayEnd: "18:00", workDays: [1, 2, 3, 4, 5] })),
}));

import { proposeRedistributionFor, resolveOverlapFor, toOffsetIso } from "@/lib/calendario/propose-planning";

function user(id: string, access: string): AuthenticatedUser {
  return {
    member: { id, name: "Ana García", role: access, area: "", capacity: 0, availability: "", active: true, institutionalEmail: "", phone: "" },
    email: "ana@cincel.example",
    access,
  } as unknown as AuthenticatedUser;
}

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const E1 = "33333333-3333-4333-8333-333333333333";
const E2 = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-11T16:00:00Z"));
  proposals.createProposal.mockImplementation(async (_u, kind, data) => ({
    id: "p1",
    kind,
    status: "propuesta",
    ...data,
    rangeFrom: data.range?.from ?? null,
    rangeTo: data.range?.to ?? null,
    createdAt: "",
    expiresAt: "",
  }));
  repo.staffDisplayName.mockResolvedValue("Luis Martínez");
  repo.staffBusyIntervals.mockResolvedValue([]);
});

describe("toOffsetIso", () => {
  it("writes the org-zone offset", () => {
    expect(toOffsetIso(new Date("2026-11-13T16:00:00Z"))).toBe("2026-11-13T10:00:00-06:00");
  });
});

describe("proposeRedistributionFor", () => {
  it("refuses another person's day without the team calendar", async () => {
    await expect(proposeRedistributionFor(user(ME, "Colaborador"), { date: "2026-11-12", staffId: OTHER })).rejects.toThrow(/^FORBIDDEN/);
    expect(proposals.createProposal).not.toHaveBeenCalled();
  });

  it("writes a repartir proposal with task_date changes", async () => {
    load.dayLoadRows.mockResolvedValue([
      { date: "2026-11-12", staffId: ME, hours: 8, workday: 6, label: "sobrecargado", tasks: [], meetings: [], overlaps: [] },
      { date: "2026-11-13", staffId: ME, hours: 1, workday: 6, label: "libre", tasks: [], meetings: [], overlaps: [] },
    ]);
    repo.openTasksDueOn.mockResolvedValue([
      {
        id: "t1",
        title: "Cotización",
        projectName: "Casa Lomas",
        priority: "baja",
        blocked: false,
        commitmentDate: "2026-11-12",
        deliveryDate: null,
        estimatedHours: 2,
        templateHours: null,
        dependsOn: [],
        dependents: [],
      },
    ]);
    const result = await proposeRedistributionFor(user(ME, "Administrador"), { date: "2026-11-12" });
    expect(result.proposal.kind).toBe("repartir");
    expect(result.proposal.changes).toHaveLength(1);
    expect(result.proposal.changes[0]).toMatchObject({ type: "task_date", taskId: "t1", after: { date: "2026-11-13" }, staffId: ME });
    expect(result.loadAfter.find((d) => d.date === "2026-11-12")?.after).toBe(6);
  });
});

describe("resolveOverlapFor", () => {
  const event = (id: string, organizerId: string, start: string, end: string, createdAt: string) => ({
    id,
    source: "cincel" as const,
    title: id === E1 ? "Revisión Lomas" : "Visita de obra",
    startsAt: new Date(start),
    endsAt: new Date(end),
    organizerId,
    createdAt: new Date(createdAt),
    status: "confirmada" as const,
    attendees: [
      { staffId: ME, email: "ana@cincel.example", name: "Ana" },
      { staffId: OTHER, email: "luis@cincel.example", name: "Luis" },
    ],
  });

  it("proposes the first slot nobody is busy in and notifies", async () => {
    repo.eventsWithAttendees.mockResolvedValue([
      event(E1, ME, "2026-11-12T16:00:00Z", "2026-11-12T17:00:00Z", "2026-11-01T00:00:00Z"),
      event(E2, OTHER, "2026-11-12T16:30:00Z", "2026-11-12T17:30:00Z", "2026-11-02T00:00:00Z"),
    ]);
    google.freeBusy.mockResolvedValue({
      busy: { "luis@cincel.example": [{ start: "2026-11-12T17:00:00Z", end: "2026-11-12T19:00:00Z" }] },
      unknown: ["ana@cincel.example"],
    });
    const result = await resolveOverlapFor(user(ME, "Colaborador"), { eventIds: [E1, E2] });
    const change = result.proposal.changes[0];
    expect(change).toMatchObject({ type: "event_update", eventId: E1, notify: true });
    if (change.type !== "event_update") throw new Error("unexpected change");
    // Busy 10:00-13:00 local (the meeting's own slot and Luis): the first free hour is 09:00-10:00.
    expect(change.after).toEqual({ start: "2026-11-12T09:00:00-06:00", end: "2026-11-12T10:00:00-06:00" });
    expect(result.unknownCalendars).toBe(1);
    expect(result.proposal.line).toContain("No pude ver la agenda de 1 persona.");
  });

  it("treats everyone as unknown when free/busy fails", async () => {
    repo.eventsWithAttendees.mockResolvedValue([
      event(E1, ME, "2026-11-12T16:00:00Z", "2026-11-12T17:00:00Z", "2026-11-01T00:00:00Z"),
      event(E2, OTHER, "2026-11-12T16:30:00Z", "2026-11-12T17:30:00Z", "2026-11-02T00:00:00Z"),
    ]);
    google.freeBusy.mockRejectedValue(new Error("NO_GRANT"));
    const result = await resolveOverlapFor(user(ME, "Colaborador"), { eventIds: [E1, E2] });
    expect(result.unknownCalendars).toBe(2);
  });

  it("refuses a viewer who organizes neither meeting", async () => {
    repo.eventsWithAttendees.mockResolvedValue([
      event(E1, OTHER, "2026-11-12T16:00:00Z", "2026-11-12T17:00:00Z", "2026-11-01T00:00:00Z"),
      event(E2, OTHER, "2026-11-12T16:30:00Z", "2026-11-12T17:30:00Z", "2026-11-02T00:00:00Z"),
    ]);
    await expect(resolveOverlapFor(user(ME, "Colaborador"), { eventIds: [E1, E2] })).rejects.toThrow(/^NOT_ORGANIZER/);
  });

  it("reports a missing meeting", async () => {
    repo.eventsWithAttendees.mockResolvedValue([]);
    await expect(resolveOverlapFor(user(ME, "Colaborador"), { eventIds: [E1, E2] })).rejects.toThrow(/^NOT_FOUND/);
  });
});
