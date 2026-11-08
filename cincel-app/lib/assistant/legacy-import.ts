/**
 * Imported thread normalization (redesign BE §7.9, §8.10). Pure: turns
 * previously saved chat messages into rows for a new server thread. Tool
 * parts are kept for display only: every tool part ends in a final state, so
 * nothing imported can be resumed, approved or executed. Client-safe.
 */

/** Max messages accepted by `importLegacyAssistantThreadAction`. */
export const LEGACY_IMPORT_MAX_MESSAGES = 200;

/** `imported_from` of a thread created from the legacy localStorage key. */
export const LEGACY_IMPORT_SOURCE = "localStorage";

/** Error text of a tool call that was still pending when the thread was imported. */
export const LEGACY_PENDING_TOOL_TEXT = "Conversación importada: esta acción no se ejecutó.";

const DEFAULT_TITLE = "Conversación importada";
const TITLE_MAX = 80;

const FINAL_TOOL_STATES = new Set(["output-available", "output-error", "output-denied"]);

export type LegacyMessageInput = { id: string; role: "user" | "assistant" | "system"; parts: unknown[] };

export type ImportedMessageRow = { id: string; role: "user" | "assistant"; parts: Record<string, unknown>[] };

function isToolPart(part: Record<string, unknown>): boolean {
  const type = part.type as string;
  return type === "dynamic-tool" || type.startsWith("tool-");
}

/** A display-only copy of a tool part: final state kept, anything pending becomes an error. */
function displayOnlyToolPart(part: Record<string, unknown>): Record<string, unknown> {
  const state = typeof part.state === "string" ? part.state : "";
  if (FINAL_TOOL_STATES.has(state)) return { ...part };
  const rest: Record<string, unknown> = { ...part };
  delete rest.approval;
  delete rest.output;
  return { ...rest, state: "output-error", errorText: LEGACY_PENDING_TOOL_TEXT };
}

function normalizeParts(parts: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const part of parts) {
    if (!part || typeof part !== "object" || Array.isArray(part)) continue;
    const record = part as Record<string, unknown>;
    if (typeof record.type !== "string" || record.type.length === 0) continue;
    out.push(isToolPart(record) ? displayOnlyToolPart(record) : { ...record });
  }
  return out;
}

/**
 * The rows to store, in order. System messages are dropped (only the server
 * writes system prompts), messages with no usable part are dropped and a
 * repeated id keeps its first occurrence (ids are unique per thread).
 */
export function normalizeLegacyMessages(messages: LegacyMessageInput[]): ImportedMessageRow[] {
  const seen = new Set<string>();
  const rows: ImportedMessageRow[] = [];
  for (const message of messages) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    if (seen.has(message.id)) continue;
    const parts = normalizeParts(message.parts);
    if (parts.length === 0) continue;
    seen.add(message.id);
    rows.push({ id: message.id, role: message.role, parts });
  }
  return rows;
}

/** The thread title: the first user message's text, collapsed and cut to 80 characters. */
export function titleFromMessages(rows: ImportedMessageRow[]): string {
  for (const row of rows) {
    if (row.role !== "user") continue;
    const text = row.parts
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text as string)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) return text.length > TITLE_MAX ? `${text.slice(0, TITLE_MAX - 1).trimEnd()}…` : text;
  }
  return DEFAULT_TITLE;
}
