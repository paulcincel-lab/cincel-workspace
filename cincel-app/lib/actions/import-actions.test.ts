import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ImportData } from "@/lib/types/core";

const ROW = "44444444-4444-4444-8444-444444444444";

const session = vi.hoisted(() => ({ access: "Colaborador" }));
vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: { id: "actor" },
    access: session.access,
  })),
}));

const caps = vi.hoisted(() => ({
  tasks: true,
  projects: true,
  contacts: true,
}));
vi.mock("@/lib/auth/permissions", () => ({
  canSeeAdminData: (user: { access: string }) => user.access === "Administrador",
  resolveActivitiesCapabilities: () => ({ canViewActivities: caps.tasks }),
  resolveProjectsCapabilities: () => ({ canViewProjects: caps.projects }),
  resolveClientsCapabilities: () => ({ canViewClients: caps.contacts }),
}));

const repo = vi.hoisted(() => ({
  importDataRowExists: vi.fn(),
  getImportData: vi.fn(),
}));
vi.mock("@/lib/repositories/import-repository", () => repo);

const tasksRepo = vi.hoisted(() => ({ assertTaskVisible: vi.fn() }));
vi.mock("@/lib/repositories/tasks-repository", () => tasksRepo);

import { getImportDataAction } from "./import-actions";

const data: ImportData = {
  source: "monday",
  importedAt: "2026-10-01T00:00:00.000Z",
  boardName: "Proyectos 2026",
  groupTitle: "En obra",
  data: { columns: { Estado: "Listo" } },
};

beforeEach(() => {
  vi.clearAllMocks();
  caps.tasks = caps.projects = caps.contacts = true;
  session.access = "Colaborador";
  tasksRepo.assertTaskVisible.mockResolvedValue(undefined);
  repo.importDataRowExists.mockResolvedValue(true);
  repo.getImportData.mockResolvedValue(data);
});

describe("getImportDataAction", () => {
  it.each(["task", "project", "contact"] as const)(
    "returns the %s's import data",
    async (entity) => {
      await expect(getImportDataAction(entity, ROW)).resolves.toEqual(data);
      expect(repo.importDataRowExists).toHaveBeenCalledWith(entity, ROW);
      expect(repo.getImportData).toHaveBeenCalledWith(entity, ROW, {
        hideClientColumns: entity === "project",
      });
    },
  );

  it("returns null when the row was not imported", async () => {
    repo.getImportData.mockResolvedValue(null);
    await expect(getImportDataAction("task", ROW)).resolves.toBeNull();
  });

  it.each([
    ["task", "tasks"],
    ["project", "projects"],
    ["contact", "contacts"],
  ] as const)("refuses a user who cannot see the %s", async (entity, cap) => {
    caps[cap] = false;
    await expect(getImportDataAction(entity, ROW)).resolves.toBeNull();
    expect(repo.importDataRowExists).not.toHaveBeenCalled();
    expect(repo.getImportData).not.toHaveBeenCalled();
  });

  it("checks the capability of the row's own module", async () => {
    caps.tasks = false;
    await expect(getImportDataAction("project", ROW)).resolves.toEqual(data);
  });

  it("returns null for a deleted or missing row", async () => {
    repo.importDataRowExists.mockResolvedValue(false);
    await expect(getImportDataAction("contact", ROW)).resolves.toBeNull();
    expect(repo.getImportData).not.toHaveBeenCalled();
  });

  it("returns null for an unknown entity or a malformed id", async () => {
    await expect(
      getImportDataAction("checklist_item" as unknown as "task", ROW),
    ).resolves.toBeNull();
    await expect(getImportDataAction("task", "not-a-uuid")).resolves.toBeNull();
    expect(repo.importDataRowExists).not.toHaveBeenCalled();
  });

  describe("admin data (non-administrators)", () => {
    it("returns null for an admin task", async () => {
      tasksRepo.assertTaskVisible.mockRejectedValue(new Error("FORBIDDEN"));
      await expect(getImportDataAction("task", ROW)).resolves.toBeNull();
      expect(tasksRepo.assertTaskVisible).toHaveBeenCalledWith(ROW, {
        staffId: "actor",
        isAdmin: false,
      });
      expect(repo.getImportData).not.toHaveBeenCalled();
    });

    it("passes other task guard errors through", async () => {
      tasksRepo.assertTaskVisible.mockRejectedValue(new Error("boom"));
      await expect(getImportDataAction("task", ROW)).rejects.toThrow("boom");
    });

    it("asks for a project's data without client columns", async () => {
      await getImportDataAction("project", ROW);
      expect(repo.getImportData).toHaveBeenCalledWith("project", ROW, {
        hideClientColumns: true,
      });
    });

    it("does not check task visibility for projects or contacts", async () => {
      await getImportDataAction("project", ROW);
      await getImportDataAction("contact", ROW);
      expect(tasksRepo.assertTaskVisible).not.toHaveBeenCalled();
    });
  });

  describe("administrators", () => {
    beforeEach(() => {
      session.access = "Administrador";
    });

    it("keep the client columns of a project", async () => {
      await expect(getImportDataAction("project", ROW)).resolves.toEqual(data);
      expect(repo.getImportData).toHaveBeenCalledWith("project", ROW, {
        hideClientColumns: false,
      });
    });

    it("see an admin task's data", async () => {
      await expect(getImportDataAction("task", ROW)).resolves.toEqual(data);
      expect(tasksRepo.assertTaskVisible).toHaveBeenCalledWith(ROW, {
        staffId: "actor",
        isAdmin: true,
      });
    });
  });
});
