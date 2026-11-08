// @vitest-environment node
/**
 * `loadTaskSheet` (Query Migration 4b, #956) with the repositories mocked:
 * the viewer rules, admin-field stripping in the loader and the
 * `{id,name,suggested}` shape of `assignable`. The SQL is covered by
 * `tests/db/task-sheet-data.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  getTaskSheetDetail: vi.fn(),
  listAssignableStaffOptions: vi.fn(),
  listProjectSpacesWithCounts: vi.fn(),
  searchProjectTasks: vi.fn(),
}));
const catalog = vi.hoisted(() => ({
  loadCatalogTaskStatuses: vi.fn(async () => []),
  loadCatalogWorkflows: vi.fn(async () => []),
}));
const projects = vi.hoisted(() => ({ projectExists: vi.fn(async () => true) }));

vi.mock("@/lib/repositories/task-sheet-repository", () => repo);
vi.mock("@/lib/loaders/catalog", () => catalog);
vi.mock("@/lib/repositories/projects-repository", () => projects);
vi.mock("@/lib/db/client", () => ({ db: {} }));

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { loadTaskSheet, searchProjectTasks } from "@/lib/loaders/tareas";
import { makeTask } from "@/components/tareas/task-sheet.fixtures";

function user(access: AuthenticatedUser["access"]): AuthenticatedUser {
  return {
    member: {
      id: "s-1",
      name: "Ana",
      role: "",
      area: "",
      capacity: 0,
      availability: "",
      active: true,
      institutionalEmail: "ana@cincel.example",
      phone: "",
    },
    email: "ana@cincel.example",
    access,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  repo.listProjectSpacesWithCounts.mockResolvedValue([]);
  repo.listAssignableStaffOptions.mockResolvedValue([
    { id: "s-1", name: "Ana López", suggested: true, email: "leak@cincel.example", phone: "555" },
  ]);
});

describe("loadTaskSheet", () => {
  it("returns assignable rows with only id, name and suggested", async () => {
    repo.getTaskSheetDetail.mockResolvedValue({ task: makeTask(), phases: [] });
    const data = await loadTaskSheet(user("Administrador"), { id: "t-1" });
    expect(data?.assignable).toEqual([{ id: "s-1", name: "Ana López", suggested: true }]);
    for (const row of data?.assignable ?? []) expect(Object.keys(row).sort()).toEqual(["id", "name", "suggested"]);
    expect(repo.listAssignableStaffOptions).toHaveBeenCalledWith("w-diseno");
    expect(repo.listProjectSpacesWithCounts).toHaveBeenCalledWith("p-1");
  });

  it("strips the client name for a non-admin and keeps it for an administrator", async () => {
    const task = makeTask({ project: { id: "p-1", name: "Casa Lomas", clientName: "Cliente SA" } });
    repo.getTaskSheetDetail.mockResolvedValue({ task, phases: [] });
    expect((await loadTaskSheet(user("Colaborador"), { id: "t-1" }))?.task.project.clientName).toBeNull();
    repo.getTaskSheetDetail.mockResolvedValue({ task, phases: [] });
    expect((await loadTaskSheet(user("Administrador"), { id: "t-1" }))?.task.project.clientName).toBe("Cliente SA");
  });

  it("is null for an admin task and a non-admin viewer, before any catalog of the task is read", async () => {
    repo.getTaskSheetDetail.mockResolvedValue({
      task: makeTask({ kind: "admin", workflowId: null, workflow: null, phaseId: null, phase: null }),
      phases: [],
    });
    expect(await loadTaskSheet(user("Colaborador"), { id: "t-1" })).toBeNull();
    expect(repo.listAssignableStaffOptions).not.toHaveBeenCalled();
  });

  it("an admin task reads no espacios", async () => {
    repo.getTaskSheetDetail.mockResolvedValue({
      task: makeTask({ kind: "admin", workflowId: null, workflow: null, phaseId: null, phase: null }),
      phases: [],
    });
    const data = await loadTaskSheet(user("Administrador"), { id: "t-1" });
    expect(data?.spaces).toEqual([]);
    expect(repo.listProjectSpacesWithCounts).not.toHaveBeenCalled();
  });

  it("is null when the task is missing", async () => {
    repo.getTaskSheetDetail.mockResolvedValue(null);
    expect(await loadTaskSheet(user("Administrador"), { id: "t-1" })).toBeNull();
  });
});

describe("searchProjectTasks", () => {
  it("is FORBIDDEN for a missing or deleted project", async () => {
    projects.projectExists.mockResolvedValueOnce(false);
    await expect(searchProjectTasks(user("Colaborador"), { projectId: "p-x", q: "" })).rejects.toThrow("FORBIDDEN");
    expect(repo.searchProjectTasks).not.toHaveBeenCalled();
  });

  it("searches with 20 rows by default", async () => {
    repo.searchProjectTasks.mockResolvedValue([]);
    await searchProjectTasks(user("Colaborador"), { projectId: "p-1", q: "planos" });
    expect(repo.searchProjectTasks).toHaveBeenCalledWith("p-1", "planos", 20, undefined);
  });
});
