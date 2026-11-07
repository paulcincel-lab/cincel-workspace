// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import type { ProjectItem } from "@/lib/proyectos/use-projects-data";

const state = vi.hoisted(() => ({
  user: null as null | { access: string },
  projects: [] as unknown[],
}));

const exportTableData = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/proyectos/use-projects-data", () => ({
  useProjectsData: () => ({
    projectsData: state.projects,
    isLoadingData: false,
    fetchError: null,
    activeStaff: [],
    authenticatedUser: state.user,
    refresh: vi.fn(),
    addProject: vi.fn(),
    updateProject: vi.fn(),
    archiveProject: vi.fn(),
    removeProject: vi.fn(),
  }),
}));
vi.mock("@/lib/settings/use-general-settings", () => ({
  useGeneralSettings: () => ({ company: { tradeName: "Cincel", legalName: "Cincel" } }),
}));
vi.mock("@/lib/utils/export-service", () => ({ exportTableData }));
vi.mock("@/lib/auth/permissions", () => ({
  canSeeAdminData: (user: { access?: string } | null) => user?.access === "Administrador",
  resolveProjectsCapabilities: () => ({
    canCreateProject: true,
    canArchiveProject: false,
    canDeleteProject: false,
  }),
}));

import { ProyectosClient } from "./ProyectosClient";

function project(id: string, name: string, client: { id: string; name: string } | null): ProjectItem {
  return {
    id,
    name,
    status: "activo",
    client,
    currentWorkflow: null,
    tramos: [],
    activePhase: null,
    needsTramo: false,
    stages: [],
    manager: null,
    coordinator: null,
    taskCounts: { total: 0, open: 0, blocked: 0 },
    area: null,
  } as unknown as ProjectItem;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.projects = [
    project("p1", "Casa Lomas", { id: "c1", name: "Familia Pérez" }),
    project("p2", "Depto Roma", null),
  ];
});

afterEach(() => {
  cleanup();
});

async function exportHeaders(): Promise<string[]> {
  fireEvent.click(screen.getByText("Exportar ▼"));
  fireEvent.click(await screen.findByText("Exportar a Excel (.xlsx)"));
  await waitFor(() => expect(exportTableData).toHaveBeenCalled());
  const { columns } = exportTableData.mock.calls[0][0] as { columns: { header: string }[] };
  return columns.map((c) => c.header);
}

describe("ProyectosClient Cliente column", () => {
  it("shows the Cliente column and 'Por asignar' to admins", async () => {
    state.user = { access: "Administrador" };
    render(<ProyectosClient initialProjects={[]} />);

    expect(screen.getByRole("columnheader", { name: "Cliente" })).toBeTruthy();
    expect(screen.getByText("Familia Pérez")).toBeTruthy();
    expect(screen.getByText("Por asignar")).toBeTruthy();

    const headers = await exportHeaders();
    expect(headers).toContain("Cliente");
  });

  it("leaves the Cliente column out of the DOM and the export for non-admins", async () => {
    state.user = { access: "Colaborador" };
    render(<ProyectosClient initialProjects={[]} />);

    expect(screen.queryByRole("columnheader", { name: "Cliente" })).toBeNull();
    expect(screen.queryByText("Cliente")).toBeNull();
    expect(screen.queryByText("Por asignar")).toBeNull();

    const headers = await exportHeaders();
    expect(headers).not.toContain("Cliente");
  });
});
