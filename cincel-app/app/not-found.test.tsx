// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  flags: { searchWorkspaceAction: false },
}));

vi.mock("@/lib/actions/search-actions.flags", () => ({
  get IMPLEMENTED() {
    return state.flags;
  },
}));

vi.mock("@/components/shell/CommandPalette", () => ({
  CommandPalette: ({ open }: { open: boolean }) => (open ? <div data-testid="command-palette">palette</div> : null),
}));

import NotFound from "./not-found";

function renderNotFound() {
  return render(<NotFound />);
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
    expect(screen.queryByTestId("command-palette")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Buscar/ }));
    expect(screen.getByTestId("command-palette")).toBeTruthy();
  });

  it("opens the palette with Ctrl+K when its flag is on", () => {
    state.flags = { searchWorkspaceAction: true };
    renderNotFound();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByTestId("command-palette")).toBeTruthy();
  });

  it("keeps the illustration out of the accessibility tree", () => {
    const { container } = renderNotFound();
    const illustration = container.querySelector('[data-slot="not-found-illustration"]');
    expect(illustration?.getAttribute("aria-hidden")).toBe("true");
  });
});
