// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { WorkflowRef } from "@/lib/types/core";

const state = vi.hoisted(() => ({
  pathname: "/dashboard",
  fetchTramos: (() => Promise.resolve([])) as () => Promise<WorkflowRef[]>,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
}));

vi.mock("@/lib/actions/workflows-actions", () => ({
  fetchTramosNavAction: () => state.fetchTramos(),
}));

vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => null,
}));

vi.mock("@/components/layout/ThemeToggle", () => ({ ThemeToggle: () => <div /> }));

vi.mock("@/lib/settings/use-general-settings", async () => {
  const { buildDefaultGeneralSettings } = await import("@/lib/settings/general-settings");
  return { useGeneralSettings: () => buildDefaultGeneralSettings() };
});

import Sidebar from "./Sidebar";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  state.pathname = "/dashboard";
  state.fetchTramos = () => Promise.resolve([]);
});

/**
 * Regression test for the mobile nav bug: SidebarTrigger used to live only
 * inside the collapsible sidebar itself, which on mobile renders as a Sheet
 * that starts closed — so the only way to open it was already hidden inside
 * it. There must be a trigger reachable outside that closed Sheet.
 */
describe("Sidebar — mobile navigation", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 375 });
    window.dispatchEvent(new Event("resize"));
  });

  it("renders a trigger outside the mobile sheet that opens it", () => {
    render(<Sidebar />);

    // The mobile Sheet starts closed, so its content (nav links) must not be present yet.
    expect(screen.queryByRole("link", { name: /Dashboard/i })).toBeNull();

    // A trigger must still be reachable to open it.
    const triggers = screen.getAllByRole("button", { name: "Alternar barra lateral" });
    expect(triggers.length).toBeGreaterThan(0);

    fireEvent.click(triggers[0]);

    // Once opened, the sidebar's nav content should now be present.
    expect(screen.getByRole("link", { name: /Dashboard/i })).toBeTruthy();
  });
});

describe("Sidebar — icon button names", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
    window.dispatchEvent(new Event("resize"));
  });

  it("names the collapse toggle and every menu group toggle, and reports whether a group is open", () => {
    render(<Sidebar />);
    expect(screen.getAllByRole("button", { name: "Alternar barra lateral" }).length).toBeGreaterThan(0);

    const groupToggles = screen.getAllByRole("button").filter((button) => button.hasAttribute("aria-expanded"));
    expect(groupToggles.length).toBeGreaterThan(0);
    for (const toggle of groupToggles) {
      expect(toggle.getAttribute("aria-label")?.trim()).toBeTruthy();
    }

    const [first] = groupToggles;
    const wasExpanded = first.getAttribute("aria-expanded") === "true";
    fireEvent.click(first);
    expect(first.getAttribute("aria-expanded")).toBe(wasExpanded ? "false" : "true");
  });
});

const TRAMOS: WorkflowRef[] = [
  { id: "w-cons", key: "construccion", name: "Construcción", sortOrder: 3 },
  { id: "w-pre", key: "presale", name: "Presale", sortOrder: 1 },
  { id: "w-dis", key: "diseno", name: "Diseño", sortOrder: 2 },
];

describe("Sidebar — Actividades submenu from tramos", () => {
  beforeEach(() => {
    Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1280 });
    window.dispatchEvent(new Event("resize"));
    state.pathname = "/actividades/general";
  });

  it("lists General plus every active tramo in sortOrder, linked by key", async () => {
    state.fetchTramos = () => Promise.resolve(TRAMOS);
    render(<Sidebar />);

    await waitFor(() => expect(screen.getByRole("link", { name: "Construcción" })).toBeTruthy());

    const general = screen.getByRole("link", { name: "General" });
    const presale = screen.getByRole("link", { name: "Presale" });
    const diseno = screen.getByRole("link", { name: "Diseño" });
    const construccion = screen.getByRole("link", { name: "Construcción" });

    expect(general.getAttribute("href")).toBe("/actividades/general");
    expect(presale.getAttribute("href")).toBe("/actividades/presale");
    expect(diseno.getAttribute("href")).toBe("/actividades/diseno");
    expect(construccion.getAttribute("href")).toBe("/actividades/construccion");

    const links = screen.getAllByRole("link").map((link) => link.textContent);
    const start = links.indexOf("General");
    expect(links.slice(start, start + 4)).toEqual(["General", "Presale", "Diseño", "Construcción"]);

    expect(screen.queryByText(/Departamento/i)).toBeNull();
    expect(screen.queryByText("Taller de diseño")).toBeNull();
    expect(screen.queryAllByTestId("sidebar-submenu-skeleton")).toHaveLength(0);
  });

  it("shows three skeleton rows while the tramos load", () => {
    state.fetchTramos = () => new Promise<WorkflowRef[]>(() => {});
    render(<Sidebar />);

    expect(screen.getByRole("link", { name: "General" })).toBeTruthy();
    expect(screen.getAllByTestId("sidebar-submenu-skeleton")).toHaveLength(3);
  });

  it("keeps only General when the tramos fail to load", async () => {
    state.fetchTramos = () => Promise.reject(new Error("boom"));
    render(<Sidebar />);

    await waitFor(() => expect(screen.queryAllByTestId("sidebar-submenu-skeleton")).toHaveLength(0));
    expect(screen.getByRole("link", { name: "General" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Presale" })).toBeNull();
    expect(screen.queryByText(/Departamento/i)).toBeNull();
  });
});
