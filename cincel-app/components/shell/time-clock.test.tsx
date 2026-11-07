// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { loadTimeClock } from "@/lib/shell/sidebar-slots/time-clock";

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

const session = { staffId: "s-1", name: "Ana", role: "Diseño", isAdmin: false, photoUrl: null };

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
});

describe("TimeClock states", () => {
  it("off: Sin iniciar pill and only Registrar entrada", () => {
    render(<TimeClock initial={status()} />);
    expect(screen.getByText("Jornada")).toBeTruthy();
    expect(screen.getByText("Sin iniciar")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Registrar entrada" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pausa" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Salida" })).toBeNull();
    expect(screen.getByText("de 8 h")).toBeTruthy();
  });

  it("on: En curso pill with Pausa and Salida, and the entry sub-line", () => {
    render(
      <TimeClock initial={status({ state: "on", startedAt: "2026-11-07T15:02:00.000Z", workedSeconds: 600 })} />,
    );
    expect(screen.getByText("En curso")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pausa" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salida" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Registrar entrada" })).toBeNull();
    expect(screen.getByText("de 8 h · entrada 9:02")).toBeTruthy();
  });

  it("pausa: En pausa pill with Reanudar and Salida", () => {
    render(<TimeClock initial={status({ state: "pausa", startedAt: "2026-11-07T15:02:00.000Z", workedSeconds: 600 })} />);
    expect(screen.getByText("En pausa")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reanudar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salida" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Pausa" })).toBeNull();
  });

  it("done: Cerrada pill and Registrar entrada again", () => {
    render(<TimeClock initial={status({ state: "done", startedAt: "2026-11-07T15:02:00.000Z", workedSeconds: 28800 })} />);
    expect(screen.getByText("Cerrada")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Registrar entrada" })).toBeTruthy();
    expect(screen.getByRole("timer").textContent).toBe("08:00:00");
  });

  it("renders nothing when time tracking is disabled or exempt", () => {
    const { container } = render(<TimeClock initial={status({ enabled: false })} />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing while a clock action is still a stub", () => {
    flags.IMPLEMENTED.pauseWorkAction = false;
    const { container } = render(<TimeClock initial={status()} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("TimeClock footnote", () => {
  it('shows "Opcional hasta el {fecha}" before requiredFrom', () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    render(<TimeClock initial={status({ requiredFrom: "2026-12-01" })} />);
    expect(screen.getByText("Opcional hasta el 1 de diciembre")).toBeTruthy();
  });

  it("shows nothing from requiredFrom on", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    render(<TimeClock initial={status({ requiredFrom: "2026-11-07" })} />);
    expect(screen.queryByText(/Opcional hasta/)).toBeNull();
  });

  it("shows nothing when requiredFrom is not set", () => {
    render(<TimeClock initial={status()} />);
    expect(screen.queryByText(/Opcional hasta/)).toBeNull();
  });
});

describe("TimeClock ticking", () => {
  it("ticks every second while on, from workedSeconds", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    render(
      <TimeClock
        initial={status({ state: "on", startedAt: new Date(NOW.getTime() - 3600_000).toISOString(), workedSeconds: 3600 })}
      />,
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
    render(
      <TimeClock initial={status({ state: "on", startedAt: new Date(NOW.getTime() + 2000).toISOString(), workedSeconds: 0 })} />,
    );
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByRole("timer").textContent).toBe("00:00:03");
  });

  it("does not tick while paused", () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    render(<TimeClock initial={status({ state: "pausa", workedSeconds: 125 })} />);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByRole("timer").textContent).toBe("00:02:05");
  });

  it("re-syncs every 5 minutes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    actions.fetchMyTodayAction.mockResolvedValue(status({ state: "pausa", workedSeconds: 900 }));
    render(<TimeClock initial={status({ state: "on", workedSeconds: 0 })} />);
    await act(async () => {
      vi.advanceTimersByTime(TIME_CLOCK_RESYNC_MS);
    });
    expect(actions.fetchMyTodayAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText("En pausa")).toBeTruthy();
  });

  it("re-syncs on window focus", async () => {
    actions.fetchMyTodayAction.mockResolvedValue(status({ state: "done", workedSeconds: 28800 }));
    render(<TimeClock initial={status()} />);
    fireEvent(window, new Event("focus"));
    await waitFor(() => expect(screen.getByText("Cerrada")).toBeTruthy());
    expect(actions.fetchMyTodayAction).toHaveBeenCalledTimes(1);
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
    render(<TimeClock initial={status()} />);
    fireEvent.click(screen.getByRole("button", { name: "Registrar entrada" }));
    expect(actions.clockInAction).toHaveBeenCalledWith({ source: "sidebar" });
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Entrada registrada a las 9:02"));
    expect(sonner.toast.success).toHaveBeenCalledWith("Entrada registrada 9:02");
    expect(screen.getByText("En curso")).toBeTruthy();
  });

  it("pauses, resumes and clocks out with the returned status", async () => {
    actions.pauseWorkAction.mockResolvedValue(status({ state: "pausa", workedSeconds: 60 }));
    actions.resumeWorkAction.mockResolvedValue(status({ state: "on", workedSeconds: 60 }));
    actions.clockOutAction.mockResolvedValue(status({ state: "done", workedSeconds: 70 }));
    render(<TimeClock initial={status({ state: "on", workedSeconds: 50 })} />);

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
    render(<TimeClock initial={status({ state: "on", workedSeconds: 100 })} />);

    fireEvent.click(screen.getByRole("button", { name: "Pausa" }));
    await waitFor(() => expect(sonner.toast.error).toHaveBeenCalledWith("Tu jornada no está en curso."));
    // Rolled back to the state before the click.
    expect(screen.getByText("En curso")).toBeTruthy();
    expect(actions.fetchMyTodayAction).toHaveBeenCalledTimes(1);

    await act(async () => resolveFetch(status({ state: "done", workedSeconds: 200 })));
    expect(screen.getByText("Cerrada")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Registrar entrada" })).toBeTruthy();
  });

  it("re-syncs without an error toast on ALREADY_ON", async () => {
    actions.clockInAction.mockRejectedValue(new Error("ALREADY_ON"));
    actions.fetchMyTodayAction.mockResolvedValue(
      status({ state: "on", startedAt: "2026-11-07T15:02:00.000Z", workedSeconds: 30 }),
    );
    render(<TimeClock initial={status()} />);
    fireEvent.click(screen.getByRole("button", { name: "Registrar entrada" }));
    await waitFor(() => expect(screen.getByText("En curso")).toBeTruthy());
    expect(sonner.toast.error).not.toHaveBeenCalled();
    expect(actions.fetchMyTodayAction).toHaveBeenCalledTimes(1);
    expect(actions.clockInAction).toHaveBeenCalledTimes(1);
  });

  it("hides itself when a re-sync after DISABLED reports disabled", async () => {
    actions.clockInAction.mockRejectedValue(new Error("DISABLED"));
    actions.fetchMyTodayAction.mockResolvedValue(status({ enabled: false }));
    const { container } = render(<TimeClock initial={status()} />);
    fireEvent.click(screen.getByRole("button", { name: "Registrar entrada" }));
    await waitFor(() => expect(container.innerHTML).toBe(""));
    expect(sonner.toast.error).toHaveBeenCalledWith("Esta función está desactivada.");
  });
});

describe("TimeClock compact", () => {
  it("opens a popover with the same controls", async () => {
    render(<TimeClock initial={status({ state: "on", workedSeconds: 0 })} variant="compact" />);
    expect(screen.queryByRole("button", { name: "Pausa" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Jornada: En curso" }));
    expect(await screen.findByRole("button", { name: "Pausa" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Salida" })).toBeTruthy();
    expect(screen.getByRole("timer")).toBeTruthy();
  });
});

describe("time-clock sidebar slot loader", () => {
  it("returns the status when enabled", async () => {
    const today = status({ state: "on" });
    actions.fetchMyTodayAction.mockResolvedValue(today);
    await expect(loadTimeClock(session)).resolves.toEqual(today);
  });

  it("returns null when disabled or exempt", async () => {
    actions.fetchMyTodayAction.mockResolvedValue(status({ enabled: false }));
    await expect(loadTimeClock(session)).resolves.toBeNull();
  });

  it("returns null without calling the action while the flags are off", async () => {
    flags.IMPLEMENTED.clockInAction = false;
    await expect(loadTimeClock(session)).resolves.toBeNull();
    expect(actions.fetchMyTodayAction).not.toHaveBeenCalled();
  });
});
