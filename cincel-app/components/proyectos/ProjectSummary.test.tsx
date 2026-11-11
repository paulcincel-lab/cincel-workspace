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

// Analítico has its own layout (#997); here it only marks that it rendered.
vi.mock("@/components/widgets/ResumenAnaliticoLayout", () => ({
  ResumenAnaliticoLayout: ({ data }: { data: { project: { name: string } } }) => (
    <section aria-label="Resumen analítico" data-layout="analitico">
      {data.project.name}
    </section>
  ),
}));

// Esencial has its own layout (#996); here it only marks that it rendered.
vi.mock("@/components/widgets/ResumenEsencialLayout", () => ({
  ResumenEsencialLayout: ({ data }: { data: { project: { name: string } } }) => (
    <section aria-label="Resumen esencial" data-layout="esencial">
      {data.project.name}
    </section>
  ),
}));

// Visual has its own layout (#995); here it prints what the Resumen passes it.
vi.mock("@/components/widgets/ResumenVisualLayout", () => ({
  ResumenVisualLayout: (props: {
    data: { project: { name: string } };
    summary: { next: { id: string }[] };
    history: { events: { id: string }[]; status: string };
    canCreate: boolean;
  }) => (
    <section
      aria-label="Resumen visual"
      data-layout="visual"
      data-next={props.summary.next.map((t) => t.id).join(",")}
      data-events={props.history.events.map((e) => e.id).join(",")}
      data-history={props.history.status}
      data-can-create={String(props.canCreate)}
    >
      {props.data.project.name}
    </section>
  ),
}));
vi.mock("@/components/tareas/quick-add-create", () => ({
  useQuickAddCreate: () => ({ create: vi.fn(async () => ({ id: "new", title: "Nueva" })), undo: vi.fn() }),
}));
vi.mock("@/lib/stores/quick-add-store", () => ({
  useQuickAddRecent: (select: (state: { recent: string[] }) => unknown) => select({ recent: [] }),
}));

// The page prefetches the Resumen, the task numbers and the history; a client call here would be a bug.
const actions = vi.hoisted(() => ({
  getProyectoResumenData: vi.fn(),
  getProyectoResumenSummary: vi.fn(),
  getProyectoHistoryPage: vi.fn(),
}));
vi.mock("@/lib/actions/page-data/proyectos-actions", () => actions);
const summaryLib = vi.hoisted(() => ({ builds: 0 }));
vi.mock("@/lib/proyectos/project-summary", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/proyectos/project-summary")>();
  return {
    ...actual,
    buildProjectSummary: (input: Parameters<typeof actual.buildProjectSummary>[0]) => {
      summaryLib.builds += 1;
      return actual.buildProjectSummary(input);
    },
  };
});

import { StyleProvider } from "@/components/shell/StyleProvider";
import { qk } from "@/lib/query/keys";
import { proyectoHistoryOptions, proyectoResumenOptions, proyectoResumenSummaryOptions } from "@/lib/query/options/proyectos";
import { prefetch } from "@/lib/query/server";
import { createTestQueryClient, hydrationRoundtrip, renderWithQueryClient } from "@/lib/query/test-utils";
import type { PresentationStyle } from "@/lib/types/redesign";
import { fixtureSummaryInput, HISTORY_EVENTS, TASK_ROWS } from "@/tests/unit/fixtures/project-summary";
import { resumenSummaryOfRows } from "@/tests/unit/fixtures/resumen-summary";

import { ProjectSummary, ProjectSummaryContent, RESUMEN_NOT_FOUND_TITLE } from "./ProjectSummary";
import { ProjectSummaryWidgets } from "./ProjectSummaryWidgets";

afterEach(cleanup);

// The shared widget composition (`ProjectSummaryWidgets`): every style of the tab has its own layout now.
function renderSummary(overrides: Parameters<typeof fixtureSummaryInput>[0] = {}, style: PresentationStyle = "esencial") {
  return render(
    <StyleProvider style={style} scope="staff">
      <ProjectSummaryWidgets data={fixtureSummaryInput(overrides)} />
    </StyleProvider>
  );
}

/** The Resumen tab content, which picks the layout of the style. */
function renderContent(style: PresentationStyle, overrides: Parameters<typeof fixtureSummaryInput>[0] = {}) {
  return render(
    <StyleProvider style={style} scope="staff">
      <ProjectSummaryContent data={fixtureSummaryInput(overrides)} />
    </StyleProvider>
  );
}

