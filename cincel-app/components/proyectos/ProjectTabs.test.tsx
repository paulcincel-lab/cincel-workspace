// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/proyectos/p1", useRouter: () => router }));
vi.mock("@/lib/actions/projects-actions", () => ({
  deleteProjectAction: vi.fn(async (id: string) => ({ ok: true, data: { id, deletedTaskCount: 3 } })),
  restoreProjectAction: vi.fn(async (id: string) => ({ ok: true, data: { id, restoredTaskCount: 3 } })),
}));
vi.mock("@/lib/actions/page-data/proyectos-actions", () => ({
  getProjectDeletePreview: vi.fn(async (id: string) => ({ id, name: "Local Espinopapa", taskCount: 3, openTaskCount: 2 })),
  getDeletedProjects: vi.fn(async () => []),
}));
// Custom permission overrides live in localStorage; stub it so the tests use the default matrix.
vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn().mockReturnValue(null),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn((_key: string, fallback: unknown) => fallback),
}));
vi.mock("@/components/shell/EstiloSwitch", () => ({
  EstiloSwitch: () => <div data-testid="estilo-switch" />,
}));
vi.mock("@/components/widgets/TramoBadge", () => ({
  TramoBadge: ({ tramo }: { tramo: { name: string } }) => <span data-testid="tramo-chip">{tramo.name}</span>,
}));

import type { SessionAccess } from "@/lib/auth/session";
import { deleteProjectAction } from "@/lib/actions/projects-actions";
import { createTestQueryClient } from "@/lib/query/test-utils";
import { resetNewTaskUi, useNewTaskUi } from "@/lib/stores/new-task-store";
import { useSessionStore } from "@/lib/stores/session-store";

import { ProjectTabs, type ProjectTabsProps, newTaskHref, projectDescription, reportHref } from "./ProjectTabs";

const PROJECT: ProjectTabsProps["project"] = {
  id: "p1",
  name: "Local Espinopapa",
  tramo: { id: "w3", key: "construccion", name: "Construcción", sortOrder: 3 },
  projectType: "Local comercial",
  addressCity: "CDMX",
  manager: { id: "s1", name: "Paul Langarica" },
};

const COUNTS = { tareas: 39, archivos: 48, clientes: 2 };

function renderTabs(props: Partial<ProjectTabsProps> = {}) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <ProjectTabs project={PROJECT} active="resumen" counts={COUNTS} canManagePortal={false} {...props} />
    </QueryClientProvider>,
  );
}

/** The tab link whose text starts with `label` (Base UI gives each tab role="tab"). */
function tab(label: string): HTMLAnchorElement | null {
  const nav = screen.getByRole("navigation", { name: "Secciones del proyecto" });
  return (
    Array.from(nav.querySelectorAll("a")).find((a) => a.textContent?.trim().startsWith(label)) ?? null
  );
}

afterEach(() => {
  cleanup();
  useSessionStore.setState({ access: { status: "guest", user: null } });
  resetNewTaskUi();
});

