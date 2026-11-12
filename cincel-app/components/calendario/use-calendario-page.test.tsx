// @vitest-environment happy-dom
import { QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/calendario",
  useSearchParams: () => new URLSearchParams(nav.search),
}));
const getRange = vi.hoisted(() => vi.fn());
vi.mock("@/lib/actions/page-data/calendario-actions", () => ({
  getCalendarioRange: getRange,
  getCalendarioList: vi.fn(),
  getCalendarioDaySummary: vi.fn(),
  getCalendarioWeekSummary: vi.fn(),
  getCalendarioLoad: vi.fn(),
  getMeetingDetail: vi.fn(),
  getMeetingPrep: vi.fn(),
  getMeetingMinutes: vi.fn(),
  getPlanWeek: vi.fn(),
  getProposal: vi.fn(),
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { emptyCalendarioRange } from "@/lib/calendario/empty";
import { localDate } from "@/lib/time-tracking/local-time";
import { NAV_PREFETCH_DEBOUNCE_MS } from "@/lib/shell/nav-prefetch";
import { createTestQueryClient } from "@/lib/query/test-utils";

import { pushCalendarioUrl, replaceCalendarioUrl, useCalendarioNavigation, useCalendarioQuery } from "./use-calendario-page";

const TODAY = localDate(new Date());

function wrapperFor(style: "visual" | "esencial" | "analitico", client = createTestQueryClient()) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <StyleProvider style={style} scope="staff">
          {children}
        </StyleProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  nav.search = "";
  getRange.mockReset().mockImplementation(async (i: { from: string; to: string }) => emptyCalendarioRange(i, TODAY));
  window.history.replaceState(null, "", "/calendario");
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("useCalendarioQuery", () => {
  it("defaults the vista per Estilo (F3)", () => {
    expect(renderHook(() => useCalendarioQuery(), { wrapper: wrapperFor("visual") }).result.current.vista).toBe("mes");
    expect(renderHook(() => useCalendarioQuery(), { wrapper: wrapperFor("esencial") }).result.current.vista).toBe("semana");
    expect(renderHook(() => useCalendarioQuery(), { wrapper: wrapperFor("analitico") }).result.current.vista).toBe("semana");
  });

  it("reads the URL over the defaults", () => {
    nav.search = "vista=dia&fecha=2026-11-12&mostrar=tareas&quien=todos&ocultar=1";
    const { result } = renderHook(() => useCalendarioQuery(), { wrapper: wrapperFor("visual") });
    expect(result.current).toMatchObject({ vista: "dia", fecha: "2026-11-12", filters: { mostrar: "tareas", quien: "todos", ocultarCompletadas: true } });
  });
});

describe("URL writers", () => {
  let base: ReturnType<typeof useCalendarioQuery>;
  beforeEach(() => {
    base = renderHook(() => useCalendarioQuery(), { wrapper: wrapperFor("visual") }).result.current;
  });

  it("write vista and ocultar explicitly and keep ?estilo=", () => {
    window.history.replaceState(null, "", "/calendario?estilo=analitico");
    replaceCalendarioUrl({ ...base, vista: "semana", filters: { ...base.filters, mostrar: "reuniones" } });
    const url = new URL(window.location.href);
    expect(url.pathname).toBe("/calendario");
    expect(url.searchParams.get("vista")).toBe("semana");
    expect(url.searchParams.get("ocultar")).toBe("0");
    expect(url.searchParams.get("mostrar")).toBe("reuniones");
    expect(url.searchParams.get("estilo")).toBe("analitico");
  });

  it("replace adds no history entry and push adds one", () => {
    const length = window.history.length;
    replaceCalendarioUrl({ ...base, fecha: "2026-11-20" });
    expect(window.history.length).toBe(length);
    pushCalendarioUrl({ ...base, fecha: "2026-11-27" });
    expect(window.history.length).toBe(length + 1);
    expect(new URL(window.location.href).searchParams.get("fecha")).toBe("2026-11-27");
  });

  it("leaves today out of the URL", () => {
    pushCalendarioUrl({ ...base, fecha: TODAY });
    expect(new URL(window.location.href).searchParams.has("fecha")).toBe(false);
  });
});

describe("useCalendarioNavigation", () => {
  it("moves by the vista, switches the vista and jumps to today", () => {
    nav.search = "vista=semana&fecha=2026-11-11";
    const { result } = renderHook(
      () => {
        const query = useCalendarioQuery();
        return { query, nav: useCalendarioNavigation(query) };
      },
      { wrapper: wrapperFor("esencial") },
    );
    act(() => result.current.nav.next());
    expect(new URL(window.location.href).searchParams.get("fecha")).toBe("2026-11-18");
    act(() => result.current.nav.previous());
    expect(new URL(window.location.href).searchParams.get("fecha")).toBe("2026-11-04");
    act(() => result.current.nav.setVista("mes"));
    expect(new URL(window.location.href).searchParams.get("vista")).toBe("mes");
    act(() => result.current.nav.today());
    expect(new URL(window.location.href).searchParams.has("fecha")).toBe(false);
  });

  it("writes filters in place and clears them", () => {
    nav.search = "";
    const { result } = renderHook(
      () => {
        const query = useCalendarioQuery();
        return useCalendarioNavigation(query);
      },
      { wrapper: wrapperFor("analitico") },
    );
    const length = window.history.length;
    act(() => result.current.patchFilters({ mostrar: "tareas", apoyo: false, ocultarCompletadas: true }));
    const url = new URL(window.location.href);
    expect(url.searchParams.get("mostrar")).toBe("tareas");
    expect(url.searchParams.get("apoyo")).toBe("0");
    expect(url.searchParams.get("ocultar")).toBe("1");
    expect(window.history.length).toBe(length);
    act(() => result.current.clearFilters());
    const cleared = new URL(window.location.href);
    expect(cleared.searchParams.has("mostrar")).toBe(false);
    expect(cleared.searchParams.has("apoyo")).toBe(false);
    expect(cleared.searchParams.get("ocultar")).toBe("0");
  });

  it("prefetches the next range once after 100 ms, and not again while it is fresh", async () => {
    vi.useFakeTimers();
    nav.search = "vista=semana&fecha=2026-11-11";
    const client = createTestQueryClient();
    const { result } = renderHook(
      () => {
        const query = useCalendarioQuery();
        return useCalendarioNavigation(query);
      },
      { wrapper: wrapperFor("esencial", client) },
    );
    act(() => result.current.prefetchAdjacent(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NAV_PREFETCH_DEBOUNCE_MS - 1);
    });
    expect(getRange).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(getRange).toHaveBeenCalledTimes(1);
    expect(getRange.mock.calls[0]![0]).toMatchObject({ view: "semana", from: "2026-11-16", to: "2026-11-22" });

    act(() => result.current.prefetchAdjacent(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NAV_PREFETCH_DEBOUNCE_MS * 2);
    });
    expect(getRange).toHaveBeenCalledTimes(1);
  });

  it("cancels a pending prefetch when the pointer leaves", async () => {
    vi.useFakeTimers();
    nav.search = "vista=dia&fecha=2026-11-11";
    const { result } = renderHook(
      () => {
        const query = useCalendarioQuery();
        return useCalendarioNavigation(query);
      },
      { wrapper: wrapperFor("esencial") },
    );
    act(() => result.current.prefetchAdjacent(-1));
    act(() => result.current.cancelPrefetch());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(NAV_PREFETCH_DEBOUNCE_MS * 2);
    });
    expect(getRange).not.toHaveBeenCalled();
  });
});