describe("ProjectSummaryWidgets · visibility (B8)", () => {
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
  it("renders the Esencial layout instead of the shared widgets in Esencial", () => {
    const { container } = renderContent("esencial");
    expect(screen.getByRole("region", { name: "Resumen esencial" }).textContent).toBe("Local Espinopapa");
    expect(container.querySelector("[data-widget]")).toBeNull();
  });

  it("renders the Visual layout with the hydrated task numbers and history, 0 client action calls", async () => {
    const input = fixtureSummaryInput();
    const { client, state } = await hydrationRoundtrip(async (server) => {
      await Promise.all([
        prefetch(server, proyectoResumenOptions("p1"), async () => input),
        prefetch(server, proyectoResumenSummaryOptions("p1"), async () => resumenSummaryOfRows(TASK_ROWS, "2026-11-06")),
        server.prefetchInfiniteQuery({
          ...proyectoHistoryOptions("p1"),
          queryFn: async () => ({ events: HISTORY_EVENTS, nextCursor: null }),
        }),
      ]);
    });
    const { container } = renderWithQueryClient(
      <StyleProvider style="visual" scope="staff">
        <ProjectSummary projectId="p1" />
      </StyleProvider>,
      { client, hydrate: state },
    );
    const layout = screen.getByRole("region", { name: "Resumen visual" });
    expect(layout.getAttribute("data-next")).toBe(resumenSummaryOfRows(TASK_ROWS, "2026-11-06").next.map((t) => t.id).join(","));
    expect(layout.getAttribute("data-events")).toBe("h1,h2");
    expect(layout.getAttribute("data-history")).toBe("success");
    expect(layout.getAttribute("data-can-create")).toBe("false");
    expect(container.querySelector("[data-widget]")).toBeNull();
    expect(actions.getProyectoResumenData).not.toHaveBeenCalled();
    expect(actions.getProyectoResumenSummary).not.toHaveBeenCalled();
    expect(actions.getProyectoHistoryPage).not.toHaveBeenCalled();
  });

  it("renders the Analítico layout instead of the shared widgets in Analítico", () => {
    const { container } = renderContent("analitico");
    expect(screen.getByRole("region", { name: "Resumen analítico" }).textContent).toBe("Local Espinopapa");
    expect(container.querySelector("[data-widget]")).toBeNull();
  });

  it("passes the shared avance ring the portfolio numbers and the task caption", () => {
    renderSummary();
    const avance = screen.getByRole("region", { name: "Avance" }).textContent ?? "";
    expect(avance).toContain('"variant":"rings"');
    expect(avance).toContain('"real":82');
    expect(avance).toContain("32 de 39 tareas");
  });
});

describe("ProjectSummary · query", () => {
  it("renders from the hydrated Resumen with 0 client action calls", async () => {
    const input = fixtureSummaryInput();
    const { client, state } = await hydrationRoundtrip((server) =>
      prefetch(server, proyectoResumenOptions("p1"), async () => input),
    );
    renderWithQueryClient(
      <StyleProvider style="esencial" scope="staff">
        <ProjectSummary projectId="p1" />
      </StyleProvider>,
      { client, hydrate: state },
    );
    expect(screen.getByRole("region", { name: "Resumen esencial" }).textContent).toBe("Local Espinopapa");
    expect(actions.getProyectoResumenData).not.toHaveBeenCalled();
  });

  it("shows the not-found state when the Resumen is null", () => {
    const client = createTestQueryClient();
    client.setQueryData(qk.proyectos.resumen("p1"), null);
    renderWithQueryClient(<ProjectSummary projectId="p1" />, { client });
    expect(screen.getByText(RESUMEN_NOT_FOUND_TITLE)).toBeTruthy();
    expect(actions.getProyectoResumenData).not.toHaveBeenCalled();
  });
});

describe("ProjectSummaryWidgets · memo", () => {
  it("builds the summary once per data object, not once per render", () => {
    summaryLib.builds = 0;
    const input = fixtureSummaryInput();
    const ui = (data: typeof input) => (
      <StyleProvider style="esencial" scope="staff">
        <ProjectSummaryWidgets data={data} />
      </StyleProvider>
    );
    const { rerender } = render(ui(input));
    expect(summaryLib.builds).toBe(1);
    // A parent re-render with the same cached data reuses the build.
    rerender(ui(input));
    rerender(ui(input));
    expect(summaryLib.builds).toBe(1);
    // New data (a refetch or an invalidation) builds again.
    rerender(ui(fixtureSummaryInput({ showBudget: false })));
    expect(summaryLib.builds).toBe(2);
  });
});
