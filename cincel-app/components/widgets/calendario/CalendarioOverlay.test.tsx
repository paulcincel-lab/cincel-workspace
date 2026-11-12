// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/calendario/use-calendario-assistant-context", () => ({ useOpenCalendarioAssistant: () => vi.fn() }));

import { buildDayAlerts } from "@/lib/calendario/alerts";
import { originalItemIds, overlayEntries } from "@/lib/calendario/proposal-view";
import type { CalDay, CalTaskItem, Proposal } from "@/lib/types/calendario";

import { CalendarioAlerts } from "./CalendarioAlerts";
import { CalendarItemChip } from "./CalendarItemChip";
import { DayCellExtras } from "./DayCellExtras";
import { CalendarioOverlayContext, NO_OVERLAY, type CalendarioOverlay } from "./overlay-context";
import { emptyCalendarioRange } from "@/lib/calendario/empty";

afterEach(cleanup);

const proposal: Proposal = {
  id: "p1",
  kind: "mover_tareas",
  status: "propuesta",
  title: "Mover 1 tarea",
  line: "",
  rangeFrom: null,
  rangeTo: null,
  changes: [{ changeId: "c1", type: "task_date", taskId: "1", title: "Ingenierías", projectName: null, before: { date: "2026-11-09", field: "commitmentDate" }, after: { date: "2026-11-12" }, staffId: null }],
  deferred: [],
  createdAt: "2026-11-11T10:00:00Z",
  expiresAt: "2999-01-01T00:00:00Z",
};

const day = (date: string, hours: number, label: CalDay["loadLabel"]): CalDay => ({ date, tasks: 1, events: 0, shown: 1, hours, workday: 6, loadLabel: label, overlaps: 0 }) as CalDay;

const task: CalTaskItem = {
  kind: "task", id: "t:1", taskId: "1", title: "Ingenierías", date: "2026-11-09", dateField: "commitmentDate", project: null, tramo: null, phase: null,
  status: "en_proceso", statusLabel: "En progreso", priority: "media", manager: null, support: [], overdue: false, completed: false, blocked: false,
  hours: 2, hoursSource: "task", parentTaskId: null, canEdit: true,
} as CalTaskItem;

function overlay(over: Partial<CalendarioOverlay> = {}): CalendarioOverlay {
  const entries = overlayEntries(proposal, ["c1"]);
  return {
    ...NO_OVERLAY,
    proposal,
    checked: ["c1"],
    entries,
    originals: originalItemIds(proposal, ["c1"]),
    entriesByDate: new Map([["2026-11-12", entries]]),
    afterHours: (date) => (date === "2026-11-12" ? 8 : null),
    ...over,
  };
}

describe("proposal overlay in the grids", () => {
  it("strikes the original chip and announces it by text", () => {
    render(
      <CalendarioOverlayContext.Provider value={overlay()}>
        <CalendarItemChip item={task} density="card" />
      </CalendarioOverlayContext.Provider>,
    );
    const chip = screen.getByText("Ingenierías").closest("[data-slot=calendar-item-chip]") as HTMLElement;
    expect(chip.className).toContain("line-through");
    expect(chip.getAttribute("aria-description")).toBe("Se moverá");
    expect(screen.getByText("2 h")).toBeTruthy();
  });

  it("draws the dashed entry with its tag and the after-load meter on the target day", () => {
    render(
      <CalendarioOverlayContext.Provider value={overlay()}>
        <DayCellExtras day={day("2026-11-12", 4, "bien")} />
      </CalendarioOverlayContext.Provider>,
    );
    expect(screen.getByText("propuesta: desde 9 nov")).toBeTruthy();
    expect(screen.getByRole("meter").getAttribute("aria-valuenow")).toBe("8");
    expect(screen.getByText("Sobrecargado")).toBeTruthy();
  });

  it("shows the meter of a day with load and nothing for a day without", () => {
    render(
      <CalendarioOverlayContext.Provider value={NO_OVERLAY}>
        <DayCellExtras day={day("2026-11-10", 5, "casi_lleno")} />
        <DayCellExtras day={day("2026-11-11", 0, "libre")} />
      </CalendarioOverlayContext.Provider>,
    );
    expect(screen.getAllByRole("meter")).toHaveLength(1);
  });
});

describe("alerts per Estilo", () => {
  const days = [day("2026-11-12", 9, "sobrecargado")];
  const range = { ...emptyCalendarioRange({ from: "2026-11-09", to: "2026-11-15" }), days } as ReturnType<typeof emptyCalendarioRange>;

  it.each(["visual", "esencial", "analitico"] as const)("%s shows the banner with its action and no axe violations", async (variant) => {
    const onAlert = vi.fn();
    const { container } = render(
      <CalendarioOverlayContext.Provider value={overlay({ alerts: buildDayAlerts(days), onAlert })}>
        <CalendarioAlerts range={range} variant={variant} />
      </CalendarioOverlayContext.Provider>,
    );
    expect(screen.getByRole("button", { name: "✦ Reparte esto" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Propuesta del asistente" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "✦ Reparte esto" }));
    expect(onAlert).toHaveBeenCalledTimes(1);
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
  });
});
