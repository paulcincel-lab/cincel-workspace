import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createCalendar,
  deleteEvent,
  GoogleCalendarError,
  insertEvent,
  isGone,
  patchEvent,
} from "@/lib/google/calendar-api";
import type { GoogleEventBody } from "@/lib/google/calendar-sync";

const fetchMock = vi.fn();

function reply(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

const body: GoogleEventBody = {
  summary: "Entrega",
  description: "d",
  start: { date: "2026-12-31" },
  end: { date: "2027-01-01" },
  transparency: "transparent",
  source: { title: "Cincel Workspace", url: "https://app/x" },
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("Google Calendar API client", () => {
  it("creates a calendar with a bearer token and returns its id", async () => {
    fetchMock.mockResolvedValue(reply(200, { id: "cal-1" }));
    await expect(createCalendar("tok", "Cincel", "America/Mexico_City")).resolves.toBe("cal-1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://www.googleapis.com/calendar/v3/calendars");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({ summary: "Cincel", timeZone: "America/Mexico_City" });
  });

  it("inserts and patches events under the url-encoded calendar id", async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { id: "ev-1" })).mockResolvedValueOnce(reply(200, { id: "ev-1" }));
    await expect(insertEvent("tok", "abc@group.calendar.google.com", body)).resolves.toBe("ev-1");
    await patchEvent("tok", "abc@group.calendar.google.com", "ev-1", body);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/abc%40group.calendar.google.com/events"
    );
    expect(fetchMock.mock.calls[1][0]).toMatch(/\/events\/ev-1$/);
    expect(fetchMock.mock.calls[1][1].method).toBe("PATCH");
  });

  it("surfaces Google's error message and status", async () => {
    fetchMock.mockResolvedValue(reply(403, { error: { message: "Insufficient Permission" } }));
    const error = await insertEvent("tok", "c", body).catch((e) => e);
    expect(error).toBeInstanceOf(GoogleCalendarError);
    expect(error.message).toBe("Insufficient Permission");
    expect(error.status).toBe(403);
    expect(isGone(error)).toBe(false);
  });

  it("treats an already-deleted event as deleted, but rethrows other failures", async () => {
    fetchMock.mockResolvedValueOnce(reply(204)).mockResolvedValueOnce(reply(410)).mockResolvedValueOnce(reply(500));
    await expect(deleteEvent("tok", "c", "e")).resolves.toBeUndefined();
    await expect(deleteEvent("tok", "c", "e")).resolves.toBeUndefined();
    await expect(deleteEvent("tok", "c", "e")).rejects.toBeInstanceOf(GoogleCalendarError);
  });
});
