// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { StyleProvider, useStyle } from "@/components/shell/StyleProvider";
import { buildPortalOverview } from "@/lib/portal/overview";
import type { PortalFileDTO, PortalProjectDTO, PortalScheduleDTO, PortalTramoDTO } from "@/lib/types/portal";
import type { PresentationStyle } from "@/lib/types/redesign";

/** What each library widget received, with the style it was rendered in. */
const calls = vi.hoisted(() => [] as { widget: string; style: string; props: Record<string, unknown> }[]);

vi.mock("@/components/widgets/ProgressListWidget", () => ({
  ProgressListWidget: (props: Record<string, unknown>) => {
    calls.push({ widget: "ProgressListWidget", style: useStyle().style, props });
    return <div data-testid="progress" />;
  },
}));
vi.mock("@/components/widgets/AgendaWidget", () => ({
  AgendaWidget: (props: Record<string, unknown>) => {
    calls.push({ widget: "AgendaWidget", style: useStyle().style, props });
    return <div data-testid="agenda" />;
  },
}));
vi.mock("@/components/widgets/RecordTable", () => ({
  RecordTable: (props: { data: { rows: Record<string, unknown>[] }; renderCell?: (k: string, r: Record<string, unknown>) => unknown }) => {
    calls.push({ widget: "RecordTable", style: useStyle().style, props });
    return <div data-testid="documentos">{props.data.rows.map((row) => <span key={String(row.id)}>{props.renderCell?.("name", row) as never}</span>)}</div>;
  },
}));

import PortalProjectOverview from "./PortalProjectOverview";

const project: PortalProjectDTO = {
  id: "p 1",
  name: "Casa Lomas",
  code: "CL-01",
  address: "Av. Siempre Viva 742",
  status: "activo",
  progressPct: 42,
  startDate: "2026-01-15",
  endDate: "2026-12-20",
  manager: { name: "Laura Pérez", email: "laura@cincel.mx" },
};
const schedule: PortalScheduleDTO = {
  sections: [{ key: "PB::Muros", planta: "PB", seccion: "Muros", start: "2026-03-01", end: "2026-12-15", progressPct: 50 }],
};
const tramos: PortalTramoDTO[] = [
  { key: "presale", name: "Presale", state: "completado" },
  { key: "diseno", name: "Diseño", state: "en_curso" },
  { key: "construccion", name: "Construcción", state: "por_iniciar" },
];
const files: PortalFileDTO[] = [
  { id: "f1", name: "Contrato.pdf", mimeType: "application/pdf", sizeBytes: 10, modifiedAt: "2026-09-15T00:00:00Z", kind: "file", deliveredAs: "original" },
];
const data = buildPortalOverview({ project, schedule, tramos, files, today: "2026-11-07" });

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];

function renderIn(style: PresentationStyle, overview = data) {
  return render(
    <StyleProvider style={style} scope="portal">
      <PortalProjectOverview project={project} data={overview} />
    </StyleProvider>,
  );
}

function propsOf(widget: string, style: string) {
  const call = calls.find((c) => c.widget === widget && c.style === style);
  expect(call, `${widget} in ${style}`).toBeTruthy();
  const { renderCell: _renderCell, ...rest } = call!.props;
  void _renderCell;
  return rest;
}

describe("PortalProjectOverview", () => {
  afterEach(() => {
    cleanup();
    calls.length = 0;
  });

  it("renders Visual, Esencial and Analítico from the same data (FE §18 item 4)", () => {
    const markup: string[] = [];
    for (const style of STYLES) {
      const { container } = renderIn(style);
      // useId values differ per render root; compare the markup without them.
      markup.push(container.innerHTML.replace(/(id|aria-labelledby)="[^"]*"/g, ""));
      cleanup();
    }
    for (const widget of ["ProgressListWidget", "AgendaWidget", "RecordTable"]) {
      const visual = propsOf(widget, "visual");
      expect(propsOf(widget, "esencial")).toEqual(visual);
      expect(propsOf(widget, "analitico")).toEqual(visual);
    }
    // The page itself writes no per-style markup: only the widgets differ.
    expect(markup[1]).toBe(markup[0]);
    expect(markup[2]).toBe(markup[0]);
  });

  it("feeds each widget its slice of the data", () => {
    renderIn("visual");
    expect(propsOf("ProgressListWidget", "visual")).toMatchObject({ title: "Avance", items: data.progress });
    expect(propsOf("AgendaWidget", "visual")).toMatchObject({ title: "Próximas entregas", items: data.entregas, mode: "month" });
    expect(propsOf("RecordTable", "visual")).toMatchObject({ data: data.documentos });
  });

  it("shows the tramos with the stepper and the project facts without a second progress bar", () => {
    renderIn("esencial");
    expect(screen.getByRole("heading", { level: 2, name: "Fases" })).toBeTruthy();
    expect(screen.getByText("Fase actual: Diseño · 2 de 3")).toBeTruthy();
    expect(screen.getByText("Construcción").nextElementSibling?.textContent).toBe("Por iniciar");
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.getByText("Activo")).toBeTruthy();
  });

  it("links each shared document to the portal download route", () => {
    renderIn("analitico");
    expect(screen.getByRole("link", { name: "Descargar Contrato.pdf" }).getAttribute("href")).toBe(
      "/api/portal/projects/p%201/files/f1/download",
    );
  });

  it("has no approvals, messages or payments blocks, and no documents block without a listing", () => {
    renderIn("visual", { ...data, documentos: null, stepper: null, tramos: [] });
    const text = document.body.textContent ?? "";
    for (const absent of ["Aprobar", "Renders por aprobar", "Mensajes", "Pagos", "Documentos compartidos", "Fases"]) {
      expect(text).not.toContain(absent);
    }
    expect(screen.queryByTestId("documentos")).toBeNull();
  });
});
