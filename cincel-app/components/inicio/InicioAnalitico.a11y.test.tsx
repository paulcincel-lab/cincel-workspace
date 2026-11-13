// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import axe from "axe-core";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/inicio",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/actions/preferences-actions", () => ({
  fetchMyPreferencesAction: vi.fn(),
  updateMyPreferencesAction: vi.fn(async () => ({ preferences: {}, appearance: {} })),
}));
vi.mock("@/lib/actions/tasks-actions", () => ({ createUserTaskAction: vi.fn() }));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { ANALITICO_SECTION } from "@/lib/inicio/analitico";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { useInicioDashboard } from "@/lib/stores/inicio-dashboard-store";
import { THEME_PRESETS } from "@/lib/ui/themes";

import { ANALITICO_DATA } from "./inicio-analitico-fixtures";
import { InicioAnalitico } from "./InicioAnalitico";

const MODES = ["light", "dark"] as const;

/** Azul Cincel, the way the root layout applies it: `<html>` attributes + one token block. */
function applyTheme(mode: (typeof MODES)[number]) {
  const html = document.documentElement;
  html.setAttribute("lang", "es");
  html.setAttribute("data-theme", mode);
  html.setAttribute("data-theme-id", "azul");
  html.classList.toggle("dark", mode === "dark");
  const vars = Object.entries(THEME_PRESETS.azul.tokens)
    .map(([name, value]) => `--${name}: ${value[mode]};`)
    .join(" ");
  const style = document.createElement("style");
  style.id = "appearance";
  style.textContent = `html:root[data-theme="${mode}"]{${vars}}`;
  document.head.appendChild(style);
}

async function seriousViolations() {
  const results = await axe.run(document.body, { resultTypes: ["violations"] });
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

function renderAnalitico() {
  return renderWithQueryClient(
    <StyleProvider style="analitico" scope="staff">
      <main>
        <InicioAnalitico data={ANALITICO_DATA} firstName="Ana" now={new Date("2026-11-09T15:00:00Z")} />
      </main>
    </StyleProvider>,
    { client: createTestQueryClient() },
  );
}

/** The header button of a section card (`button[aria-expanded]` first in the section). */
function header(id: string): HTMLElement {
  const button = document.getElementById(id)?.querySelector<HTMLElement>("button[aria-expanded]");
  if (!button) throw new Error(`no header for ${id}`);
  return button;
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  document.getElementById("appearance")?.remove();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-id");
  document.documentElement.classList.remove("dark");
});

describe("InicioAnalitico accessibility", () => {
  for (const mode of MODES) {
    it(`axe clean light and dark (${mode})`, async () => {
      applyTheme(mode);
      renderAnalitico();
      expect(await seriousViolations()).toEqual([]);
    });
  }

  it("radiogroup keyboard", () => {
    renderAnalitico();
    const rango = screen.getByRole("radiogroup", { name: "Rango" });
    const checked = () => within(rango).getByRole("radio", { checked: true });
    expect(checked().textContent).toContain("8 sem");
    fireEvent.keyDown(checked(), { key: "ArrowRight" });
    expect(useInicioDashboard.getState().range).toBe("12w");
    fireEvent.keyDown(checked(), { key: "ArrowLeft" });
    expect(useInicioDashboard.getState().range).toBe("8w");
  });

  it("aria-expanded per section", () => {
    renderAnalitico();
    const ids = Object.values(ANALITICO_SECTION);
    for (const id of ids) {
      const button = header(id);
      expect(button.getAttribute("aria-expanded")).toBe("true");
      const controls = button.getAttribute("aria-controls");
      expect(controls ? document.getElementById(controls) : null).toBeTruthy();
    }

    fireEvent.click(header(ANALITICO_SECTION.etapas));
    expect(header(ANALITICO_SECTION.etapas).getAttribute("aria-expanded")).toBe("false");
    expect(useInicioDashboard.getState().collapsed.etapaDonut).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Contraer todo" }));
    for (const id of ids) expect(header(id).getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByText("Secciones contraídas")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Expandir todo" }));
    for (const id of ids) expect(header(id).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Secciones expandidas")).toBeTruthy();
  });
});
