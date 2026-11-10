// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, screen } from "@testing-library/react";

import { qk } from "@/lib/query/keys";
import { renderWithQueryClient } from "@/lib/query/test-utils";
import type { PortalProjectDTO, PortalScheduleDTO } from "@/lib/types/portal";

const mocks = vi.hoisted(() => {
  class PortalNotFoundError extends Error {}
  return {
    PortalNotFoundError,
    nav: { search: "" },
    requirePortalUser: vi.fn(),
    requirePortalViewer: vi.fn(),
    requireProjectAccess: vi.fn(),
    getPortalProject: vi.fn(),
    getPortalSchedule: vi.fn(),
    getPortalProjectTramos: vi.fn(),
    listPortalProjects: vi.fn(),
    listPortalFolder: vi.fn(),
    listPortalFolderGroups: vi.fn(),
    getPortalTeam: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  };
});

vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  useSearchParams: () => new URLSearchParams(mocks.nav.search),
}));
vi.mock("@/lib/portal/session", () => ({
  requirePortalUser: mocks.requirePortalUser,
  requirePortalViewer: mocks.requirePortalViewer,
  requireProjectAccess: mocks.requireProjectAccess,
}));
vi.mock("@/lib/portal/drive-guard", () => ({
  PortalNotFoundError: mocks.PortalNotFoundError,
  isPortalNotFound: (e: unknown) => e instanceof mocks.PortalNotFoundError,
}));
vi.mock("@/components/portal/PortalFileBrowser", () => ({
  default: ({ projectId, folderId }: { projectId: string; folderId: string | null }) => (
    <div data-testid="file-browser" data-project={projectId} data-folder={folderId ?? ""} />
  ),
}));
vi.mock("@/components/portal/PortalUploader", () => ({
  default: ({ projectId }: { projectId: string }) => <div data-testid="uploader" data-project={projectId} />,
}));
vi.mock("@/lib/portal/queries", () => ({
  getPortalProject: mocks.getPortalProject,
  getPortalSchedule: mocks.getPortalSchedule,
  getPortalProjectTramos: mocks.getPortalProjectTramos,
  getPortalTeam: mocks.getPortalTeam,
  listPortalProjects: mocks.listPortalProjects,
}));
// "Subido por" on Resumen reads the client's own upload events; none here.
vi.mock("@/lib/portal/uploads", () => ({ listOwnPortalUploadFileIds: async () => new Set<string>() }));
vi.mock("@/lib/portal/files", () => ({
  listPortalFolder: mocks.listPortalFolder,
  listPortalFolderGroups: mocks.listPortalFolderGroups,
}));
vi.mock("@/components/portal/PortalProjectOverview", () => ({
  default: ({ project, data }: { project: { id: string }; data: Record<string, unknown> }) => (
    <div data-testid="overview" data-project={project.id} data-overview={JSON.stringify(data)} />
  ),
}));

import PortalProjectPage from "./page";

const PID = "11111111-1111-4111-8111-111111111111";

const project: PortalProjectDTO = {
  id: PID,
  name: "Casa Lomas",
  code: "CL-01",
  address: "Av. Siempre Viva 742, Monterrey, NL",
  status: "activo",
  progressPct: 42,
  startDate: "2026-01-15",
  endDate: "2026-12-20",
  manager: { name: "Laura Pérez", email: "laura@cincel.mx" },
};

const schedule: PortalScheduleDTO = {
  sections: [
    { key: "PB::Cimentación", planta: "PB", seccion: "Cimentación", start: "2026-02-01", end: "2026-02-28", progressPct: 100 },
    { key: "PB::Muros", planta: "PB", seccion: "Muros", start: "2026-03-01", end: "2026-04-15", progressPct: 50 },
    { key: "PA::Losa", planta: "PA", seccion: "Losa", start: "2026-05-01", end: "2026-05-30", progressPct: 0 },
  ],
};

const ACCESS = { accessId: "a1", projectId: PID, driveFolderStatus: "pending", driveClientFolderId: null, currentWorkflowId: null };

function renderPage(tab?: string, id = PID, folder?: string) {
  const query = { ...(tab ? { tab } : {}), ...(folder ? { folder } : {}) };
  mocks.nav.search = new URLSearchParams(query).toString();
  return PortalProjectPage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(query) });
}

async function renderInto(tab?: string, id = PID, folder?: string) {
  return renderWithQueryClient(await renderPage(tab, id, folder));
}

