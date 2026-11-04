// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import type { PortalProjectDTO, PortalScheduleDTO } from "@/lib/types/portal";

const mocks = vi.hoisted(() => {
  class PortalNotFoundError extends Error {}
  return {
    PortalNotFoundError,
    requirePortalUser: vi.fn(),
    requireProjectAccess: vi.fn(),
    getPortalProject: vi.fn(),
    getPortalSchedule: vi.fn(),
    notFound: vi.fn(() => {
      throw new Error("NEXT_NOT_FOUND");
    }),
  };
});

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/portal/session", () => ({
  requirePortalUser: mocks.requirePortalUser,
  requireProjectAccess: mocks.requireProjectAccess,
}));
vi.mock("@/lib/portal/drive-guard", () => ({
  PortalNotFoundError: mocks.PortalNotFoundError,
  isPortalNotFound: (e: unknown) => e instanceof mocks.PortalNotFoundError,
}));
vi.mock("@/components/portal/PortalFileBrowser", () => ({
  default: ({ projectId, initialFolderId }: { projectId: string; initialFolderId: string | null }) => (
    <div data-testid="file-browser" data-project={projectId} data-folder={initialFolderId ?? ""} />
  ),
}));
vi.mock("@/lib/portal/queries", () => ({
  getPortalProject: mocks.getPortalProject,
  getPortalSchedule: mocks.getPortalSchedule,
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

function renderPage(tab?: string, id = PID, folder?: string) {
  return PortalProjectPage({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve({ ...(tab ? { tab } : {}), ...(folder ? { folder } : {}) }),
  });
}

describe("/portal/proyectos/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePortalUser.mockResolvedValue({ id: "pu1", name: "Ana", email: "ana@example.com", contactId: "c1" });
    mocks.requireProjectAccess.mockResolvedValue({ accessId: "a1", projectId: PID });
    mocks.getPortalProject.mockResolvedValue(project);
    mocks.getPortalSchedule.mockResolvedValue(schedule);
  });
  afterEach(cleanup);

  it("renders Resumen by default from the project DTO", async () => {
    render(await renderPage());

    expect(screen.getByRole("heading", { level: 1, name: "Casa Lomas" })).toBeTruthy();
    expect(screen.getByText("Activo")).toBeTruthy();
    expect(screen.getByText("42%")).toBeTruthy();
    expect(screen.getByText("15-01-2026")).toBeTruthy();
    expect(screen.getByText("20-12-2026")).toBeTruthy();
    expect(screen.getByText("Av. Siempre Viva 742, Monterrey, NL")).toBeTruthy();
    expect(screen.getByRole("link", { name: "laura@cincel.mx" }).getAttribute("href")).toBe("mailto:laura@cincel.mx");
    expect(mocks.getPortalSchedule).not.toHaveBeenCalled();
    expect(mocks.requireProjectAccess).toHaveBeenCalledWith(PID, expect.objectContaining({ id: "pu1" }));
  });

  it("shows both tabs as links that keep the tab in ?tab=", async () => {
    render(await renderPage());

    expect(screen.getByRole("tab", { name: "Resumen" }).getAttribute("href")).toBe(`/portal/proyectos/${PID}`);
    expect(screen.getByRole("tab", { name: "Cronograma" }).getAttribute("href")).toBe(
      `/portal/proyectos/${PID}?tab=cronograma`,
    );
  });

  it("renders Cronograma grouped by planta, one row per section", async () => {
    render(await renderPage("cronograma"));

    expect(mocks.getPortalSchedule).toHaveBeenCalledWith("pu1", PID);
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
    render(await renderPage("cronograma"));

    expect(document.body.textContent).not.toContain("Colado secreto");
    expect(document.body.textContent).not.toContain("Juan Interno");
  });

  it("shows the empty state when there is no schedule", async () => {
    mocks.getPortalSchedule.mockResolvedValue(null);
    render(await renderPage("cronograma"));

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
    render(await renderPage("archivos", PID, "fold-2"));

    expect(screen.getByRole("tab", { name: "Archivos" }).getAttribute("href")).toBe(`/portal/proyectos/${PID}?tab=archivos`);
    const browser = screen.getByTestId("file-browser");
    expect(browser.getAttribute("data-project")).toBe(PID);
    expect(browser.getAttribute("data-folder")).toBe("fold-2");
    expect(mocks.getPortalSchedule).not.toHaveBeenCalled();
  });

  it("falls back to Resumen for an unknown tab", async () => {
    render(await renderPage("pagos"));

    expect(screen.getByText("Avance")).toBeTruthy();
    expect(mocks.getPortalSchedule).not.toHaveBeenCalled();
  });

  it("stays in one column at 360 px", async () => {
    window.innerWidth = 360;
    render(await renderPage());

    expect(document.querySelector("dl")?.className).toContain("grid-cols-1");
  });
});
