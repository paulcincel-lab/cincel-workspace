// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";

import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { THEME_IDS } from "@/lib/ui/themes";
import type { TodayStatus } from "@/lib/types/redesign";

const mocks = vi.hoisted(() => ({
  clockInAction: vi.fn(),
  fetchMyTodayAction: vi.fn(),
  pauseWorkAction: vi.fn(),
  resumeWorkAction: vi.fn(),
  clockOutAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/actions/time-tracking-actions", () => mocks);
vi.mock("@/lib/actions/time-tracking-actions.flags", () => ({
  IMPLEMENTED: { clockInAction: true, fetchMyTodayAction: true },
}));

import { ClockInPrompt } from "./ClockInPrompt";

const NOW = new Date("2026-11-09T15:00:00Z");

/** Renders the prompt with `me.today` holding `s`, as the staff layout hydrates it. */
function renderPrompt(s: TodayStatus, name = "Ana López") {
  const client = createTestQueryClient();
  client.setQueryData(qk.me.today(), s);
  return renderWithQueryClient(<ClockInPrompt now={NOW} name={name} />, { client });
}

function status(overrides: Partial<TodayStatus> = {}): TodayStatus {
  return {
    state: "off",
    startedAt: null,
    workedSeconds: 0,
    required: false,
    promptAtLogin: true,
    enabled: true,
    requiredFrom: "2026-11-16",
    hoursPerDay: 8,
    ...overrides,
  };
}

const VARIANTS: [string, TodayStatus][] = [
  ["optional", status()],
  ["required", status({ required: true, requiredFrom: "2026-11-02" })],
];

async function seriousViolations(container: HTMLElement) {
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

beforeEach(() => {
  mocks.clockInAction.mockReset();
  mocks.fetchMyTodayAction.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  const html = document.documentElement;
  html.removeAttribute("data-theme-id");
  html.removeAttribute("data-theme");
  html.classList.remove("dark");
});

describe("ClockInPrompt accessibility", () => {
  for (const themeId of THEME_IDS) {
    for (const mode of ["light", "dark"] as const) {
      for (const [label, s] of VARIANTS) {
        it(`has no serious axe violations (${label}, ${themeId}, ${mode})`, async () => {
          setTheme(themeId, mode);
          renderPrompt(s);
          await screen.findByRole("dialog");
          expect(await seriousViolations(document.body)).toEqual([]);
        });
      }

      it(`has no serious axe violations with the error and "Cerrar" (${themeId}, ${mode})`, async () => {
        setTheme(themeId, mode);
        mocks.clockInAction.mockRejectedValue(new Error("DISABLED"));
        mocks.fetchMyTodayAction.mockResolvedValue(status({ enabled: false, promptAtLogin: false }));
        const s = VARIANTS[1][1];
        renderPrompt(s);
        await screen.findByRole("dialog");
        fireEvent.click(screen.getByRole("button", { name: "Registrar entrada" }));
        await screen.findByRole("button", { name: "Cerrar" });
        expect(await seriousViolations(document.body)).toEqual([]);
      });
    }
  }

  it("is labelled by its title and described by its copy", async () => {
    renderPrompt(status());
    const dialog = await screen.findByRole("dialog", { name: "Buenos días, Ana" });
    const describedBy = dialog.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy ?? "")?.textContent).toContain(
      "Registra tu entrada para empezar el día.",
    );
  });

  it("moves focus into the dialog and keeps it there", async () => {
    renderPrompt(status({ required: true, requiredFrom: "2026-11-02" }), "Ana");
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    expect(dialog.getAttribute("aria-modal")).not.toBe("false");
  });

  it("returns focus to the page after closing", async () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Página";
    document.body.appendChild(trigger);
    trigger.focus();

    renderPrompt(status(), "Ana");
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "Ahora no" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(false));
    trigger.remove();
  });

  it("announces errors through an alert", async () => {
    mocks.clockInAction.mockRejectedValue(new Error("DISABLED"));
    mocks.fetchMyTodayAction.mockResolvedValue(status({ enabled: false, promptAtLogin: false }));
    renderPrompt(status({ required: true, requiredFrom: "2026-11-02" }), "Ana");
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Registrar entrada" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Esta función está desactivada.");
  });

  it("uses no font weight above 600", async () => {
    renderPrompt(status(), "Ana");
    const dialog = await screen.findByRole("dialog");
    expect(dialog.innerHTML).not.toMatch(/font-(bold|extrabold|black)\b/);
  });
});
