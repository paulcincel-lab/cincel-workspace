// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import axe from "axe-core";

import type { CalendarItem } from "@/lib/types/redesign";

vi.mock("next/navigation", () => ({
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams("vista=calendario"),
}));
vi.mock("@/lib/actions/tasks-actions", () => ({ deleteTaskAction: vi.fn(async () => ({ ok: true, data: undefined })) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { EventDetailPopover } from "@/components/tareas/EventDetailPopover";
import { renderWithQueryClient } from "@/lib/query/test-utils";
import { CONTRAST_PAIRS } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";

const MODES = ["light", "dark"] as const;

/**
 * Text / background pairs the popover draws. It sits on `popover`, which every
 * preset sets equal to `card` (asserted below), so the card pairs that
 * `checkContrast` verifies for the presets cover it.
 */
const POPOVER_PAIRS = [
  "foreground/card",
  "muted-foreground/card",
  "destructive/card",
  "primary-foreground/primary",
  "secondary-foreground/secondary",
];

const EVENT: CalendarItem = {
  id: "e1",
  taskId: "t1",
  date: "2026-11-06",
  time: "11:00",
  title: "Revisión de cotas",
  project: "Ensenada",
  responsible: "Paul Langarica",
  tramo: "construccion",
  tramoLabel: "Construcción",
  phaseId: null,
  phaseLabel: "",
  type: "Reunion",
  href: "/actividades/construccion",
  attendees: ["Juanma", "Paul Langarica"],
  location: "Obra Ensenada",
  meetingUrl: "https://cutto.cloudketer.dev/meet/42",
};

function applyTheme(themeId: string, mode: (typeof MODES)[number]) {
  const root = document.documentElement;
  root.setAttribute("data-theme-id", themeId);
  root.setAttribute("data-theme", mode);
  root.classList.toggle("dark", mode === "dark");
}

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout and CSS, which happy-dom doesn't provide;
  // the pairs are covered by CONTRAST_PAIRS / checkContrast below.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  const root = document.documentElement;
  root.removeAttribute("data-theme-id");
  root.removeAttribute("data-theme");
  root.classList.remove("dark");
});

describe("EventDetailPopover accessibility", () => {
  it("only uses color pairs the contrast checker covers", () => {
    const covered = new Set(CONTRAST_PAIRS.map((p) => p.pair));
    for (const pair of POPOVER_PAIRS) expect(covered.has(pair), pair).toBe(true);
  });

  for (const themeId of THEME_IDS) {
    it(`popover surface is the card surface, so the card pairs cover it · ${themeId}`, () => {
      const tokens = THEME_PRESETS[themeId].tokens;
      expect(tokens.popover).toEqual(tokens.card);
      expect(tokens["popover-foreground"]).toEqual(tokens.foreground);
    });

    for (const mode of MODES) {
      it(`has no serious or critical axe violations · ${themeId} ${mode}`, async () => {
        applyTheme(themeId, mode);
        const anchor = document.createElement("button");
        anchor.textContent = EVENT.title;
        document.body.appendChild(anchor);
        renderWithQueryClient(<EventDetailPopover event={EVENT} anchor={anchor} onClose={vi.fn()} />);
        await screen.findByRole("dialog", { name: EVENT.title });
        expect(await seriousViolations(document.body)).toEqual([]);
      });
    }
  }
});
