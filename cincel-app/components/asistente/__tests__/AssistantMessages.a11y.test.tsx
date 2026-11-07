// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

import { AssistantTableMessage, type RenderTableArgs } from "@/components/asistente/AssistantTableMessage";
import { AssistantTimelineMessage } from "@/components/asistente/AssistantTimelineMessage";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { PresentationStyle, ThemeId, TokenName } from "@/lib/types/redesign";
import type { AgendaItem } from "@/lib/types/widgets";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;

const tableArgs: RenderTableArgs = {
  title: "Horas por persona",
  columns: [
    { key: "persona", label: "Persona" },
    { key: "horas", label: "Horas", align: "right", format: "hours", mono: true },
  ],
  rows: [
    { id: "p1", persona: "Ana López", horas: 38.5 },
    { id: "p2", persona: "Luis Pérez", horas: 41 },
  ],
  totals: "auto",
};

const items: AgendaItem[] = [
  { id: "e1", title: "Revisión de planos", start: "2026-11-09T10:00:00-06:00", end: "2026-11-09T11:00:00-06:00" },
  { id: "e2", title: "Entrega de mobiliario", start: "2026-11-11T00:00:00-06:00", allDay: true },
];

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout and rendering, which happy-dom doesn't provide.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

/** The theme's token values for the mode as CSS variables on `<html>`, as the SSR style block sets them. */
function applyTheme(theme: ThemeId, mode: (typeof MODES)[number]) {
  const root = document.documentElement;
  root.setAttribute("data-theme", mode);
  root.classList.toggle("dark", mode === "dark");
  const tokens = THEME_PRESETS[theme].tokens;
  for (const name of Object.keys(tokens) as TokenName[]) {
    root.style.setProperty(`--${name}`, tokens[name][mode]);
  }
}

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("style");
  document.documentElement.classList.remove("dark");
});

describe("assistant table and timeline messages accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      for (const style of STYLES) {
        it(`${theme} ${mode} ${style}: no serious or critical axe violations`, async () => {
          applyTheme(theme, mode);
          const { container } = render(
            <StyleProvider style={style} scope="staff">
              <AssistantTableMessage {...tableArgs} />
              <AssistantTimelineMessage title="Próxima semana" items={items} />
              <AssistantTableMessage columns={[]} rows={[]} />
              <AssistantTimelineMessage items={[]} />
            </StyleProvider>,
          );
          expect(await seriousViolations(container)).toEqual([]);
        });
      }
    }
  }
});
