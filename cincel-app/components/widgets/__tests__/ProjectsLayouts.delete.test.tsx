// @vitest-environment happy-dom
/**
 * "Eliminar proyecto" (#1050) in the Proyectos row and card menus of every
 * style: offered with `canDeleteProject` only; picking it opens the
 * confirmation that names the project.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { act, cleanup, screen } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/proyectos",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() }) }));
vi.mock("@/lib/actions/projects-actions", () => ({
  setProjectCurrentEtapaAction: vi.fn(),
  updateProjectAction: vi.fn(),
  deleteProjectAction: vi.fn(),
  restoreProjectAction: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/proyectos-actions", () => ({
  getProyectosPageData: vi.fn(() => new Promise(() => {})),
  getProjectDeletePreview: vi.fn(() => new Promise(() => {})),
  getDeletedProjects: vi.fn(async () => []),
}));
vi.mock("@/lib/actions/tasks-actions", () => ({}));
vi.mock("@/lib/actions/page-data/tareas-actions", () => ({
  getTareasListPage: vi.fn(() => new Promise(() => {})),
  getTareasListFirstPages: vi.fn(() => new Promise(() => {})),
}));
vi.mock("@/lib/actions/page-data/catalog-actions", () => ({ fetchCatalogStaff: vi.fn(() => new Promise(() => {})) }));
vi.mock("@/lib/actions/preferences-actions", () => ({ updateMyPreferencesAction: vi.fn(async () => ({})) }));
vi.mock("@/lib/etapas/compat", () => {
  const slots: Record<string, 1 | 2 | 3> = { presale: 1, diseno: 2, construccion: 3 };
  return {
    canSeeAdminData: () => false,
    listEtapas: async () => [],
    etapaLabel: (key: string) => key,
    etapaColorSlot: (key: string) => slots[key] ?? null,
    etapaColorVar: (key: string) => (slots[key] ? `var(--chart-${slots[key]})` : "var(--muted-foreground)"),
    phaseLabel: () => null,
  };
});

import { PORTFOLIO, portfolioPageData } from "@/components/proyectos/projects-portfolio.fixtures";
import { StyleProvider } from "@/components/shell/StyleProvider";
import { ProjectsAnaliticoLayout } from "@/components/widgets/ProjectsAnaliticoLayout";
import { ProjectsEsencialLayout } from "@/components/widgets/ProjectsEsencialLayout";
import { ProjectsVisualLayout } from "@/components/widgets/ProjectsVisualLayout";
import type { SessionAccess } from "@/lib/auth/session";
import { qk } from "@/lib/query/keys";
import { createTestQueryClient, renderWithQueryClient } from "@/lib/query/test-utils";
import { resetProyectosDashboard } from "@/lib/stores/proyectos-dashboard-store";
import { useSessionStore } from "@/lib/stores/session-store";

const STYLES = [
  { style: "analitico" as const, render: () => <ProjectsAnaliticoLayout /> },
  { style: "esencial" as const, render: () => <ProjectsEsencialLayout /> },
  { style: "visual" as const, render: () => <ProjectsVisualLayout /> },
];

function signIn(access: string) {
  useSessionStore.setState({
    access: {
      status: "active",
      user: { id: "s1", name: "Ana", email: "ana@example.test", role: access, area: null, active: true, access },
    } as unknown as SessionAccess,
  });
}

function renderStyle(style: (typeof STYLES)[number]["style"], node: ReactNode) {
  const client = createTestQueryClient();
  client.setQueryData(qk.proyectos.list(), portfolioPageData({ portfolio: PORTFOLIO }));
  return renderWithQueryClient(
    <StyleProvider style={style} scope="staff">
      {node}
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
  resetProyectosDashboard();
  useSessionStore.setState({ access: { status: "guest", user: null } });
});

describe.each(STYLES)("Proyectos $style · Eliminar proyecto", ({ style, render }) => {
  it("offers it with canDeleteProject and opens the confirmation", async () => {
    signIn("Dirección");
    renderStyle(style, render());
    const [trigger] = screen.getAllByRole("button", { name: "Acciones de «Casa Lomas»" });
    act(() => trigger.click());
    act(() => screen.getByRole("menuitem", { name: "Eliminar proyecto" }).click());
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("¿Eliminar «Casa Lomas»?");
    expect(dialog.textContent).toContain("La carpeta de Drive no se borra.");
  });

  it("has no menu without canDeleteProject", () => {
    signIn("Colaborador");
    renderStyle(style, render());
    expect(screen.queryByRole("button", { name: "Acciones de «Casa Lomas»" })).toBeNull();
  });
});
