// @vitest-environment node
/**
 * `loadTareasPage` (#955) with the repositories mocked: what it asks them for
 * and what it hands out. The DB-backed counterpart is `tests/db/tasks-page.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Staff rows as the table has them: the loader must keep `{id,name}` only. */
const staffRows = vi.hoisted(() => [
  { id: "s1", name: "Ana", lastName: "Ruiz", email: "ana@cincel.example", phone: "555" },
  { id: "s2", name: "Luis", lastName: null, email: "luis@cincel.example", phone: null },
]);
vi.mock("@/lib/db/client", () => {
  const chain = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    innerJoin: () => chain,
    orderBy: async () => staffRows,
  };
  return { db: chain };
});

/** Three projects; the first has an etapa group and a "Sin etapa" one. */
const summary = vi.hoisted(() => {
  const c = { total: 1, open: 1, overdue: 0, blocked: 0, daysLateSum: 0 };
  const diseno = { id: "w1", key: "diseno", name: "Diseño", sortOrder: 1 };
  const none = { id: null, key: null, name: "Sin etapa", sortOrder: 2147483647 };
  const project = (id: string, etapas: (typeof diseno | typeof none)[]) => ({
    project: { id, name: id },
    ...c,
    etapas: etapas.map((etapa) => ({ etapa, ...c })),
  });
  return {
    projects: [project("p1", [diseno, none]), project("p2", [diseno]), project("p3", [diseno])],
    totals: { ...c, projects: 3 },
    unfiltered: { projects: 3, total: 4, projectList: [] },
  };
});

const repo = vi.hoisted(() => ({
  taskSummary: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => summary),
  taskFacets: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ total: 0, byEtapa: {}, projects: [] })),
  listBoardColumns: vi.fn(async () => ({})),
  listTasksPage: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ rows: [], nextCursor: null, total: 0 })),
  listTaskRows: vi.fn(async () => []),
}));
vi.mock("@/lib/repositories/tasks-repository", () => repo);
vi.mock("@/lib/repositories/workflows-repository", () => ({
  listEtapasNav: vi.fn(async () => [
    { id: "w1", key: "diseno", name: "Diseño", sortOrder: 1 },
    { id: "w2", key: " ", name: "Sin clave", sortOrder: 2 },
  ]),
}));
vi.mock("@/lib/loaders/catalog", () => ({
  loadCatalogTaskStatuses: vi.fn(async () => [{ id: "cs1", name: "QA", closes: false, countsAsCompleted: false, sortOrder: 1 }]),
  loadCatalogWorkflows: vi.fn(async () => []),
}));

const caps = vi.hoisted(() => ({ canViewActivities: true }));
vi.mock("@/lib/auth/permissions", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/permissions")>()),
  resolveActivitiesCapabilities: () => ({ canViewActivities: caps.canViewActivities }),
}));

import type { AuthenticatedUser } from "@/lib/auth/auth-service";

import { loadTareasBoardColumn, loadTareasListPage, loadTareasPage } from "./tareas";

const NO_FILTERS = { etapa: null, proyecto: null, responsable: null, estado: null, q: null };

function user(access: AuthenticatedUser["access"]): AuthenticatedUser {
  return {
    member: {
      id: "me",
      name: "Yo",
      role: "",
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "",
      phone: "",
    },
    email: "",
    access,
  };
}

beforeEach(() => {
  caps.canViewActivities = true;
  vi.clearAllMocks();
});

