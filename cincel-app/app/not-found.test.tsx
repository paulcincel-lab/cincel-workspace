// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  flags: { searchWorkspaceAction: false },
}));

vi.mock("@/lib/actions/search-actions.flags", () => ({
  get IMPLEMENTED() {
    return state.flags;
  },
}));

// The real palette (it owns ⌘K / Ctrl+K and reads `useShellUi.searchOpen`); its server actions are stubbed.
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/lib/actions/search-actions", () => ({ searchWorkspaceAction: vi.fn(async () => []) }));
vi.mock("@/lib/actions/time-tracking-actions", () => ({
  fetchMyTodayAction: vi.fn(),
  clockInAction: vi.fn(),
  pauseWorkAction: vi.fn(),
  resumeWorkAction: vi.fn(),
  clockOutAction: vi.fn(),
}));
vi.mock("@/lib/actions/time-tracking-actions.flags", () => ({
  IMPLEMENTED: { clockInAction: false, fetchMyTodayAction: false },
}));

import { renderWithQueryClient } from "@/lib/query/test-utils";

import NotFound from "./not-found";

function renderNotFound() {
  return renderWithQueryClient(<NotFound />);
}

/** The open palette's dialog ("Buscar" is its sr-only title). */
function palette() {
  return screen.queryByRole("dialog", { name: "Buscar" });
}

beforeEach(() => {
  state.flags = { searchWorkspaceAction: false };
});

afterEach(cleanup);

describe("app/not-found", () => {
  it("shows the not-found copy", () => {
    renderNotFound();
    expect(screen.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeTruthy();
    expect(screen.getByText("Error 404")).toBeTruthy();
  });

  it("links 'Volver a Inicio' to /inicio", () => {
    renderNotFound();
    expect(screen.getByRole("link", { name: "Volver a Inicio" }).getAttribute("href")).toBe("/inicio");
  });

  it("hides 'Buscar' while the search action is not implemented", () => {
    renderNotFound();
    expect(screen.queryByRole("button", { name: /Buscar/ })).toBeNull();
  });

  it("opens the palette from 'Buscar' when its flag is on", () => {
    state.flags = { searchWorkspaceAction: true };
    renderNotFound();
    expect(palette()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Buscar/ }));
    expect(palette()).toBeTruthy();
  });

  it("opens the palette with Ctrl+K when its flag is on", () => {
    state.flags = { searchWorkspaceAction: true };
    renderNotFound();
    expect(palette()).toBeNull();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(palette()).toBeTruthy();
  });

  it("keeps the illustration out of the accessibility tree", () => {
    const { container } = renderNotFound();
    const illustration = container.querySelector('[data-slot="not-found-illustration"]');
    expect(illustration?.getAttribute("aria-hidden")).toBe("true");
  });
});
