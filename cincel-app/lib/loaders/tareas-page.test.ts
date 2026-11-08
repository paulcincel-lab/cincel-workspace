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

const repo = vi.hoisted(() => ({
  taskFacets: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ total: 0, byTramo: {}, projects: [] })),
  listBoardColumns: vi.fn(async () => ({})),
  listTasksPage: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ rows: [], nextCursor: null, total: 0 })),
  listTaskRows: vi.fn(async () => []),
}));
vi.mock("@/lib/repositories/tasks-repository", () => repo);
vi.mock("@/lib/repositories/workflows-repository", () => ({
  listTramosNav: vi.fn(async () => [
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

const NO_FILTERS = { tramo: null, proyecto: null, responsable: null, estado: null, q: null };

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
    const data = await loadTareasPage(user("Colaborador"), { vista: "lista", ...NO_FILTERS });
    expect(data.staff).toEqual([
      { id: "s1", name: "Ana Ruiz" },
      { id: "s2", name: "Luis" },
    ]);
    for (const s of data.staff) expect(Object.keys(s).sort()).toEqual(["id", "name"]);
  });

  it("keeps the tramos with a key", async () => {
    const data = await loadTareasPage(user("Colaborador"), { vista: "lista", ...NO_FILTERS });
    expect(data.tramos.map((t) => t.key)).toEqual(["diseno"]);
  });

  it("Tablero: every catalog column, the first rows per column; no Lista page", async () => {
    const data = await loadTareasPage(user("Colaborador"), { vista: "tablero", ...NO_FILTERS });
    expect(Object.keys(data.board!.columns).sort()).toEqual(
      ["bloqueado", "completado", "custom:cs1", "en_proceso", "pendiente"].sort(),
    );
    expect(repo.listBoardColumns).toHaveBeenCalledTimes(1);
    expect(repo.listTasksPage).not.toHaveBeenCalled();
    expect(data.list).toBeUndefined();
  });

  it("Lista: one first page, no board", async () => {
    const data = await loadTareasPage(user("Colaborador"), { vista: "lista", ...NO_FILTERS });
    expect(repo.listTasksPage).toHaveBeenCalledWith({}, { staffId: "me", isAdmin: false }, { cursor: null, limit: 50 });
    expect(repo.listBoardColumns).not.toHaveBeenCalled();
    expect(data.board).toBeUndefined();
  });

  it("maps the filters: tramo key → workflow id, Yo → the viewer (admin kinds for an admin only)", async () => {
    await loadTareasPage(user("Administrador"), {
      vista: "lista",
      tramo: "diseno",
      proyecto: "p1",
      responsable: "yo",
      estado: "pendiente",
      q: "plano",
    });
    expect(repo.listTasksPage.mock.calls[0][0]).toEqual({
      search: "plano",
      status: "pendiente",
      involvesStaffId: "me",
      kind: ["workflow", "usuario", "admin"],
      workflowId: "w1",
      projectId: "p1",
    });
    // The facets ignore tramo and proyecto (the chips and the Proyecto options).
    expect(repo.taskFacets.mock.calls[0][0]).toEqual({
      search: "plano",
      status: "pendiente",
      involvesStaffId: "me",
      kind: ["workflow", "usuario", "admin"],
    });
    expect(repo.taskFacets.mock.calls[0][2]).toEqual({ workflowKey: "diseno", projectId: "p1" });

    vi.clearAllMocks();
    await loadTareasPage(user("Colaborador"), { vista: "lista", ...NO_FILTERS, responsable: "yo" });
    expect(repo.listTasksPage.mock.calls[0][0]).toEqual({ involvesStaffId: "me" });
  });

  it("an unknown tramo loads no rows", async () => {
    const data = await loadTareasPage(user("Colaborador"), { vista: "lista", ...NO_FILTERS, tramo: "otro" });
    expect(repo.listTasksPage).not.toHaveBeenCalled();
    expect(data.list).toEqual({ rows: [], nextCursor: null, total: 0 });
  });

  it("is FORBIDDEN without the Tareas capability", async () => {
    caps.canViewActivities = false;
    await expect(loadTareasPage(user("Colaborador"), { vista: "lista", ...NO_FILTERS })).rejects.toThrow("FORBIDDEN");
    await expect(loadTareasListPage(user("Colaborador"), { filters: NO_FILTERS, cursor: null })).rejects.toThrow(
      "FORBIDDEN",
    );
    await expect(
      loadTareasBoardColumn(user("Colaborador"), { filters: NO_FILTERS, columnId: "pendiente", cursor: null }),
    ).rejects.toThrow("FORBIDDEN");
    expect(repo.listTasksPage).not.toHaveBeenCalled();
  });
});