describe("loadTareasPage", () => {
  it("hands out staff as {id,name} only (nombre + apellido), never the full Staff", async () => {
    const data = await loadTareasPage(user("Colaborador"), { estilo: "analitico", ...NO_FILTERS });
    expect(data.staff).toEqual([
      { id: "s1", name: "Ana Ruiz" },
      { id: "s2", name: "Luis" },
    ]);
    for (const s of data.staff) expect(Object.keys(s).sort()).toEqual(["id", "name"]);
  });

  it("keeps the etapas with a key", async () => {
    const data = await loadTareasPage(user("Colaborador"), { estilo: "analitico", ...NO_FILTERS });
    expect(data.etapas.map((t) => t.key)).toEqual(["diseno"]);
  });

  it("Tablero: every catalog column, the first rows per column; no Lista page", async () => {
    const data = await loadTareasPage(user("Colaborador"), { estilo: "visual", ...NO_FILTERS });
    expect(Object.keys(data.board!.columns).sort()).toEqual(
      ["bloqueado", "completado", "custom:cs1", "en_proceso", "pendiente"].sort(),
    );
    expect(repo.listBoardColumns).toHaveBeenCalledTimes(1);
    expect(repo.listTasksPage).not.toHaveBeenCalled();
    expect(data.list).toBeUndefined();
  });

  it("Analítico: the summary and the first page of the first 3 groups in retraso order, no board", async () => {
    const data = await loadTareasPage(user("Colaborador"), { estilo: "analitico", ...NO_FILTERS });
    expect(repo.taskSummary).toHaveBeenCalledTimes(1);
    expect(repo.taskSummary.mock.calls[0][0]).toEqual({ topLevelOnly: true });
    expect(repo.taskSummary.mock.calls[0][2]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.summary).toBe(summary);
    expect(repo.listTasksPage).toHaveBeenCalledTimes(3);
    const calls = repo.listTasksPage.mock.calls.map((call) => {
      const { today, ...f } = call[0] as Record<string, unknown>;
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      return f;
    });
    expect(calls).toEqual([
      { topLevelOnly: true, projectId: "p1", workflowId: "w1" },
      { topLevelOnly: true, projectId: "p1", withoutWorkflow: true },
      { topLevelOnly: true, projectId: "p2", workflowId: "w1" },
    ]);
    for (const call of repo.listTasksPage.mock.calls) {
      expect(call[2]).toEqual({ cursor: null, limit: 30, orderBy: "retraso" });
    }
    // Each page is keyed by the group's list filters (`tareasGroupFilters`).
    expect(data.groups?.map((g) => [g.filters.proyecto, g.filters.etapa, g.filters.orderBy])).toEqual([
      ["p1", "diseno", "retraso"],
      ["p1", "__sin_etapa", "retraso"],
      ["p2", "diseno", "retraso"],
    ]);
    expect(repo.listBoardColumns).not.toHaveBeenCalled();
    expect(data.board).toBeUndefined();
    expect(data.list).toBeUndefined();
  });

  it("maps the filters: etapa key → workflow id, Yo → the viewer (admin kinds for an admin only)", async () => {
    await loadTareasPage(user("Administrador"), {
      estilo: "analitico",
      etapa: "diseno",
      proyecto: "p1",
      responsable: "yo",
      estado: "pendiente",
      q: "plano",
    });
    expect(repo.taskSummary.mock.calls[0][0]).toEqual({
      topLevelOnly: true,
      search: "plano",
      status: "pendiente",
      involvesStaffId: "me",
      kind: ["workflow", "usuario", "admin"],
      workflowId: "w1",
      projectId: "p1",
    });
    // The facets ignore etapa and proyecto (the chips and the Proyecto options).
    expect(repo.taskFacets.mock.calls[0][0]).toEqual({
      topLevelOnly: true,
      search: "plano",
      status: "pendiente",
      involvesStaffId: "me",
      kind: ["workflow", "usuario", "admin"],
    });
    expect(repo.taskFacets.mock.calls[0][2]).toEqual({ workflowKey: "diseno", projectId: "p1" });

    vi.clearAllMocks();
    await loadTareasPage(user("Colaborador"), { estilo: "analitico", ...NO_FILTERS, responsable: "yo", mostrar: "en_retraso" });
    expect(repo.taskSummary.mock.calls[0][0]).toEqual({ topLevelOnly: true, involvesStaffId: "me", mostrar: "en_retraso" });
  });

  it("an unknown etapa loads no rows", async () => {
    const data = await loadTareasPage(user("Colaborador"), { estilo: "analitico", ...NO_FILTERS, etapa: "otro" });
    expect(repo.listTasksPage).not.toHaveBeenCalled();
    expect(repo.taskSummary).not.toHaveBeenCalled();
    expect(data.summary?.projects).toEqual([]);
    expect(data.groups).toEqual([]);
  });

  it("is FORBIDDEN without the Tareas capability", async () => {
    caps.canViewActivities = false;
    await expect(loadTareasPage(user("Colaborador"), { estilo: "analitico", ...NO_FILTERS })).rejects.toThrow("FORBIDDEN");
    await expect(loadTareasListPage(user("Colaborador"), { filters: NO_FILTERS, cursor: null })).rejects.toThrow(
      "FORBIDDEN",
    );
    await expect(
      loadTareasBoardColumn(user("Colaborador"), { filters: NO_FILTERS, columnId: "pendiente", cursor: null }),
    ).rejects.toThrow("FORBIDDEN");
    expect(repo.listTasksPage).not.toHaveBeenCalled();
  });
});
