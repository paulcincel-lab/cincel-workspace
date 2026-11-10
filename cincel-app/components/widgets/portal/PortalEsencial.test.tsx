// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { PortalOverviewData } from "@/lib/portal/overview";
import type { PortalFileDTO, PortalProjectDTO, PortalTramoDTO } from "@/lib/types/portal";

import { PortalEsencial } from "./PortalEsencial";

afterEach(cleanup);

const project: PortalProjectDTO = {
  id: "p1",
  name: "Casa Lomas",
  code: "CL-01",
  address: "Av. Reforma 10, CDMX",
  status: "activo",
  progressPct: 41,
  startDate: "2026-01-15",
  endDate: "2026-12-20",
  manager: { name: "Ana Torres", email: "ana@cincel.mx" },
};

const tramos: PortalTramoDTO[] = [
  { key: "presale", name: "Presale", state: "completado", progressPct: 100, startMonth: "2026-01" },
  { key: "diseno", name: "Diseño", state: "en_curso", progressPct: 62, startMonth: "2026-03" },
  { key: "construccion", name: "Construcción", state: "por_iniciar", progressPct: 0, startMonth: null },
];

const file = (id: string, name: string, modifiedAt: string): PortalFileDTO & { folder: string } => ({
  id,
  name,
  mimeType: "application/pdf",
  sizeBytes: 1024,
  modifiedAt,
  kind: "file",
  deliveredAs: "original",
  folder: "General",
});

function overview(over: Record<string, unknown> = {}): PortalOverviewData {
  return {
    tramos,
    stepper: null,
    progress: [],
    entregas: [
      { id: "a", title: "Planos ejecutivos", start: "2026-11-14", allDay: true, project: "PB" },
      { id: "b", title: "Render final", start: "2026-11-28", allDay: true, project: "PB" },
      { id: "c", title: "Licencia", start: "2026-12-05", allDay: true, project: "PA" },
      { id: "d", title: "Cuarta", start: "2026-12-20", allDay: true, project: "PA" },
    ],
    documentos: { columns: [], rows: [] },
    recentFiles: [
      file("f1", "Planos.pdf", "2026-11-03T10:00:00.000Z"),
      file("f2", "Contrato.pdf", "2026-10-20T10:00:00.000Z"),
      file("f3", "Paleta.pdf", "2026-10-10T10:00:00.000Z"),
      file("f4", "Viejo.pdf", "2026-09-01T10:00:00.000Z"),
    ],
    ...over,
  } as unknown as PortalOverviewData;
}

describe("PortalEsencial", () => {
  it("renders status, entregas, documentos, contacto", () => {
    render(<PortalEsencial project={project} data={overview()} />);

    expect(screen.getByRole("heading", { level: 1, name: "Casa Lomas" })).toBeTruthy();
    const sentence = screen.getByText((_, el) => el?.tagName === "P" && /^Vamos en/.test(el.textContent ?? ""));
    expect(sentence.textContent?.replace(/\s+/g, " ")).toBe("Vamos en Diseño, 62 % · próxima entrega 14 nov");

    const entregas = screen.getByRole("region", { name: "Próximas entregas" });
    const rows = within(entregas).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toBe("14 novPlanos ejecutivos");

    const docs = screen.getByRole("region", { name: "Documentos recientes" });
    const links = within(docs).getAllByRole("link", { name: /^Descargar / });
    expect(links.map((a) => a.getAttribute("aria-label"))).toEqual([
      "Descargar Planos.pdf",
      "Descargar Contrato.pdf",
      "Descargar Paleta.pdf",
    ]);
    expect(links[0].getAttribute("href")).toBe("/api/portal/projects/p1/files/f1/download");
    expect(within(docs).getByRole("link", { name: "Ver todos →" }).getAttribute("href")).toBe(
      "/portal/proyectos/p1?tab=archivos",
    );

    const contacto = screen.getByRole("region", { name: "Tu contacto en Cincel" });
    expect(within(contacto).getByText("Ana Torres")).toBeTruthy();
    expect(within(contacto).getByText("AT")).toBeTruthy();
    const escribir = within(contacto).getByRole("link", { name: "Escribir a Ana Torres" });
    expect(escribir.getAttribute("href")).toBe("mailto:ana@cincel.mx?subject=Casa%20Lomas");

    expect(document.querySelector("table")).toBeNull();
    expect(document.querySelector("svg")).toBeNull();
  });

  it("hides contact without manager", () => {
    render(<PortalEsencial project={{ ...project, manager: null }} data={overview()} />);
    expect(screen.queryByRole("region", { name: "Tu contacto en Cincel" })).toBeNull();
  });

  it("no Escribir without email", () => {
    render(<PortalEsencial project={{ ...project, manager: { name: "Ana Torres", email: null } }} data={overview()} />);
    expect(screen.getByText("Ana Torres")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Escribir/ })).toBeNull();
  });

  it("documents null hides card", () => {
    render(<PortalEsencial project={project} data={overview({ documentos: null, recentFiles: [] })} />);
    expect(screen.queryByRole("region", { name: "Documentos recientes" })).toBeNull();
  });

  it("empty documents and entregas show their empty copy", () => {
    render(<PortalEsencial project={project} data={overview({ entregas: [], recentFiles: [] })} />);
    expect(screen.getByText("No hay entregas próximas.")).toBeTruthy();
    expect(screen.getByText("Aún no hay documentos compartidos.")).toBeTruthy();
  });

  it("sentence variants: terminado, por iniciar, no tramos", () => {
    const done = tramos.map((t) => ({ ...t, state: "completado" as const, progressPct: 100 }));
    const { unmount } = render(<PortalEsencial project={project} data={overview({ tramos: done })} />);
    expect(screen.getByText("Proyecto terminado")).toBeTruthy();
    unmount();

    const fresh = tramos.map((t) => ({ ...t, state: "por_iniciar" as const, progressPct: 0 }));
    const second = render(<PortalEsencial project={project} data={overview({ tramos: fresh })} />);
    expect(
      screen.getByText((_, el) => el?.tagName === "P" && /^Aún no comenzamos/.test(el.textContent ?? "")).textContent,
    ).toBe("Aún no comenzamos · próxima entrega 14 nov");
    second.unmount();

    render(<PortalEsencial project={project} data={overview({ tramos: [], entregas: [] })} />);
    expect(
      screen.getByText((_, el) => el?.tagName === "P" && /^Llevamos/.test(el.textContent ?? "")).textContent,
    ).toBe("Llevamos 41 % de avance general");
    expect(screen.queryByText("Presale")).toBeNull();
  });
});
