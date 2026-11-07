// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const { widgetProps, markerModule } = vi.hoisted(() => {
  const widgetProps = { calls: [] as { widget: string; props: Record<string, unknown> }[] };
  async function markerModule(exportName: string) {
    const { createElement } = await import("react");
    return {
      [exportName]: (props: Record<string, unknown>) => {
        widgetProps.calls.push({ widget: exportName, props });
        return createElement("div", { "data-testid": `widget-${exportName}` });
      },
    };
  }
  return { widgetProps, markerModule };
});

vi.mock("@/components/widgets/RecordTable", () => markerModule("RecordTable"));
vi.mock("@/components/widgets/EntityCardGrid", () => markerModule("EntityCardGrid"));
vi.mock("@/components/widgets/PeopleWidget", () => markerModule("PeopleWidget"));
vi.mock("@/components/widgets/TaskBoardWidget", () => markerModule("TaskBoardWidget"));
vi.mock("@/components/shell/EstiloSwitch", async () => {
  const { createElement } = await import("react");
  return {
    EstiloSwitch: (props: { scope?: string }) =>
      createElement("div", { "data-testid": "estilo-switch", "data-scope": props.scope }),
  };
});
vi.mock("@/components/shell/EmptyState", async () => {
  const { createElement } = await import("react");
  return {
    EmptyState: (props: { title: string; description?: string }) =>
      createElement(
        "div",
        { "data-testid": "empty-state" },
        props.description ? `${props.title} · ${props.description}` : props.title,
      ),
  };
});

import { isListSpecEmpty, ListPage, type ListSpec } from "@/components/patterns/ListPage";
import { Button } from "@/components/ui/shadcn/button";
import type { TaskListItem } from "@/lib/types/core";
import type { TaskBoard } from "@/lib/types/redesign";
import type { RecordTableData } from "@/lib/types/widgets";

const table: RecordTableData = {
  columns: [
    { key: "nombre", label: "Nombre" },
    { key: "tramo", label: "Tramo" },
  ],
  rows: [{ id: "p1", nombre: "Casa Espino", tramo: "Diseño" }],
};

const emptyTable: RecordTableData = { columns: table.columns, rows: [] };

const task = { id: "t1", title: "Plano de cortes", status: "pendiente" } as unknown as TaskListItem;

const board: TaskBoard = { pendiente: [task], en_proceso: [], completado: [], bloqueado: [] };
const emptyBoard: TaskBoard = { pendiente: [], en_proceso: [], completado: [], bloqueado: [] };

const SPECS: { spec: ListSpec; widget: string }[] = [
  { spec: { kind: "table", data: table }, widget: "RecordTable" },
  {
    spec: { kind: "cards", items: [{ id: "p1", title: "Casa Espino", subtitle: "Familia Espino" }], table },
    widget: "EntityCardGrid",
  },
  {
    spec: {
      kind: "people",
      people: [{ id: "s1", name: "Ana López", initials: "AL", open: 4, overdue: 1 }],
      show: ["load", "projects"],
    },
    widget: "PeopleWidget",
  },
  { spec: { kind: "board", board, table }, widget: "TaskBoardWidget" },
];

const ALL_WIDGETS = ["RecordTable", "EntityCardGrid", "PeopleWidget", "TaskBoardWidget"];

afterEach(() => {
  cleanup();
  widgetProps.calls = [];
});

