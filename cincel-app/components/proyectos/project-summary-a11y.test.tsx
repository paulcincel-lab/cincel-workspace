// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/proyectos/p1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/actions/page-data/proyectos-actions", () => ({
  getProyectoResumenData: vi.fn(),
  getProyectoTareasData: vi.fn(),
  getProyectoHistoryPage: vi.fn(async () => ({ events: [], nextCursor: null })),
  // The Analítico quick-add hint (#997): someone under 60 % for an overloaded responsable.
  getProyectoAssigneeSuggestion: vi.fn(async () => ({
    staffId: "s3",
    name: "Ana López",
    loadPct: 40,
    phaseName: "Obra negra",
    projectName: "Casa Roble",
  })),
}));
vi.mock("@/lib/actions/tasks-actions", () => ({ createUserTaskAction: vi.fn() }));
// The Visual quick-add (#984): created tasks come back through the task list.
vi.mock("@/components/tareas/quick-add-create", () => ({
  useQuickAddCreate: () => ({ create: vi.fn(async () => ({ id: "t-new", title: "Nueva" })), undo: vi.fn() }),
}));
vi.mock("@/lib/stores/quick-add-store", () => ({
  useQuickAddRecent: (select: (state: { recent: string[] }) => unknown) => select({ recent: [] }),
}));
// The quick-add rows of the Analítico layout need a viewer who may create tasks.
vi.mock("@/lib/auth/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/permissions")>();
  return {
    ...actual,
    resolveActivitiesCapabilities: (user: Parameters<typeof actual.resolveActivitiesCapabilities>[0]) => ({
      ...actual.resolveActivitiesCapabilities(user),
      canViewActivities: true,
      canCreateActivity: true,
      canChangeResponsible: true,
    }),
  };
});
vi.mock("@/lib/actions/preferences-actions", () => ({ updateMyPreferencesAction: vi.fn(async () => ({})) }));
// Custom permission overrides live in localStorage; stub it so the tests use the default matrix.
vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn().mockReturnValue(null),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn((_key: string, fallback: unknown) => fallback),
}));
vi.mock("@/lib/tramos/compat", () => {
  const slots: Record<string, 1 | 2 | 3> = { presale: 1, diseno: 2, construccion: 3 };
  const labels: Record<string, string> = { presale: "Presale", diseno: "Diseño", construccion: "Construcción" };
  return {
    canSeeAdminData: () => true,
    listTramos: async () => [],
    tramoLabel: (key: string) => labels[key] ?? key,
    tramoColorSlot: (key: string) => slots[key] ?? null,
    tramoColorVar: (key: string) => (slots[key] ? `var(--chart-${slots[key]})` : "var(--muted-foreground)"),
    phaseLabel: () => null,
  };
});

import { StyleProvider } from "@/components/shell/StyleProvider";
import { QueryClientProvider } from "@tanstack/react-query";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient } from "@/lib/query/test-utils";
import { HISTORY_EVENTS, TASK_ROWS } from "@/tests/unit/fixtures/project-summary";
import type { PresentationStyle } from "@/lib/types/redesign";
import { THEME_IDS } from "@/lib/ui/themes";
import { fixtureSummaryInput } from "@/tests/unit/fixtures/project-summary";

import { ProjectSummaryContent } from "./ProjectSummary";
import { ProjectTabs } from "./ProjectTabs";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];
const MODES = ["light", "dark"] as const;

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout and rendering, which happy-dom doesn't provide;
  // the token pairs are covered by `CONTRAST_PAIRS` / `checkContrast` in lib/ui/contrast.ts.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

beforeAll(() => {
  Element.prototype.scrollIntoView ??= () => {};
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-theme-id");
  document.documentElement.classList.remove("dark");
});

function setTheme(theme: string, mode: "light" | "dark") {
  document.documentElement.setAttribute("data-theme-id", theme);
  document.documentElement.setAttribute("data-theme", mode);
  document.documentElement.classList.toggle("dark", mode === "dark");
}

function Page({ style, restricted }: { style: PresentationStyle; restricted: boolean }) {
  const input = fixtureSummaryInput(restricted ? { showBudget: false, showClientContacts: false } : {});
  // The Analítico layout (and the Visual one) read the project's task rows, prefetched by the page.
  const client = createTestQueryClient();
  client.setQueryData(qk.proyectos.tab(input.project.id, "tareas"), { tasks: TASK_ROWS, includeAdmin: !restricted });
  return (
    <QueryClientProvider client={client}>
      <StyleProvider style={style} scope="staff">
        <main>
          <ProjectTabs
            project={{
              id: input.project.id,
              name: input.project.name,
              tramo: input.project.currentWorkflow,
              projectType: input.project.projectType,
              addressCity: input.project.addressCity,
              manager: input.project.manager,
            }}
            active="resumen"
            counts={{ tareas: 39, archivos: 3, clientes: 2 }}
            canManagePortal={!restricted}
            showEstilo
          />
          <ProjectSummaryContent data={input} />
        </main>
      </StyleProvider>
    </QueryClientProvider>
  );
}

