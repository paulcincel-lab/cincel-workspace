// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

import { isGoogleStale, resetRefreshOnce, useRefreshOnce } from "./use-refresh-once";

function Probe({ mutation, run }: { mutation: { mutate(): void }; run: boolean }) {
  useRefreshOnce(mutation, run);
  return null;
}

describe("isGoogleStale", () => {
  const now = Date.parse("2026-11-11T12:00:00Z");
  it("is stale after 5 minutes or when never synced", () => {
    expect(isGoogleStale(null, now)).toBe(true);
    expect(isGoogleStale("2026-11-11T11:54:00Z", now)).toBe(true);
    expect(isGoogleStale("2026-11-11T11:56:00Z", now)).toBe(false);
  });
});

describe("useRefreshOnce", () => {
  beforeEach(() => resetRefreshOnce());
  afterEach(cleanup);

  it("runs the mutation once per session", () => {
    const mutate = vi.fn();
    const { rerender, unmount } = render(<Probe mutation={{ mutate }} run />);
    rerender(<Probe mutation={{ mutate }} run />);
    expect(mutate).toHaveBeenCalledTimes(1);
    unmount();
    render(<Probe mutation={{ mutate }} run />);
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("does not run while it should not, and runs when it becomes true", () => {
    const mutate = vi.fn();
    const { rerender } = render(<Probe mutation={{ mutate }} run={false} />);
    expect(mutate).not.toHaveBeenCalled();
    rerender(<Probe mutation={{ mutate }} run />);
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
