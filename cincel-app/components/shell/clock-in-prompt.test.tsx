// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { TodayStatus } from "@/lib/types/redesign";

const mocks = vi.hoisted(() => ({
  clockInAction: vi.fn(),
  fetchMyTodayAction: vi.fn(),
  refresh: vi.fn(),
  flags: { IMPLEMENTED: { clockInAction: true, fetchMyTodayAction: true } as Record<string, boolean> },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/actions/time-tracking-actions", () => ({
  clockInAction: mocks.clockInAction,
  fetchMyTodayAction: mocks.fetchMyTodayAction,
}));
vi.mock("@/lib/actions/time-tracking-actions.flags", () => mocks.flags);

import { TODAY_STATUS_EVENT } from "@/lib/time-tracking/today-events";

import {
  CLOCK_IN_PROMPT_SEEN_KEY,
  ClockInPrompt,
  formatPromptDate,
  isClockInRequired,
  localDateKey,
} from "./ClockInPrompt";

/** Monday 9 Nov 2026, 9:00 in Mexico City. */
const NOW = new Date("2026-11-09T15:00:00Z");
const TRIAL_UNTIL = "2026-11-16";
const REQUIRED_SINCE = "2026-11-02";

function status(overrides: Partial<TodayStatus> = {}): TodayStatus {
  return {
    state: "off",
    startedAt: null,
    workedSeconds: 0,
    required: false,
    promptAtLogin: true,
    enabled: true,
    requiredFrom: TRIAL_UNTIL,
    hoursPerDay: 8,
    ...overrides,
  };
}

const REQUIRED = status({ required: true, requiredFrom: REQUIRED_SINCE });
const ON: TodayStatus = { ...status(), state: "on", startedAt: NOW.toISOString(), promptAtLogin: false };

function renderPrompt(s: TodayStatus, requiredFrom: string | null = s.requiredFrom) {
  return render(<ClockInPrompt status={s} requiredFrom={requiredFrom} now={NOW} name="Ana López" />);
}

async function findDialog() {
  return screen.findByRole("dialog");
}

async function expectClosed() {
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

beforeEach(() => {
  mocks.clockInAction.mockReset();
  mocks.fetchMyTodayAction.mockReset();
  mocks.refresh.mockReset();
  mocks.flags.IMPLEMENTED.clockInAction = true;
  mocks.flags.IMPLEMENTED.fetchMyTodayAction = true;
  window.localStorage.clear();
});

afterEach(cleanup);

describe("ClockInPrompt helpers", () => {
  it("uses the Mexico City calendar day", () => {
    expect(localDateKey(new Date("2026-11-10T05:00:00Z"))).toBe("2026-11-09");
    expect(localDateKey(NOW)).toBe("2026-11-09");
  });

  it("is required from `requiredFrom` on, or when the server says so", () => {
    expect(isClockInRequired(status(), TRIAL_UNTIL, NOW)).toBe(false);
    expect(isClockInRequired(status(), "2026-11-09", NOW)).toBe(true);
    expect(isClockInRequired(status(), null, NOW)).toBe(false);
    expect(isClockInRequired(status({ required: true }), null, NOW)).toBe(true);
  });

  it("formats the trial date in lowercase es-MX", () => {
    expect(formatPromptDate("2026-11-16")).toBe("16 de noviembre");
  });
});

describe("ClockInPrompt visibility", () => {
  it("opens when enabled, off and asked at login", async () => {
    renderPrompt(status());
    const dialog = await findDialog();
    expect(dialog.textContent).toContain("Buenos días, Ana");
    expect(dialog.textContent).toContain("Registra tu entrada para empezar el día.");
    expect(dialog.textContent).toContain("Opcional hasta el 16 de noviembre.");
    expect(dialog.textContent).toContain("9:00");
  });

  it.each([
    ["the feature is disabled", status({ enabled: false, promptAtLogin: false })],
    ["the day already started", ON],
    ["the day is closed", status({ state: "done" })],
    ["it is not a work day or the role is exempt", status({ promptAtLogin: false })],
  ])("stays hidden when %s", async (_label, s) => {
    renderPrompt(s);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays hidden while the clock actions are not implemented", async () => {
    mocks.flags.IMPLEMENTED.clockInAction = false;
    renderPrompt(status());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.clockInAction).not.toHaveBeenCalled();
  });

  it("shows once per day: a skip today keeps it closed on the next page", async () => {
    window.localStorage.setItem(CLOCK_IN_PROMPT_SEEN_KEY, "2026-11-09");
    renderPrompt(status());
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows again on a new day", async () => {
    window.localStorage.setItem(CLOCK_IN_PROMPT_SEEN_KEY, "2026-11-06");
    renderPrompt(status());
    expect(await findDialog()).toBeTruthy();
  });

  it("ignores a previous skip once it is required", async () => {
    window.localStorage.setItem(CLOCK_IN_PROMPT_SEEN_KEY, "2026-11-09");
    renderPrompt(REQUIRED);
    expect(await findDialog()).toBeTruthy();
  });
});

