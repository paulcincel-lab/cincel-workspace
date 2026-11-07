// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, within } from "@testing-library/react";
import type { ReactNode } from "react";

import { StyleProvider } from "@/components/shell/StyleProvider";
import { CronogramaWidget } from "@/components/widgets/CronogramaWidget";
import { CRONOGRAMA_PROJECT_ID, cronogramaEmptyTable, cronogramaTable } from "@/components/widgets/fixtures/cronograma";
import type { PresentationStyle } from "@/lib/types/redesign";

vi.mock("@/components/shell/LoadingSkeleton", () => ({
  LoadingSkeleton: (props: { variant: string; rows?: number }) => (
    <div data-testid="loading-skeleton" data-variant={props.variant} data-rows={props.rows} />
  ),
}));

vi.mock("@/components/shell/EmptyState", () => ({
  EmptyState: (props: { title: string; description?: string }) => (
    <div data-testid="empty-state">
      <p>{props.title}</p>
      {props.description ? <p>{props.description}</p> : null}
    </div>
  ),
}));

vi.mock("@/components/widgets/WidgetCard", () => ({
  WidgetCard: (props: { title: string; actions?: ReactNode; children: ReactNode }) => (
    <section aria-label={props.title} data-testid="widget-card">
      <h2>{props.title}</h2>
      {props.actions}
      {props.children}
    </section>
  ),
}));

afterEach(cleanup);

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];

function renderIn(style: PresentationStyle, ui: ReactNode) {
  return render(
    <StyleProvider style={style} scope="staff">
      {ui}
    </StyleProvider>,
  );
}

function widget(extra: Partial<Parameters<typeof CronogramaWidget>[0]> = {}) {
  return <CronogramaWidget projectId={CRONOGRAMA_PROJECT_ID} table={cronogramaTable} {...extra} />;
}

/** A cell showing `n` as a percent, whether or not the table formats it. */
const percentText = (n: number) => (content: string) => new RegExp(`^${n}\\s?%?$`).test(content.trim());

