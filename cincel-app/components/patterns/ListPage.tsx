"use client";

import type { ReactNode } from "react";

import type { EmptyStateProps } from "@/components/shell/EmptyState";
import type { PageHeaderProps } from "@/components/shell/PageHeader";
import type { EntityCardGridProps } from "@/components/widgets/EntityCardGrid";
import type { PeopleWidgetProps } from "@/components/widgets/PeopleWidget";
import type { RecordTableProps } from "@/components/widgets/RecordTable";
import type { TaskBoard } from "@/lib/types/redesign";
import type { EntityCard, PersonDatum, RecordTableData } from "@/lib/types/widgets";

/**
 * List page pattern (redesign FE §4.11): `PageHeader` + `EstiloSwitch` +
 * filters + one library widget chosen by `spec.kind`. Never imports
 * `StyleView`; pages never pass per-style markup.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export type ListSpec =
  | { kind: "table"; data: RecordTableData; renderCell?: RecordTableProps["renderCell"]; rowActions?: RecordTableProps["rowActions"] }
  | { kind: "cards"; items: EntityCard[]; table: RecordTableData; footer?: EntityCardGridProps["footer"] }
  | { kind: "people"; people: PersonDatum[]; show: PeopleWidgetProps["show"] }
  | { kind: "board"; board: TaskBoard; table: RecordTableData };

export type ListPageProps = {
  header: PageHeaderProps;
  filters?: ReactNode;
  tabs?: ReactNode;
  spec: ListSpec;
  empty?: EmptyStateProps;
};

export function ListPage(props: ListPageProps) {
  void props;
  return null;
}
