import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";

const nav = vi.hoisted(() => ({ search: "", push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: nav.push, replace: nav.replace, refresh: vi.fn() }),
  usePathname: () => "/proyectos/p1/cronograma",
}));

vi.mock("@/lib/actions/schedule-actions", () => ({
  previewImportScheduleAction: vi.fn(),
  commitImportScheduleAction: vi.fn(),
  importLegacyStateAction: vi.fn(),
}));

import { renderWithQueryClient } from "@/lib/query/test-utils";

import { CronogramaHeader } from "./cronograma-header";

function renderHeader(weekOffset: number) {
  return renderWithQueryClient(
    <CronogramaHeader
      projectId="p1"
      scheduleId="s1"
      projectName="Proyecto"
      address={null}
      today={new Date("2026-09-18T00:00:00")}
      weekOffset={weekOffset}
    />,
  );
}

let replaceState: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  window.history.replaceState(null, "", "/proyectos/p1/cronograma");
  replaceState = vi.spyOn(window.history, "replaceState");
});

afterEach(() => {
  cleanup();
  replaceState.mockRestore();
  nav.search = "";
  vi.clearAllMocks();
});

describe("CronogramaHeader — ?week=", () => {
  it("writes the next week with history.replaceState, never the router", () => {
    renderHeader(0);
    fireEvent.click(screen.getByRole("button", { name: "→" }));
    expect(replaceState).toHaveBeenCalledWith(null, "", "?week=1");
    expect(nav.push).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("keeps the other params and goes back a week", () => {
    nav.search = "week=2&estilo=visual";
    renderHeader(2);
    fireEvent.click(screen.getByRole("button", { name: "←" }));
    expect(replaceState).toHaveBeenCalledWith(null, "", "?week=1&estilo=visual");
  });

  it("'Hoy' drops ?week= and keeps the path", () => {
    nav.search = "week=3";
    renderHeader(3);
    fireEvent.click(screen.getByRole("button", { name: "Hoy" }));
    expect(replaceState).toHaveBeenCalledWith(null, "", "/proyectos/p1/cronograma");
    expect(nav.push).not.toHaveBeenCalled();
  });
});
