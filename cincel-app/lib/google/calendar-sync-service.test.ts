import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  getGoogleOauthAccount: vi.fn(),
  getOauthAccessToken: vi.fn(),
  listMyTasks: vi.fn(),
  buildCalendarEvents: vi.fn(),
  getCalendarSync: vi.fn(),
  upsertCalendarSync: vi.fn(),
  listSyncedEvents: vi.fn(),
  saveSyncedEvent: vi.fn(),
  deleteSyncedEvents: vi.fn(),
  createCalendar: vi.fn(),
  getCalendar: vi.fn(),
  insertEvent: vi.fn(),
  patchEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

vi.mock("@/lib/repositories/google-oauth-repository", () => ({ getGoogleOauthAccount: m.getGoogleOauthAccount }));
vi.mock("@/lib/repositories/tasks-repository", () => ({ listMyTasks: m.listMyTasks }));
vi.mock("@/lib/calendar/calendar-service", () => ({ buildCalendarEvents: m.buildCalendarEvents }));
vi.mock("@/lib/google/oauth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/google/oauth")>()),
  getOauthAccessToken: m.getOauthAccessToken,
}));
vi.mock("@/lib/repositories/google-calendar-sync-repository", () => ({
  getCalendarSync: m.getCalendarSync,
  upsertCalendarSync: m.upsertCalendarSync,
  listSyncedEvents: m.listSyncedEvents,
  saveSyncedEvent: m.saveSyncedEvent,
  deleteSyncedEvents: m.deleteSyncedEvents,
}));
vi.mock("@/lib/google/calendar-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/google/calendar-api")>()),
  createCalendar: m.createCalendar,
  getCalendar: m.getCalendar,
  insertEvent: m.insertEvent,
  patchEvent: m.patchEvent,
  deleteEvent: m.deleteEvent,
}));

import { GoogleCalendarError } from "@/lib/google/calendar-api";
import { CALENDAR_SCOPE } from "@/lib/google/oauth";
import { CalendarNotConnectedError, syncGoogleCalendar } from "@/lib/google/calendar-sync-service";
import { toDesiredEvents } from "@/lib/google/calendar-sync";
import type { CalendarEvent } from "@/lib/types/calendar";

const BASE = "https://app";
const ev = (id: string, title = "T") =>
  ({ id, taskId: id, date: "2026-12-01", time: "09:00", title, project: "P", responsible: "R", stage: "s", stageLabel: "S", phase: "", type: "Compromiso", href: "/x" }) as CalendarEvent;

beforeEach(() => {
  Object.values(m).forEach((fn) => fn.mockReset());
  m.getGoogleOauthAccount.mockResolvedValue({ email: "a@b.c", scope: `openid ${CALENDAR_SCOPE}` });
  m.getOauthAccessToken.mockResolvedValue({ token: "tok", email: "a@b.c" });
  m.listMyTasks.mockResolvedValue([]);
  m.getCalendarSync.mockResolvedValue({ calendarId: "cal", enabled: true, lastSyncedAt: null, lastError: null });
  m.getCalendar.mockResolvedValue(undefined);
  m.listSyncedEvents.mockResolvedValue([]);
  m.insertEvent.mockImplementation(async (_t, _c, body) => `g-${body.summary}`);
});

describe("syncGoogleCalendar", () => {
  it("refuses when the connected account didn't grant Calendar access", async () => {
    m.getGoogleOauthAccount.mockResolvedValue({ email: "a@b.c", scope: "openid email" });
    await expect(syncGoogleCalendar("s1", BASE)).rejects.toThrow(new CalendarNotConnectedError().message);
    expect(m.upsertCalendarSync).toHaveBeenCalledWith("s1", { lastError: expect.stringContaining("Conecta") });
  });

  it("creates, patches and deletes only what changed, then records the sync", async () => {
    m.buildCalendarEvents.mockReturnValue([ev("a"), ev("b", "Cambiada"), ev("c", "Nueva")]);
    const [a] = toDesiredEvents([ev("a")], BASE);
    m.listSyncedEvents.mockResolvedValue([
      { eventKey: "a", googleEventId: "g-a", contentHash: a.contentHash },
      { eventKey: "b", googleEventId: "g-b", contentHash: "old" },
      { eventKey: "z", googleEventId: "g-z", contentHash: "old" },
    ]);

    await expect(syncGoogleCalendar("s1", BASE)).resolves.toEqual({ created: 1, updated: 1, deleted: 1 });
    expect(m.insertEvent).toHaveBeenCalledTimes(1);
    expect(m.patchEvent).toHaveBeenCalledWith("tok", "cal", "g-b", expect.objectContaining({ summary: "Cambiada" }));
    expect(m.deleteEvent).toHaveBeenCalledWith("tok", "cal", "g-z");
    expect(m.deleteSyncedEvents).toHaveBeenCalledWith("s1", ["z"]);
    expect(m.upsertCalendarSync).toHaveBeenLastCalledWith("s1", { lastSyncedAt: expect.any(Date), lastError: null });
  });

  it("recreates the calendar when the user deleted it in Google, forgetting old events", async () => {
    m.getCalendar.mockRejectedValue(new GoogleCalendarError("Not Found", 404));
    m.createCalendar.mockResolvedValue("cal-new");
    m.buildCalendarEvents.mockReturnValue([ev("a")]);

    await syncGoogleCalendar("s1", BASE);
    expect(m.createCalendar).toHaveBeenCalledWith("tok", "Cincel", "America/Mexico_City");
    expect(m.deleteSyncedEvents).toHaveBeenCalledWith("s1");
    expect(m.upsertCalendarSync).toHaveBeenCalledWith("s1", { calendarId: "cal-new" });
    expect(m.insertEvent).toHaveBeenCalledWith("tok", "cal-new", expect.anything());
  });

  it("puts back an event that was deleted by hand in Google", async () => {
    m.buildCalendarEvents.mockReturnValue([ev("b", "Cambiada")]);
    m.listSyncedEvents.mockResolvedValue([{ eventKey: "b", googleEventId: "g-b", contentHash: "old" }]);
    m.patchEvent.mockRejectedValue(new GoogleCalendarError("Deleted", 410));

    await syncGoogleCalendar("s1", BASE);
    expect(m.insertEvent).toHaveBeenCalledTimes(1);
    expect(m.saveSyncedEvent).toHaveBeenCalledWith("s1", expect.objectContaining({ eventKey: "b", googleEventId: "g-Cambiada" }));
  });

  it("stores the error and rethrows when Google fails", async () => {
    m.buildCalendarEvents.mockReturnValue([ev("a")]);
    m.insertEvent.mockRejectedValue(new GoogleCalendarError("Rate Limit Exceeded", 429));
    await expect(syncGoogleCalendar("s1", BASE)).rejects.toThrow("limitando las solicitudes");
    expect(m.upsertCalendarSync).toHaveBeenLastCalledWith("s1", { lastError: expect.stringContaining("limitando") });
  });

  it("asks to reconnect when Google rejects the token", async () => {
    m.getCalendar.mockRejectedValue(new GoogleCalendarError("Invalid Credentials", 401));
    await expect(syncGoogleCalendar("s1", BASE)).rejects.toThrow("Vuelve a conectar tu cuenta de Google");
  });
});
