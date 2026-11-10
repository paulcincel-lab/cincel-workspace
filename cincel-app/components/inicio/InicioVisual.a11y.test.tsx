// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
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

import { StyleProvider } from "@/components/shell/StyleProvider";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { THEME_PRESETS } from "@/lib/ui/themes";
import type { InicioData } from "@/lib/types/redesign";

import { InicioVisual } from "./InicioVisual";
import { INICIO_EMPTY } from "./inicio-fixtures";
import { INICIO_VISUAL, VISUAL_NOW } from "./inicio-visual-fixtures";

const MODES = ["light", "dark"] as const;

/** Azul Cincel (the default theme) in `mode`, the way the root layout applies it. */
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

function renderVisual(data: InicioData = INICIO_VISUAL) {
  renderWithQueryClient(
    <StyleProvider style="visual" scope="staff">
      <InicioVisual data={data} me={{ firstName: "Oscar" }} renderedAt={new Date(VISUAL_NOW)} />
    </StyleProvider>,
    { client: createTestQueryClient() },
  );
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  document.getElementById("appearance")?.remove();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-id");
  document.documentElement.classList.remove("dark");
});

describe("InicioVisual accessibility", () => {
  it.each(MODES)("axe clean light and dark (%s)", async (mode) => {
    applyTheme(mode);
    renderVisual();
    expect(await seriousViolations()).toEqual([]);
  });

  it("axe clean when empty", async () => {
    applyTheme("light");
    renderVisual({ ...INICIO_EMPTY });
    expect(await seriousViolations()).toEqual([]);
  });

  it("tile aria-labels", () => {
    renderVisual();
    expect(screen.getByRole("group", { name: "Tareas abiertas: 23, +3 vs. semana pasada" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Vencidas: 7, −2 vs. semana pasada" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Proyectos activos: 12, ±0 vs. semana pasada" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "Horas esta semana: 126 h, +4 h vs. semana pasada" })).toBeTruthy();
    // Tiles are not focusable and their sparklines are hidden from assistive tech.
    for (const tile of document.querySelectorAll('[data-slot="inicio-tile"]')) {
      expect(tile.getAttribute("tabindex")).toBeNull();
      expect(tile.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    }
  });

  it("charts have sr-only tables", () => {
    renderVisual();
    const tables = [...document.querySelectorAll<HTMLTableElement>('table[data-slot="chart-sr-table"]')];
    expect(tables.map((t) => t.caption?.textContent)).toEqual(["Ritmo semanal", "Tareas por tramo"]);
    for (const table of tables) expect(table.classList.contains("sr-only")).toBe(true);
    // Ritmo semanal: the default 8 weeks; Tareas por tramo: one row per tramo.
    expect(tables[0].querySelectorAll("tbody tr")).toHaveLength(8);
    expect(tables[1].querySelectorAll("tbody tr")).toHaveLength(INICIO_VISUAL.tasksByTramo.length);
  });

  it("makes the hero a labelled section with decorative avatars", () => {
    renderVisual();
    const hero = screen.getByRole("region", { name: "Saludo" });
    expect(hero.querySelector('[data-slot="avatar-stack"]')?.getAttribute("aria-hidden")).toBe("true");
  });
});