describe("ClockInPrompt before requiredFrom", () => {
  it("closes with \"Ahora no\" and remembers the skip", async () => {
    renderPrompt(status());
    await findDialog();
    fireEvent.click(screen.getByRole("button", { name: "Ahora no" }));
    await expectClosed();
    expect(window.localStorage.getItem(CLOCK_IN_PROMPT_SEEN_KEY)).toBe("2026-11-09");
    expect(mocks.clockInAction).not.toHaveBeenCalled();
  });

  it("closes with Escape", async () => {
    renderPrompt(status());
    const dialog = await findDialog();
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    await expectClosed();
  });
});

describe("ClockInPrompt after requiredFrom", () => {
  it("has no \"Ahora no\", no close button and explains why", async () => {
    renderPrompt(REQUIRED);
    const dialog = await findDialog();
    expect(screen.queryByRole("button", { name: "Ahora no" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cerrar" })).toBeNull();
    expect(dialog.textContent).not.toContain("Opcional hasta");
    expect(dialog.textContent).toContain("El registro de entrada es obligatorio.");
  });

  it("is required from requiredFrom even before the server flag", async () => {
    renderPrompt(status({ requiredFrom: "2026-11-09" }));
    await findDialog();
    expect(screen.queryByRole("button", { name: "Ahora no" })).toBeNull();
  });

  it("ignores Escape and outside clicks", async () => {
    renderPrompt(REQUIRED);
    const dialog = await findDialog();
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    fireEvent.pointerDown(document.body);
    fireEvent.mouseDown(document.body);
    fireEvent.click(document.body);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

describe("ClockInPrompt clock-in", () => {
  it("calls clockInAction with source login, closes and updates the clock", async () => {
    mocks.clockInAction.mockResolvedValue(ON);
    const published: TodayStatus[] = [];
    const listener = (e: Event) => published.push((e as CustomEvent<TodayStatus>).detail);
    window.addEventListener(TODAY_STATUS_EVENT, listener);

    renderPrompt(REQUIRED);
    await findDialog();
    fireEvent.click(screen.getByRole("button", { name: "Registrar entrada" }));
    await expectClosed();

    window.removeEventListener(TODAY_STATUS_EVENT, listener);
    expect(mocks.clockInAction).toHaveBeenCalledTimes(1);
    expect(mocks.clockInAction).toHaveBeenCalledWith({ source: "login" });
    expect(published).toEqual([ON]);
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("closes silently on ALREADY_ON and syncs the fresh status", async () => {
    mocks.clockInAction.mockRejectedValue(new Error("ALREADY_ON"));
    mocks.fetchMyTodayAction.mockResolvedValue(ON);
    const published: TodayStatus[] = [];
    const listener = (e: Event) => published.push((e as CustomEvent<TodayStatus>).detail);
    window.addEventListener(TODAY_STATUS_EVENT, listener);

    renderPrompt(REQUIRED);
    await findDialog();
    fireEvent.click(screen.getByRole("button", { name: "Registrar entrada" }));
    await expectClosed();

    window.removeEventListener(TODAY_STATUS_EVENT, listener);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(published).toEqual([ON]);
  });

  it("treats a hidden error as ALREADY_ON when the day already started", async () => {
    mocks.clockInAction.mockRejectedValue(new Error("An error occurred in the Server Components render."));
    mocks.fetchMyTodayAction.mockResolvedValue(ON);
    renderPrompt(REQUIRED);
    await findDialog();
    fireEvent.click(screen.getByRole("button", { name: "Registrar entrada" }));
    await expectClosed();
  });

  it("becomes dismissible after DISABLED: shows the copy and \"Cerrar\"", async () => {
    mocks.clockInAction.mockRejectedValue(new Error("DISABLED"));
    mocks.fetchMyTodayAction.mockResolvedValue(status({ enabled: false, promptAtLogin: false }));
    renderPrompt(REQUIRED);
    await findDialog();
    fireEvent.click(screen.getByRole("button", { name: "Registrar entrada" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Esta función está desactivada.");
    expect(screen.queryByRole("button", { name: "Ahora no" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    await expectClosed();
  });

  it("becomes dismissible with Escape after a generic error", async () => {
    mocks.clockInAction.mockRejectedValue(new Error("boom"));
    mocks.fetchMyTodayAction.mockRejectedValue(new Error("offline"));
    renderPrompt(REQUIRED);
    const dialog = await findDialog();
    fireEvent.click(screen.getByRole("button", { name: "Registrar entrada" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No se pudo completar la acción. Intenta de nuevo.");
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeTruthy();
    fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
    await expectClosed();
  });

  it("maps a hidden error to DISABLED when the re-sync shows the feature off", async () => {
    mocks.clockInAction.mockRejectedValue(new Error("hidden"));
    mocks.fetchMyTodayAction.mockResolvedValue(status({ enabled: false, promptAtLogin: false }));
    renderPrompt(REQUIRED);
    await findDialog();
    fireEvent.click(screen.getByRole("button", { name: "Registrar entrada" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Esta función está desactivada.");
  });
});
