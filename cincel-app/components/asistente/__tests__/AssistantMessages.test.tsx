// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

import type { AgendaWidgetProps } from "@/components/widgets/AgendaWidget";
import type { RecordTableProps } from "@/components/widgets/RecordTable";
import type { PresentationStyle } from "@/lib/types/redesign";
import type { AgendaItem, RecordTableData } from "@/lib/types/widgets";

const calls = vi.hoisted(() => ({
  table: [] as { props: unknown; style: string }[],
  agenda: [] as { props: unknown; style: string }[],
}));

// The widgets own the per-style markup; these doubles record what the adapter
// hands them and the style they would render in.
vi.mock("@/components/widgets/RecordTable", async () => {
  const { useStyle } = await import("@/components/shell/StyleProvider");
  return {
    RecordTable: (props: RecordTableProps) => {
      const { style } = useStyle();
      calls.table.push({ props, style });
      return (
        <div data-testid="record-table" data-style={style}>
          {props.data.rows.length === 0 ? props.emptyState?.title : `${props.data.rows.length} filas`}
        </div>
      );
    },
  };
});
vi.mock("@/components/widgets/AgendaWidget", async () => {
  const { useStyle } = await import("@/components/shell/StyleProvider");
  return {
    AgendaWidget: (props: AgendaWidgetProps) => {
      const { style } = useStyle();
      calls.agenda.push({ props, style });
      return (
        <div data-testid="agenda-widget" data-style={style}>
          {props.title}: {props.items.length === 0 ? props.emptyText : `${props.items.length} eventos`}
        </div>
      );
    },
  };
});

import {
  ASSISTANT_TABLE_EMPTY_TITLE,
  AssistantTableMessage,
  type RenderTableArgs,
} from "@/components/asistente/AssistantTableMessage";
import {
  ASSISTANT_TIMELINE_DEFAULT_TITLE,
  ASSISTANT_TIMELINE_EMPTY_TEXT,
  AssistantTimelineMessage,
} from "@/components/asistente/AssistantTimelineMessage";
import { StyleProvider } from "@/components/shell/StyleProvider";

const STYLES: PresentationStyle[] = ["visual", "esencial", "analitico"];

const tableArgs: RenderTableArgs = {
  title: "Tareas vencidas por etapa",
  columns: [
    { key: "etapa", label: "Etapa" },
    { key: "vencidas", label: "Vencidas", align: "right", format: "count" },
  ],
  rows: [
    { id: "r1", etapa: "Diseño", vencidas: 3 },
    { id: "r2", etapa: "Construcción", vencidas: 5 },
  ],
  totals: "auto",
  heat: [{ key: "vencidas", warnAt: 3, critAt: 5 }],
};

const agendaItems: AgendaItem[] = [
  { id: "e1", title: "Revisión de planos", start: "2026-11-09T10:00:00-06:00", end: "2026-11-09T11:00:00-06:00", project: "Casa Roble" },
  { id: "e2", title: "Visita de obra", start: "2026-11-10T09:00:00-06:00", allDay: false },
];

function inStyle(style: PresentationStyle, node: ReactNode) {
  return render(
    <StyleProvider style={style} scope="staff">
      {node}
    </StyleProvider>,
  );
}

beforeEach(() => {
  calls.table.length = 0;
  calls.agenda.length = 0;
});
afterEach(() => cleanup());

describe("AssistantTableMessage (render_table → RecordTable)", () => {
  for (const style of STYLES) {
    it(`renders through RecordTable in the ${style} style`, () => {
      inStyle(style, <AssistantTableMessage {...tableArgs} />);
      expect(screen.getByRole("region", { name: tableArgs.title })).toBeTruthy();
      expect(screen.getByText(tableArgs.title!)).toBeTruthy();
      const widget = screen.getByTestId("record-table");
      expect(widget.getAttribute("data-style")).toBe(style);
      const last = calls.table.at(-1)!;
      expect(last.style).toBe(style);
      const props = last.props as RecordTableProps;
      const expected: RecordTableData = {
        columns: tableArgs.columns,
        rows: tableArgs.rows,
        totals: "auto",
        heat: tableArgs.heat,
      };
      expect(props.data).toEqual(expected);
      expect(props.renderCell).toBeUndefined();
      expect(props.rowActions).toBeUndefined();
      expect(props.selectable).toBeUndefined();
    });
  }

  it("passes groupBy through", () => {
    inStyle("analitico", <AssistantTableMessage {...tableArgs} groupBy="etapa" />);
    expect((calls.table.at(-1)!.props as RecordTableProps).data.groupBy).toBe("etapa");
  });

  it("renders the widget empty state for empty args", () => {
    inStyle("visual", <AssistantTableMessage {...({} as RenderTableArgs)} />);
    const props = calls.table.at(-1)!.props as RecordTableProps;
    expect(props.data).toEqual({ columns: [], rows: [] });
    expect(props.emptyState).toEqual({ title: ASSISTANT_TABLE_EMPTY_TITLE });
    expect(screen.getByText(ASSISTANT_TABLE_EMPTY_TITLE)).toBeTruthy();
    expect(screen.queryByRole("region")).toBeNull();
  });

  it("renders the widget empty state when rows are empty", () => {
    inStyle("esencial", <AssistantTableMessage title="Pagos" columns={tableArgs.columns} rows={[]} />);
    expect(screen.getByText(ASSISTANT_TABLE_EMPTY_TITLE)).toBeTruthy();
  });

  it("follows Visual outside a StyleProvider", () => {
    render(<AssistantTableMessage {...tableArgs} />);
    expect(calls.table.at(-1)!.style).toBe("visual");
  });
});

describe("AssistantTimelineMessage (render_timeline → AgendaWidget)", () => {
  for (const style of STYLES) {
    it(`renders through AgendaWidget in the ${style} style`, () => {
      inStyle(style, <AssistantTimelineMessage title="Próxima semana" items={agendaItems} />);
      expect(screen.getByTestId("agenda-widget").getAttribute("data-style")).toBe(style);
      const last = calls.agenda.at(-1)!;
      expect(last.style).toBe(style);
      expect(last.props).toEqual({
        title: "Próxima semana",
        items: agendaItems,
        mode: "day",
        groupBy: "day",
        emptyText: ASSISTANT_TIMELINE_EMPTY_TEXT,
      });
    });
  }

  it("uses the default title when none is given", () => {
    inStyle("visual", <AssistantTimelineMessage items={agendaItems} />);
    expect((calls.agenda.at(-1)!.props as AgendaWidgetProps).title).toBe(ASSISTANT_TIMELINE_DEFAULT_TITLE);
  });

  it("renders the widget empty state for empty args", () => {
    inStyle("esencial", <AssistantTimelineMessage {...({} as { items: AgendaItem[] })} />);
    const props = calls.agenda.at(-1)!.props as AgendaWidgetProps;
    expect(props.items).toEqual([]);
    expect(screen.getByText(new RegExp(ASSISTANT_TIMELINE_EMPTY_TEXT))).toBeTruthy();
  });
});
