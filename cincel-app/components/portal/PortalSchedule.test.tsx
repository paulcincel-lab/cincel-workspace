// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import PortalSchedule, { groupByPlanta, PORTAL_SCHEDULE_EMPTY } from "./PortalSchedule";

afterEach(cleanup);

const s = (planta: string, seccion: string, progressPct = 0) => ({
  key: `${planta}::${seccion}`,
  planta,
  seccion,
  start: "2026-01-01",
  end: "2026-01-31",
  progressPct,
});

describe("PortalSchedule", () => {
  it("groups by planta keeping the DTO order", () => {
    const groups = groupByPlanta([s("PB", "A"), s("PA", "B"), s("PB", "C")]);

    expect(groups.map((g) => g.planta)).toEqual(["PB", "PA"]);
    expect(groups[0].sections.map((x) => x.seccion)).toEqual(["A", "C"]);
  });

  it("shows the empty copy for null and for no sections", () => {
    const { unmount } = render(<PortalSchedule schedule={null} />);
    expect(screen.getByText(PORTAL_SCHEDULE_EMPTY)).toBeTruthy();
    unmount();

    render(<PortalSchedule schedule={{ sections: [] }} />);
    expect(screen.getByText(PORTAL_SCHEDULE_EMPTY)).toBeTruthy();
  });

  it("renders name, dates and a clamped percentage per section", () => {
    render(<PortalSchedule schedule={{ sections: [s("PB", "Muros", 133)] }} />);

    expect(screen.getByText("Muros")).toBeTruthy();
    expect(screen.getByText("01-01-2026 – 31-01-2026")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
  });
});
