// @vitest-environment node
/**
 * Pure parts of the Google Calendar sync (Calendario BE §7): error mapping,
 * event mapping, free/busy parsing and merging, meeting bodies. The database
 * and Google are not touched.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/google/staff-token", () => ({ getStaffAccessToken: vi.fn() }));
vi.mock("@/lib/repositories/google-calendar-sync-repository", () => ({}));
vi.mock("@/lib/repositories/calendar-events-repository", () => ({}));
vi.mock("@/lib/time-tracking/settings", () => ({ getTimeTrackingSettings: vi.fn() }));
vi.mock("@/lib/vacations/approved-absences", () => ({ approvedAbsences: vi.fn() }));

import { CalendarScopeMissingError } from "@/lib/assistant/agenda/google-calendar";
import { GoogleCalendarError } from "@/lib/google/calendar-api";
import {
  actionCodeOf,
  classifyGoogleError,
  mapGoogleEvent,
  meetingBody,
  meetingPatchBody,
  mergeBusy,
  meetUrlOf,
  primaryWindow,
  readFreeBusy,
} from "./calendar-events-sync";

const err = (status: number, message = "x") => new GoogleCalendarError(message, status);

describe("classifyGoogleError", () => {
  it("maps Google statuses to the failure codes of BE §7.5", () => {
    expect(classifyGoogleError(err(401))).toBe("REAUTH");
    expect(classifyGoogleError(err(412))).toBe("CONFLICT");
    expect(classifyGoogleError(err(404))).toBe("GONE");
    expect(classifyGoogleError(err(410))).toBe("GONE");
    expect(classifyGoogleError(err(429))).toBe("RATE_LIMITED");
    expect(classifyGoogleError(err(403, "Rate Limit Exceeded"))).toBe("RATE_LIMITED");
    expect(classifyGoogleError(err(403, "Insufficient Permission"))).toBe("REAUTH");
    expect(classifyGoogleError(err(403, "You need to have writer access"))).toBe("NOT_ORGANIZER");
    expect(classifyGoogleError(err(503))).toBe("UNAVAILABLE");
    expect(classifyGoogleError(new TypeError("fetch failed"))).toBe("UNAVAILABLE");
    expect(classifyGoogleError(new CalendarScopeMissingError())).toBe("NO_GRANT");
  });

  it("surfaces failures with the error codes of lib/errors.ts", () => {
    expect(actionCodeOf("REAUTH")).toBe("GOOGLE_REAUTH");
    expect(actionCodeOf("NO_GRANT")).toBe("GOOGLE_REAUTH");
    expect(actionCodeOf("UNAVAILABLE")).toBe("GOOGLE_UNAVAILABLE");
    expect(actionCodeOf("RATE_LIMITED")).toBe("GOOGLE_UNAVAILABLE");
    expect(actionCodeOf("CONFLICT")).toBe("CONFLICT");
  });
});

describe("mapGoogleEvent", () => {
  it("maps attendees, the Meet link, htmlLink and etag", () => {
    const mapped = mapGoogleEvent({
      id: "g1",
      summary: "Revisión",
      htmlLink: "https://calendar.example/g1",
      etag: '"1"',
      start: { dateTime: "2026-11-12T16:00:00Z" },
      end: { dateTime: "2026-11-12T17:00:00Z" },
      conferenceData: { entryPoints: [{ entryPointType: "phone", uri: "tel:1" }, { entryPointType: "video", uri: "https://meet.example/x" }] },
      organizer: { email: "Ana@Example.test" },
      attendees: [
        { email: "Ana@Example.test", responseStatus: "accepted", displayName: "Ana" },
        { email: "luis@example.test", responseStatus: "declined" },
        { email: "LUIS@example.test", responseStatus: "accepted" },
        { email: "sol@example.test", responseStatus: "tentative", optional: true },
      ],
    });
    expect(mapped?.meetUrl).toBe("https://meet.example/x");
    expect(mapped?.htmlLink).toBe("https://calendar.example/g1");
    expect(mapped?.etag).toBe('"1"');
    expect(mapped?.attendees.map((a) => [a.email, a.response, a.isOrganizer, a.optional])).toEqual([
      ["ana@example.test", "acepta", true, false],
      ["luis@example.test", "rechaza", false, false],
      ["sol@example.test", "tentativo", false, true],
    ]);
  });

  it("prefers hangoutLink, handles all-day events and untitled events", () => {
    expect(meetUrlOf({ hangoutLink: "https://meet.example/h", conferenceData: { entryPoints: [] } })).toBe("https://meet.example/h");
    const allDay = mapGoogleEvent({ id: "g2", start: { date: "2026-11-12" }, end: { date: "2026-11-13" } });
    expect(allDay?.allDay).toBe(true);
    expect(allDay?.title).toBe("(Sin título)");
    expect(allDay && allDay.endsAt > allDay.startsAt).toBe(true);
  });

  it("returns null without a start and never produces an empty range", () => {
    expect(mapGoogleEvent({ id: "g3" })).toBeNull();
    const zero = mapGoogleEvent({ id: "g4", start: { dateTime: "2026-11-12T16:00:00Z" }, end: { dateTime: "2026-11-12T16:00:00Z" } });
    expect(zero && zero.endsAt > zero.startsAt).toBe(true);
  });
});

describe("primaryWindow", () => {
  it("is today − 35 days to today + 120 days", () => {
    const w = primaryWindow(new Date("2026-11-11T12:00:00Z"));
    expect(w.from).toBe("2026-10-07");
    expect(w.to).toBe("2027-03-11");
  });
});

describe("free/busy parsing", () => {
  it("reports emails Google can't answer for as unknown", () => {
    const { busy, unknown } = readFreeBusy(["a@example.test", "b@other.test", "c@example.test"], {
      calendars: {
        "a@example.test": { busy: [{ start: "2026-11-12T16:00:00Z", end: "2026-11-12T17:00:00Z" }] },
        "b@other.test": { busy: [], errors: [{ reason: "notFound" }] },
      },
    });
    expect(busy["a@example.test"]).toHaveLength(1);
    expect(unknown).toEqual(["b@other.test", "c@example.test"]);
  });

  it("merges overlapping and touching intervals", () => {
    expect(
      mergeBusy([
        { start: "2026-11-12T17:00:00Z", end: "2026-11-12T18:00:00Z" },
        { start: "2026-11-12T16:00:00Z", end: "2026-11-12T17:00:00Z" },
        { start: "2026-11-12T16:30:00Z", end: "2026-11-12T16:45:00Z" },
        { start: "2026-11-12T20:00:00Z", end: "2026-11-12T20:00:00Z" },
      ]),
    ).toEqual([{ start: "2026-11-12T16:00:00Z", end: "2026-11-12T18:00:00Z" }]);
  });
});

describe("meeting bodies", () => {
  const row = {
    title: "Revisión",
    description: null,
    location: "Oficina",
    startsAt: new Date("2026-11-12T16:00:00Z"),
    endsAt: new Date("2026-11-12T17:00:00Z"),
    allDay: false,
    timeZone: "America/Mexico_City",
  };

  it("builds the whole event without empty fields", () => {
    expect(meetingBody(row, ["a@example.test"])).toEqual({
      summary: "Revisión",
      location: "Oficina",
      start: { dateTime: "2026-11-12T16:00:00.000Z", timeZone: "America/Mexico_City" },
      end: { dateTime: "2026-11-12T17:00:00.000Z", timeZone: "America/Mexico_City" },
      attendees: [{ email: "a@example.test" }],
    });
  });

  it("builds a patch with only the changed fields", () => {
    expect(meetingPatchBody(row, { title: "Nuevo", location: null })).toEqual({ summary: "Nuevo", location: "" });
  });
});
