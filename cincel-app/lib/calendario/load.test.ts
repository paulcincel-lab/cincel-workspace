// @vitest-environment node
import { describe, expect, it } from "vitest";

import { applyLoadToDays, loadLabel, meetingHoursByDay, overlaps, workdayHours } from "./load";

describe("workdayHours", () => {
  it("is weekly capacity over work days, rounded to 0.5", () => {
    expect(workdayHours({ weeklyCapacityHours: 40, workDays: 5 }, 6)).toBe(8);
    expect(workdayHours({ weeklyCapacityHours: 32, workDays: 5 }, 6)).toBe(6.5);
    expect(workdayHours({ weeklyCapacityHours: 33, workDays: 5 }, 6)).toBe(6.5);
    expect(workdayHours({ weeklyCapacityHours: 20, workDays: 3 }, 6)).toBe(6.5);
  });

  it("falls back to the org default without capacity", () => {
    expect(workdayHours({ weeklyCapacityHours: null, workDays: 5 }, 6)).toBe(6);
    expect(workdayHours({ weeklyCapacityHours: 0, workDays: 5 }, 7)).toBe(7);
    expect(workdayHours({ weeklyCapacityHours: 40, workDays: 0 }, 6)).toBe(6);
  });
});

describe("loadLabel", () => {
  it("has exact thresholds at 50 %, 85 % and 100 %", () => {
    expect(loadLabel(0, 6)).toBe("libre");
    expect(loadLabel(2.9, 6)).toBe("libre");
    expect(loadLabel(3, 6)).toBe("bien");
    expect(loadLabel(5.1, 6)).toBe("bien");
    expect(loadLabel(5.2, 6)).toBe("casi_lleno");
    expect(loadLabel(6, 6)).toBe("casi_lleno");
    expect(loadLabel(6.01, 6)).toBe("sobrecargado");
    expect(loadLabel(9.5, 6)).toBe("sobrecargado");
  });

  it("is exact at 85 % of an 8 h day", () => {
    expect(loadLabel(6.8, 8)).toBe("bien");
    expect(loadLabel(6.9, 8)).toBe("casi_lleno");
  });

  it("an absent day (workday 0) is overloaded only when something is planned", () => {
    expect(loadLabel(0, 0)).toBe("libre");
    expect(loadLabel(1, 0)).toBe("sobrecargado");
  });
});

describe("overlaps", () => {
  const ev = (id: string, start: string, end: string) => ({ id, start, end });

  it("pairs events whose ranges overlap, earlier start first", () => {
    const pairs = overlaps([
      ev("b", "2026-11-12T10:30:00-06:00", "2026-11-12T11:30:00-06:00"),
      ev("a", "2026-11-12T10:00:00-06:00", "2026-11-12T11:00:00-06:00"),
      ev("c", "2026-11-12T13:00:00-06:00", "2026-11-12T14:00:00-06:00"),
    ]);
    expect(pairs).toEqual([["a", "b"]]);
  });

  it("does not pair events that only touch", () => {
    expect(overlaps([ev("a", "2026-11-12T10:00:00Z", "2026-11-12T11:00:00Z"), ev("b", "2026-11-12T11:00:00Z", "2026-11-12T12:00:00Z")])).toEqual([]);
  });

  it("pairs every overlapping couple of three events", () => {
    const pairs = overlaps([
      ev("a", "2026-11-12T10:00:00Z", "2026-11-12T12:00:00Z"),
      ev("b", "2026-11-12T10:30:00Z", "2026-11-12T11:30:00Z"),
      ev("c", "2026-11-12T11:00:00Z", "2026-11-12T11:15:00Z"),
    ]);
    expect(pairs).toEqual([["a", "b"], ["a", "c"], ["b", "c"]]);
  });
});

describe("meetingHoursByDay", () => {
  const range = { from: "2026-11-12", to: "2026-11-13", dayStart: "09:00", dayEnd: "18:00", timeZone: "America/Mexico_City" };

  it("counts the hours inside the jornada", () => {
    expect(meetingHoursByDay({ start: "2026-11-12T10:00:00-06:00", end: "2026-11-12T11:30:00-06:00" }, range)).toEqual({ "2026-11-12": 1.5 });
  });

  it("clips a meeting that starts before or ends after the jornada", () => {
    expect(meetingHoursByDay({ start: "2026-11-12T08:00:00-06:00", end: "2026-11-12T10:00:00-06:00" }, range)).toEqual({ "2026-11-12": 1 });
    expect(meetingHoursByDay({ start: "2026-11-12T17:00:00-06:00", end: "2026-11-12T20:00:00-06:00" }, range)).toEqual({ "2026-11-12": 1 });
  });

  it("counts nothing outside the jornada and splits a meeting over two days", () => {
    expect(meetingHoursByDay({ start: "2026-11-12T19:00:00-06:00", end: "2026-11-12T20:00:00-06:00" }, range)).toEqual({});
    expect(meetingHoursByDay({ start: "2026-11-12T17:00:00-06:00", end: "2026-11-13T10:00:00-06:00" }, range)).toEqual({
      "2026-11-12": 1,
      "2026-11-13": 1,
    });
  });
});

describe("applyLoadToDays", () => {
  it("fills hours, workday, label and overlap count on matching days", () => {
    const days = [
      { date: "2026-11-12", hours: null, workday: null, loadLabel: null, overlaps: 0 },
      { date: "2026-11-13", hours: null, workday: null, loadLabel: null, overlaps: 0 },
    ];
    const out = applyLoadToDays(days, [{ date: "2026-11-12", hours: 9.5, workday: 6, label: "sobrecargado", overlaps: [["a", "b"]] }]);
    expect(out[0]).toEqual({ date: "2026-11-12", hours: 9.5, workday: 6, loadLabel: "sobrecargado", overlaps: 1 });
    expect(out[1]).toEqual(days[1]);
  });
});
