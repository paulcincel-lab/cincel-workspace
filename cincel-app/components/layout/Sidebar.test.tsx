// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
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
    const triggers = screen.getAllByRole("button", { name: /toggle sidebar/i });
    expect(triggers.length).toBeGreaterThan(0);

    fireEvent.click(triggers[0]);

    // Once opened, the sidebar's nav content should now be present.
    expect(screen.getByRole("link", { name: /Dashboard/i })).toBeTruthy();
  });
});
