// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, waitFor } from "@testing-library/react";
import axe from "axe-core";

import { qk } from "@/lib/query/keys";
import { setShellBadgesUnread } from "@/lib/query/options/shell";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { ShellBadges } from "@/lib/types/shell";

import { BandejaBadge, formatUnreadBadge, type BandejaBadgeData } from "./bandeja-badge-view";

/** Renders the badge over `qk.shell.badges()` holding `bandeja`, as the `(staff)` layout hydrates it. */
function renderBadge(bandeja: BandejaBadgeData) {
  const client = createTestQueryClient();
  client.setQueryData<ShellBadges>(qk.shell.badges(), { tareasOpen: 0, bandeja });
  return renderWithQueryClient(<BandejaBadge />, { client });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("BandejaBadge", () => {
  it("shows the unread count with a screen reader label", () => {
    const { container } = renderBadge({ unreadCount: 5 });
    expect(container.textContent).toBe("5 sin leer");
  });

  it("is hidden at zero", () => {
    const { container } = renderBadge({ unreadCount: 0 });
    expect(container.innerHTML).toBe("");
  });

  it("is hidden while the cache holds no badges (the first poll is still pending)", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const { container } = renderWithQueryClient(<BandejaBadge />);
    expect(container.innerHTML).toBe("");
    vi.unstubAllGlobals();
  });

  it("follows the count the Bandeja writes into shell.badges", async () => {
    const { container, client } = renderBadge({ unreadCount: 2 });
    // Query observers are notified on the next tick.
    act(() => setShellBadgesUnread(client, 7));
    await waitFor(() => expect(container.textContent).toBe("7 sin leer"));
    act(() => setShellBadgesUnread(client, 0));
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });

  it("uses the mono primary-tint count badge of frame `Sidebar`", () => {
    const { container } = renderBadge({ unreadCount: 5 });
    const badge = container.querySelector("[data-slot=bandeja-badge]")!;
    expect(badge.className).toContain("font-mono");
    expect(badge.className).toContain("bg-primary/15");
    expect(badge.className).toContain("text-primary");
  });

  it("adds the reminders still due today", () => {
    const renderedAt = Date.parse("2026-11-07T17:00:00.000Z");
    const { container } = renderBadge({
      unreadCount: 2,
      dueReminders: ["2026-11-07T20:00:00.000Z", "2026-11-07T23:00:00.000Z"],
      renderedAt,
    });
    expect(container.textContent).toBe("4 pendientes");
  });

  it("shows the reminders alone when nothing is unread, and drops each one once its time passes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-07T17:00:00.000Z"));
    const { container } = renderBadge({ unreadCount: 0, dueReminders: ["2026-11-07T17:00:01.000Z"], renderedAt: Date.now() });
    expect(container.textContent).toBe("1 pendiente");
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(container.innerHTML).toBe("");
  });

  it("caps the label at 99+", () => {
    expect(formatUnreadBadge(99)).toBe("99");
    expect(formatUnreadBadge(120)).toBe("99+");
  });

  it("has no serious axe violations", async () => {
    const { container } = renderBadge({ unreadCount: 4 });
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });
});
