// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

import { buildPortalOverview } from "@/lib/portal/overview";
import type { PortalFileDTO, PortalProjectDTO, PortalScheduleDTO, PortalEtapaDTO } from "@/lib/types/portal";

import { PortalAnalitico } from "./PortalAnalitico";

// `useSearchParams` follows `window.location`, as Next's patched `replaceState` makes it do.
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(window.location.search) }));

const project: PortalProjectDTO = {
  id: "p1",
  name: "Casa Lomas",
  code: "CL-01",
  address: null,
  status: "activo",
  progressPct: 41,
  startDate: "2026-01-15",
  endDate: "2026-12-20",
  manager: null,
};
const schedule: PortalScheduleDTO = {
  sections: [
    { key: "PB::Cimentación", planta: "PB", seccion: "Cimentación", start: "2026-10-06", end: "2026-10-17", progressPct: 100 },
    { key: "PB::Muros", planta: "PB", seccion: "Muros", start: "2026-10-27", end: "2026-11-20", progressPct: 50 },
  ],
};
const etapas: PortalEtapaDTO[] = [{ key: "diseno", name: "Diseño", state: "en_curso", progressPct: 60, startMonth: "2026-03" }];
const files: PortalFileDTO[] = [
  { id: "f1", name: "Contrato.pdf", mimeType: "application/pdf", sizeBytes: 120_000, modifiedAt: "2026-11-05T00:00:00Z", kind: "file", deliveredAs: "original" },
];

function overview(over: Partial<Parameters<typeof buildPortalOverview>[0]> = {}) {
  return buildPortalOverview({ project, schedule, etapas, files, today: "2026-11-07", ...over });
}

beforeEach(() => {
  window.history.replaceState(null, "", "/portal/proyectos/p1");
});
afterEach(cleanup);

describe("PortalAnalitico", () => {
  it("renders the title, KPIs and the three sections", () => {
    render(<PortalAnalitico project={project} data={overview({ updatedAt: Date.UTC(2026, 10, 7, 20, 5) })} />);
    expect(screen.getByRole("heading", { level: 1, name: "Casa Lomas" })).toBeTruthy();
    expect(screen.getByText("Actualizado 7 nov 2026 · 14:05")).toBeTruthy();
    expect(screen.getByText("41 %")).toBeTruthy();
    const nav = screen.getByRole("navigation", { name: "Ir a sección" });
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual(["Fases", "Entregables", "Archivos"]);
    expect(screen.getByRole("columnheader", { name: "Plan" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Fecha plan" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Subido por" })).toBeTruthy();
  });

  it("omits Real and Desvío without data", () => {
    render(<PortalAnalitico project={project} data={overview()} />);
    expect(screen.queryByRole("columnheader", { name: "Real" })).toBeNull();
    expect(screen.queryByRole("columnheader", { name: "Fecha real" })).toBeNull();
    expect(screen.queryAllByRole("columnheader", { name: "Desvío (días)" })).toHaveLength(0);
    expect(screen.queryByText("Desvío")).toBeNull();
    cleanup();

    const withReal: PortalScheduleDTO = {
      sections: schedule!.sections.map((s) => ({ ...s, actualStart: s.start, actualEnd: s.progressPct === 100 ? "2026-10-20" : null })),
    };
    render(<PortalAnalitico project={project} data={overview({ schedule: withReal })} />);
    expect(screen.getByRole("columnheader", { name: "Real" })).toBeTruthy();
    expect(screen.getByRole("columnheader", { name: "Fecha real" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader", { name: "Desvío (días)" })).toHaveLength(2);
  });

  it("no schedule shows Aún no hay cronograma", () => {
    render(<PortalAnalitico project={project} data={overview({ schedule: null })} />);
    expect(screen.getAllByText("Aún no hay cronograma.")).toHaveLength(2);
    expect(screen.getByText("de 0")).toBeTruthy();
  });

  it("files null shows Los archivos aún no están listos", () => {
    render(<PortalAnalitico project={project} data={overview({ files: null, folders: null })} />);
    expect(screen.getByText("Los archivos aún no están listos.")).toBeTruthy();
    cleanup();
    render(<PortalAnalitico project={project} data={overview({ files: [], folders: [] })} />);
    expect(screen.getByText("Aún no hay documentos compartidos.")).toBeTruthy();
  });

  it("downloads through the portal file route", () => {
    render(<PortalAnalitico project={project} data={overview()} />);
    const html = document.body.innerHTML;
    expect(html).not.toMatch(/drive\.google|webViewLink/);
    expect(screen.getByRole("link", { name: "Descargar Contrato.pdf" }).getAttribute("href")).toBe(
      "/api/portal/projects/p1/files/f1/download",
    );
  });

  it("anchor expands section", () => {
    window.history.replaceState(null, "", "/portal/proyectos/p1?tab=resumen&abiertos=fases");
    render(<PortalAnalitico project={project} data={overview()} />);
    const nav = screen.getByRole("navigation", { name: "Ir a sección" });
    fireEvent.click(within(nav).getByRole("link", { name: "Entregables" }));
    expect(window.location.search).toBe("?tab=resumen&abiertos=fases,entregables");
    const section = document.getElementById("entregables")!;
    expect(section.contains(document.activeElement)).toBe(true);
  });
});
