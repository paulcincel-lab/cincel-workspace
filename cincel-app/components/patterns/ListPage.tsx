"use client";

import type { ReactNode } from "react";

import { EmptyState, type EmptyStateProps } from "@/components/shell/EmptyState";
import { PageHeader, type PageHeaderProps } from "@/components/shell/PageHeader";
import { EntityCardGrid, type EntityCardGridProps } from "@/components/widgets/EntityCardGrid";
import { PeopleWidget, type PeopleWidgetProps } from "@/components/widgets/PeopleWidget";
import { RecordTable, type RecordTableProps } from "@/components/widgets/RecordTable";
import { TaskBoardWidget, type TaskBoardWidgetProps } from "@/components/widgets/TaskBoardWidget";
import type { TaskBoard } from "@/lib/types/redesign";
import type { EntityCard, PersonDatum, RecordTableData } from "@/lib/types/widgets";

/**
 * List page pattern (redesign FE §4.11): `PageHeader` (Estilo switch as its
 * last action) + tabs + filters + one library widget chosen by `spec.kind`. The widget
 * decides how each presentation style looks; this pattern never branches on
 * the style itself and pages never pass per-style markup.
 */
export type ListSpec =
  | {
      kind: "table";
      data: RecordTableData;
      renderCell?: RecordTableProps["renderCell"];
      rowActions?: RecordTableProps["rowActions"];
      /** Per-row `⋯` menu and Supr (`RecordTable.rowMenu`). */
      rowMenu?: RecordTableProps["rowMenu"];
      /** Controlled row checkboxes (`RecordTable.rowSelection`, #1040). */
      rowSelection?: RecordTableProps["rowSelection"];
      /** Opt-in "Cargar más" under the table (`RecordTable.onEndReached`). */
      pagination?: Pick<RecordTableProps, "onEndReached" | "hasMore" | "loadingMore">;
    }
  | {
      kind: "cards";
      items: EntityCard[];
      table: RecordTableData;
      footer?: EntityCardGridProps["footer"];
      /** Opt-in cards/table override (dashboard store); without it the style decides. */
      view?: EntityCardGridProps["view"];
    }
  | { kind: "people"; people: PersonDatum[]; show: PeopleWidgetProps["show"] }
  | {
      kind: "board";
      board: TaskBoard;
      table: RecordTableData;
      /** Status change on drop; without it the board is read-only and drops are ignored. */
      onMove?: TaskBoardWidgetProps["onMove"];
      /** Per-column totals and "Cargar más" (Tareas). */
      columnPages?: TaskBoardWidgetProps["columnPages"];
      /** Every configured custom status, so its column shows even when empty. */
      customStatuses?: TaskBoardWidgetProps["customStatuses"];
    };

export type ListPageProps = {
  header: PageHeaderProps;
  filters?: ReactNode;
  tabs?: ReactNode;
  spec: ListSpec;
  /**
   * Rendered instead of the widget when the spec carries no records. A board
   * always keeps its widget (its columns stay as drop targets) and hands this
   * to the widget, which shows it only in the styles without columns.
   */
  empty?: EmptyStateProps;
};

/** True when the spec has no records to show. */
export function isListSpecEmpty(spec: ListSpec): boolean {
  switch (spec.kind) {
    case "table":
      return spec.data.rows.length === 0;
    case "cards":
      return spec.items.length === 0;
    case "people":
      return spec.people.length === 0;
    case "board":
      return Object.values(spec.board).every((tasks) => tasks.length === 0);
  }
}

const readOnlyMove: TaskBoardWidgetProps["onMove"] = () => Promise.resolve();

function ListWidget({ spec, empty }: { spec: ListSpec; empty?: EmptyStateProps }) {
  switch (spec.kind) {
    case "table":
      return (
        <RecordTable data={spec.data} renderCell={spec.renderCell} rowActions={spec.rowActions} rowMenu={spec.rowMenu} rowSelection={spec.rowSelection} {...spec.pagination} />
      );
    case "cards":
      return <EntityCardGrid items={spec.items} table={spec.table} footer={spec.footer} view={spec.view} />;
    case "people":
      return <PeopleWidget people={spec.people} show={spec.show} />;
    case "board":
      return (
        <TaskBoardWidget
          board={spec.board}
          table={spec.table}
          onMove={spec.onMove ?? readOnlyMove}
          columnPages={spec.columnPages}
          customStatuses={spec.customStatuses}
          emptyState={empty}
        />
      );
  }
}

export function ListPage({ header, filters, tabs, spec, empty }: ListPageProps) {
  const showEmpty = empty !== undefined && spec.kind !== "board" && isListSpecEmpty(spec);
  return (
    <div className="flex min-w-0 flex-col gap-4" data-list-kind={spec.kind}>
      <PageHeader {...header} />
      {tabs ? <div className="min-w-0">{tabs}</div> : null}
      {filters ? <div className="min-w-0">{filters}</div> : null}
      <div className="min-w-0">{showEmpty ? <EmptyState {...empty} /> : <ListWidget spec={spec} empty={empty} />}</div>
    </div>
  );
}
