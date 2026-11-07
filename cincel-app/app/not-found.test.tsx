// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const state = vi.hoisted(() => ({
  redesignEnabled: false,
  fail: false,
  flags: { searchWorkspaceAction: false },
}));

vi.mock("@/lib/ui/preferences-server", () => ({
  getResolvedAppearance: vi.fn(async () => {
    if (state.fail) throw new Error("db down");
    return { redesignEnabled: state.redesignEnabled };
  }),
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

async function renderNotFound() {
  return render(await NotFound());
}

beforeEach(() => {
  state.redesignEnabled = false;
  state.fail = false;
  state.flags = { searchWorkspaceAction: false };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("app/not-found", () => {
  it("shows the not-found copy", async () => {
    await renderNotFound();
    expect(screen.getByRole("heading", { level: 1, name: "No encontramos esta página" })).toBeTruthy();
    expect(screen.getByText("Error 404")).toBeTruthy();
  });

  it("links 'Volver a Inicio' to /inicio with the redesign on", async () => {
    state.redesignEnabled = true;
    await renderNotFound();
    expect(screen.getByRole("link", { name: "Volver a Inicio" }).getAttribute("href")).toBe("/inicio");
  });

  it("links 'Volver a Inicio' to /dashboard with the redesign off", async () => {
    await renderNotFound();
    expect(screen.getByRole("link", { name: "Volver a Inicio" }).getAttribute("href")).toBe("/dashboard");
  });

  it("falls back to the legacy link when the appearance lookup fails", async () => {
    state.fail = true;
    state.flags = { searchWorkspaceAction: true };
    await renderNotFound();
    expect(screen.getByRole("link", { name: "Volver a Inicio" }).getAttribute("href")).toBe("/dashboard");
    expect(screen.queryByRole("button", { name: /Buscar/ })).toBeNull();
  });

  it("hides 'Buscar' while the search action is not implemented", async () => {
    state.redesignEnabled = true;
    await renderNotFound();
    expect(screen.queryByRole("button", { name: /Buscar/ })).toBeNull();
  });

  it("hides 'Buscar' with the redesign off even when search is implemented", async () => {
    state.flags = { searchWorkspaceAction: true };
    await renderNotFound();
    expect(screen.queryByRole("button", { name: /Buscar/ })).toBeNull();
  });

  it("opens the palette from 'Buscar' when its flag is on", async () => {
    state.redesignEnabled = true;
    state.flags = { searchWorkspaceAction: true };
    await renderNotFound();
    expect(screen.queryByTestId("command-palette")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Buscar/ }));
    expect(screen.getByTestId("command-palette")).toBeTruthy();
  });

  it("opens the palette with Ctrl+K when its flag is on", async () => {
    state.redesignEnabled = true;
    state.flags = { searchWorkspaceAction: true };
    await renderNotFound();
    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(screen.getByTestId("command-palette")).toBeTruthy();
  });

  it("keeps the illustration out of the accessibility tree", async () => {
    const { container } = await renderNotFound();
    const illustration = container.querySelector('[data-slot="not-found-illustration"]');
    expect(illustration?.getAttribute("aria-hidden")).toBe("true");
  });
});
