// @vitest-environment happy-dom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildUrl, editSearch, readParam } from "@/lib/soporte/mejoras-url";

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(nav.search) }));

import { useUrlSearch } from "./use-url-search";

beforeEach(() => {
  nav.search = "";
  window.history.replaceState(null, "", "/mejoras");
});
afterEach(cleanup);

describe("mejoras-url helpers", () => {
  it("edits, reads and builds the query", () => {
    expect(editSearch("estado=nuevo", (p) => p.set("solicitud", "SOL-0001"))).toBe("estado=nuevo&solicitud=SOL-0001");
    expect(editSearch("?solicitud=SOL-0001", (p) => p.delete("solicitud"))).toBe("");
    expect(readParam("?solicitud=SOL-0001", "solicitud")).toBe("SOL-0001");
    expect(readParam("solicitud=", "solicitud")).toBeNull();
    expect(readParam("", "solicitud")).toBeNull();
    expect(buildUrl("/mejoras", "a=1", "#x")).toBe("/mejoras?a=1#x");
    expect(buildUrl("/mejoras", "")).toBe("/mejoras");
  });
});

describe("useUrlSearch", () => {
  it("starts from the router's query", () => {
    nav.search = "solicitud=SOL-0001";
    const { result } = renderHook(() => useUrlSearch());
    expect(result.current.search).toBe("solicitud=SOL-0001");
  });

  it("opening updates the state in the same render even if the router never reports it, and writes the URL", () => {
    const { result } = renderHook(() => useUrlSearch());
    act(() => result.current.update((p) => p.set("solicitud", "SOL-0002"), "push"));
    expect(result.current.search).toBe("solicitud=SOL-0002");
    expect(window.location.search).toBe("?solicitud=SOL-0002");
  });

  it("replace keeps the history length, push adds an entry", () => {
    const { result } = renderHook(() => useUrlSearch());
    const length = window.history.length;
    act(() => result.current.update((p) => p.set("q", "falla"), "replace"));
    expect(window.history.length).toBe(length);
    act(() => result.current.update((p) => p.set("solicitud", "SOL-0001"), "push"));
    expect(window.history.length).toBe(length + 1);
    expect(window.location.search).toBe("?q=falla&solicitud=SOL-0001");
  });

  it("dismiss closes at once and goes Back when this page pushed the entry", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    const { result } = renderHook(() => useUrlSearch());
    act(() => result.current.update((p) => p.set("solicitud", "SOL-0001"), "push"));
    act(() => result.current.dismiss("solicitud"));
    expect(result.current.search).toBe("");
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  it("dismiss replaces the URL when the drawer came from a direct link", () => {
    nav.search = "solicitud=SOL-0001&q=x";
    window.history.replaceState(null, "", "/mejoras?solicitud=SOL-0001&q=x");
    const back = vi.spyOn(window.history, "back").mockImplementation(() => undefined);
    const { result } = renderHook(() => useUrlSearch());
    act(() => result.current.dismiss("solicitud"));
    expect(back).not.toHaveBeenCalled();
    expect(result.current.search).toBe("q=x");
    expect(window.location.search).toBe("?q=x");
    back.mockRestore();
  });

  it("follows popstate (Back and Forward)", () => {
    const { result } = renderHook(() => useUrlSearch());
    act(() => result.current.update((p) => p.set("solicitud", "SOL-0001"), "push"));
    window.history.replaceState(null, "", "/mejoras");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.search).toBe("");
    window.history.replaceState(null, "", "/mejoras?solicitud=SOL-0003");
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.search).toBe("solicitud=SOL-0003");
  });

  it("follows a navigation the router reports", () => {
    const { result, rerender } = renderHook(() => useUrlSearch());
    nav.search = "solicitud=SOL-0009";
    rerender();
    expect(result.current.search).toBe("solicitud=SOL-0009");
  });
});
