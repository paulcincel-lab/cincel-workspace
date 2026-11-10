// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, within } from "@testing-library/react";
import axe from "axe-core";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/personas",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/actions/preferences-actions", () => ({
  fetchMyPreferencesAction: vi.fn(),
  updateMyPreferencesAction: vi.fn(),
}));
vi.mock("@/lib/auth/auth-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/auth-service")>()),
  getCurrentAuthenticatedUser: () => ({
    access: "Administrador",
    email: "ana@cincel.mx",
    member: { id: "00000000-0000-4000-8000-000000000101" },
  }),
}));
vi.mock("@/lib/actions/staff-actions", () => ({
  fetchStaffDetailAction: vi.fn(),
  saveMemberAction: vi.fn(),
}));
vi.mock("@/lib/actions/positions-actions", () => ({ fetchPositionsAction: vi.fn(async () => []) }));
vi.mock("@/lib/actions/workspace-access-actions", () => ({ recheckStaffAccessAction: vi.fn() }));
vi.mock("@/lib/query/options/catalog", async (importOriginal) => {
  const { EQUIPO_TRAMOS: tramos } = await import("./fixtures/equipo");
  return {
    ...(await importOriginal<typeof import("@/lib/query/options/catalog")>()),
    catalogTramosOptions: () => ({ queryKey: ["catalog", "tramos"], queryFn: async () => tramos }),
  };
});
vi.mock("@/lib/actions/tasks-actions", () => ({ createUserTaskAction: vi.fn() }));
vi.mock("@/lib/tramos/compat", () => ({
  tramoLabel: (key: string) => ({ presale: "Presale", diseno: "Diseño", construccion: "Construcción" })[key] ?? key,
  tramoColorVar: (key: string) =>
    ({ presale: "var(--chart-1)", diseno: "var(--chart-2)", construccion: "var(--chart-3)" })[key] ?? "var(--muted-foreground)",
  tramoColorSlot: (key: string) => ({ presale: 1, diseno: 2, construccion: 3 })[key] ?? null,
  phaseLabel: () => null,
  canSeeAdminData: () => false,
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { buildTeamPeople, countPersonasTabs } from "@/lib/personas/team";
import { appearanceStyleBlock, toCssVars } from "@/lib/ui/appearance-css";
import { CONTRAST_PAIRS, checkContrast } from "@/lib/ui/contrast";
import { THEME_IDS, THEME_PRESETS } from "@/lib/ui/themes";
import { usePersonasDashboard } from "@/lib/stores/personas-dashboard-store";
// EquipoView reads the puestos catalog and saves through TanStack Query.
import { renderWithQueryClient as render } from "@/lib/query/test-utils";
import type { PresentationStyle, ThemeId } from "@/lib/types/redesign";

import { EquipoView } from "./EquipoView";
import { EQUIPO_OVERVIEW_WITH_HOURS, EQUIPO_STAFF, EQUIPO_TRAMOS } from "./fixtures/equipo";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { seedSessionUser } from "@/tests/helpers/session-user";
import { settle } from "@/tests/helpers/settle";

// The components read the signed-in user from the session store; seed it with the mocked user.
beforeEach(() => {
  seedSessionUser(getCurrentAuthenticatedUser());
  usePersonasDashboard.getState().reset();
});

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;

/** Token pairs this page paints text or controls with (subset of `CONTRAST_PAIRS`). */
const PAGE_PAIRS = new Set([
  "foreground/background",
  "foreground/card",
  "muted-foreground/background",
  "muted-foreground/card",
  "primary-foreground/primary",
  "secondary-foreground/secondary",
  "destructive/card",
  "success/card",
  "warning-ink/card",
  "border-strong/card",
  "ring/background",
]);

function applyTheme(theme: ThemeId, mode: (typeof MODES)[number]) {
  const preset = THEME_PRESETS[theme];
  const style = document.createElement("style");
  style.id = "appearance";
  style.textContent = appearanceStyleBlock({ light: toCssVars(preset, "light"), dark: toCssVars(preset, "dark") });
  document.head.appendChild(style);
  const html = document.documentElement;
  html.setAttribute("data-theme", mode);
  html.setAttribute("data-theme-id", theme);
  html.classList.toggle("dark", mode === "dark");
}

function resetTheme() {
  document.getElementById("appearance")?.remove();
  const html = document.documentElement;
  html.removeAttribute("data-theme");
  html.removeAttribute("data-theme-id");
  html.classList.remove("dark");
}

async function seriousViolations(container: HTMLElement) {
  await settle();
  // Color contrast needs real layout and rendering, which happy-dom doesn't
  // provide; token contrast is checked with `checkContrast` instead.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

afterEach(() => {
  cleanup();
  resetTheme();
});

describe("Personas · Equipo accessibility", () => {
  const { people, emails } = buildTeamPeople(EQUIPO_STAFF, EQUIPO_OVERVIEW_WITH_HOURS, EQUIPO_TRAMOS);
  const counts = countPersonasTabs(EQUIPO_STAFF, []);

  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      it(`token pairs used by the page pass contrast (${theme}, ${mode})`, () => {
        const used = CONTRAST_PAIRS.filter((p) => PAGE_PAIRS.has(p.pair)).map((p) => p.pair);
        expect(used.length).toBe(PAGE_PAIRS.size);
        const failing = checkContrast(THEME_PRESETS[theme].tokens, mode).filter(
          (r) => PAGE_PAIRS.has(r.pair) && !r.ok,
        );
        expect(failing).toEqual([]);
      });

      for (const style of STYLES) {
        it(`has no serious or critical axe violations (${theme}, ${mode}, ${style})`, async () => {
          applyTheme(theme, mode);
          const { container } = render(
            <main>
              <StyleProvider style={style} scope="staff">
                <EquipoView people={people} emails={emails} counts={counts} canCreate canAssign canCreateTask />
              </StyleProvider>
            </main>,
          );
          expect(await seriousViolations(container)).toEqual([]);
        });
      }

      it(`empty team has no serious or critical axe violations (${theme}, ${mode})`, async () => {
        applyTheme(theme, mode);
        const { container } = render(
          <main>
            <EquipoView people={[]} emails={{}} counts={countPersonasTabs([], [])} canCreate={false} canAssign={false} canCreateTask={false} />
          </main>,
        );
        expect(await seriousViolations(container)).toEqual([]);
      });
    }
  }
});

describe("Personas · Equipo Esencial accessibility", () => {
  const { people, emails } = buildTeamPeople(EQUIPO_STAFF, EQUIPO_OVERVIEW_WITH_HOURS, EQUIPO_TRAMOS);
  const counts = countPersonasTabs(EQUIPO_STAFF, []);

  for (const mode of MODES) {
    it(`pills, cards and meters have no serious or critical axe violations (${mode})`, async () => {
      applyTheme("azul" as ThemeId, mode);
      const { container, getByRole, getAllByRole } = render(
        <main>
          <StyleProvider style="esencial" scope="staff">
            <EquipoView people={people} emails={emails} counts={counts} canCreate canAssign canCreateTask />
          </StyleProvider>
        </main>,
      );
      expect(getByRole("group", { name: "Filtrar por carga" }).querySelectorAll("button[aria-pressed]")).toHaveLength(5);
      const meters = getAllByRole("meter");
      expect(meters).toHaveLength(people.length);
      for (const [i, meter] of meters.entries()) {
        expect(meter.getAttribute("aria-label")).toBe(`Carga ${people[i].occupancyPct ?? 0} %`);
      }
      for (const person of people) {
        const toggle = getByRole("button", { name: `Tareas de ${person.name}` });
        expect(toggle.getAttribute("aria-expanded")).toBe("false");
        expect(toggle.getAttribute("aria-controls")).toBeTruthy();
      }
      expect(container.querySelector("table")).toBeNull();
      expect(await seriousViolations(container)).toEqual([]);
    });
  }
});

describe("Personas · Equipo Visual accessibility", () => {
  const { emails } = buildTeamPeople(EQUIPO_STAFF, EQUIPO_OVERVIEW_WITH_HOURS, EQUIPO_TRAMOS);
  const counts = countPersonasTabs(EQUIPO_STAFF, []);
  const week = (weekStart: string, occupancyPct: number, absentDays = 0) => ({
    weekStart,
    open: Math.round(occupancyPct / 10),
    occupancyPct,
    absentDays,
  });
  const MONDAYS = ["2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"];
  const base = buildTeamPeople(EQUIPO_STAFF, EQUIPO_OVERVIEW_WITH_HOURS, EQUIPO_TRAMOS).people;
  // Ana over capacity (banner), Bruno leaving next week, Carla free.
  const people = [
    { ...base[0]!, occupancyPct: 120, overdue: 2, weeks: MONDAYS.map((m, i) => week(m, [120, 90, 40, 0][i]!)) },
    {
      ...base[1]!,
      occupancyPct: 85,
      weeks: MONDAYS.map((m, i) => week(m, [85, 0, 30, 20][i]!, [0, 5, 2, 0][i])),
      absences: [{ from: "2026-11-16", to: "2026-11-25", kind: "ausencia" as const }],
    },
    { ...base[2]!, occupancyPct: 10, weeks: MONDAYS.map((m) => week(m, 10)) },
  ];

  for (const mode of MODES) {
    it(`banner, cards, board and heatmap have no serious or critical axe violations (${mode})`, async () => {
      applyTheme("azul" as ThemeId, mode);
      const { container, getByRole } = render(
        <main>
          <StyleProvider style="visual" scope="staff">
            <EquipoView people={people} emails={emails} counts={counts} canCreate canAssign canCreateTask />
          </StyleProvider>
        </main>,
      );
      expect(getByRole("region", { name: "Quién está saturado" })).toBeTruthy();
      expect(getByRole("region", { name: "Equipo" })).toBeTruthy();
      const table = getByRole("table", { name: "Carga por persona y semana" });
      const columns = Array.from(table.querySelectorAll('thead th[scope="col"]')).map((th) => th.textContent);
      expect(columns).toEqual(["Persona", "9–15 nov", "16–22 nov", "23–29 nov", "30 nov–6 dic"]);
      const rows = Array.from(table.querySelectorAll('tbody th[scope="row"]')).map((th) => th.textContent);
      expect(rows).toEqual(people.map((p) => p.name));
      expect(await seriousViolations(container)).toEqual([]);
    });
  }
});

describe("Personas · Analítico accessibility", () => {
  const { people, emails } = buildTeamPeople(EQUIPO_STAFF, EQUIPO_OVERVIEW_WITH_HOURS, EQUIPO_TRAMOS);
  const counts = countPersonasTabs(EQUIPO_STAFF, []);

  function renderAnalitico() {
    return render(
      <main>
        <StyleProvider style="analitico" scope="staff">
          <EquipoView people={people} emails={emails} counts={counts} canCreate canAssign canCreateTask />
        </StyleProvider>
      </main>,
    );
  }

  for (const mode of MODES) {
    it(`has no serious or critical axe violations (${mode})`, async () => {
      applyTheme("azul", mode);
      const { container } = renderAnalitico();
      expect(await seriousViolations(container)).toEqual([]);
    });
  }

  it("names every group and person toggle", () => {
    const { getByRole, getAllByRole } = renderAnalitico();
    const table = getByRole("table", { name: "Personas por tramo" });
    const toggles = Array.from(table.querySelectorAll("button[aria-expanded]"));
    expect(toggles.length).toBeGreaterThan(0);
    for (const toggle of toggles) {
      expect((toggle.getAttribute("aria-label") ?? toggle.textContent ?? "").trim()).not.toBe("");
      for (const id of (toggle.getAttribute("aria-controls") ?? "").split(" ").filter(Boolean)) {
        if (toggle.getAttribute("aria-expanded") === "true") expect(document.getElementById(id)).not.toBeNull();
      }
    }
    for (const person of people.filter((p) => p.open > 0 && (p.projects?.length ?? 0) > 0)) {
      expect(getByRole("button", { name: `Expandir ${person.name}` })).toBeTruthy();
    }
    const filters = getByRole("region", { name: "Filtros" });
    for (const name of ["Estado", "Tramo", "Alcance"]) expect(within(filters).getByRole("radiogroup", { name })).toBeTruthy();
    expect(getAllByRole("radiogroup").length).toBeGreaterThanOrEqual(3);
  });

  it("table headers are column headers and the person cell is a row header", () => {
    const { getByRole } = renderAnalitico();
    const table = getByRole("table", { name: "Personas por tramo" });
    const headers = Array.from(table.querySelectorAll("thead th"));
    expect(headers).toHaveLength(10);
    expect(headers.every((th) => th.getAttribute("scope") === "col")).toBe(true);
    expect(headers.map((th) => th.textContent)).toEqual(
      expect.arrayContaining(["Persona", "Puesto", "Abiertas", "Vencidas", "Carga", "Disponibilidad"]),
    );
    const rowHeaders = Array.from(table.querySelectorAll('tbody th[scope="row"]'));
    expect(rowHeaders.length).toBe(people.length);
  });

  it("at 390 px the table scrolls inside its card, not the page", () => {
    window.innerWidth = 390;
    const { getByRole, container } = renderAnalitico();
    const table = getByRole("table", { name: "Personas por tramo" });
    expect(table.parentElement?.className).toContain("overflow-x-auto");
    expect(table.closest('[data-slot="card"]')?.className).toContain("overflow-hidden");
    // Only the table carries a minimum width; nothing outside the scroller does.
    const fixedWidth = Array.from(container.querySelectorAll<HTMLElement>("[class*='min-w-[']")).filter(
      (el) => el !== table && !table.parentElement?.contains(el),
    );
    expect(fixedWidth).toEqual([]);
  });
});
