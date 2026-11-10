// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

import { useScrollAnchor } from "@/components/widgets/asistente/useScrollAnchor";

afterEach(cleanup);

/** A plain scroller with a fixed size and a writable `scrollTop`. */
function scroller({ scrollHeight = 2000, clientHeight = 500, scrollTop = 1500 } = {}) {
  const el = document.createElement("div");
  document.body.appendChild(el);
  let top = scrollTop;
  Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => scrollHeight });
  Object.defineProperty(el, "clientHeight", { configurable: true, get: () => clientHeight });
  Object.defineProperty(el, "scrollTop", { configurable: true, get: () => top, set: (v: number) => (top = v) });
  el.scrollTo = vi.fn((opts?: ScrollToOptions | number) => {
    if (typeof opts === "object" && typeof opts.top === "number") top = Math.min(opts.top, scrollHeight - clientHeight);
  }) as unknown as typeof el.scrollTo;
  const scrollTo = (value: number) => {
    top = value;
    el.dispatchEvent(new Event("scroll"));
  };
  return { el, scrollTo };
}

describe("useScrollAnchor", () => {
  it("atBottom within 80 px", () => {
    const { el, scrollTo } = scroller();
    const ref = { current: el };
    const { result } = renderHook(() => useScrollAnchor(ref));
    expect(result.current.atBottom).toBe(true);

    act(() => scrollTo(1430)); // 70 px from the bottom
    expect(result.current.atBottom).toBe(true);

    act(() => scrollTo(1400)); // 100 px from the bottom
    expect(result.current.atBottom).toBe(false);
  });

  it("counts messages added while scrolled up", () => {
    const { el, scrollTo } = scroller();
    const ref = { current: el };
    const { result, rerender } = renderHook(({ count }) => useScrollAnchor(ref, { count }), { initialProps: { count: 2 } });

    rerender({ count: 3 }); // at the bottom: not counted
    expect(result.current.newCount).toBe(0);

    act(() => scrollTo(200));
    rerender({ count: 4 });
    expect(result.current.newCount).toBe(1);
    rerender({ count: 6 });
    expect(result.current.newCount).toBe(3);
  });

  it("jump resets the count", () => {
    const { el, scrollTo } = scroller();
    const ref = { current: el };
    const { result, rerender } = renderHook(({ count }) => useScrollAnchor(ref, { count }), { initialProps: { count: 1 } });

    act(() => scrollTo(0));
    rerender({ count: 3 });
    expect(result.current.newCount).toBe(2);

    act(() => result.current.jump());
    expect(result.current.newCount).toBe(0);
    expect(result.current.atBottom).toBe(true);
    expect(el.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 2000 }));
  });

  it("counts added articles when no count is given", async () => {
    const { el, scrollTo } = scroller();
    const ref = { current: el };
    const { result } = renderHook(() => useScrollAnchor(ref));
    act(() => scrollTo(0));
    await act(async () => {
      el.appendChild(document.createElement("article"));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(result.current.newCount).toBe(1);
  });
});
