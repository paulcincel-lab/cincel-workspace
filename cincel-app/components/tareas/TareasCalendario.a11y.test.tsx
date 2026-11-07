// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import axe from "axe-core";

import type { TaskListItem, WorkflowRef } from "@/lib/types/core";
import type { PresentationStyle } from "@/lib/types/redesign";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams("vista=calendario"),
}));
vi.mock("@/lib/actions/tasks-actions", () => ({ fetchCalendarAction: vi.fn(async () => []) }));
vi.mock("@/lib/actions/calendar-actions", () => ({ syncGoogleCalendarAction: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => ({ member: { id: "s1", name: "Ana Ruiz" } }),
}));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveCalendarCapabilities: () => ({ canViewCalendar: true, canViewDailyAgenda: true, canViewTeamCalendar: true }),
}));
vi.mock("@/lib/google/use-google-connect-result", () => ({ useGoogleConnectResult: () => null }));
vi.mock("@/components/calendario/CalendarFeedDialog", () => ({ default: () => null }));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { CONTRAST_PAIRS } from "@/lib/ui/contrast";
import { THEME_IDS } from "@/lib/ui/themes";
import { TareasCalendario } from "./TareasCalendario";

const MODES = ["light", "dark"] as const;
const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];

/** Text / background pairs the view draws itself (toolbar, aside, Día timeline and tinted blocks). */
const VIEW_PAIRS = [
  "foreground/background",
  "foreground/card",
  "muted-foreground/background",
  "muted-foreground/card",
  "secondary-foreground/secondary",
  "chart-1-ink/chart-1-tint",
  "chart-2-ink/chart-2-tint",
  "chart-3-ink/chart-3-tint",
  "chart-1/card",
  "chart-2/card",
  "chart-3/card",
];

const TRAMOS: WorkflowRef[] = [
  { id: "w1", key: "presale", name: "Presale", sortOrder: 1 },
  { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 },
  { id: "w3", key: "construccion", name: "Construcción", sortOrder: 3 },
];

const TASKS = [
  {
    id: "t1",
    title: "Planos ejecutivos",
    kind: "user",
    workflow: TRAMOS[1],
    project: { id: "p1", name: "Residencia Valle Alto" },
    manager: { id: "s1", name: "Ana Ruiz" },
    phase: null,
    createdAt: "2026-10-01T09:30:00",
    commitmentDate: "2026-11-06",
    reviewDate: null,
    deliveryDate: "2026-11-06",
  },
  {
    id: "t2",
    title: "Cotización inicial",
    kind: "user",
    workflow: TRAMOS[0],
    project: { id: "p2", name: "Casa Ensenada" },
    manager: { id: "s2", name: "Luis Pérez" },
    phase: null,
    createdAt: "2026-10-01T11:00:00",
    commitmentDate: "2026-11-06",
    reviewDate: null,
    deliveryDate: "2026-11-12",
  },
] as unknown as TaskListItem[];

function applyTheme(themeId: string, mode: (typeof MODES)[number]) {
  const root = document.documentElement;
  root.setAttribute("data-theme-id", themeId);
  root.setAttribute("data-theme", mode);
  root.classList.toggle("dark", mode === "dark");
}

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout and CSS, which happy-dom doesn't provide;
  // the pairs are covered by CONTRAST_PAIRS / checkContrast.
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

describe("TareasCalendario accessibility", () => {
  it("only uses color pairs the contrast checker covers", () => {
    const covered = new Set(CONTRAST_PAIRS.map((p) => p.pair));
    for (const pair of VIEW_PAIRS) expect(covered.has(pair), pair).toBe(true);
  });

  for (const themeId of THEME_IDS) {
    for (const mode of MODES) {
      it(`mes and semana in every style, and día, have no serious or critical violations · ${themeId} ${mode}`, async () => {
        applyTheme(themeId, mode);
        const today = new Date(2026, 10, 6);
        const views: { cal: "mes" | "semana" | "dia"; style: PresentationStyle }[] = [
          ...STYLES.map((style) => ({ cal: "mes" as const, style })),
          ...STYLES.map((style) => ({ cal: "semana" as const, style })),
          { cal: "dia", style: "visual" },
        ];
        for (const view of views) {
          const { container, unmount } = render(
            <StyleProvider style={view.style} scope="staff">
              <TareasCalendario
                cal={view.cal}
                tasks={TASKS}
                tramos={TRAMOS}
                today={today}
                initialRange={{ from: "2026-09-01", to: "2027-01-31" }}
              />
            </StyleProvider>
          );
          expect(await seriousViolations(container), `${view.cal} ${view.style}`).toEqual([]);
          unmount();
        }
      });
    }
  }
});
