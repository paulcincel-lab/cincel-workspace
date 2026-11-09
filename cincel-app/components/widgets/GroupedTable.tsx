"use client";

import type { ReactNode } from "react";

import type { EmptyStateProps } from "@/components/shell/EmptyState";
import { formatCell, type HeatLevel } from "@/components/widgets/record-table-format";
import type { RecordColumn } from "@/lib/types/widgets";

/**
 * Analítico grouped table (ADR 0005): groups (two levels), metrics per group,
 * totals, heat cells and anchors. Minimal markup for now: one `<section>` per
 * top group with a plain table of its leaf rows. Full behavior in #982.
 */
export type HeatRule = { key: string; warnAt: number; critAt: number; direction?: "above" | "below" };
export type GroupMetric = {
  key: string;
  label?: string;
  value: string;
  tone?: "default" | "muted" | "destructive" | "warning" | "success";
  pill?: boolean;
};
export type GroupFooter = "auto" | Record<string, string | number>;
export type Group<Row> = {
  id: string;
  label: string;
  color?: string;
  caption?: string;
  metrics: GroupMetric[];
  rows?: Row[];
  children?: Group<Row>[];
  footer?: GroupFooter;
  quickAdd?: ReactNode;
  loading?: boolean;
  hasMore?: boolean;
  hidden?: boolean;
};
export type GroupAnchor = { groupId: string; label: string; count: number; tone?: "destructive" | "muted" };
export type GroupedTableProps<Row extends Record<string, unknown>> = {
  label: string;
  columns: RecordColumn[];
  groups: Group<Row>[];
  totals?: { label: string; summary: string };
  anchors?: GroupAnchor[];
  anchorsCaption?: string;
  defaultExpanded?: boolean | string[];
  expanded?: string[];
  onExpandedChange?(ids: string[]): void;
  heat?: HeatRule[];
  getRowId?(row: Row, index: number): string;
  renderCell?(columnKey: string, row: Row): ReactNode | undefined;
  rowHref?(row: Row): string | null;
  isRowNew?(row: Row): boolean;
  isRowMuted?(row: Row): boolean;
  onGroupExpand?(groupId: string): void;
  onLoadMore?(groupId: string): void;
  loading?: boolean;
  error?: { title?: string; onRetry?(): void };
  emptyState?: EmptyStateProps;
};

/** Heat level of a cell under its rule (used by #982). */
export type { HeatLevel };

/** The rows of a group and of all its descendants, in order. */
function leafRows<Row>(group: Group<Row>): Row[] {
  return [...(group.rows ?? []), ...(group.children ?? []).flatMap(leafRows)];
}

export function GroupedTable<Row extends Record<string, unknown>>(p: GroupedTableProps<Row>): ReactNode {
  return (
    <div aria-label={p.label} role="region">
      {p.groups.map((group) => {
        const rows = leafRows(group);
        return (
          <section key={group.id} aria-label={group.label}>
            <h3>{group.label}</h3>
            <table>
              <thead>
                <tr>
                  {p.columns.map((column) => (
                    <th key={column.key} scope="col">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={p.getRowId?.(row, index) ?? index}>
                    {p.columns.map((column) => (
                      <td key={column.key}>{formatCell(column, row)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
