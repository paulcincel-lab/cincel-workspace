// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";

const PID = "22222222-2222-4222-8222-222222222222";

const state = vi.hoisted(() => ({
  user: { member: { id: "s1" }, email: "ana@cincel.mx", access: "Administrador" } as unknown,
  shell: null as unknown,
  resumen: null as unknown,
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => {
    if (!state.user) throw new Error("UNAUTHENTICATED");
    return state.user;
  }),
}));
const loaders = vi.hoisted(() => ({
  loadProyectoResumen: vi.fn(async () => state.resumen),
  loadProyectoShell: vi.fn(async () => state.shell),
  loadProyectoTareas: vi.fn(async () => ({ tasks: [{ id: "t1" }], includeAdmin: true })),
  loadProyectoHistory: vi.fn(async () => ({ events: [{ id: "h1" }], nextCursor: null })),
}));
vi.mock("@/lib/loaders/proyectos", () => ({
  loadProyectoResumen: loaders.loadProyectoResumen,
  loadProyectoTareas: loaders.loadProyectoTareas,
  loadProyectoHistory: loaders.loadProyectoHistory,
}));
vi.mock("@/lib/loaders/proyectos-shell", () => ({ loadProyectoShell: loaders.loadProyectoShell }));
// The client query functions: the first render must never need them.
const actions = vi.hoisted(() => ({
  getProyectoResumenData: vi.fn(),
  getProyectoTareasData: vi.fn(),
  getProyectoHistoryPage: vi.fn(),
  getProyectoShell: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/proyectos-actions", () => ({
  getProyectoResumenData: actions.getProyectoResumenData,
  getProyectoTareasData: actions.getProyectoTareasData,
  getProyectoHistoryPage: actions.getProyectoHistoryPage,
}));
vi.mock("@/lib/actions/page-data/proyectos-shell-actions", () => ({ getProyectoShell: actions.getProyectoShell }));
vi.mock("@/components/proyectos/ProjectTabs", () => ({
  ProjectTabs: (props: {
    active: string;
    showEstilo?: boolean;
    project: { name: string };
    counts: { tareas: number; archivos: number; clientes: number };
  }) => (
    <div
      data-testid="tabs"
      data-active={props.active}
      data-estilo={String(Boolean(props.showEstilo))}
      data-archivos={String(props.counts.archivos)}
    >
      {props.project.name}
    </div>
  ),
}));
vi.mock("@/components/proyectos/ProjectSummary", async () => {
  const { useQueryClient } = await import("@tanstack/react-query");
  const { qk } = await import("@/lib/query/keys");
  return {
    ProjectSummary: ({ projectId }: { projectId: string }) => {
      const client = useQueryClient();
      const data = client.getQueryData<{ project: { name: string } } | null>(qk.proyectos.resumen(projectId));
      const tareas = client.getQueryData<{ tasks: { id: string }[] } | null>(qk.proyectos.tab(projectId, "tareas"));
      const history = client.getQueryData<{ pages: { events: { id: string }[] }[] }>(qk.proyectos.history(projectId));
      return (
        <div
          data-testid="summary"
          data-tasks={tareas?.tasks.map((t) => t.id).join(",") ?? ""}
          data-events={history?.pages[0]?.events.map((e) => e.id).join(",") ?? ""}
        >
          {data?.project.name ?? "empty"}
        </div>
      );
    },
  };
});

import { renderWithQueryClient } from "@/lib/query/test-utils";

import ProjectPage from "./page";

const SHELL = {
  detail: { id: PID },
  project: { id: PID, name: "Local Espinopapa", tramo: null },
  counts: { tareas: 1, archivos: 0, clientes: 0 },
  canManagePortal: false,
};
const RESUMEN = {
  project: { id: PID, name: "Local Espinopapa" },
  files: [{ id: "f1" }, { id: "f2" }],
};

async function renderPage(id = PID) {
  return renderWithQueryClient(await ProjectPage({ params: Promise.resolve({ id }) }));
}

beforeEach(() => {
  state.user = { member: { id: "s1" }, email: "ana@cincel.mx", access: "Administrador" };
  state.shell = SHELL;
  state.resumen = RESUMEN;
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("/proyectos/[id]", () => {
  it("renders the tabs (Resumen, with the style switch) and the Resumen from the hydrated cache", async () => {
    await renderPage();
    const tabs = screen.getByTestId("tabs");
    expect(tabs.getAttribute("data-active")).toBe("resumen");
    expect(tabs.getAttribute("data-estilo")).toBe("true");
    expect(screen.getByTestId("summary").textContent).toBe("Local Espinopapa");
  });

  it("prefetches four keys (shell, Resumen, task list, history) through the loaders, with 0 client action calls", async () => {
    await renderPage();
    expect(loaders.loadProyectoShell).toHaveBeenCalledTimes(1);
    expect(loaders.loadProyectoShell).toHaveBeenCalledWith(state.user, { id: PID });
    expect(loaders.loadProyectoResumen).toHaveBeenCalledTimes(1);
    expect(loaders.loadProyectoResumen).toHaveBeenCalledWith(state.user, { id: PID });
    expect(loaders.loadProyectoTareas).toHaveBeenCalledTimes(1);
    expect(loaders.loadProyectoTareas).toHaveBeenCalledWith(state.user, { id: PID });
    expect(loaders.loadProyectoHistory).toHaveBeenCalledTimes(1);
    expect(loaders.loadProyectoHistory).toHaveBeenCalledWith(state.user, { id: PID, cursor: null });
    // The hydrated cache answers the Visual's task list and "Actividad reciente".
    expect(screen.getByTestId("summary").getAttribute("data-tasks")).toBe("t1");
    expect(screen.getByTestId("summary").getAttribute("data-events")).toBe("h1");
    expect(actions.getProyectoResumenData).not.toHaveBeenCalled();
    expect(actions.getProyectoTareasData).not.toHaveBeenCalled();
    expect(actions.getProyectoHistoryPage).not.toHaveBeenCalled();
    expect(actions.getProyectoShell).not.toHaveBeenCalled();
  });

  it("fills the shell's Archivos count from the Resumen's root listing", async () => {
    await renderPage();
    expect(screen.getByTestId("tabs").getAttribute("data-archivos")).toBe("2");
  });

  it("shows «Proyecto no encontrado» when the project can't be read", async () => {
    state.resumen = null;
    state.shell = null;
    await renderPage();
    expect(screen.getByRole("heading", { name: "Proyecto no encontrado" })).toBeTruthy();
    expect(screen.queryByTestId("tabs")).toBeNull();
  });

  it("shows «Proyecto no encontrado» for an id that is not a UUID, without reading", async () => {
    await renderPage("nope");
    expect(screen.getByRole("heading", { name: "Proyecto no encontrado" })).toBeTruthy();
    expect(loaders.loadProyectoResumen).not.toHaveBeenCalled();
    expect(loaders.loadProyectoShell).not.toHaveBeenCalled();
    expect(loaders.loadProyectoTareas).not.toHaveBeenCalled();
  });

  it("asks to sign in without a session", async () => {
    state.user = null;
    await renderPage();
    expect(screen.getByRole("heading", { name: "Sin permiso" })).toBeTruthy();
  });
});
