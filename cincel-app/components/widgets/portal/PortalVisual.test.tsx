// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { buildPortalOverview } from "@/lib/portal/overview";
import type {
  PortalFileDTO,
  PortalFolderGroupDTO,
  PortalProjectDTO,
  PortalScheduleDTO,
  PortalTeamMemberDTO,
  PortalTramoDTO,
} from "@/lib/types/portal";

import { PortalVisual, portalDayMonth, portalMailto, portalMonthYear } from "./PortalVisual";

const project: PortalProjectDTO = {
  id: "p 1",
  name: "Oficina Polanco",
  code: "OP-01",
  address: "Av. Presidente Masaryk 120, Polanco",
  status: "activo",
  progressPct: 41,
  startDate: "2026-01-15",
  endDate: "2027-04-30",
  manager: { name: "Luis Pérez", email: "luis@cincel.mx" },
};
const schedule: PortalScheduleDTO = {
  sections: [
    { key: "PB::Planos", planta: "Planta baja", seccion: "Planos de instalación eléctrica", start: "2026-10-01", end: "2026-11-14", progressPct: 40 },
    { key: "PB::Render", planta: "Planta baja", seccion: "Render final del lobby", start: "2026-10-01", end: "2026-11-21", progressPct: 10 },
    { key: "PA::Ejecutivo", planta: "Planta alta", seccion: "Proyecto ejecutivo", start: "2026-10-01", end: "2026-11-28", progressPct: 0 },
    { key: "PA::Obra", planta: "Planta alta", seccion: "Inicio de obra", start: "2026-11-01", end: "2026-12-08", progressPct: 0 },
    { key: "PA::Acabados", planta: "Planta alta", seccion: "Acabados", start: "2026-12-01", end: "2027-01-20", progressPct: 0 },
  ],
};
const tramos: PortalTramoDTO[] = [
  { key: "presale", name: "Presale", state: "completado", progressPct: 100, startMonth: "2026-01" },
  { key: "diseno", name: "Diseño", state: "en_curso", progressPct: 62, startMonth: "2026-06" },
  { key: "construccion", name: "Construcción", state: "por_iniciar", progressPct: 0, startMonth: null },
  { key: "decoracion", name: "Decoración", state: "por_iniciar", progressPct: 0, startMonth: null },
];
const file = (id: string, name: string, modifiedAt: string, over: Partial<PortalFileDTO> = {}): PortalFileDTO => ({
  id,
  name,
  mimeType: "application/pdf",
  sizeBytes: 2_400_000,
  modifiedAt,
  kind: "file",
  deliveredAs: "original",
  ...over,
});
const folders: PortalFolderGroupDTO[] = [
  { folderId: "root", name: "General", files: [file("c1", "Contrato firmado.pdf", "2026-10-30T10:00:00Z", { sizeBytes: 820_000 })] },
  { folderId: "d1", name: "Planos", files: [file("p1", "Planta arquitectónica v3.pdf", "2026-11-05T10:00:00Z")] },
  {
    folderId: "d2",
    name: "Renders",
    files: [
      file("r1", "Render preliminar del lobby.jpg", "2026-11-03T10:00:00Z", { mimeType: "image/jpeg", sizeBytes: 6_100_000 }),
      file("r0", "Render viejo.jpg", "2026-08-01T10:00:00Z", { mimeType: "image/jpeg" }),
    ],
  },
  {
    folderId: "d3",
    name: "Presupuestos",
    files: [file("x1", "Presupuesto de acabados.xlsx", "2026-10-28T10:00:00Z", { mimeType: "application/vnd.ms-excel", sizeBytes: 140_000 })],
  },
];
const team: PortalTeamMemberDTO[] = [
  { name: "Luis Pérez", role: "Responsable del proyecto", email: "luis@cincel.mx" },
  { name: "Ana Ruiz", role: "Diseñadora líder", email: null },
  { name: "Marta Gil", role: "Residente de obra", email: null },
];

function overview(over: Partial<Parameters<typeof buildPortalOverview>[0]> = {}) {
  return buildPortalOverview({
    project,
    schedule,
    tramos,
    files: folders[0].files,
    folders,
    team,
    today: "2026-11-09",
    ...over,
  });
}

afterEach(cleanup);

