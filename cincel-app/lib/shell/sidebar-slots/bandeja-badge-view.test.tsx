// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import axe from "axe-core";

import { publishBandejaUnread, resetBandejaUnread } from "@/lib/my-space/bandeja-unread";

import { BandejaBadge, formatUnreadBadge } from "./bandeja-badge-view";

afterEach(() => {
  cleanup();
  resetBandejaUnread();
  vi.useRealTimers();
});

describe("BandejaBadge", () => {
  it("shows the unread count with a screen reader label", () => {
    const { container } = render(<BandejaBadge data={{ unreadCount: 5 }} />);
    expect(container.textContent).toBe("5 sin leer");
  });

  it("is hidden at zero", () => {
    const { container } = render(<BandejaBadge data={{ unreadCount: 0 }} />);
    expect(container.innerHTML).toBe("");
  });

  it("follows the count the Bandeja publishes", () => {
    const { container } = render(<BandejaBadge data={{ unreadCount: 2 }} />);
    act(() => publishBandejaUnread(7));
    expect(container.textContent).toBe("7 sin leer");
    act(() => publishBandejaUnread(0));
    expect(container.innerHTML).toBe("");
  });

  it("uses the mono primary-tint count badge of frame `Sidebar`", () => {
    const { container } = render(<BandejaBadge data={{ unreadCount: 5 }} />);
    const badge = container.querySelector("[data-slot=bandeja-badge]")!;
    expect(badge.className).toContain("font-mono");
    expect(badge.className).toContain("bg-primary/15");
    expect(badge.className).toContain("text-primary");
  });

  it("adds the reminders still due today", () => {
    const renderedAt = Date.parse("2026-11-07T17:00:00.000Z");
    const { container } = render(
      <BandejaBadge
        data={{ unreadCount: 2, dueReminders: ["2026-11-07T20:00:00.000Z", "2026-11-07T23:00:00.000Z"], renderedAt }}
      />,
    );
    expect(container.textContent).toBe("4 pendientes");
  });

  it("shows the reminders alone when nothing is unread, and drops each one once its time passes", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-07T17:00:00.000Z"));
    const { container } = render(
      <BandejaBadge
        data={{ unreadCount: 0, dueReminders: ["2026-11-07T17:00:01.000Z"], renderedAt: Date.now() }}
      />,
    );
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
    const { container } = render(<BandejaBadge data={{ unreadCount: 4 }} />);
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
  });
});
