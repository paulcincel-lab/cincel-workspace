// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/tareas",
  useSearchParams: () => new URLSearchParams(),
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
// The dialog (R3-09) has its own a11y test; closed here.
vi.mock("./NewTaskDialog", () => ({ NewTaskDialog: () => null }));
vi.mock("./TareasCalendario", () => ({
  CALENDARIO_DESCRIPTION: "Fechas de entrega y agenda del equipo. Las horas con ≈ son estimadas.",
  TareasCalendario: () => <div />,
}));

import { DEFAULT_TAREAS_QUERY, type TareasQuery } from "@/lib/tareas/query";
import type { TaskListItem, WorkflowRef } from "@/lib/types/core";
import type { StaffOption } from "@/lib/types/redesign";
import { THEME_IDS } from "@/lib/ui/themes";

import { TareasClient } from "./TareasClient";

const TRAMOS: WorkflowRef[] = [
  { id: "w1", key: "presale", name: "Presale", sortOrder: 1 },
  { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 },
  { id: "w3", key: "construccion", name: "Construcción", sortOrder: 3 },
];

const TASKS = [
  {
    id: "t1",
    title: "Plano de acabados",
    status: "pendiente",
    workflow: TRAMOS[0],
    project: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "Guadalajara 83", clientName: null },
  },
] as unknown as TaskListItem[];

const STAFF = [{ id: "22222222-2222-4222-8222-222222222222", name: "Luis", lastName: "Paz", suggested: false }] as unknown as StaffOption[];

async function seriousViolations(container: HTMLElement) {
  // Color contrast needs real layout and rendering, which happy-dom doesn't provide.
  const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

function renderClient(patch: Partial<TareasQuery>, tasks: TaskListItem[] = TASKS) {
  return render(
    <TareasClient query={{ ...DEFAULT_TAREAS_QUERY, ...patch }} initial={{ tasks }} staff={STAFF} tramos={TRAMOS} />,
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
    const { container } = renderClient({ vista: "calendario", tramo: "diseno" }, []);
    expect(await seriousViolations(container)).toEqual([]);
  });

  it("names the view switch and marks the active view", () => {
    renderClient({ vista: "calendario" });
    const nav = screen.getByRole("navigation", { name: "Vista" });
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe("Calendario");
  });
});
