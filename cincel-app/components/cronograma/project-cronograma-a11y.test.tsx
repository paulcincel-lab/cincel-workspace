// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/proyectos/p1/cronograma",
}));


vi.mock("@/lib/actions/schedule-actions", () => ({
  fetchScheduleAction: vi.fn(),
  setTaskStatusAction: vi.fn(),
  toggleTaskFlagAction: vi.fn(),
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import md22Tasks from "@/lib/cronograma/__fixtures__/md22-schedule-tasks.json";
import rawPagos from "@/scripts/data/md22-pagos-calendar.json";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import type { PresentationStyle } from "@/lib/types/redesign";
import type { CronogramaData, PaymentRow, ScheduleTask } from "@/lib/types/schedule";

import CronogramaView from "./cronograma-view";
import { CronogramaReport } from "./cronograma-report";

// A slice of the real dataset keeps every axe run fast while covering each sección.
const allTasks = md22Tasks as unknown as ScheduleTask[];
const tasks = [...new Map(allTasks.map((t) => [t.seccion, t])).values()].concat(allTasks.slice(0, 20));
const payments: PaymentRow[] = (rawPagos as Array<{ fecha: string; pagado: number; avance: number }>).map((r) => ({
  fecha: r.fecha,
  pagadoPct: r.pagado,
  avancePct: r.avance,
}));
const data: CronogramaData = {
  project: { id: "p1", name: "Madrid 22", address: "CDMX" },
  schedule: { id: "s1", version: 1, paymentCalendarLabel: null },
  tasks,
  payments,
  imprevistos: [{ id: "i1", fecha: "2026-07-28", texto: "Trabajo imprevisto de ejemplo" }],
  adicionales: [],
};
const initialView = { data, today: "2026-09-18" };

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;

/** The token pairs the tab and the report draw text with. */
const USED_PAIRS = new Set([
  "foreground/background",
  "foreground/card",
  "muted-foreground/background",
  "muted-foreground/card",
  "destructive/card",
]);

function applyTheme(theme: string, mode: (typeof MODES)[number]) {
  const html = document.documentElement;
  html.setAttribute("data-theme-id", theme);
  html.setAttribute("data-theme", mode);
  html.classList.toggle("dark", mode === "dark");
}

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout; it is checked on the tokens below.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
}

afterEach(() => {
  cleanup();
  const html = document.documentElement;
  html.removeAttribute("data-theme-id");
  html.removeAttribute("data-theme");
  html.classList.remove("dark");
});

describe("Proyecto · Cronograma accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      for (const style of STYLES) {
        it(`tab in ${style}, ${theme} ${mode}: no serious or critical axe violations`, async () => {
          applyTheme(theme, mode);
          const { container } = render(
            <StyleProvider style={style} scope="staff">
              <CronogramaView projectId="p1" initialView={initialView} contractEnd="2026-10-15" />
            </StyleProvider>,
          );
          expect(await seriousViolations(container)).toEqual([]);
        });
      }

      it(`report sheet, ${theme} ${mode}: no serious or critical axe violations`, async () => {
        applyTheme(theme, mode);
        const { container } = render(<CronogramaReport data={data} asOf={new Date("2026-09-18T00:00:00")} />);
        expect(await seriousViolations(container)).toEqual([]);
      });

      it(`text token pairs pass contrast in ${theme} ${mode}`, () => {
        expect(CONTRAST_PAIRS.filter((p) => USED_PAIRS.has(p.pair))).toHaveLength(USED_PAIRS.size);
        const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter((r) => USED_PAIRS.has(r.pair) && !r.ok);
        expect(failing).toEqual([]);
      });
    }
  }
});
