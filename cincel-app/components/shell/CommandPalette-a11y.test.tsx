// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import axe from "axe-core";

import type { SearchResult } from "@/lib/types/redesign";
import { THEME_IDS } from "@/lib/ui/themes";

const search = vi.hoisted(() => ({ searchWorkspaceAction: vi.fn() }));
const time = vi.hoisted(() => ({
  fetchMyTodayAction: vi.fn(),
  clockInAction: vi.fn(),
  pauseWorkAction: vi.fn(),
  resumeWorkAction: vi.fn(),
  clockOutAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/actions/search-actions", () => search);
vi.mock("@/lib/actions/time-tracking-actions", () => time);

import { renderWithQueryClient } from "@/lib/query/test-utils";
import { useShellUi } from "@/lib/stores/shell-ui-store";

import { CommandPalette } from "./CommandPalette";

const RESULTS: SearchResult[] = [
  { type: "proyecto", id: "p1", title: "Ensenada", subtitle: "Construcción", url: "/proyectos/p1" },
  { type: "tarea", id: "t1", title: "Medir muro del fondo de cocina", subtitle: "Ensenada", url: "/tareas/t1" },
  { type: "persona", id: "s1", title: "Juanma", subtitle: "Líder de proyecto", url: "/personas/equipo/s1" },
];

async function seriousViolations() {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide; token pairs are
  // covered by CONTRAST_PAIRS / checkContrast in lib/ui/contrast.ts.
  const results = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

function applyAppearance(themeId: string, mode: "light" | "dark") {
  const html = document.documentElement;
  html.setAttribute("lang", "es");
  html.setAttribute("data-theme-id", themeId);
  html.setAttribute("data-theme", mode);
  html.classList.toggle("dark", mode === "dark");
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CommandPalette accessibility", () => {
  for (const themeId of THEME_IDS) {
    for (const mode of ["light", "dark"] as const) {
      it(`has no serious or critical axe violations (${themeId}, ${mode})`, async () => {
        applyAppearance(themeId, mode);
        search.searchWorkspaceAction.mockResolvedValue(RESULTS);
        time.fetchMyTodayAction.mockResolvedValue({
          state: "off",
          startedAt: null,
          workedSeconds: 0,
          required: false,
          promptAtLogin: false,
          enabled: false,
          requiredFrom: null,
          hoursPerDay: 8,
        });
        renderWithQueryClient(<CommandPalette />);
        act(() => useShellUi.getState().openSearch());

        // Short-query state: hint + actions group.
        await screen.findByText("Escribe al menos 2 letras.");
        expect(await seriousViolations()).toEqual([]);

        // Results state.
        fireEvent.change(screen.getByPlaceholderText("Buscar tareas, proyectos, personas, archivos…"), {
          target: { value: "ensenada" },
        });
        await screen.findByText("Juanma");
        expect(await seriousViolations()).toEqual([]);
      });
    }
  }
});
