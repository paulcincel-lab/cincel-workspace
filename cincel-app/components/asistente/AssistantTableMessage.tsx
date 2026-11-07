"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { RecordTable } from "@/components/widgets/RecordTable";
import type { RecordTableData } from "@/lib/types/widgets";

/** `render_table` args = `RecordTableData` (`lib/types/widgets.ts`). */
export type RenderTableArgs = RecordTableData & { title?: string };

export type AssistantTableMessageProps = RenderTableArgs;

export const ASSISTANT_TABLE_EMPTY_TITLE = "Sin datos para mostrar";

/**
 * `render_table` (redesign FE §4.9): adapter onto `RecordTable`. The table
 * follows the user's presentation style through the widget; missing columns
 * or rows render the widget's empty state.
 */
export function AssistantTableMessage({ title, columns, rows, groupBy, totals, heat }: AssistantTableMessageProps) {
  const data: RecordTableData = {
    columns: Array.isArray(columns) ? columns : [],
    rows: Array.isArray(rows) ? rows : [],
    ...(groupBy ? { groupBy } : {}),
    ...(totals ? { totals } : {}),
    ...(Array.isArray(heat) && heat.length > 0 ? { heat } : {}),
  };
  const heading = title?.trim();

  return (
    <Card size="sm" aria-label={heading || undefined} role={heading ? "region" : undefined}>
      {heading ? (
        <CardHeader>
          <CardTitle>{heading}</CardTitle>
        </CardHeader>
      ) : null}
      <CardContent>
        <RecordTable data={data} density="compacta" emptyState={{ title: ASSISTANT_TABLE_EMPTY_TITLE }} />
      </CardContent>
    </Card>
  );
}
