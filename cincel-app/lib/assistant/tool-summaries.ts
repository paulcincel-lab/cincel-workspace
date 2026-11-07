/**
 * Approval summaries (redesign BE §8.10, §10.1; review R2-3): tool name →
 * `summarize(input)`, the same pure functions `defineTool` registers.
 * Client-safe (no server imports); `ConfirmationCard` renders from it.
 */

export type ToolSummary = (input: unknown) => string;

/** Filled by the tool domain files' summaries. */
export const toolSummaries: Record<string, ToolSummary> = {};

/** The summary line for an approval card; falls back to the tool name. */
export function summarizeToolCall(toolName: string, input: unknown): string {
  const summarize = toolSummaries[toolName];
  return summarize ? summarize(input) : toolName;
}
