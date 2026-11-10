// @vitest-environment happy-dom
import { cleanup, fireEvent, screen } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams(nav.search),
}));

vi.mock("@/lib/actions/page-data/tareas-actions", () => ({
  getTareasPageData: vi.fn(),
  getTareasFacets: vi.fn(),
  getTareasBoard: vi.fn(),
  getTareasListPage: vi.fn(),
  getTareasBoardColumn: vi.fn(),
}));

vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => ({
    member: { id: "11111111-1111-4111-8111-111111111111", name: "Ana" },
    access: "Colaborador",
  }),
}));

vi.mock("@/lib/auth/permissions", () => ({
  resolveActivitiesCapabilities: () => ({ canViewActivities: true, canCreateActivity: true }),
}));

vi.mock("@/lib/tramos/compat", () => ({
  tramoColorVar: (key: string) => `var(--chart-${key === "presale" ? 1 : key === "diseno" ? 2 : 3})`,
}));

// The view bodies (R3-04 to R3-06) have their own a11y tests; here they render
// the shell parts they receive: the header (real `PageHeader`) and the filters.
vi.mock("./TareasTablero", async () => {
  const { PageHeader } = await import("@/components/shell/PageHeader");
  return {
    TABLERO_DESCRIPTION: "Todas los tramos en un solo lugar. Arrastra una tarjeta para cambiar su estatus.",
    TareasTablero: (p: { header: { title: string; description?: string; actions?: ReactNode }; filters: ReactNode }) => (
      <main>
        <PageHeader {...p.header} />
        {p.filters}
      </main>
    ),
  };
});
vi.mock("./TareasLista", async () => {
  const { PageHeader } = await import("@/components/shell/PageHeader");
  return {
    TareasLista: (p: { header: { title: string; description?: string; actions?: ReactNode }; filters: ReactNode }) => (
      <main>
        <PageHeader {...p.header} />
        {p.filters}
      </main>
    ),
  };
});
// The task sheet (R3-08) opens from `?tarea=`; none here.
vi.mock("./TaskSheet", () => ({ TaskSheetRoute: () => null }));
// Visual and Esencial have their own layouts and a11y tests; this file renders Analítico, which keeps the views.
vi.mock("./TareasVisual", () => ({ TareasVisual: () => <main /> }));
vi.mock("./TareasEsencial", () => ({ TareasEsencial: () => <main /> }));
vi.mock("./TareasCalendario", () => ({
  CALENDARIO_DESCRIPTION: "Fechas de entrega y agenda del equipo. Las horas con ≈ son estimadas.",
  TareasCalendario: () => <div />,
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import { qk } from "@/lib/query/keys";
import { tareasListFiltersOf, tareasPageKeyInputOf } from "@/lib/query/options/tareas";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import type { TareasFacets, TareasPageData } from "@/lib/tareas/page-data";
import { parseTareasQuery, toTareasSearch, type TareasQuery } from "@/lib/tareas/query";
import type { WorkflowRef } from "@/lib/types/core";
import { THEME_IDS } from "@/lib/ui/themes";

import { TareasClient } from "./TareasClient";
import { getCurrentAuthenticatedUser } from "@/lib/auth/auth-service";
import { seedSessionUser } from "@/tests/helpers/session-user";

// The components read the signed-in user from the session store; seed it with the mocked user.
beforeEach(() => seedSessionUser(getCurrentAuthenticatedUser()));

const TRAMOS: WorkflowRef[] = [
  { id: "w1", key: "presale", name: "Presale", sortOrder: 1 },
  { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 },
  { id: "w3", key: "construccion", name: "Construcción", sortOrder: 3 },
];

const FACETS: TareasFacets = {
  total: 1,
  byTramo: { presale: 1 },
  projects: [{ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Guadalajara 83", count: 1 }],
};
const NO_FACETS: TareasFacets = { total: 0, byTramo: {}, projects: [] };

const STAFF = [{ id: "22222222-2222-4222-8222-222222222222", name: "Luis Paz" }];

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout and rendering, which happy-dom doesn't provide.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

/** The URL holds `patch`; the cache is what `/tareas` hydrates for it. */
function renderClient(patch: Partial<TareasQuery>, facets: TareasFacets = FACETS) {
  nav.search = toTareasSearch(patch).replace(/^\?/, "");
  const query = parseTareasQuery(new URLSearchParams(nav.search));
  const client = createTestQueryClient();
  const page: TareasPageData = { facets, tramos: TRAMOS, staff: STAFF };
  client.setQueryData(qk.tareas.page(tareasPageKeyInputOf(query, "analitico")), page);
  client.setQueryData(qk.tareas.facets(tareasListFiltersOf(query)), facets);
  return renderWithQueryClient(
    <StyleProvider style="analitico" scope="staff">
      <TareasClient />
    </StyleProvider>,
    { client },
  );
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
});

const MODES = ["light", "dark"] as const;

describe("Tareas shell accessibility", () => {
  for (const theme of THEME_IDS) {
    for (const mode of MODES) {
      it(`has no serious axe violations in ${theme} / ${mode} for the three views`, async () => {
        document.documentElement.setAttribute("data-theme-id", theme);
        document.documentElement.setAttribute("data-theme", mode);
        for (const vista of ["tablero", "lista", "calendario"] as const) {
          const { container } = renderClient({ vista, tramo: "presale" });
          expect(await seriousViolations(container)).toEqual([]);
          cleanup();
        }
      });
    }
  }

  it("has no serious axe violations with a combobox open", async () => {
    renderClient({ vista: "lista" });
    fireEvent.click(screen.getByRole("button", { name: "Responsable: Todos" }));
    await screen.findByRole("listbox");
    expect(await seriousViolations(document.body)).toEqual([]);
  });

  it("has no serious axe violations on the empty state", async () => {
    const { container } = renderClient({ vista: "calendario", tramo: "diseno" }, NO_FACETS);
    expect(await seriousViolations(container)).toEqual([]);
  });

  it("renders no Vista switch; the header keeps a single h1", () => {
    renderClient({ vista: "calendario" });
    expect(screen.queryByRole("navigation", { name: "Vista" })).toBeNull();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
});
