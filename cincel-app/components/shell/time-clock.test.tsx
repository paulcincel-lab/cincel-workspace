// @vitest-environment happy-dom
import { focusManager } from "@tanstack/react-query";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient, type RenderWithQueryClientResult } from "@/lib/query/test-utils";
import type { TodayStatus } from "@/lib/types/redesign";

const actions = vi.hoisted(() => ({
  fetchTimeTrackingSettingsAction: vi.fn(),
  saveTimeTrackingSettingsAction: vi.fn(),
  fetchMyTodayAction: vi.fn(),
  clockInAction: vi.fn(),
  pauseWorkAction: vi.fn(),
  resumeWorkAction: vi.fn(),
  clockOutAction: vi.fn(),
  fetchTeamHoursAction: vi.fn(),
  fetchMyWeekHoursAction: vi.fn(),
}));
vi.mock("@/lib/actions/time-tracking-actions", () => actions);

const flags = vi.hoisted(() => ({
  IMPLEMENTED: {
    fetchTimeTrackingSettingsAction: true,
    saveTimeTrackingSettingsAction: true,
    fetchMyTodayAction: true,
    clockInAction: true,
    pauseWorkAction: true,
    resumeWorkAction: true,
    clockOutAction: true,
    fetchTeamHoursAction: true,
    fetchMyWeekHoursAction: true,
  } as Record<string, boolean>,
}));
vi.mock("@/lib/actions/time-tracking-actions.flags", () => flags);

const sonner = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));
vi.mock("sonner", () => sonner);

import { formatClockTime, TIME_CLOCK_RESYNC_MS, TimeClock } from "./TimeClock";
import { CLOCK_INVALIDATIONS } from "./use-clock-mutation";

const NOW = new Date("2026-11-07T17:00:00.000Z"); // 11:00 in Mexico City

function status(patch: Partial<TodayStatus> = {}): TodayStatus {
  return {
    state: "off",
    startedAt: null,
    workedSeconds: 0,
    required: false,
    promptAtLogin: false,
    enabled: true,
    requiredFrom: null,
    hoursPerDay: 8,
    ...patch,
  };
}

/**
 * Renders under a client whose `me.today` holds `today`, as the `(staff)`
 * layout hydrates it. `age` (ms) backdates the entry so a focus refetches.
 */
function renderClock(ui: ReactElement, today: TodayStatus, age = 0): RenderWithQueryClientResult {
  const client = createTestQueryClient();
  client.setQueryData(qk.me.today(), today, { updatedAt: Date.now() - age });
  return renderWithQueryClient(ui, { client });
}

beforeEach(() => {
  for (const fn of Object.values(actions)) fn.mockReset();
  sonner.toast.mockReset();
  sonner.toast.success.mockReset();
  sonner.toast.error.mockReset();
  for (const key of Object.keys(flags.IMPLEMENTED)) flags.IMPLEMENTED[key] = true;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  focusManager.setFocused(undefined);
});

describe("TimeClock states", () => {
  it("off: Sin iniciar pill and only Registrar entrada", () => {
    renderClock(<TimeClock />, status());
    expect(screen.getByText("Jornada")).toBeTruthy();
    expect(screen.getByText("Sin iniciar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Registrar entrada" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pausa" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Salida" })).toBeNull();
    expect(screen.getByText("de 8 h")).toBeTruthy();
  });

  it("on: En curso pill with Pausa and Salida, and the entry sub-line", () => {
    renderClock(<TimeClock />, status({ state: "on", startedAt: "2026-11-07T15:02:00.000Z", workedSeconds: 600 }));
    expect(screen.getByText("En curso")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pausa" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salida" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Registrar entrada" })).toBeNull();
    expect(screen.getByText("de 8 h · entrada 9:02")).toBeTruthy();
  });

  it("pausa: En pausa pill with Reanudar and Salida", () => {
    renderClock(<TimeClock />, status({ state: "pausa", startedAt: "2026-11-07T15:02:00.000Z", workedSeconds: 600 }));
    expect(screen.getByText("En pausa")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reanudar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salida" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pausa" })).toBeNull();
  });

  it("done: Cerrada pill and Registrar entrada again", () => {
    renderClock(<TimeClock />, status({ state: "done", startedAt: "2026-11-07T15:02:00.000Z", workedSeconds: 28800 }));
    expect(screen.getByText("Cerrada")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Registrar entrada" })).toBeTruthy();
    expect(screen.getByRole("timer").textContent).toBe("08:00:00");
  });

  it("renders nothing when time tracking is disabled or exempt", () => {
    const { container } = renderClock(<TimeClock />, status({ enabled: false }));
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing while a clock action is still a stub", () => {
    flags.IMPLEMENTED.pauseWorkAction = false;
    const { container } = renderClock(<TimeClock />, status());
    expect(container.innerHTML).toBe("");
  });
});

