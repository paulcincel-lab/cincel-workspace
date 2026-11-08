import type { ReactNode } from "react";
import { render } from "@testing-library/react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { PresentationStyle, ThemeId } from "@/lib/types/redesign";

/** Tool arguments exactly as the model sends them today (`lib/assistant/tools.ts`). */
export const CHART_BAR = {
  chartType: "bar" as const,
  title: "Ocupación por área",
  data: [
    { label: "Diseño", value: 7 },
    { label: "Construcción", value: 12 },
    { label: "Decoración", value: 3 },
  ],
};

export const CHART_LINE = {
  chartType: "line" as const,
  title: "Tareas cerradas por semana",
  data: [
    { label: "S1", value: 4 },
    { label: "S2", value: 9 },
    { label: "S3", value: 6 },
  ],
};

export const CARD = {
  title: "Casa Ensenada",
  subtitle: "Construcción · fase 3",
  fields: [
    { label: "Avance", value: "62 %" },
    { label: "Responsable", value: "Ana López" },
  ],
  badge: { label: "En riesgo", tone: "warning" as const },
};

export const STAT_GRID = {
  title: "Avance de proyectos activos",
  stats: [
    { label: "Casa Ensenada", value: "62 %", badge: { label: "En riesgo", tone: "warning" as const } },
    { label: "Depto. Roma", value: "88 %", badge: { label: "A tiempo", tone: "ok" as const } },
    { label: "Oficina Polanco", value: "1,250" },
  ],
};

export const LIST = {
  title: "Falta en el checklist",
  items: ["Planos firmados", "Cotización de herrería", "Fotos de obra"],
};

export const STYLES: readonly PresentationStyle[] = ["visual", "esencial", "analitico"];
export const MODES = ["light", "dark"] as const;
export { THEME_IDS };

/** Renders inside a `StyleProvider` with the given style, as the shell does. */
export function renderInStyle(style: PresentationStyle, ui: ReactNode) {
  return render(
    <StyleProvider style={style} scope="staff">
      {ui}
    </StyleProvider>,
  );
}

/**
 * Applies a theme and mode the way the root layout does: `data-theme`,
 * `data-theme-id`, `.dark` and a `<style id="appearance">` block with the
 * preset tokens.
 */
export function applyTheme(theme: ThemeId, mode: "light" | "dark") {
  const html = document.documentElement;
  html.setAttribute("data-theme", mode);
  html.setAttribute("data-theme-id", theme);
  html.classList.toggle("dark", mode === "dark");
  const tokens = THEME_PRESETS[theme].tokens;
  const vars = Object.entries(tokens)
    .map(([name, value]) => `--${name}:${value[mode]};`)
    .join("");
  let block = document.getElementById("appearance");
  if (!block) {
    block = document.createElement("style");
    block.id = "appearance";
    document.head.appendChild(block);
  }
  block.textContent = `html:root[data-theme="${mode}"]{${vars}}`;
}

export function resetTheme() {
  const html = document.documentElement;
  html.removeAttribute("data-theme");
  html.removeAttribute("data-theme-id");
  html.classList.remove("dark");
  document.getElementById("appearance")?.remove();
}
