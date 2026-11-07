/**
 * Approval summaries (redesign BE §8.10, §10.1; review R2-3): tool name →
 * `summarize(input)`, the same pure functions `defineTool` registers.
 * Client-safe (no server imports); `ConfirmationCard` renders from it.
 *
 * Each tool group adds its summaries here and its tool definitions take them
 * with `summaryOf(name)`, so the server registration and the client card
 * always share one function per tool.
 */

export type ToolSummary = (input: unknown) => string;

/** Filled by the tool domain files' summaries. */
export const toolSummaries: Record<string, ToolSummary> = {};

/**
 * The registered summary of a tool, for its `defineTool({ summarize })`.
 * Throws when the tool has no entry in `toolSummaries`, so a tool can't be
 * registered with a summary the client doesn't know.
 */
export function summaryOf<I = unknown>(toolName: string): (input: I) => string {
  const summarize = toolSummaries[toolName];
  if (!summarize) throw new Error(`NOT_FOUND: no summary for assistant tool "${toolName}"`);
  return summarize as (input: I) => string;
}

/**
 * The summary line for an approval card; falls back to the tool name when
 * the tool has no summary or the input doesn't fit it.
 */
export function summarizeToolCall(toolName: string, input: unknown): string {
  const summarize = toolSummaries[toolName];
  if (!summarize) return toolName;
  try {
    const line = summarize(input);
    return typeof line === "string" && line.trim() ? line : toolName;
  } catch {
    return toolName;
  }
}
