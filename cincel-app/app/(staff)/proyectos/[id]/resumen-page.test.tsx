// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";

const PID = "22222222-2222-4222-8222-222222222222";

const state = vi.hoisted(() => ({
  user: { member: { id: "s1" }, email: "ana@cincel.mx", access: "Administrador" } as unknown,
  shell: null as unknown,
  resumen: null as unknown,
  style: "visual" as string,
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
  loadProyectoResumenSummary: vi.fn(async () => SUMMARY),
  loadTareasListFirstPages: vi.fn(async (_user: unknown, input: { lists: unknown[] }) =>
    input.lists.map(() => ({ rows: [{ id: "t-admin" }], nextCursor: null, total: 1 })),
  ),
  loadProyectoHistory: vi.fn(async () => ({ events: [{ id: "h1" }], nextCursor: null })),
}));
vi.mock("@/lib/loaders/proyectos", () => ({
  loadProyectoResumen: loaders.loadProyectoResumen,
  loadProyectoResumenSummary: loaders.loadProyectoResumenSummary,
  loadProyectoHistory: loaders.loadProyectoHistory,
}));
vi.mock("@/lib/loaders/tareas", () => ({ loadTareasListFirstPages: loaders.loadTareasListFirstPages }));
vi.mock("@/lib/ui/preferences-server", () => ({
  getResolvedAppearance: vi.fn(async () => ({ style: state.style })),
  getStoredOrgAppearance: vi.fn(async () => ({ styleDefault: "visual", allowUserOverride: true })),
  getMyPreferences: vi.fn(async () => ({ hideCompletedTasks: false })),
}));
vi.mock("@/lib/loaders/proyectos-shell", () => ({ loadProyectoShell: loaders.loadProyectoShell }));
// The client query functions: the first render must never need them.
const actions = vi.hoisted(() => ({
  getProyectoResumenData: vi.fn(),
  getProyectoResumenSummary: vi.fn(),
  getProyectoHistoryPage: vi.fn(),
  getProyectoShell: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/proyectos-actions", () => ({
  getProyectoResumenData: actions.getProyectoResumenData,
  getProyectoResumenSummary: actions.getProyectoResumenSummary,
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
      const numbers = client.getQueryData<{ next: { id: string }[] } | null>(qk.proyectos.resumenSummary(projectId));
      const history = client.getQueryData<{ pages: { events: { id: string }[] }[] }>(qk.proyectos.history(projectId));
      return (
        <div
          data-testid="summary"
          data-next={numbers?.next.map((t) => t.id).join(",") ?? ""}
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
  project: { id: PID, name: "Local Espinopapa", etapa: null },
  counts: { tareas: 1, archivos: 0, clientes: 0 },
  canManagePortal: false,
};
const RESUMEN = {
  project: { id: PID, name: "Local Espinopapa", etapas: [] },
  etapaCatalog: [],
  files: [{ id: "f1" }, { id: "f2" }],
};
/** One admin task: "Tareas por etapa" has one group ("Administración"). */
const SUMMARY = vi.hoisted(() => ({
  canViewTasks: true,
  includeAdmin: true,
  today: "2026-11-06",
  buckets: [
    {
      workflow: null,
      phase: null,
      total: 1,
      done: 0,
      closed: 0,
      pendiente: 1,
      enProceso: 0,
      blocked: 0,
      overdue: 0,
      daysLateSum: 0,
      shownOverdue: 0,
      shownDaysLateSum: 0,
      shownBlocked: 0,
      earliestDue: null,
      latestDue: null,
      earliestCreated: "2026-11-01",
      latestClosed: null,
    },
  ],
  managers: [],
  next: [{ id: "t-admin" }],
  recent: [],
}));

async function renderPage(id = PID, searchParams: Record<string, string> = {}) {
  return renderWithQueryClient(await ProjectPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(searchParams) }));
}

beforeEach(() => {
  state.user = { member: { id: "s1" }, email: "ana@cincel.mx", access: "Administrador" };
  state.shell = SHELL;
  state.resumen = RESUMEN;
  state.style = "visual";
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

  it("prefetches four keys (shell, Resumen, task numbers, history) through the loaders, with 0 client action calls", async () => {
    await renderPage();
    expect(loaders.loadProyectoShell).toHaveBeenCalledTimes(1);
    expect(loaders.loadProyectoShell).toHaveBeenCalledWith(state.user, { id: PID });
    expect(loaders.loadProyectoResumen).toHaveBeenCalledTimes(1);
    expect(loaders.loadProyectoResumen).toHaveBeenCalledWith(state.user, { id: PID });
    expect(loaders.loadProyectoResumenSummary).toHaveBeenCalledTimes(1);
    expect(loaders.loadProyectoResumenSummary).toHaveBeenCalledWith(state.user, { id: PID });
    expect(loaders.loadProyectoHistory).toHaveBeenCalledTimes(1);
    expect(loaders.loadProyectoHistory).toHaveBeenCalledWith(state.user, { id: PID, cursor: null });
    // The hydrated cache answers the task numbers and "Actividad reciente"; Visual reads no task rows.
    expect(screen.getByTestId("summary").getAttribute("data-next")).toBe("t-admin");
    expect(loaders.loadTareasListFirstPages).not.toHaveBeenCalled();
    expect(screen.getByTestId("summary").getAttribute("data-events")).toBe("h1");
    expect(actions.getProyectoResumenData).not.toHaveBeenCalled();
    expect(actions.getProyectoResumenSummary).not.toHaveBeenCalled();
    expect(actions.getProyectoHistoryPage).not.toHaveBeenCalled();
    expect(actions.getProyectoShell).not.toHaveBeenCalled();
  });

  it("Analítico: the first page of every «Tareas por etapa» group in one call (#1051)", async () => {
    state.style = "analitico";
    await renderPage();
    expect(loaders.loadTareasListFirstPages).toHaveBeenCalledTimes(1);
    expect(loaders.loadTareasListFirstPages).toHaveBeenCalledWith(state.user, {
      lists: [expect.objectContaining({ proyecto: PID, etapa: "__sin_etapa", orderBy: "retraso", incluirAdmin: true })],
    });
    cleanup();
    vi.clearAllMocks();
    // `?estilo=` wins over the viewer's style.
    state.style = "analitico";
    await renderPage(PID, { estilo: "esencial" });
    expect(loaders.loadTareasListFirstPages).not.toHaveBeenCalled();
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
    expect(loaders.loadProyectoResumenSummary).not.toHaveBeenCalled();
  });

  it("asks to sign in without a session", async () => {
    state.user = null;
    await renderPage();
    expect(screen.getByRole("heading", { name: "Sin permiso" })).toBeTruthy();
  });
});
