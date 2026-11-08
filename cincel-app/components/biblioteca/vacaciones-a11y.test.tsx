// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";
import axe from "axe-core";

import { StyleProvider } from "@/components/shell/StyleProvider";
import type { PresentationStyle, ThemeId } from "@/lib/types/redesign";
import { THEME_IDS } from "@/lib/ui/themes";

const actions = vi.hoisted(() => ({
  requestVacationAction: vi.fn(),
  cancelVacationRequestAction: vi.fn(),
}));
vi.mock("@/lib/actions/vacations-actions", () => actions);
vi.mock("@/lib/actions/page-data/biblioteca-actions", () => ({
  getBibliotecaPageData: vi.fn(),
  getMisVacacionesPageData: vi.fn(),
}));
vi.mock("@/lib/actions/vacations-actions.flags", () => ({
  IMPLEMENTED: {
    fetchMyVacationsAction: true,
    requestVacationAction: true,
    cancelVacationRequestAction: true,
    fetchPendingVacationRequestsAction: true,
    decideVacationAction: true,
    fetchTeamAbsencesAction: true,
    fetchVacationSettingsAction: true,
    saveVacationSettingsAction: true,
  },
}));

import { renderWithQueryClient } from "@/lib/query/test-utils";

import { MisVacacionesClient } from "./MisVacacionesClient";
import { seededVacacionesClient } from "./vacaciones.fixtures";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;

async function seriousViolations(root: Element) {
  // Color contrast needs real layout/rendering, which happy-dom doesn't provide.
  const results = await axe.run(root, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

function applyTheme(theme: ThemeId, mode: (typeof MODES)[number]) {
  const html = document.documentElement;
  html.setAttribute("lang", "es");
  html.setAttribute("data-theme", mode);
  html.setAttribute("data-theme-id", theme);
  html.classList.toggle("dark", mode === "dark");
}

function renderPage(style: PresentationStyle) {
  return renderWithQueryClient(
    <StyleProvider style={style} scope="staff">
      <main>
        <MisVacacionesClient month="2026-11" year={2026} />
      </main>
    </StyleProvider>,
    { client: seededVacacionesClient() },
  );
}

afterEach(() => {
  cleanup();
  const html = document.documentElement;
  html.removeAttribute("data-theme");
  html.removeAttribute("data-theme-id");
  html.classList.remove("dark");
});

describe("Mis vacaciones accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      for (const style of STYLES) {
        it(`has no serious axe violations · ${theme} ${mode} · ${style}`, async () => {
          applyTheme(theme, mode);
          const { container } = renderPage(style);
          expect(await seriousViolations(container)).toEqual([]);
        });
      }
    }
  }

  it("the request sheet has no serious axe violations", async () => {
    applyTheme("azul", "light");
    renderPage("visual");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Nueva solicitud/ }));
    });
    expect(await seriousViolations(document.body)).toEqual([]);
  });

  it("the cancel dialog has no serious axe violations", async () => {
    applyTheme("azul", "dark");
    renderPage("analitico");
    const cancel = screen.queryAllByRole("button", { name: /Cancelar la solicitud/ })[0];
    if (cancel) {
      await act(async () => {
        fireEvent.click(cancel);
      });
    }
    expect(await seriousViolations(document.body)).toEqual([]);
  });
});
