"use client";

import type { RecordTableData } from "@/lib/types/widgets";

/** `render_table` args = `RecordTableData` (`lib/types/widgets.ts`). */
export type RenderTableArgs = RecordTableData & { title?: string };

export type AssistantTableMessageProps = RenderTableArgs;

/**
 * `render_table` (redesign FE §4.9): adapter onto `RecordTable`.
 *
 * Contract stub: renders nothing until its owning issue implements it.
 */
export function AssistantTableMessage(props: AssistantTableMessageProps) {
  void props;
  return null;
}
