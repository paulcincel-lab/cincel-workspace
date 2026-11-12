// @vitest-environment happy-dom
import { QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render as baseRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/calendario",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/components/calendario/CalendarFeedDialog", () => ({
  default: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Suscribirse al calendario" /> : null),
}));
vi.mock("@/lib/actions/calendario-actions.flags", () => ({ IMPLEMENTED: { createMeetingAction: false } }));
vi.mock("@/components/shell/EstiloSwitch", () => ({ EstiloSwitch: () => null }));

import { createTestQueryClient } from "@/lib/query/test-utils";
import { resetNewTaskUi, useNewTaskUi } from "@/lib/stores/new-task-store";
import type { CalKpis, CalendarioQuery } from "@/lib/types/calendario";
import { DEFAULT_CALENDARIO_FILTERS } from "@/lib/calendario/url-state";

import { CalendarioHeader } from "./CalendarioHeader";

const QUERY: CalendarioQuery = {
  vista: "semana",
  fecha: "2026-11-12",
  filters: DEFAULT_CALENDARIO_FILTERS,
  modo: null,
  evento: null,
  tarea: null,
  propuesta: null,
  nueva: null,
};
const KPIS: CalKpis = { tasks: 9, meetings: 4, meetingHours: 5, overdue: 3, overduePct: 10, unassigned: 0 };

/** The header mounts the new-meeting dialog, which reads the range query. */
function render(ui: ReactElement) {
  return baseRender(<QueryClientProvider client={createTestQueryClient()}>{ui}</QueryClientProvider>);
}

beforeEach(resetNewTaskUi);
afterEach(cleanup);

describe("CalendarioHeader", () => {
  it("shows the title and the subtitle with counts and the overdue count", () => {
    render(<CalendarioHeader query={QUERY} today="2026-11-11" kpis={KPIS} />);
    expect(screen.getByRole("heading", { name: "Calendario" })).toBeTruthy();
    expect(screen.getByText(/Semana 46 · 9 tareas y 4 reuniones/)).toBeTruthy();
    expect(screen.getByText("3 vencidas").className).toContain("text-destructive-ink");
  });

  it("leaves the overdue part out at zero and uses singular plurals", () => {
    render(<CalendarioHeader query={{ ...QUERY, vista: "dia", fecha: "2026-11-11" }} today="2026-11-11" kpis={{ ...KPIS, tasks: 1, meetings: 1, overdue: 0 }} />);
    expect(screen.getByText("Hoy · 1 tarea y 1 reunión")).toBeTruthy();
    expect(screen.queryByText(/vencida/)).toBeNull();
  });

  it("opens the subscription dialog", () => {
    render(<CalendarioHeader query={QUERY} today="2026-11-11" kpis={KPIS} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Suscribirse" }));
    expect(screen.getByRole("dialog", { name: "Suscribirse al calendario" })).toBeTruthy();
  });

  it("creates a task for the date of the calendar with the source calendario", async () => {
    render(<CalendarioHeader query={QUERY} today="2026-11-11" kpis={KPIS} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Tarea" }));
    const state = useNewTaskUi.getState();
    expect(state.open).toBe(true);
    expect(state.source).toBe("calendario");
    expect(state.defaults).toEqual({ deliveryDate: "2026-11-12" });
  });

  it("keeps Reunión disabled until meetings are implemented", async () => {
    render(<CalendarioHeader query={QUERY} today="2026-11-11" kpis={KPIS} />);
    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo" }));
    const item = await screen.findByRole("menuitem", { name: "Reunión" });
    expect(item.getAttribute("aria-disabled") === "true" || item.hasAttribute("data-disabled")).toBe(true);
  });
});
