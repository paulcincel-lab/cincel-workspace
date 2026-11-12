// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loadMeetingPrep: vi.fn(), sendAgenda: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/loaders/calendario", () => ({ loadDayLoad: vi.fn(), loadMeetingPrep: mocks.loadMeetingPrep }));
vi.mock("@/lib/calendario/agenda-mail", () => ({ sendAgenda: mocks.sendAgenda }));
vi.mock("@/lib/calendario/propose-planning", () => ({ proposeRedistributionFor: vi.fn(), resolveOverlapFor: vi.fn() }));

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { AssistantContext } from "@/lib/types/redesign";

import { meeting_prep, send_agenda } from "./calendario";

const EVENT_ID = "6f1c0a8e-3c41-4d63-9d0b-0a7c3a5f2b11";
const user = { email: "ana@cincel.test", access: "Colaborador", member: { id: "staff-1", name: "Ana" } } as unknown as AuthenticatedUser;
const context: AssistantContext = { route: "/calendario" };
const ctx = { user, context, threadId: "t1" };

beforeEach(() => vi.clearAllMocks());

describe("meeting_prep", () => {
  it("is a read tool offered once the loader is live", () => {
    expect(meeting_prep.definition.confirm).toBe(false);
    expect(meeting_prep.definition.write).toBe(false);
    expect(meeting_prep.definition.available({ user, context })).toBe(true);
  });

  it("validates its input", () => {
    expect(meeting_prep.definition.schema.safeParse({ eventId: "x" }).success).toBe(false);
    expect(meeting_prep.definition.schema.safeParse({ eventId: EVENT_ID, phrasing: true }).success).toBe(true);
  });

  it("returns the prep and passes phrasing on", async () => {
    mocks.loadMeetingPrep.mockResolvedValue({ eventId: EVENT_ID, agenda: [] });
    await expect(meeting_prep.definition.run(ctx, { eventId: EVENT_ID, phrasing: true })).resolves.toEqual({ eventId: EVENT_ID, agenda: [] });
    expect(mocks.loadMeetingPrep).toHaveBeenCalledWith(user, EVENT_ID, { phrasing: true });
  });

  it("says NOT_FOUND when the viewer cannot see the meeting", async () => {
    mocks.loadMeetingPrep.mockResolvedValue(null);
    await expect(meeting_prep.definition.run(ctx, { eventId: EVENT_ID })).rejects.toThrow("NOT_FOUND");
  });
});

describe("send_agenda", () => {
  it("asks for approval and is a write", () => {
    expect(send_agenda.definition.confirm).toBe(true);
    expect(send_agenda.definition.write).toBe(true);
    expect(send_agenda.definition.available({ user, context })).toBe(true);
  });

  it("accepts 1 to 12 non-empty items", () => {
    const schema = send_agenda.definition.schema;
    expect(schema.safeParse({ eventId: EVENT_ID, items: [] }).success).toBe(false);
    expect(schema.safeParse({ eventId: EVENT_ID, items: ["  "] }).success).toBe(false);
    expect(schema.safeParse({ eventId: EVENT_ID, items: Array(13).fill("p") }).success).toBe(false);
    expect(schema.safeParse({ eventId: EVENT_ID, items: ["Punto"], to: "asistentes" }).success).toBe(true);
  });

  it("sends as the viewer", async () => {
    mocks.sendAgenda.mockResolvedValue({ sent: 3 });
    await expect(send_agenda.definition.run(ctx, { eventId: EVENT_ID, items: ["Punto"] })).resolves.toEqual({ sent: 3 });
    expect(mocks.sendAgenda).toHaveBeenCalledWith(user, EVENT_ID, ["Punto"]);
  });
});