describe("CronogramaWidget", () => {
  it("Visual: partida timeline, indicators and the wrapped existing panels", () => {
    const { container, getByRole, getByText, getByTestId, queryByRole } = renderIn(
      "visual",
      widget({ panels: <div data-testid="existing-panels">Cronograma general</div> }),
    );

    const timeline = getByRole("region", { name: "Cronograma de obra" });
    expect(within(timeline).getByText("Instalaciones")).toBeTruthy();
    expect(within(timeline).getByText("Hidráulica y sanitaria")).toBeTruthy();
    expect(within(timeline).getByText("90%")).toBeTruthy();
    expect(within(timeline).getByText("85%")).toBeTruthy();
    expect(within(timeline).getByText("Hito · Entrega de obra negra")).toBeTruthy();
    expect(within(timeline).getByText("27 jul – 12 oct")).toBeTruthy();
    for (const month of ["jul", "ago", "sep", "oct", "nov", "dic", "ene"]) {
      expect(within(timeline).getByText(month)).toBeTruthy();
    }

    const wrapped = getByRole("region", { name: "Seguimiento de obra" });
    expect(within(wrapped).getByTestId("existing-panels")).toBe(getByTestId("existing-panels"));

    const avance = getByRole("region", { name: "Avance del cronograma" });
    expect(within(avance).getByText("82% / 85%")).toBeTruthy();
    expect(within(avance).getByText("3 puntos por debajo del plan")).toBeTruthy();
    expect(within(avance).getByText("2")).toBeTruthy();
    expect(within(avance).getByText("18 nov")).toBeTruthy();
    expect(within(avance).getByText("29 ene")).toBeTruthy();
    expect(getByText("9 días después de lo pactado en contrato")).toBeTruthy();

    expect(getByRole("link", { name: "Ver reporte" }).getAttribute("href")).toBe(
      `/proyectos/${CRONOGRAMA_PROJECT_ID}/cronograma/reporte`,
    );
    // Only the chosen style renders.
    expect(container.querySelector("table")).toBeNull();
    expect(queryByRole("region", { name: "Programa de obra" })).toBeNull();
  });

  it("Esencial: indicators as text, partidas through RecordTable (duración, holgura) and hitos", () => {
    const { container, getByRole, queryByRole } = renderIn("esencial", widget({ panels: <div data-testid="existing-panels" /> }));

    const avance = getByRole("region", { name: "Avance del cronograma" });
    expect(within(avance).getByText("82% / 85%")).toBeTruthy();
    expect(within(avance).getByText("3 puntos por debajo del plan")).toBeTruthy();
    expect(within(avance).getByText("2")).toBeTruthy();

    const partidas = getByRole("region", { name: "Partidas" });
    const table = within(partidas).getByRole("table");
    expect(within(table).getByRole("columnheader", { name: "Duración" })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "Holgura" })).toBeTruthy();
    const instalaciones = within(table).getByText("Instalaciones").closest("tr");
    expect(instalaciones).not.toBeNull();
    expect(within(instalaciones as HTMLElement).getAllByText(percentText(90)).length).toBeGreaterThan(0);

    const hitos = getByRole("region", { name: "Hitos" });
    expect(within(hitos).getByText("Entrega de obra negra")).toBeTruthy();
    expect(within(hitos).getByText("18 nov")).toBeTruthy();
    expect(within(hitos).getByText("29 ene")).toBeTruthy();

    // No charts and no wrapped panels in Esencial.
    expect(container.querySelector('[data-testid="existing-panels"]')).toBeNull();
    expect(queryByRole("region", { name: "Cronograma de obra" })).toBeNull();
  });

  it("Analítico: indicators table and the program table with derived monthly timeline", () => {
    const { getByRole, queryByRole } = renderIn("analitico", widget());

    const indicadores = within(getByRole("region", { name: "Indicadores" })).getByRole("table");
    expect(within(indicadores).getByText("Avance real vs. plan")).toBeTruthy();
    expect(within(indicadores).getByText("82% / 85%")).toBeTruthy();
    expect(within(indicadores).getByText("3 puntos por debajo del plan")).toBeTruthy();
    expect(within(indicadores).getByText("2")).toBeTruthy();
    expect(within(indicadores).getByText("Instalaciones y Albañilería y muros")).toBeTruthy();

    const programa = within(getByRole("region", { name: "Programa de obra" })).getByRole("table");
    for (const header of ["Partida", "Responsable", "Inicio", "Fin", "Duración", "% real", "% plan", "Desv.", "Holgura"]) {
      expect(within(programa).getByRole("columnheader", { name: header })).toBeTruthy();
    }
    expect(within(programa).getByRole("columnheader", { name: "jul · ago · sep · oct · nov · dic · ene" })).toBeTruthy();

    const instalaciones = within(programa).getByText("Instalaciones").closest("tr") as HTMLElement;
    expect(within(instalaciones).getAllByText(percentText(90)).length).toBeGreaterThan(0);
    expect(within(instalaciones).getByText("▪▪▪▪···")).toBeTruthy();
    const hito = within(programa).getByText("Hito · Entrega al cliente").closest("tr") as HTMLElement;
    expect(within(hito).getByText("······◆")).toBeTruthy();
    expect(within(hito).getAllByText("—").length).toBeGreaterThan(0);

    expect(queryByRole("region", { name: "Avance del cronograma" })).toBeNull();
  });

  it("renders the same indicator numbers in every style", () => {
    for (const style of STYLES) {
      const { getAllByText, unmount } = renderIn(style, widget());
      expect(getAllByText("82% / 85%")).toHaveLength(1);
      expect(getAllByText("3 puntos por debajo del plan")).toHaveLength(1);
      expect(getAllByText("Avance real vs. plan")).toHaveLength(1);
      expect(getAllByText("Partidas con retraso")).toHaveLength(1);
      expect(getAllByText("Entrega estimada")).toHaveLength(1);
      unmount();
    }
  });

  it("shows the default empty state, or the one given, when there are no rows", () => {
    for (const style of STYLES) {
      const { getByTestId, queryByRole, unmount } = renderIn(
        style,
        <CronogramaWidget projectId={CRONOGRAMA_PROJECT_ID} table={cronogramaEmptyTable} />,
      );
      expect(getByTestId("empty-state").textContent).toContain("Este proyecto todavía no tiene un cronograma importado");
      expect(queryByRole("table")).toBeNull();
      unmount();
    }

    const { getByTestId } = renderIn(
      "visual",
      <CronogramaWidget
        projectId={CRONOGRAMA_PROJECT_ID}
        table={cronogramaEmptyTable}
        emptyState={{ title: "Sin partidas", description: "Importa el cronograma." }}
      />,
    );
    expect(getByTestId("empty-state").textContent).toContain("Sin partidas");
  });

  it("renders its LoadingSkeleton variant per style while loading", () => {
    const expected: Record<PresentationStyle, string> = { visual: "list", esencial: "list", analitico: "table" };
    for (const style of STYLES) {
      const { getAllByTestId, queryByText, unmount } = renderIn(style, widget({ loading: true }));
      const skeletons = getAllByTestId("loading-skeleton");
      expect(skeletons).toHaveLength(1);
      expect(skeletons[0].getAttribute("data-variant")).toBe(expected[style]);
      expect(queryByText("82% / 85%")).toBeNull();
      unmount();
    }
  });
});
