import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ImportData } from "@/lib/types/core";

const ROW = "44444444-4444-4444-8444-444444444444";

vi.mock("@/lib/auth/session", () => ({
  requireCapabilityUser: vi.fn(async () => ({
    member: { id: "actor" },
    access: "Colaborador",
  })),
}));

const caps = vi.hoisted(() => ({
  tasks: true,
  projects: true,
  contacts: true,
}));
vi.mock("@/lib/auth/permissions", () => ({
  resolveActivitiesCapabilities: () => ({ canViewActivities: caps.tasks }),
  resolveProjectsCapabilities: () => ({ canViewProjects: caps.projects }),
  resolveClientsCapabilities: () => ({ canViewClients: caps.contacts }),
}));

const repo = vi.hoisted(() => ({
  importDataRowExists: vi.fn(),
  getImportData: vi.fn(),
}));
vi.mock("@/lib/repositories/import-repository", () => repo);

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
  repo.importDataRowExists.mockResolvedValue(true);
  repo.getImportData.mockResolvedValue(data);
});

describe("getImportDataAction", () => {
  it.each(["task", "project", "contact"] as const)(
    "returns the %s's import data",
    async (entity) => {
      await expect(getImportDataAction(entity, ROW)).resolves.toEqual(data);
      expect(repo.importDataRowExists).toHaveBeenCalledWith(entity, ROW);
      expect(repo.getImportData).toHaveBeenCalledWith(entity, ROW);
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
});
