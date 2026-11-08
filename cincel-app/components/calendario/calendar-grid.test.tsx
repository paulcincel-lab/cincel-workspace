import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { dateKey } from "@/lib/calendar/calendar-service";

import { CalendarWeekdayHeader, approxTime, buildMonthCells } from "./calendar-grid";

describe("approxTime", () => {
  it("marks the time as estimated", () => {
    expect(approxTime("09:30")).toBe("≈09:30");
  });
});

describe("buildMonthCells", () => {
  const key = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  it("builds whole Monday-first weeks with the leading and trailing days", () => {
    // Noviembre 2026: Sunday the 1st → the grid starts Monday Oct 26 and ends Sunday Dec 6.
    const cells = buildMonthCells(new Date(2026, 10, 15), new Map(), new Date(2026, 10, 6), key);
    expect(cells).toHaveLength(42);
    expect(cells[0]).toMatchObject({ key: "2026-10-26", isCurrentMonth: false, dayNumber: 26 });
    expect(cells.at(-1)).toMatchObject({ key: "2026-12-06", isCurrentMonth: false, dayNumber: 6 });
    expect(cells.filter((c) => c.isCurrentMonth)).toHaveLength(30);
  });

  it("marks today and attaches each day's events", () => {
    const events = new Map([["2026-11-06", ["Planos ejecutivos"]]]);
    const cells = buildMonthCells(new Date(2026, 10, 1), events, new Date(2026, 10, 6), key);
    const today = cells.filter((c) => c.isToday);
    expect(today.map((c) => c.key)).toEqual(["2026-11-06"]);
    expect(today[0].events).toEqual(["Planos ejecutivos"]);
    expect(cells.find((c) => c.key === "2026-11-07")?.events).toEqual([]);
  });

  it("uses the calendar service dateKey by default", () => {
    const cells = buildMonthCells(new Date(2026, 1, 1), new Map(), new Date(2026, 1, 1));
    expect(cells.every((c) => c.key === dateKey(c.date))).toBe(true);
    // Febrero 2026 starts on a Sunday and has 28 days: five weeks.
    expect(cells).toHaveLength(35);
  });
});

describe("CalendarWeekdayHeader", () => {
  it("renders the seven weekday labels", () => {
    const { container } = render(<CalendarWeekdayHeader />);
    expect(container.firstElementChild?.children).toHaveLength(7);
    expect(screen.getAllByText(/\S/).length).toBe(7);
  });
});