describe("ProjectTabs", () => {
  it("renders the tabs in order with counts, Resumen at the project URL and Ficha last", () => {
    renderTabs({ canManagePortal: true });
    const nav = screen.getByRole("navigation", { name: "Secciones del proyecto" });
    const labels = Array.from(nav.querySelectorAll("a")).map((a) => a.textContent?.trim());
    expect(labels).toEqual(["Resumen", "Tareas39", "Cronograma", "Archivos48", "Clientes2", "Ficha"]);
    expect(tab("Resumen")?.getAttribute("href")).toBe("/proyectos/p1");
    expect(tab("Tareas")?.getAttribute("href")).toBe("/proyectos/p1/tareas");
    expect(tab("Ficha")?.getAttribute("href")).toBe("/proyectos/p1/ficha");
  });

  it("hides the Clientes tab without portal.manageAccess", () => {
    renderTabs({ canManagePortal: false });
    expect(tab("Clientes")).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Clientes" })).toBeNull();
  });

  it("hides the Clientes tab even when the session would allow it, if the server said no", () => {
    const user = { id: "s1", name: "Ana", email: "ana@example.test", role: "Administrador", area: null, active: true, access: "Administrador" };
    useSessionStore.setState({ access: { status: "active", user } as unknown as SessionAccess });
    renderTabs({ canManagePortal: false });
    expect(tab("Clientes")).toBeNull();
  });

  it("shows the Clientes tab with its count with portal.manageAccess", () => {
    renderTabs({ canManagePortal: true });
    expect(tab("Clientes")?.getAttribute("href")).toBe("/proyectos/p1/clientes");
  });

  it("marks the active tab", () => {
    renderTabs({ active: "archivos" });
    expect(tab("Archivos")?.getAttribute("aria-current")).toBe("page");
    expect(tab("Resumen")?.getAttribute("aria-current")).toBeNull();
  });

  it("renders the header: back link, name, description and «Nueva tarea» with create permission", () => {
    useSessionStore.setState({
      access: {
        status: "active",
        user: { id: "s1", name: "Ana", email: "ana@example.test", role: "Administrador", area: null, active: true, access: "Administrador" },
      } as unknown as SessionAccess,
    });
    renderTabs({ project: { ...PROJECT, clientName: "Grupo Espinopapa", endDate: "2027-04-30" } });
    expect(screen.getByRole("heading", { level: 1, name: "Local Espinopapa" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "← Proyectos" }).getAttribute("href")).toBe("/proyectos");
    expect(screen.getByText(/Grupo Espinopapa/).closest("p")?.textContent).toBe(
      "Grupo Espinopapa · CDMX · entrega final 30 abr 2027",
    );
    const create = screen.getByRole("button", { name: "Nueva tarea" });
    act(() => create.click());
    expect(useNewTaskUi.getState().open).toBe(true);
    expect(useNewTaskUi.getState().defaults).toMatchObject({ projectId: "p1" });
    expect(reportHref("p1")).toBe("/proyectos/p1/cronograma/reporte");
    expect(newTaskHref("p1")).toBe("/tareas?proyecto=p1&nueva=1");
  });

  it("hides «Nueva tarea» without create permission and leaves out missing description parts", () => {
    renderTabs({ project: { id: "p1", name: "Sin datos", tramo: null } });
    expect(screen.queryByRole("button", { name: "Nueva tarea" })).toBeNull();
    expect(screen.queryByText(/entrega final/)).toBeNull();
    expect(projectDescription({ clientName: null, addressCity: "CDMX", endDate: null }).map((p) => p.text)).toEqual(["CDMX"]);
  });

  it("keeps the ?estilo= override on the back link", () => {
    window.history.replaceState(null, "", "/proyectos/p1?estilo=visual");
    renderTabs();
    expect(screen.getByRole("link", { name: "← Proyectos" }).getAttribute("href")).toBe("/proyectos?estilo=visual");
    window.history.replaceState(null, "", "/");
  });

  it("renders EstiloSwitch only when asked", () => {
    renderTabs();
    expect(screen.queryByTestId("estilo-switch")).toBeNull();
    cleanup();
    renderTabs({ showEstilo: true });
    expect(screen.getByTestId("estilo-switch")).toBeTruthy();
  });

  describe("Eliminar proyecto (#1050)", () => {
    const signIn = (access: string) =>
      useSessionStore.setState({
        access: {
          status: "active",
          user: { id: "s1", name: "Ana", email: "ana@example.test", role: access, area: null, active: true, access },
        } as unknown as SessionAccess,
      });

    it("is not offered without canDeleteProject", () => {
      signIn("Colaborador");
      renderTabs();
      act(() => screen.getByRole("button", { name: "Más opciones" }).click());
      expect(screen.queryByRole("menuitem", { name: "Eliminar proyecto" })).toBeNull();
    });

    it("asks for the name when the project has open tasks, then deletes and goes back to Proyectos", async () => {
      signIn("Administrador");
      renderTabs();
      act(() => screen.getByRole("button", { name: "Más opciones" }).click());
      act(() => screen.getByRole("menuitem", { name: "Eliminar proyecto" }).click());
      const dialog = await screen.findByRole("alertdialog");
      expect(dialog.textContent).toContain("¿Eliminar «Local Espinopapa»?");
      await waitFor(() =>
        expect(dialog.textContent).toContain(
          "Se eliminan también sus 3 tareas y se quita el acceso al portal de sus clientes.",
        ),
      );
      expect(dialog.textContent).toContain("La carpeta de Drive no se borra.");
      const confirm = screen.getByRole("button", { name: "Eliminar" }) as HTMLButtonElement;
      expect(confirm.disabled).toBe(true);
      fireEvent.change(screen.getByRole("textbox", { name: "Nombre del proyecto" }), {
        target: { value: "local espinopapa" },
      });
      expect(confirm.disabled).toBe(false);
      act(() => confirm.click());
      await waitFor(() => expect(deleteProjectAction).toHaveBeenCalledWith("p1"));
      await waitFor(() => expect(router.push).toHaveBeenCalledWith("/proyectos"));
    });
  });
});
