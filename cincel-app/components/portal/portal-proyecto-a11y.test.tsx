// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { buildPortalOverview } from "@/lib/portal/overview";
import type { PortalFileDTO, PortalProjectDTO, PortalScheduleDTO, PortalTramoDTO } from "@/lib/types/portal";
import type { PresentationStyle, ThemeId } from "@/lib/types/redesign";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS, TOKEN_NAMES } from "@/lib/ui/themes";

import PortalProjectOverview from "./PortalProjectOverview";

const MODES = ["light", "dark"] as const;
type Mode = (typeof MODES)[number];
const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];

/** Token pairs the portal project page paints text with (the widgets check their own). */
const PORTAL_PROYECTO_CONTRAST_PAIRS = [
  "foreground/background",
  "foreground/card",
  "muted-foreground/background",
  "muted-foreground/card",
  "secondary-foreground/secondary",
] as const;

const project: PortalProjectDTO = {
  id: "p1",
  name: "Casa Lomas",
  code: "CL-01",
  address: "Av. Siempre Viva 742, Monterrey, NL",
  status: "activo",
  progressPct: 42,
  startDate: "2026-01-15",
  endDate: "2026-12-20",
  manager: { name: "Laura Pérez", email: "laura@cincel.mx" },
};
const schedule: PortalScheduleDTO = {
  sections: [
    { key: "PB::Cimentación", planta: "PB", seccion: "Cimentación", start: "2026-02-01", end: "2026-02-28", progressPct: 100 },
    { key: "PB::Muros", planta: "PB", seccion: "Muros", start: "2026-03-01", end: "2026-11-20", progressPct: 50 },
    { key: "PA::Losa", planta: "PA", seccion: "Losa", start: "2026-11-01", end: "2026-11-30", progressPct: 0 },
  ],
};
const tramos: PortalTramoDTO[] = [
  { key: "presale", name: "Presale", state: "completado" },
  { key: "diseno", name: "Diseño", state: "en_curso" },
  { key: "construccion", name: "Construcción", state: "por_iniciar" },
];
const files: PortalFileDTO[] = [
  { id: "f1", name: "Contrato.pdf", mimeType: "application/pdf", sizeBytes: 120_000, modifiedAt: "2026-09-15T00:00:00Z", kind: "file", deliveredAs: "original" },
  { id: "f2", name: "Planta.pdf", mimeType: "application/pdf", sizeBytes: 2_400_000, modifiedAt: "2026-10-28T00:00:00Z", kind: "file", deliveredAs: "original" },
];
const data = buildPortalOverview({ project, schedule, tramos, files, today: "2026-11-07" });

/** What the redesign puts on the portal: the org preset's tokens as CSS variables, `data-theme` for the mode. */
function applyTheme(theme: ThemeId, mode: Mode) {
  const root = document.documentElement;
  root.setAttribute("data-theme", mode);
  root.setAttribute("data-theme-id", theme);
  root.classList.toggle("dark", mode === "dark");
  for (const token of TOKEN_NAMES) root.style.setProperty(`--${token}`, THEME_PRESETS[theme].tokens[token][mode]);
}

function resetTheme() {
  const root = document.documentElement;
  root.removeAttribute("data-theme");
  root.removeAttribute("data-theme-id");
  root.classList.remove("dark");
  root.removeAttribute("style");
}

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout and rendering, which happy-dom doesn't provide; the token pairs are checked
  // with `checkContrast` below instead.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((violation) => violation.impact === "critical" || violation.impact === "serious")
    .map((violation) => ({ id: violation.id, nodes: violation.nodes.map((node) => node.html) }));
}

describe("portal project page accessibility (FE §16, §18 item 13)", () => {
  afterEach(() => {
    cleanup();
    resetTheme();
  });

  for (const style of STYLES) {
    for (const theme of THEME_IDS) {
      for (const mode of MODES) {
        it(`${style} has no serious or critical axe violations in ${theme} ${mode}`, async () => {
          applyTheme(theme, mode);
          const { container } = render(
            <main>
              <h1>Casa Lomas</h1>
              <StyleProvider style={style} scope="portal">
                <PortalProjectOverview project={project} data={data} />
              </StyleProvider>
            </main>,
          );
          expect(await seriousViolations(container)).toEqual([]);
        });
      }
    }
  }
});

describe("portal project page colors", () => {
  it("paints text only with pairs of lib/ui/contrast.ts", () => {
    const known = new Set(CONTRAST_PAIRS.map((pair) => pair.pair));
    for (const pair of PORTAL_PROYECTO_CONTRAST_PAIRS) expect(known.has(pair)).toBe(true);
  });

  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      it(`every pair passes in ${theme} ${mode}`, () => {
        const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter(
          (result) => (PORTAL_PROYECTO_CONTRAST_PAIRS as readonly string[]).includes(result.pair) && !result.ok,
        );
        expect(failing).toEqual([]);
      });
    }
  }
});