describe("/portal/proyectos/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePortalUser.mockResolvedValue({ id: "pu1", name: "Ana", email: "ana@example.com", contactId: "c1", companyName: null });
    mocks.requireProjectAccess.mockResolvedValue(ACCESS);
    mocks.getPortalProject.mockResolvedValue(project);
    mocks.getPortalSchedule.mockResolvedValue(schedule);
    mocks.getPortalProjectTramos.mockResolvedValue([]);
    mocks.getPortalTeam.mockResolvedValue([]);
    mocks.listPortalProjects.mockResolvedValue([project]);
  });
  afterEach(cleanup);

  it("shows the tabs as links that keep the tab in ?tab=", async () => {
    await renderInto();

    expect(screen.getByRole("tab", { name: "Resumen" }).getAttribute("href")).toBe(`/portal/proyectos/${PID}`);
    expect(screen.getByRole("tab", { name: "Cronograma" }).getAttribute("href")).toBe(
      `/portal/proyectos/${PID}?tab=cronograma`,
    );
  });

  it("checks access once and reads the project through that access only", async () => {
    await renderInto("cronograma");

    expect(mocks.requireProjectAccess).toHaveBeenCalledTimes(1);
    expect(mocks.requireProjectAccess).toHaveBeenCalledWith(PID, expect.objectContaining({ id: "pu1" }));
    expect(mocks.getPortalProject).toHaveBeenCalledWith(ACCESS);
    expect(mocks.getPortalSchedule).toHaveBeenCalledWith(ACCESS);
  });

  it("seeds portal.project(id, tab) with the page data, DTOs only", async () => {
    const { client } = await renderInto("cronograma");

    expect(client.getQueryData(qk.portal.project(PID, "cronograma"))).toEqual({
      project,
      schedule,
      tramos: [],
      documents: null,
      documentFolders: null,
      team: [],
    });
  });

  it("seeds portal.projects() for the top bar's project menu", async () => {
    const { client } = await renderInto("cronograma");

    expect(client.getQueryData(qk.portal.projects())).toEqual({ projects: [project] });
  });

  it("keeps the project's name above the tabs on Cronograma", async () => {
    await renderInto("cronograma");

    expect(screen.getByRole("heading", { level: 1, name: "Casa Lomas" }).className).toContain("font-semibold");
    expect(screen.queryByRole("link", { name: "Mis proyectos" })).toBeNull();
  });

  it("renders Cronograma grouped by planta, one row per section", async () => {
    await renderInto("cronograma");

    const plantas = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(plantas).toEqual(["PB", "PA"]);
    const pb = screen.getByRole("region", { name: "PB" });
    expect(pb.querySelectorAll("li")).toHaveLength(2);
    expect(pb.textContent).toContain("Cimentación");
    expect(pb.textContent).toContain("01-02-2026 – 28-02-2026");
    expect(screen.getByRole("progressbar", { name: "Avance de Muros" })).toBeTruthy();
  });

  it("never shows tarea or responsable even if a row carried them", async () => {
    mocks.getPortalSchedule.mockResolvedValue({
      sections: [{ ...schedule!.sections[0], tarea: "Colado secreto", responsable: "Juan Interno" }],
    });
    await renderInto("cronograma");

    expect(document.body.textContent).not.toContain("Colado secreto");
    expect(document.body.textContent).not.toContain("Juan Interno");
  });

  it("shows the empty state when there is no schedule", async () => {
    mocks.getPortalSchedule.mockResolvedValue(null);
    await renderInto("cronograma");

    expect(screen.getByText("El cronograma aún no está disponible.")).toBeTruthy();
  });

  it("another client's project id is a 404", async () => {
    mocks.requireProjectAccess.mockRejectedValue(new mocks.PortalNotFoundError());

    await expect(renderPage(undefined, "22222222-2222-4222-8222-222222222222")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getPortalProject).not.toHaveBeenCalled();
  });

  it("is a 404 when the project query finds nothing", async () => {
    mocks.getPortalProject.mockResolvedValue(null);

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders Archivos with the PortalFileBrowser and the ?folder= it was opened with", async () => {
    await renderInto("archivos", PID, "fold-2");

    expect(screen.getByRole("tab", { name: "Archivos" }).getAttribute("href")).toBe(`/portal/proyectos/${PID}?tab=archivos`);
    const browser = screen.getByTestId("file-browser");
    expect(browser.getAttribute("data-project")).toBe(PID);
    expect(browser.getAttribute("data-folder")).toBe("fold-2");
    expect(mocks.getPortalSchedule).not.toHaveBeenCalled();
  });

  it("renders Enviar archivos with the PortalUploader", async () => {
    await renderInto("enviar");

    expect(screen.getByRole("tab", { name: "Enviar archivos" }).getAttribute("href")).toBe(
      `/portal/proyectos/${PID}?tab=enviar`
    );
    expect(screen.getByTestId("uploader").getAttribute("data-project")).toBe(PID);
    expect(mocks.getPortalSchedule).not.toHaveBeenCalled();
  });

  it("falls back to Resumen for an unknown tab", async () => {
    await renderInto("pagos");

    expect(screen.getByTestId("overview").getAttribute("data-project")).toBe(PID);
  });

  it("switches tabs on the client through history.pushState, without a navigation", async () => {
    const push = vi.spyOn(window.history, "pushState").mockImplementation(() => {});
    await renderInto("cronograma");

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: "Archivos" }));
    });
    expect(push).toHaveBeenCalledWith(null, "", `/portal/proyectos/${PID}?tab=archivos`);
    push.mockRestore();
  });
});

