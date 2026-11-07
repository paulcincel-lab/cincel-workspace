// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";

// The widgets own the per-style markup; here they print the data they get, so
// the tests check what the Resumen passes (and what it leaves out) per style.
vi.mock("@/components/widgets/WidgetCard", () => ({
  WidgetCard: ({ title, actions, children }: { title: string; actions?: ReactNode; children: ReactNode }) => (
    <section aria-label={title} data-widget="card">
      <h2>{title}</h2>
      {actions}
      {children}
    </section>
  ),
}));
vi.mock("@/components/widgets/ProgressListWidget", () => ({
  ProgressListWidget: (props: { title: string }) => (
    <section aria-label={props.title} data-widget="progress">
      <pre>{JSON.stringify(props)}</pre>
    </section>
  ),
}));
vi.mock("@/components/widgets/KpiWidget", () => ({
  KpiWidget: (props: object) => (
    <section aria-label="Indicadores" data-widget="kpi">
      <pre>{JSON.stringify(props)}</pre>
    </section>
  ),
}));
vi.mock("@/components/widgets/EntityCardGrid", () => ({
  EntityCardGrid: (props: object) => <pre data-widget="cards">{JSON.stringify(props)}</pre>,
}));
vi.mock("@/components/widgets/TramoStepperWidget", () => ({
  TramoStepperWidget: (props: { title: string }) => (
    <section aria-label={props.title} data-widget="tramos">
      <pre>{JSON.stringify(props)}</pre>
    </section>
  ),
}));
vi.mock("@/components/widgets/RecordTable", () => ({
  RecordTable: ({
    data,
    renderCell,
  }: {
    data: { columns: { key: string }[]; rows: Record<string, unknown>[] };
    renderCell?: (key: string, row: Record<string, unknown>) => ReactNode | undefined;
  }) => (
    <table data-widget="table">
      <tbody>
        {data.rows.map((row, i) => (
          <tr key={i}>
            {data.columns.map((c) => (
              <td key={c.key}>{renderCell?.(c.key, row) ?? String(row[c.key] ?? "")}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  ),
}));

import { StyleProvider } from "@/components/shell/StyleProvider";
import type { PresentationStyle } from "@/lib/types/redesign";
import { fixtureSummaryInput } from "@/tests/unit/fixtures/project-summary";

import { ProjectSummary } from "./ProjectSummary";

afterEach(cleanup);

function renderSummary(overrides: Parameters<typeof fixtureSummaryInput>[0] = {}, style: PresentationStyle = "visual") {
  return render(
    <StyleProvider style={style} scope="staff">
      <ProjectSummary {...fixtureSummaryInput(overrides)} />
    </StyleProvider>
  );
}

describe("ProjectSummary · visibility (B8)", () => {
  it("shows «Cliente y contactos» with the client when allowed", () => {
    renderSummary();
    const card = screen.getByRole("region", { name: "Cliente y contactos" });
    expect(within(card).getByText("Grupo Espinopapa")).toBeTruthy();
    expect(within(card).getByText("Mariana Ruiz")).toBeTruthy();
    expect(within(card).getAllByText("Paul Langarica").length).toBeGreaterThan(0);
  });

  it("has no «Cliente y contactos» and no client data for a viewer who may not see them", () => {
    const { container } = renderSummary({ showClientContacts: false });
    expect(screen.queryByText("Cliente y contactos")).toBeNull();
    expect(container.textContent).not.toContain("Grupo Espinopapa");
    expect(container.textContent).not.toContain("Mariana Ruiz");
    // The team stays visible.
    const team = screen.getByRole("region", { name: "Equipo" });
    expect(within(team).getByText("Alejandro Riofrio")).toBeTruthy();
  });

  it("shows the budget bar and budget table only to admins", () => {
    renderSummary();
    expect(screen.getByRole("region", { name: "Presupuesto" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Presupuesto por pago" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Indicadores" }).textContent).toContain("Presupuesto ejercido");
    cleanup();

    const { container } = renderSummary({ showBudget: false });
    expect(screen.queryByRole("region", { name: "Presupuesto" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Presupuesto por pago" })).toBeNull();
    expect(container.textContent).not.toContain("Presupuesto ejercido");
    expect(container.textContent).not.toContain("budgetPct\":64");
    expect(container.textContent).not.toContain("Contrato");
  });

  it("links staff to their Cutto chat in a new tab, never embedding Cutto", () => {
    const { container } = renderSummary();
    const link = screen.getByRole("link", { name: "Abrir chat en Cutto con Paul Langarica" });
    expect(link.getAttribute("href")).toBe("https://cutto.cloudketer.dev/dm/paul%40cincel.mx");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.queryByRole("link", { name: /Cutto con Grupo Espinopapa/ })).toBeNull();
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("leaves out partidas and recent files when there is no cronograma or Drive folder", () => {
    renderSummary({ schedule: null, files: null });
    expect(screen.queryByRole("region", { name: "Cronograma de obra" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Archivos recientes" })).toBeNull();
    expect(screen.getByRole("region", { name: "Ficha" })).toBeTruthy();
  });

  it("links «Ver los n» to the Archivos tab", () => {
    renderSummary();
    expect(screen.getByRole("link", { name: "Ver los 3" }).getAttribute("href")).toBe("/proyectos/p1/archivos");
  });
});

describe("ProjectSummary · styles", () => {
  it("renders the same widgets with the same data in Visual, Esencial and Analítico", () => {
    const snapshots = (["visual", "esencial", "analitico"] as const).map((style) => {
      const { container } = renderSummary({}, style);
      const widgets = Array.from(container.querySelectorAll("[data-widget]")).map(
        (el) => `${el.getAttribute("data-widget")}:${el.getAttribute("aria-label") ?? ""}:${el.textContent}`
      );
      cleanup();
      return widgets;
    });
    expect(snapshots[0].length).toBeGreaterThan(0);
    expect(snapshots[1]).toEqual(snapshots[0]);
    expect(snapshots[2]).toEqual(snapshots[0]);
  });

  it("passes the avance ring the portfolio numbers and the task caption", () => {
    renderSummary();
    const avance = screen.getByRole("region", { name: "Avance" }).textContent ?? "";
    expect(avance).toContain('"variant":"rings"');
    expect(avance).toContain('"real":82');
    expect(avance).toContain("32 de 39 tareas");
  });
});
