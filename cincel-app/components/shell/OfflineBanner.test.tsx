// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

import { OfflineBanner } from "./OfflineBanner";

const COPY = "Sin conexión. Los cambios se guardarán cuando vuelvas a estar en línea.";

let online = true;

function goOffline() {
  online = false;
  act(() => {
    window.dispatchEvent(new Event("offline"));
  });
}

function goOnline() {
  online = true;
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
}

beforeEach(() => {
  online = true;
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => online });
});

afterEach(() => {
  cleanup();
  delete (window.navigator as { onLine?: boolean }).onLine;
  vi.restoreAllMocks();
});

describe("OfflineBanner", () => {
  it("renders nothing while online", () => {
    const { container } = render(<OfflineBanner />);
    expect(container.textContent).toBe("");
    expect(screen.queryByText(COPY)).toBeNull();
  });

  it("appears when the browser goes offline", () => {
    render(<OfflineBanner />);
    goOffline();
    const banner = screen.getByRole("status");
    expect(banner.textContent).toContain(COPY);
  });

  it("shows on mount when the browser is already offline", () => {
    online = false;
    render(<OfflineBanner />);
    expect(screen.getByText(COPY)).toBeTruthy();
  });

  it("disappears when the connection comes back", () => {
    render(<OfflineBanner />);
    goOffline();
    expect(screen.getByText(COPY)).toBeTruthy();
    goOnline();
    expect(screen.queryByText(COPY)).toBeNull();
  });

  it("stops listening after unmount", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<OfflineBanner />);
    unmount();
    const removed = remove.mock.calls.map(([type]) => type);
    expect(removed).toContain("online");
    expect(removed).toContain("offline");
  });
});
