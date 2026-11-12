// @vitest-environment node
import { describe, expect, it } from "vitest";

import { findOverlapSlot, pickEventToMove, searchWindow, unknownAgendaLine } from "@/lib/calendario/resolve-overlap";

const settings = { dayStart: "09:00", dayEnd: "18:00", workDays: [1, 2, 3, 4, 5] };
const TZ = "America/Mexico_City";
// Mexico City is UTC-6 (no DST in Nov 2026): 10:00 local = 16:00Z.
const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-06:00`).toISOString();

describe("pickEventToMove", () => {
  const a = { id: "a", organizerId: "me", createdAt: "2026-11-01T10:00:00Z" };
  const b = { id: "b", organizerId: "me", createdAt: "2026-11-05T10:00:00Z" };
  const other = { id: "c", organizerId: "ana", createdAt: "2026-11-06T10:00:00Z" };

  it("moves the one the viewer organizes", () => {
    expect(pickEventToMove([a, other], { viewerId: "me", isAdmin: false })).toMatchObject({ move: a });
  });
  it("moves the later-created one when the viewer organizes both", () => {
    expect(pickEventToMove([a, b], { viewerId: "me", isAdmin: false })).toMatchObject({ move: b });
  });
  it("honours keep", () => {
    expect(pickEventToMove([a, b], { viewerId: "me", keep: "b", isAdmin: false })).toMatchObject({ move: a, keep: b });
  });
  it("rejects a viewer who organizes neither", () => {
    expect(pickEventToMove([other, { ...other, id: "d" }], { viewerId: "me", isAdmin: false })).toEqual({ error: "NOT_ORGANIZER" });
  });
  it("rejects a keep that is not in the pair", () => {
    expect(pickEventToMove([a, b], { viewerId: "me", keep: "zzz", isAdmin: false })).toEqual({ error: "INVALID" });
  });
});

describe("searchWindow", () => {
  it("spans five workdays", () => {
    // Thursday 12 nov: Thu, Fri, Mon, Tue, Wed.
    expect(searchWindow("2026-11-12", settings.workDays)).toEqual({ from: "2026-11-12", to: "2026-11-18" });
  });
});

describe("findOverlapSlot", () => {
  const base = {
    durationMin: 60,
    from: "2026-11-12",
    settings,
    timeZone: TZ,
    staffIds: ["ana", "luis"],
    absences: [],
    now: new Date(at("2026-11-12", "08:00")),
  };

  it("takes the earliest window where nobody is busy", () => {
    const slot = findOverlapSlot({ ...base, busy: [{ start: at("2026-11-12", "09:00"), end: at("2026-11-12", "11:00") }] });
    expect(slot).toEqual({ start: at("2026-11-12", "11:00"), end: at("2026-11-12", "12:00") });
  });

  it("never proposes a slot an attendee is busy in", () => {
    const busy = [
      { start: at("2026-11-12", "09:00"), end: at("2026-11-12", "11:00") },
      { start: at("2026-11-12", "11:30"), end: at("2026-11-12", "17:30") },
    ];
    const slot = findOverlapSlot({ ...base, busy });
    expect(slot).not.toBeNull();
    for (const b of busy) {
      const overlaps = new Date(slot!.start) < new Date(b.end) && new Date(slot!.end) > new Date(b.start);
      expect(overlaps).toBe(false);
    }
  });

  it("is deterministic", () => {
    const busy = [{ start: at("2026-11-12", "09:00"), end: at("2026-11-12", "10:10") }];
    expect(findOverlapSlot({ ...base, busy })).toEqual(findOverlapSlot({ ...base, busy }));
    // Rounded up to a quarter hour.
    expect(findOverlapSlot({ ...base, busy })?.start).toBe(at("2026-11-12", "10:15"));
  });

  it("skips a day when someone is absent", () => {
    const slot = findOverlapSlot({ ...base, absences: [{ staffId: "ana", from: "2026-11-12", to: "2026-11-13" }], busy: [] });
    expect(slot?.start).toBe(at("2026-11-16", "09:00"));
  });

  it("returns null when five workdays are full", () => {
    const busy = ["2026-11-12", "2026-11-13", "2026-11-16", "2026-11-17", "2026-11-18"].map((d) => ({
      start: at(d, "08:00"),
      end: at(d, "19:00"),
    }));
    expect(findOverlapSlot({ ...base, busy })).toBeNull();
  });
});

describe("unknownAgendaLine", () => {
  it("uses singular and plural", () => {
    expect(unknownAgendaLine(1)).toBe("No pude ver la agenda de 1 persona.");
    expect(unknownAgendaLine(3)).toBe("No pude ver la agenda de 3 personas.");
  });
});
