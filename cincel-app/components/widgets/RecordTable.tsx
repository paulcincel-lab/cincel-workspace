"use client";

import type { ReactNode } from "react";

import type { EmptyStateProps } from "@/components/shell/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/shadcn/table";
import type { RowAction } from "@/components/v2/table/RowActionsMenu";
import type { RecordTableData } from "@/lib/types/widgets";

/**
 * The table of the widget library (redesign FE §4.10.1); extends
 * `components/ui/DataTable`. Cells format by `column.format` unless
 * `renderCell` returns a node.
 *
 * Contract stub: a minimal plain table (columns and raw cell values) so
 * widgets can render through it until the full widget lands (styles,
 * grouping, totals, heat, `hideOn`, selection, row actions).
 */
export type RecordTableProps = {
  data: RecordTableData;
  renderCell?: (columnKey: string, row: Record<string, unknown>) => ReactNode | undefined;
  density?: "comoda" | "compacta";
  selectable?: boolean;
  rowActions?: RowAction<Record<string, unknown>>[];
  emptyState?: EmptyStateProps;
};

export function RecordTable({ data, renderCell }: RecordTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {data.columns.map((column) => (
            <TableHead key={column.key}>{column.label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.rows.map((row, index) => (
          <TableRow key={typeof row.id === "string" ? row.id : index}>
            {data.columns.map((column) => (
              <TableCell key={column.key}>
                {renderCell?.(column.key, row) ?? String(row[column.key] ?? "")}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