describe("/portal/proyectos/[id] Resumen (FE §3.11)", () => {
  const tramos = [
    { key: "presale", name: "Presale", state: "completado", progressPct: 100, startMonth: "2026-01" },
    { key: "diseno", name: "Diseño", state: "en_curso", progressPct: 62, startMonth: "2026-06" },
  ];
  const files = [
    { id: "f1", name: "Contrato.pdf", mimeType: "application/pdf", sizeBytes: 10, modifiedAt: "2026-09-15T00:00:00Z", kind: "file", deliveredAs: "original" },
  ];
  const READY = { ...ACCESS, driveFolderStatus: "ready", driveClientFolderId: "client-root" };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePortalUser.mockResolvedValue({ id: "pu1", name: "Ana", email: "ana@example.com", contactId: "c1", companyName: null });
    mocks.requireProjectAccess.mockResolvedValue(READY);
    mocks.getPortalProject.mockResolvedValue(project);
    mocks.getPortalSchedule.mockResolvedValue(schedule);
    mocks.getPortalProjectTramos.mockResolvedValue(tramos);
    mocks.listPortalFolder.mockResolvedValue({ folderId: "client-root", breadcrumbs: [], items: files });
    mocks.listPortalFolderGroups.mockResolvedValue([{ folderId: "client-root", name: "General", files }]);
    mocks.getPortalTeam.mockResolvedValue([{ name: "Laura Pérez", role: "Responsable del proyecto", email: "laura@cincel.mx" }]);
    mocks.listPortalProjects.mockResolvedValue([project]);
  });
  afterEach(cleanup);

  function overview() {
    const node = screen.getByTestId("overview");
    return JSON.parse(node.getAttribute("data-overview") ?? "{}");
  }

  it("renders Resumen through the widget overview, fed by the portal read layer only", async () => {
    await renderInto();

    expect(screen.getByTestId("overview").getAttribute("data-project")).toBe(PID);
    expect(mocks.getPortalSchedule).toHaveBeenCalledWith(READY);
    expect(mocks.getPortalProjectTramos).toHaveBeenCalledWith(READY);
    expect(mocks.listPortalFolder).toHaveBeenCalledWith({ driveClientFolderId: "client-root" });
    expect(mocks.requireProjectAccess).toHaveBeenCalledTimes(1);
    const data = overview();
    expect(data.tramos).toEqual(tramos);
    expect(data.progress[0]).toMatchObject({ label: "Avance general", real: 42 });
    expect(data.documentos.rows.map((r: { id: string }) => r.id)).toEqual(["f1"]);
    expect(mocks.getPortalTeam).toHaveBeenCalledWith(READY);
    expect(mocks.listPortalFolderGroups).toHaveBeenCalledWith({ driveClientFolderId: "client-root" });
    expect(data.recentFiles.map((f: { id: string; folder: string }) => [f.id, f.folder])).toEqual([["f1", "General"]]);
    expect(data.team).toEqual([{ name: "Laura Pérez", role: "Responsable del proyecto", email: "laura@cincel.mx" }]);
  });

  it("drops the documents section when the client folder isn't ready or Drive fails", async () => {
    mocks.requireProjectAccess.mockResolvedValue(ACCESS);
    await renderInto();
    expect(overview().documentos).toBeNull();
    expect(mocks.listPortalFolder).not.toHaveBeenCalled();
    cleanup();

    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.requireProjectAccess.mockResolvedValue(READY);
    mocks.listPortalFolder.mockRejectedValue(new Error("drive down"));
    await renderInto();
    expect(overview().documentos).toBeNull();
  });

  it("keeps the other tabs as they are", async () => {
    await renderInto("cronograma");
    expect(screen.queryByTestId("overview")).toBeNull();
    expect(mocks.getPortalProjectTramos).not.toHaveBeenCalled();
    expect(mocks.listPortalFolder).not.toHaveBeenCalled();
    expect(mocks.listPortalFolderGroups).not.toHaveBeenCalled();
    expect(mocks.getPortalTeam).not.toHaveBeenCalled();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["PB", "PA"]);
  });

  it("never sends tarea, responsable or money to the page", async () => {
    mocks.getPortalSchedule.mockResolvedValue({
      sections: [{ ...schedule!.sections[1], tarea: "Colado secreto", responsable: "Juan Interno", monto: 99999 }],
    });
    await renderInto();
    const raw = screen.getByTestId("overview").getAttribute("data-overview") ?? "";
    expect(raw).not.toContain("Colado secreto");
    expect(raw).not.toContain("Juan Interno");
    expect(raw).not.toContain("99999");
  });
});