describe("TimeClock footnote", () => {
  it('shows "Opcional hasta el {fecha}" before requiredFrom', () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    renderClock(<TimeClock />, status({ requiredFrom: "2026-12-01" }));
    expect(screen.getByText("Opcional hasta el 1 dic 2026")).toBeTruthy();
  });

  it("shows nothing from requiredFrom on", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    renderClock(<TimeClock />, status({ requiredFrom: "2026-11-07" }));
    expect(screen.queryByText(/Opcional hasta/)).toBeNull();
  });

  it("shows nothing when requiredFrom is not set", () => {
    renderClock(<TimeClock />, status());
    expect(screen.queryByText(/Opcional hasta/)).toBeNull();
  });
});

describe("TimeClock ticking", () => {
  it("ticks every second while on, from workedSeconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    renderClock(
      <TimeClock />,
      status({ state: "on", startedAt: new Date(NOW.getTime() - 3600_000).toISOString(), workedSeconds: 3600 }),
    );
    expect(screen.getByRole("timer").textContent).toBe("01:00:00");
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole("timer").textContent).toBe("01:00:03");
  });

  it("counts from startedAt when it is later than the sync", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    renderClock(<TimeClock />, status({ state: "on", startedAt: new Date(NOW.getTime() + 2000).toISOString(), workedSeconds: 0 }));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole("timer").textContent).toBe("00:00:03");
  });

  it("does not tick while paused", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    renderClock(<TimeClock />, status({ state: "pausa", workedSeconds: 125 }));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole("timer").textContent).toBe("00:02:05");
  });

  it("re-reads me.today every 5 minutes through the query (no timer of its own)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    actions.fetchMyTodayAction.mockResolvedValue(status({ state: "pausa", workedSeconds: 900 }));
    renderClock(<TimeClock />, status({ state: "on", workedSeconds: 0 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(TIME_CLOCK_RESYNC_MS);
    });
    expect(actions.fetchMyTodayAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText("En pausa")).toBeTruthy();
  });

  it("refetches a stale day on window focus", async () => {
    actions.fetchMyTodayAction.mockResolvedValue(status({ state: "done", workedSeconds: 28800 }));
    renderClock(<TimeClock />, status(), 2 * 60_000);
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(screen.getByText("Cerrada")).toBeTruthy());
    expect(actions.fetchMyTodayAction).toHaveBeenCalledTimes(1);
  });

  it("does not refetch a fresh day on focus", async () => {
    renderClock(<TimeClock />, status());
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await act(async () => {});
    expect(actions.fetchMyTodayAction).not.toHaveBeenCalled();
  });

  it("listens to no window focus event of its own", () => {
    const add = vi.spyOn(window, "addEventListener");
    renderClock(<TimeClock />, status());
    expect(add.mock.calls.map(([type]) => type)).not.toContain("focus");
    add.mockRestore();
  });

  it("formats HH:MM:SS", () => {
    expect(formatClockTime(0)).toBe("00:00:00");
    expect(formatClockTime(3723)).toBe("01:02:03");
  });
});