describe("PortalVisual", () => {
  it("renders hero, fases, entregas, documentos, equipo", () => {
    render(<PortalVisual project={project} data={overview()} />);

    // Hero: address, name, tramo chip, next delivery, ring.
    expect(screen.getByText("Av. Presidente Masaryk 120, Polanco")).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1, name: "Oficina Polanco" })).toBeTruthy();
    expect(screen.getByText("En Diseño")).toBeTruthy();
    expect(screen.getByText(/Próxima entrega/).textContent?.replace(/\s+/g, " ")).toBe("Próxima entrega · 14 nov");
    expect(screen.getByRole("img", { name: "Avance general 41 %" })).toBeTruthy();
    expect(screen.getByText(/etapas en marcha/).textContent).toBe(
      "2 de 4 etapas en marcha · entrega final estimada abr 2027",
    );
    expect(document.body.textContent).not.toContain("FOTO DEL PROYECTO");

    // Fases: one bar per tramo with its state.
    const fases = screen.getByRole("region", { name: "Fases" });
    const bars = within(fases).getAllByRole("progressbar");
    expect(bars.map((b) => [b.getAttribute("aria-label"), b.getAttribute("aria-valuenow")])).toEqual([
      ["Presale, completado", "100"],
      ["Diseño, en curso", "62"],
      ["Construcción, por iniciar", "0"],
      ["Decoración, por iniciar", "0"],
    ]);
    expect(within(fases).getByText("Completado · 100 %")).toBeTruthy();
    expect(within(fases).getByText("En curso · 62 %")).toBeTruthy();

    // Entregas: the first 4 open sections, with their planta.
    const entregas = screen.getByRole("region", { name: "Próximas entregas" });
    const items = within(entregas).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0].textContent).toBe("14 novPlanos de instalación eléctricaPlanta baja");
    expect(items[3].textContent).toContain("Inicio de obra");

    // Documentos: the 4 newest across folders, linking to the download route.
    const docs = screen.getByRole("region", { name: "Documentos compartidos" });
    const links = within(docs).getAllByRole("link", { name: /^Descargar / });
    expect(links.map((l) => l.getAttribute("aria-label"))).toEqual([
      "Descargar Planta arquitectónica v3.pdf",
      "Descargar Render preliminar del lobby.jpg",
      "Descargar Contrato firmado.pdf",
      "Descargar Presupuesto de acabados.xlsx",
    ]);
    expect(links[0].getAttribute("href")).toBe("/api/portal/projects/p%201/files/p1/download");
    expect(links[0].textContent).toContain("VISTA PREVIA · PDF");
    expect(links[0].textContent).toContain("Planos · 5 nov · 2.3 MB");
    expect(within(docs).getByRole("link", { name: "Ver todos →" }).getAttribute("href")).toBe(
      "/portal/proyectos/p%201?tab=archivos",
    );

    // Equipo.
    const equipo = screen.getByRole("region", { name: "Tu equipo Cincel" });
    expect(within(equipo).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "LPLuis PérezResponsable del proyectoEscribir",
      "ARAna RuizDiseñadora líder",
      "MGMarta GilResidente de obra",
    ]);
  });

  it("hides documents when null", () => {
    render(<PortalVisual project={project} data={overview({ files: null, folders: null })} />);
    expect(screen.queryByRole("region", { name: "Documentos compartidos" })).toBeNull();
  });

  it("shows the empty documents line when the folder has no files", () => {
    render(<PortalVisual project={project} data={overview({ files: [], folders: [{ folderId: "root", name: "General", files: [] }] })} />);
    expect(screen.getByText("Aún no hay documentos compartidos.")).toBeTruthy();
  });

  it("Escribir only with email", () => {
    render(<PortalVisual project={project} data={overview()} />);
    const escribir = screen.getAllByRole("link", { name: /^Escribir/ });
    expect(escribir).toHaveLength(1);
    expect(escribir[0].getAttribute("href")).toBe("mailto:luis@cincel.mx?subject=Oficina%20Polanco");
    expect(portalMailto("a@b.mx", "Casa & Jardín")).toBe("mailto:a@b.mx?subject=Casa%20%26%20Jard%C3%ADn");
  });

  it("without etapas hides Fases and the chip; the caption keeps only the date", () => {
    render(<PortalVisual project={project} data={overview({ tramos: [] })} />);
    expect(screen.queryByRole("region", { name: "Fases" })).toBeNull();
    expect(screen.queryByText(/^En /)).toBeNull();
    expect(screen.getByText(/Entrega final estimada/).textContent).toBe("Entrega final estimada abr 2027");
  });

  it("drops the date from the caption without an end date", () => {
    render(<PortalVisual project={{ ...project, endDate: null }} data={overview()} />);
    expect(screen.getByText(/etapas en marcha/).textContent).toBe("2 de 4 etapas en marcha");
  });

  it("shows No hay entregas próximas without a schedule, and hides an empty team", () => {
    render(<PortalVisual project={project} data={overview({ schedule: null, team: [] })} />);
    expect(screen.getByText("No hay entregas próximas.")).toBeTruthy();
    expect(screen.queryByText(/Próxima entrega/)).toBeNull();
    expect(screen.queryByRole("region", { name: "Tu equipo Cincel" })).toBeNull();
  });

  it("shows a por iniciar etapa's start month when it has one", () => {
    const withMonth = tramos.map((t) => (t.key === "construccion" ? { ...t, startMonth: "2026-12" } : t));
    render(<PortalVisual project={project} data={overview({ tramos: withMonth })} />);
    expect(screen.getByText("Por iniciar · dic 2026")).toBeTruthy();
  });

  it("wraps a long name and clamps file names with a title", () => {
    const long = "Residencia con un nombre muy largo que no cabe en una sola línea del encabezado";
    render(<PortalVisual project={{ ...project, name: long }} data={overview()} />);
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("break-words");
    const card = screen.getByRole("link", { name: "Descargar Contrato firmado.pdf" });
    expect(card.getAttribute("title")).toBe("Contrato firmado.pdf");
    expect(card.querySelector(".line-clamp-2")?.textContent).toBe("Contrato firmado.pdf");
  });

  it("formats dates as the frame does", () => {
    expect(portalDayMonth("2026-11-14")).toBe("14 nov");
    expect(portalDayMonth("2026-03-05T10:00:00Z")).toBe("5 mar");
    expect(portalMonthYear("2027-04")).toBe("abr 2027");
  });

  it("uses the shared motion utilities and no raw colors", () => {
    const { container } = render(<PortalVisual project={project} data={overview()} />);
    expect(container.querySelector("circle.ring")).toBeTruthy();
    expect(container.querySelector(".grow-x")).toBeTruthy();
    expect(container.querySelectorAll(".lift").length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".anim-in").length).toBeGreaterThan(0);
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{6}\b/i);
    expect(container.innerHTML).not.toMatch(/font-(bold|extrabold|black)/);
  });
});
