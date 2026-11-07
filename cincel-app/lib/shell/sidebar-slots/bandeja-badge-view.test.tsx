// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import axe from "axe-core";

import { publishBandejaUnread, resetBandejaUnread } from "@/lib/my-space/bandeja-unread";

import { BandejaBadge, formatUnreadBadge } from "./bandeja-badge-view";

afterEach(() => {
  cleanup();
  resetBandejaUnread();
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
