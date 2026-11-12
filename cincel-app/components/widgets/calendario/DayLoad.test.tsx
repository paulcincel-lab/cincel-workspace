import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildDayAlerts, dayLoadLine, hoursWithProposal, isoWeekNumber, loadSubtitle } from "@/lib/calendario/alerts";
import type { CalDay } from "@/lib/types/calendario";

import { DayAlertBanner, DayAlertBanners } from "./DayAlertBanner";
import { DayLoadMeter, OverlapTag } from "./DayLoadMeter";

afterEach(cleanup);

const day = (over: Partial<CalDay>): CalDay => ({
  date: "2026-11-12",
  tasks: 0,
  events: 0,
  overdue: 0,
  completed: 0,
  shown: 0,
  hours: 2,
  workday: 6,
  loadLabel: "bien",
  overlaps: 0,
  ...over,
});

describe("DayLoadMeter", () => {
  it("exposes meter semantics, hours text and the label chip", () => {
    render(<DayLoadMeter hours={9.5} workday={6} label="sobrecargado" />);
    const meter = screen.getByRole("meter", { name: "Carga del día" });
    expect(meter.getAttribute("aria-valuemin")).toBe("0");
    expect(meter.getAttribute("aria-valuemax")).toBe("6");
    expect(meter.getAttribute("aria-valuenow")).toBe("9.5");
    expect(screen.getByText("9.5 h de 6 h")).toBeTruthy();
    expect(screen.getByText("Sobrecargado")).toBeTruthy();
    expect(document.querySelector("[data-slot=day-load-meter]")?.className).toContain("border-destructive");
  });

  it("has no red edge when not overloaded and shows after values", () => {
    render(<DayLoadMeter hours={8} workday={6} label="bien" afterHours={5} />);
    expect(document.querySelector("[data-slot=day-load-meter]")?.className).not.toContain("border-destructive");
    expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("5");
    expect(screen.getByText("5 h de 6 h")).toBeTruthy();
  });

  it("renders the overlap tag", () => {
    render(<OverlapTag />);
    expect(screen.getByText("Se traslapan")).toBeTruthy();
  });
});

describe("day alerts", () => {
  it("orders overloads first, caps at two and writes the copy", () => {
    const alerts = buildDayAlerts([
      day({ date: "2026-11-11", hours: 7, loadLabel: "sobrecargado" }),
      day({ date: "2026-11-12", hours: 9.5, loadLabel: "sobrecargado" }),
      day({ date: "2026-11-13", overlaps: 1 }),
    ]);
    expect(alerts.map((a) => a.message)).toEqual(["El jueves 12 tiene 9.5 h de 6 h", "El miércoles 11 tiene 7 h de 6 h"]);
    expect(buildDayAlerts([day({ date: "2026-11-13", overlaps: 1 })])[0]).toMatchObject({
      kind: "overlap",
      message: "El viernes se traslapan 2 reuniones",
      actionLabel: "✦ Resolver traslape",
    });
  });

  it("builds the subtitle, the Esencial line and after values", () => {
    expect(isoWeekNumber("2026-11-12")).toBe(46);
    expect(loadSubtitle("2026-11-12", 6)).toBe("Semana 46 · tu carga por día (jornada de 6 h de trabajo)");
    expect(dayLoadLine(day({ hours: 9.5, loadLabel: "sobrecargado" }))).toBe("Jueves · 9.5 h de 6 h · Sobrecargado");
    expect(hoursWithProposal("2026-11-12", 9.5, [{ staffId: "s", date: "2026-11-12", before: 9.5, after: 5 }])).toBe(5);
    expect(hoursWithProposal("2026-11-13", 2, undefined)).toBe(2);
  });
});

describe("DayAlertBanner", () => {
  it("is a status region whose action starts the proposal", () => {
    const onAction = vi.fn();
    render(<DayAlertBanner kind="overload" date="2026-11-12" message="El jueves 12 tiene 9.5 h de 6 h" onAction={onAction} />);
    expect(screen.getByRole("status").textContent).toContain("9.5 h de 6 h");
    fireEvent.click(screen.getByRole("button", { name: "✦ Reparte esto" }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("shows at most two banners", () => {
    const alerts = ["10", "11", "12"].map((d) => ({ kind: "overload" as const, date: `2026-11-${d}`, message: `Día ${d}`, actionLabel: "✦ Reparte esto" }));
    render(<DayAlertBanners alerts={alerts} />);
    expect(screen.getAllByRole("status")).toHaveLength(2);
  });
});
