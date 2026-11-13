// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { buildPortalOverview } from "@/lib/portal/overview";
import type { PortalFileDTO, PortalProjectDTO, PortalScheduleDTO, PortalEtapaDTO } from "@/lib/types/portal";
import type { PresentationStyle } from "@/lib/types/redesign";

/** What each style's layout received. */
const calls = vi.hoisted(() => [] as { layout: string; props: Record<string, unknown> }[]);

vi.mock("@/components/widgets/portal/PortalVisual", () => ({
  PortalVisual: (props: Record<string, unknown>) => {
    calls.push({ layout: "visual", props });
    return <div data-testid="layout-visual" />;
  },
}));
vi.mock("@/components/widgets/portal/PortalEsencial", () => ({
  PortalEsencial: (props: Record<string, unknown>) => {
    calls.push({ layout: "esencial", props });
    return <div data-testid="layout-esencial" />;
  },
}));
vi.mock("@/components/widgets/portal/PortalAnalitico", () => ({
  PortalAnalitico: (props: Record<string, unknown>) => {
    calls.push({ layout: "analitico", props });
    return <div data-testid="layout-analitico" />;
  },
}));

import PortalProjectOverview, { portalDocumentDownloadUrl } from "./PortalProjectOverview";

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
const etapas: PortalEtapaDTO[] = [
  { key: "presale", name: "Presale", state: "completado", progressPct: 100, startMonth: "2026-01" },
  { key: "diseno", name: "Diseño", state: "en_curso", progressPct: 40, startMonth: "2026-05" },
];
const files: PortalFileDTO[] = [
  { id: "f1", name: "Contrato.pdf", mimeType: "application/pdf", sizeBytes: 10, modifiedAt: "2026-09-15T00:00:00Z", kind: "file", deliveredAs: "original" },
];
const data = buildPortalOverview({ project, schedule, etapas, files, today: "2026-11-07" });

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];

function renderIn(style: PresentationStyle, fixedByOrg = false) {
  return render(
    <StyleProvider style={style} scope="portal" fixedByOrg={fixedByOrg}>
      <PortalProjectOverview project={project} data={data} />
    </StyleProvider>,
  );
}

describe("PortalProjectOverview", () => {
  afterEach(() => {
    cleanup();
    calls.length = 0;
  });

  it("renders only the active style's layout, each fed the same data (ADR 0004)", () => {
    for (const style of STYLES) {
      renderIn(style);
      for (const other of STYLES) {
        expect(!!screen.queryByTestId(`layout-${other}`), `${other} in ${style}`).toBe(other === style);
      }
      cleanup();
    }
    expect(calls.map((c) => c.layout)).toEqual(STYLES);
    for (const call of calls) expect(call.props).toEqual({ project, data });
  });

  it("keeps the layout of the organization's fixed style", () => {
    renderIn("esencial", true);
    expect(screen.getByTestId("layout-esencial")).toBeTruthy();
  });

  it("has no approvals, messages or payments blocks", () => {
    renderIn("visual");
    const text = document.body.textContent ?? "";
    for (const absent of ["Aprobar", "Renders por aprobar", "Mensajes", "Pagos"]) expect(text).not.toContain(absent);
  });

  it("keeps the download URL helper for the layouts", () => {
    expect(portalDocumentDownloadUrl("p 1", "f1")).toBe("/api/portal/projects/p%201/files/f1/download");
  });
});