describe("TimeClock actions", () => {
  it("clocks in from the sidebar and announces the entry", async () => {
    actions.clockInAction.mockResolvedValue(
      status({ state: "on", startedAt: "2026-11-07T15:02:00.000Z", workedSeconds: 0 }),
    );
    renderClock(<TimeClock />, status());
    fireEvent.click(screen.getByRole("button", { name: "Registrar entrada" }));
    // The mutation calls the action on the next tick.
    await waitFor(() => expect(actions.clockInAction).toHaveBeenCalledWith({ source: "sidebar" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Entrada registrada a las 9:02"));
    expect(sonner.toast.success).toHaveBeenCalledWith("Entrada registrada 9:02");
    expect(screen.getByText("En curso")).toBeTruthy();
  });

  it("pauses, resumes and clocks out with the returned status", async () => {
    actions.pauseWorkAction.mockResolvedValue(status({ state: "pausa", workedSeconds: 60 }));
    actions.resumeWorkAction.mockResolvedValue(status({ state: "on", workedSeconds: 60 }));
    actions.clockOutAction.mockResolvedValue(status({ state: "done", workedSeconds: 70 }));
    renderClock(<TimeClock />, status({ state: "on", workedSeconds: 50 }));

    fireEvent.click(screen.getByRole("button", { name: "Pausa" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Reanudar" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Reanudar" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Pausa" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Salida" }));
    await waitFor(() => expect(screen.getByText("Cerrada")).toBeTruthy());
    expect(actions.pauseWorkAction).toHaveBeenCalledTimes(1);
    expect(actions.resumeWorkAction).toHaveBeenCalledTimes(1);
    expect(actions.clockOutAction).toHaveBeenCalledTimes(1);
  });

  it("rolls back, toasts the copy and re-syncs on NOT_ON", async () => {
    let resolveFetch: (value: TodayStatus) => void = () => {};
    actions.fetchMyTodayAction.mockReturnValue(new Promise<TodayStatus>((r) => (resolveFetch = r)));
    actions.pauseWorkAction.mockRejectedValue(new Error("NOT_ON"));
    renderClock(<TimeClock />, status({ state: "on", workedSeconds: 100 }));

    fireEvent.click(screen.getByRole("button", { name: "Pausa" }));
    await waitFor(() => expect(sonner.toast.error).toHaveBeenCalledWith("Tu jornada no está en curso."));
    // Rolled back to the state before the click.
    expect(screen.getByText("En curso")).toBeTruthy();
    expect(actions.fetchMyTodayAction).toHaveBeenCalledTimes(1);

    await act(async () => resolveFetch(status({ state: "done", workedSeconds: 200 })));
    // Query observers are notified on the next tick.
    expect(await screen.findByText("Cerrada")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Registrar entrada" })).toBeTruthy();
  });

  it("re-syncs without an error toast on ALREADY_ON", async () => {
    actions.clockInAction.mockRejectedValue(new Error("ALREADY_ON"));
    actions.fetchMyTodayAction.mockResolvedValue(
      status({ state: "on", startedAt: "2026-11-07T15:02:00.000Z", workedSeconds: 30 }),
    );
    renderClock(<TimeClock />, status());
    fireEvent.click(screen.getByRole("button", { name: "Registrar entrada" }));
    await waitFor(() => expect(screen.getByText("En curso")).toBeTruthy());
    expect(sonner.toast.error).not.toHaveBeenCalled();
    expect(actions.fetchMyTodayAction).toHaveBeenCalledTimes(1);
    expect(actions.clockInAction).toHaveBeenCalledTimes(1);
  });

  it("hides itself when a re-sync after DISABLED reports disabled", async () => {
    actions.clockInAction.mockRejectedValue(new Error("DISABLED"));
    actions.fetchMyTodayAction.mockResolvedValue(status({ enabled: false }));
    const { container } = renderClock(<TimeClock />, status());
    fireEvent.click(screen.getByRole("button", { name: "Registrar entrada" }));
    await waitFor(() => expect(container.innerHTML).toBe(""));
    expect(sonner.toast.error).toHaveBeenCalledWith("Esta función está desactivada.");
  });
});

describe("TimeClock compact", () => {
  it("opens a popover with the same controls", async () => {
    renderClock(<TimeClock variant="compact" />, status({ state: "on", workedSeconds: 0 }));
    expect(screen.queryByRole("button", { name: "Pausa" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Jornada: En curso" }));
    expect(await screen.findByRole("button", { name: "Pausa" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salida" })).toBeTruthy();
    expect(screen.getByRole("timer")).toBeTruthy();
  });
});

describe("TimeClock instances share me.today", () => {
  it("the sidebar card and the mobile pill read one query: one request on focus", async () => {
    actions.fetchMyTodayAction.mockResolvedValue(status({ state: "pausa", workedSeconds: 900 }));
    renderClock(
      <>
        <TimeClock />
        <TimeClock variant="compact" />
      </>,
      status({ state: "on", workedSeconds: 0 }),
      2 * 60_000,
    );
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(screen.getByText("En pausa")).toBeTruthy());
    expect(actions.fetchMyTodayAction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Jornada: En pausa" })).toBeTruthy();
  });

  it("a clock action in one instance updates the other through setQueryData, with no refetch", async () => {
    actions.pauseWorkAction.mockResolvedValue(status({ state: "pausa", workedSeconds: 60 }));
    const { client } = renderClock(
      <>
        <TimeClock />
        <TimeClock variant="compact" />
      </>,
      status({ state: "on", workedSeconds: 50 }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Pausa" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Jornada: En pausa" })).toBeTruthy());
    expect(client.getQueryData<TodayStatus>(qk.me.today())?.state).toBe("pausa");
    expect(actions.fetchMyTodayAction).not.toHaveBeenCalled();
  });

  it("invalidates the hours views after a clock write", async () => {
    actions.clockInAction.mockResolvedValue(status({ state: "on", startedAt: "2026-11-07T15:02:00.000Z" }));
    const { client } = renderClock(<TimeClock />, status());
    const invalidate = vi.spyOn(client, "invalidateQueries");
    fireEvent.click(screen.getByRole("button", { name: "Registrar entrada" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(CLOCK_INVALIDATIONS.length));
    expect(invalidate.mock.calls.map(([filters]) => filters?.queryKey)).toEqual([...CLOCK_INVALIDATIONS]);
  });
});
