// @vitest-environment node
/**
 * `refreshGoogleEventsAction` and `retryMeetingSyncAction` (Calendario BE §7,
 * §12, §14): input validation, viewer checks inside the action, rate limit,
 * and the error codes of failed Google calls. Everything behind them is mocked.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const user = { member: { id: "staff-1", name: "Ana", role: "Arquitecto", area: "", capacity: 0 } };
const rows: { organizerId: string | null }[] = [];

vi.mock("@/lib/auth/session", () => ({ requireCapabilityUser: vi.fn(async () => user) }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveCalendarCapabilities: vi.fn(() => ({ canViewCalendar: true })),
}));
vi.mock("@/lib/db/client", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => rows }) }) }) },
}));
vi.mock("@/lib/google/calendar-events-sync", () => ({
  actionCodeOf: (failure: string) => (failure === "REAUTH" ? "GOOGLE_REAUTH" : "GOOGLE_UNAVAILABLE"),
  refreshPrimaryEvents: vi.fn(),
  writeMeetingToGoogle: vi.fn(),
}));
vi.mock("@/lib/repositories/calendar-events-repository", () => ({ getEventItem: vi.fn(async () => ({ eventId: "ev" })) }));
vi.mock("@/lib/repositories/google-calendar-sync-repository", () => ({
  getPrimarySyncState: vi.fn(async () => ({ syncedAt: new Date("2026-11-11T10:00:00Z") })),
}));

import { resolveCalendarCapabilities } from "@/lib/auth/permissions";
import { refreshPrimaryEvents, writeMeetingToGoogle } from "@/lib/google/calendar-events-sync";

import { refreshGoogleEventsAction, retryMeetingSyncAction } from "./calendario-actions";

const EVENT_ID = "6f1c2f0e-8b0e-4b8f-9a53-0c8d8f3f6a11";

beforeEach(() => {
  vi.mocked(refreshPrimaryEvents).mockReset();
  vi.mocked(writeMeetingToGoogle).mockReset();
  vi.mocked(resolveCalendarCapabilities).mockReturnValue({ canViewCalendar: true } as never);
  rows.length = 0;
});

describe("refreshGoogleEventsAction", () => {
  it("returns the sync time of a refresh and of a skipped one", async () => {
    vi.mocked(refreshPrimaryEvents).mockResolvedValueOnce({ upserted: 2, deleted: 0, syncedAt: "2026-11-11T12:00:00.000Z" });
    expect(await refreshGoogleEventsAction()).toEqual({ ok: true, data: { syncedAt: "2026-11-11T12:00:00.000Z" } });
    vi.mocked(refreshPrimaryEvents).mockResolvedValueOnce({ skipped: "fresh" });
    expect(await refreshGoogleEventsAction()).toEqual({ ok: true, data: { syncedAt: "2026-11-11T10:00:00.000Z" } });
  });

  it("rejects invalid input and viewers without the calendar", async () => {
    expect(await refreshGoogleEventsAction({ force: "yes" } as never)).toEqual({ ok: false, error: "INVALID" });
    vi.mocked(resolveCalendarCapabilities).mockReturnValue({ canViewCalendar: false } as never);
    expect(await refreshGoogleEventsAction()).toEqual({ ok: false, error: "FORBIDDEN" });
    expect(refreshPrimaryEvents).not.toHaveBeenCalled();
  });

  it("limits forced refreshes to 6 per 10 minutes", async () => {
    vi.mocked(refreshPrimaryEvents).mockResolvedValue({ skipped: "fresh" });
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await refreshGoogleEventsAction({ force: true }));
    expect(results.slice(0, 6).every((r) => r.ok)).toBe(true);
    expect(results[6]).toEqual({ ok: false, error: "RATE_LIMITED" });
    // Without force the 5-minute freshness rule applies instead of the limiter.
    expect((await refreshGoogleEventsAction()).ok).toBe(true);
  });

  it("surfaces a failed Google call as its action code", async () => {
    vi.mocked(refreshPrimaryEvents).mockRejectedValueOnce(new Error("GOOGLE_REAUTH"));
    expect(await refreshGoogleEventsAction()).toEqual({ ok: false, error: "GOOGLE_REAUTH" });
  });
});

describe("retryMeetingSyncAction", () => {
  it("validates the id", async () => {
    expect(await retryMeetingSyncAction("nope")).toEqual({ ok: false, error: "INVALID" });
  });

  it("answers NOT_FOUND for a missing meeting and NOT_ORGANIZER for anyone but the organizer", async () => {
    expect(await retryMeetingSyncAction(EVENT_ID)).toEqual({ ok: false, error: "NOT_FOUND" });
    rows.push({ organizerId: "someone-else" });
    expect(await retryMeetingSyncAction(EVENT_ID)).toEqual({ ok: false, error: "NOT_ORGANIZER" });
    expect(writeMeetingToGoogle).not.toHaveBeenCalled();
  });

  it("retries as the organizer and returns the meeting", async () => {
    rows.push({ organizerId: "staff-1" });
    vi.mocked(writeMeetingToGoogle).mockResolvedValue({ ok: true, googleEventId: "g", etag: null, htmlLink: null, meetUrl: null });
    expect(await retryMeetingSyncAction(EVENT_ID)).toEqual({ ok: true, data: { eventId: "ev" } });
    expect(writeMeetingToGoogle).toHaveBeenCalledWith(EVENT_ID, "retry", { actorId: "staff-1" });
  });

  it("a Google failure is reported with its code and the meeting stays as it was", async () => {
    rows.push({ organizerId: "staff-1" });
    vi.mocked(writeMeetingToGoogle).mockResolvedValue({ ok: false, error: "REAUTH" });
    expect(await retryMeetingSyncAction(EVENT_ID)).toEqual({ ok: false, error: "GOOGLE_REAUTH" });
  });
});
