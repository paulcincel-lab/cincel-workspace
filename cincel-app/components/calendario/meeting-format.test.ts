import { describe, expect, it } from "vitest";

import { attendeesLabel, googleStateOf, isReadOnlyMeeting, mapsUrl, shortDate, timeOf, whenLabel } from "./meeting-format";

describe("meeting-format", () => {
  it("reads the wall clock of an ISO string", () => {
    expect(timeOf("2026-11-11T10:00:00-06:00")).toBe("10:00");
  });
  it("labels the day and time", () => {
    const item = { date: "2026-11-11", start: "2026-11-11T10:00:00-06:00", end: "2026-11-11T11:00:00-06:00", allDay: false };
    expect(whenLabel(item, "2026-11-11")).toBe("Hoy, 10:00 – 11:00");
    expect(whenLabel({ ...item, date: "2026-11-13", start: "2026-11-13T12:00:00-06:00", end: "2026-11-13T13:00:00-06:00" }, "2026-11-11")).toBe(
      "Viernes 13 nov, 12:00 – 13:00",
    );
    expect(shortDate("2026-11-11")).toBe("mié 11 nov");
  });
  it("builds the maps search of the place", () => {
    expect(mapsUrl("Madrid 22")).toBe("https://www.google.com/maps/search/?api=1&query=Madrid%2022");
  });
  it("shows the first attendee and the rest", () => {
    expect(attendeesLabel({ attendees: [{ name: "Ana García", staffId: null, response: "pendiente" }], attendeeCount: 3 })).toBe("Ana García +2");
    expect(attendeesLabel({ attendees: [], attendeeCount: 0 })).toBe("—");
  });
  it("gives the organizer the retry action and attendees only the note", () => {
    expect(googleStateOf({ source: "cincel", syncError: "UNAVAILABLE", canEdit: true }).action?.label).toBe("Reintentar ahora");
    expect(googleStateOf({ source: "cincel", syncError: "UNAVAILABLE", canEdit: false }).action).toBeNull();
    expect(googleStateOf({ source: "cincel", syncError: "ACCESS_DENIED", canEdit: true }).action).toBeNull();
    expect(googleStateOf({ source: "cincel", syncError: null, canEdit: true }).note).toBeNull();
  });
  it("marks Google events of others as read-only", () => {
    expect(isReadOnlyMeeting({ source: "google", canEdit: false })).toBe(true);
    expect(isReadOnlyMeeting({ source: "cincel", canEdit: true })).toBe(false);
  });
});