describe("ListPage", () => {
  for (const { spec, widget } of SPECS) {
    it(`renders exactly one ${widget} for spec.kind = "${spec.kind}"`, () => {
      render(<ListPage header={{ title: "Proyectos" }} spec={spec} />);
      expect(screen.getByTestId(`widget-${widget}`)).toBeTruthy();
      for (const other of ALL_WIDGETS.filter((w) => w !== widget)) {
        expect(screen.queryByTestId(`widget-${other}`)).toBeNull();
      }
      expect(widgetProps.calls.every((c) => c.widget === widget)).toBe(true);
    });
  }

  it("renders the page header, the estilo switch, tabs and filters in order", () => {
    const { container } = render(
      <ListPage
        header={{
          title: "Tareas",
          description: "Todas las tareas de tus proyectos.",
          actions: <Button>Nueva tarea</Button>,
        }}
        tabs={<nav aria-label="Vistas">Tablero · Lista · Calendario</nav>}
        filters={<div data-testid="filters">Filtros</div>}
        spec={{ kind: "table", data: table }}
      />,
    );

    expect(screen.getByRole("heading", { level: 1, name: "Tareas" })).toBeTruthy();
    expect(screen.getByText("Todas las tareas de tus proyectos.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nueva tarea" })).toBeTruthy();
    expect(screen.getByTestId("estilo-switch").getAttribute("data-scope")).toBe("staff");

    const html = container.innerHTML;
    const order = [
      html.indexOf("Tareas</h1>"),
      html.indexOf('data-testid="estilo-switch"'),
      html.indexOf('aria-label="Vistas"'),
      html.indexOf('data-testid="filters"'),
      html.indexOf('data-testid="widget-RecordTable"'),
    ];
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("passes the spec data and UI props through to the widget", () => {
    const renderCell = () => null;
    const rowActions = [{ label: "Abrir", onSelect: () => undefined }];
    render(
      <ListPage
        header={{ title: "Biblioteca" }}
        spec={{ kind: "table", data: table, renderCell, rowActions: rowActions as never }}
      />,
    );
    const call = widgetProps.calls.at(-1);
    expect(call?.props.data).toBe(table);
    expect(call?.props.renderCell).toBe(renderCell);
    expect(call?.props.rowActions).toBe(rowActions);
  });

  it("gives the board a move handler that resolves without writing when the page passes none", async () => {
    render(<ListPage header={{ title: "Tablero" }} spec={{ kind: "board", board, table }} />);
    const onMove = widgetProps.calls.at(-1)?.props.onMove as (taskId: string, statusId: string) => Promise<void>;
    await expect(onMove("t1", "en_proceso")).resolves.toBeUndefined();
  });

  it("forwards the page move handler to the board", () => {
    const onMove = vi.fn(async () => undefined);
    render(<ListPage header={{ title: "Tablero" }} spec={{ kind: "board", board, table, onMove }} />);
    expect(widgetProps.calls.at(-1)?.props.onMove).toBe(onMove);
  });

  it("renders EmptyState instead of the widget when empty is given and there are no records", () => {
    render(
      <ListPage
        header={{ title: "Proyectos" }}
        spec={{ kind: "cards", items: [], table: emptyTable }}
        empty={{ title: "Aún no hay proyectos", description: "Crea el primero." }}
      />,
    );
    expect(screen.getByTestId("empty-state").textContent).toBe("Aún no hay proyectos · Crea el primero.");
    expect(screen.queryByTestId("widget-EntityCardGrid")).toBeNull();
  });

  it("renders the widget when there are records even if empty is given", () => {
    render(
      <ListPage
        header={{ title: "Proyectos" }}
        spec={{ kind: "table", data: table }}
        empty={{ title: "Aún no hay proyectos" }}
      />,
    );
    expect(screen.queryByTestId("empty-state")).toBeNull();
    expect(screen.getByTestId("widget-RecordTable")).toBeTruthy();
  });

  it("leaves empty records to the widget when no empty prop is given", () => {
    render(<ListPage header={{ title: "Personas" }} spec={{ kind: "people", people: [], show: ["load"] }} />);
    expect(screen.queryByTestId("empty-state")).toBeNull();
    expect(screen.getByTestId("widget-PeopleWidget")).toBeTruthy();
  });

  it("does not trap focus or render a dialog of its own", () => {
    render(
      <ListPage
        header={{ title: "Proyectos", actions: <Button>Nuevo proyecto</Button> }}
        spec={{ kind: "table", data: table }}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    const button = screen.getByRole("button", { name: "Nuevo proyecto" });
    button.focus();
    expect(document.activeElement).toBe(button);
    button.blur();
    expect(document.activeElement).not.toBe(button);
  });
});

describe("isListSpecEmpty", () => {
  it("checks the records of each spec kind", () => {
    expect(isListSpecEmpty({ kind: "table", data: table })).toBe(false);
    expect(isListSpecEmpty({ kind: "table", data: emptyTable })).toBe(true);
    expect(isListSpecEmpty({ kind: "cards", items: [], table })).toBe(true);
    expect(isListSpecEmpty({ kind: "people", people: [], show: [] })).toBe(true);
    expect(isListSpecEmpty({ kind: "board", board, table })).toBe(false);
    expect(isListSpecEmpty({ kind: "board", board: emptyBoard, table })).toBe(true);
  });
});

describe("ListPage source", () => {
  const source = readFileSync(resolve(__dirname, "../ListPage.tsx"), "utf8");

  it("never imports StyleView and never branches on the presentation style", () => {
    expect(source).not.toMatch(/StyleView/);
    expect(source).not.toMatch(/useStyle/);
  });

  it("uses no color className overrides and no font weight above 600", () => {
    expect(source).not.toMatch(/\b(?:bg|text|border|ring|fill|stroke)-(?:\[|[a-z]+-\d{2,3}\b)/);
    expect(source).not.toMatch(/font-(?:bold|extrabold|black)/);
  });
});
