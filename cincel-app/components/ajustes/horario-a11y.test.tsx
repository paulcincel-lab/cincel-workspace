// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/actions/time-tracking-actions", () => ({
  saveTimeTrackingSettingsAction: vi.fn(),
  fetchTimeTrackingSettingsAction: vi.fn(),
  fetchTeamHoursAction: vi.fn(),
}));
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
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/patterns/SettingsSection", () => import("@/tests/unit/fixtures/horario"));
vi.mock("@/components/patterns/SettingsRow", () => import("@/tests/unit/fixtures/horario"));
vi.mock("@/components/widgets/RecordTable", () => import("@/tests/unit/fixtures/horario"));

import { HorarioClient } from "./HorarioClient";
import { StyleProvider } from "@/components/shell/StyleProvider";
import type { PresentationStyle } from "@/lib/types/redesign";
import { THEME_IDS } from "@/lib/ui/themes";
import { SETTINGS, TEAM_ROWS, WEEK } from "@/tests/unit/fixtures/horario";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("data-theme-id");
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
});

function renderPage(canManage: boolean, style: PresentationStyle) {
  render(
    <main>
      <h1>Ajustes</h1>
      <StyleProvider style={style} scope="staff">
        <HorarioClient
          settings={SETTINGS}
          canManage={canManage}
          canViewReport
          weekStart={WEEK}
          rows={TEAM_ROWS}
          viewerName="Ana"
        />
      </StyleProvider>
    </main>,
  );
}

async function seriousViolations() {
  const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

describe("Ajustes › Control de horario a11y", () => {
  for (const themeId of THEME_IDS) {
    for (const mode of ["light", "dark"] as const) {
      it(`administrador: no serious or critical axe violations (${themeId}, ${mode})`, async () => {
        document.documentElement.setAttribute("data-theme-id", themeId);
        document.documentElement.setAttribute("data-theme", mode);
        if (mode === "dark") document.documentElement.classList.add("dark");
        renderPage(true, "visual");
        expect(await seriousViolations()).toEqual([]);
      });

      it(`dirección: no serious or critical axe violations (${themeId}, ${mode})`, async () => {
        document.documentElement.setAttribute("data-theme-id", themeId);
        document.documentElement.setAttribute("data-theme", mode);
        if (mode === "dark") document.documentElement.classList.add("dark");
        renderPage(false, "analitico");
        expect(await seriousViolations()).toEqual([]);
      });
    }
  }

  it("every form control has a name", () => {
    renderPage(true, "esencial");
    for (const label of ["Obligatorio a partir de", "Entrada", "Salida", "Horas esperadas por día", "Tolerancia de retardo"]) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    expect(screen.getByRole("switch", { name: "Activar control de horario" })).toBeTruthy();
    for (const day of ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]) {
      expect(screen.getByRole("button", { name: day })).toBeTruthy();
    }
  });
});