describe("Proyecto · Resumen accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      it(`has no serious axe violations in ${theme} / ${mode} for the three styles`, async () => {
        setTheme(theme, mode);
        for (const style of STYLES) {
          for (const restricted of [false, true]) {
            const { container, unmount } = render(<Page style={style} restricted={restricted} />);
            expect(await seriousViolations(container)).toEqual([]);
            unmount();
          }
        }
      });
    }
  }
});

describe("Resumen Analítico accessibility (#997)", () => {
  for (const mode of MODES) {
    it(`Resumen Analítico has no serious or critical axe violations (${mode})`, async () => {
      setTheme(THEME_IDS[0]!, mode);
      for (const restricted of [false, true]) {
        const { container, unmount } = render(<Page style="analitico" restricted={restricted} />);
        expect(await seriousViolations(container)).toEqual([]);
        unmount();
      }
    });
  }

  it("tables have captions and scoped headers", () => {
    const { container } = render(<Page style="analitico" restricted={false} />);
    const tables = Array.from(container.querySelectorAll("table"));
    expect(tables.length).toBeGreaterThanOrEqual(3);
    for (const table of tables) {
      const named = table.querySelector("caption") !== null || table.hasAttribute("aria-label") || table.hasAttribute("aria-labelledby");
      expect(named).toBe(true);
      for (const th of Array.from(table.querySelectorAll("thead th"))) expect(th.getAttribute("scope")).toBe("col");
    }
  });

  it("hint box is a status region", async () => {
    render(<Page style="analitico" restricted={false} />);
    fireEvent.change(screen.getByLabelText("Nueva tarea en Construcción"), { target: { value: "Revisar plafones @paul" } });
    const hint = await screen.findByRole("status", {}, { timeout: 2000 });
    expect(hint.textContent).toContain("Asistente:");
  });
});

describe("Resumen Visual accessibility (#995)", () => {
  function VisualPage({ restricted }: { restricted: boolean }) {
    const input = fixtureSummaryInput(restricted ? { showBudget: false, showClientContacts: false } : {});
    const client = createTestQueryClient();
    client.setQueryData(qk.proyectos.tab(input.project.id, "tareas"), { tasks: TASK_ROWS, includeAdmin: !restricted });
    client.setQueryData(qk.proyectos.history(input.project.id), {
      pages: [{ events: HISTORY_EVENTS, nextCursor: null }],
      pageParams: [null],
    });
    return (
      <QueryClientProvider client={client}>
        <StyleProvider style="visual" scope="staff">
          <main>
            <ProjectSummaryContent data={input} />
          </main>
        </StyleProvider>
      </QueryClientProvider>
    );
  }

  for (const mode of MODES) {
    it(`Resumen Visual has no serious or critical axe violations (${mode})`, async () => {
      setTheme(THEME_IDS[0]!, mode);
      for (const restricted of [false, true]) {
        const { container, unmount } = render(<VisualPage restricted={restricted} />);
        expect(await seriousViolations(container)).toEqual([]);
        unmount();
      }
    });
  }

  it("each chart has role img, label and a hidden data table", () => {
    render(<VisualPage restricted={false} />);
    for (const name of ["Tareas por estatus", "Avance por tramo", "Avance contra plan"]) {
      const region = screen.getByRole("region", { name });
      const chart = region.querySelector('[role="img"]');
      expect(chart?.getAttribute("aria-label")?.length ?? 0).toBeGreaterThan(0);
      const table = region.querySelector("table.sr-only");
      expect(table).not.toBeNull();
      expect(table?.querySelector("caption")).not.toBeNull();
      expect(table?.querySelectorAll("tbody tr").length ?? 0).toBeGreaterThan(0);
    }
    // The hero ring and the load rings are labelled images too.
    expect(screen.getByRole("img", { name: /^Avance 82 %/ })).toBeTruthy();
    expect(screen.getAllByRole("img", { name: /^Carga \d+ %$/ }).length).toBeGreaterThan(0);
  });

  it("external links announce new tab", () => {
    const { container } = render(<VisualPage restricted={false} />);
    const external = Array.from(container.querySelectorAll('a[target="_blank"]'));
    expect(external.length).toBeGreaterThan(0);
    for (const link of external) {
      expect(link.textContent).toContain("(se abre en una pestaña nueva)");
      expect(link.getAttribute("rel")).toContain("noopener");
    }
  });
});
