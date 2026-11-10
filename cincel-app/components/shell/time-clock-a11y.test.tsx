// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { THEME_IDS } from "@/lib/ui/themes";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { TodayStatus } from "@/lib/types/redesign";
import { settle } from "@/tests/helpers/settle";

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

vi.mock("@/lib/actions/time-tracking-actions.flags", () => ({
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
  },
}));

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import { TimeClock } from "./TimeClock";

/** Renders with `me.today` holding `today`, as the staff layout hydrates it. */
function renderClock(ui: ReactElement, today: TodayStatus) {
  const client = createTestQueryClient();
  client.setQueryData(qk.me.today(), today);
  return renderWithQueryClient(ui, { client });
}

function status(patch: Partial<TodayStatus> = {}): TodayStatus {
  return {
    state: "off",
    startedAt: null,
    workedSeconds: 0,
    required: false,
    promptAtLogin: false,
    enabled: true,
    requiredFrom: "2099-01-01",
    hoursPerDay: 8,
    ...patch,
  };
}

const STATES: TodayStatus[] = [
  status(),
  status({ state: "on", startedAt: "2026-11-07T15:02:00.000Z", workedSeconds: 600 }),
  status({ state: "pausa", startedAt: "2026-11-07T15:02:00.000Z", workedSeconds: 600 }),
  status({ state: "done", startedAt: "2026-11-07T15:02:00.000Z", workedSeconds: 28800 }),
];

async function seriousViolations(container: HTMLElement) {
  await settle();
  // Color contrast needs real layout, which happy-dom doesn't provide; token pairs are covered by lib/ui/contrast.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

function setTheme(themeId: string, mode: "light" | "dark") {
  const html = document.documentElement;
  html.setAttribute("data-theme-id", themeId);
  html.setAttribute("data-theme", mode);
  html.classList.toggle("dark", mode === "dark");
}

function mockReducedMotion(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  mockReducedMotion(false);
  // The running clock ticks every second; hold the interval so a tick can't land in the middle of an axe pass.
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.matchMedia = originalMatchMedia;
  const html = document.documentElement;
  html.removeAttribute("data-theme-id");
  html.removeAttribute("data-theme");
  html.classList.remove("dark");
});

describe("TimeClock accessibility", () => {
  for (const themeId of THEME_IDS) {
    for (const mode of ["light", "dark"] as const) {
      it(`card has no serious axe violations in every state (${themeId}, ${mode})`, async () => {
        setTheme(themeId, mode);
        for (const initial of STATES) {
          const { container, unmount } = renderClock(<TimeClock />, initial);
          expect(await seriousViolations(container)).toEqual([]);
          unmount();
        }
      });

      it(`compact popover has no serious axe violations (${themeId}, ${mode})`, async () => {
        setTheme(themeId, mode);
        renderClock(<TimeClock variant="compact" />, STATES[1]);
        expect(await seriousViolations(document.body)).toEqual([]);
        fireEvent.click(screen.getByRole("button", { name: "Jornada: En curso" }));
        await screen.findByRole("button", { name: "Pausa" });
        expect(await seriousViolations(document.body)).toEqual([]);
      });
    }
  }

  it("the time is a timer that does not announce every tick", () => {
    renderClock(<TimeClock />, STATES[1]);
    const timer = screen.getByRole("timer");
    expect(timer.getAttribute("aria-live")).toBe("off");
    expect(timer.getAttribute("aria-label")).toBe("Tiempo trabajado hoy");
  });

  it("state changes go through a polite live region", () => {
    renderClock(<TimeClock />, STATES[0]);
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");
  });

  it("the progress bar is labelled", () => {
    renderClock(<TimeClock />, STATES[1]);
    expect(screen.getByRole("progressbar", { name: "Avance de la jornada" })).toBeTruthy();
  });

  it("respects prefers-reduced-motion (no progress animation, time still shown)", () => {
    mockReducedMotion(true);
    const { container } = renderClock(<TimeClock />, STATES[1]);
    const indicator = container.querySelector('[data-slot="progress-indicator"]');
    expect(indicator?.className).toContain("transition-none");
    expect(screen.getByRole("timer").textContent).toBe("00:10:00");
  });
});
