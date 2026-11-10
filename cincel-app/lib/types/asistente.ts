/**
 * `/asistente` page data (Query Migration Phase 10, #944). Client-safe types.
 */
import type { UIMessage } from "ai";

import type { AssistantThreadSummary } from "@/lib/types/redesign";

/** One of the caller's threads with its last messages (`qk.asistente.thread(id)`). */
export type AsistentePageThread = { id: string; title: string; messages: UIMessage[] };

/** `getAsistentePageData`: the thread list and the `?thread=` thread. */
export type AsistentePageData = {
  /** The caller's live threads, newest first, at most 50. */
  threads: AssistantThreadSummary[];
  /** The `?thread=` thread with its last messages; null for a new conversation or a missing thread. */
  initialThread: AsistentePageThread | null;
  /** True when `?thread=` named a thread the caller doesn't have (deleted, another user's, unknown). */
  missingThread: boolean;
};

/** The page context ids the "Viendo:" chip resolves (`qk.asistente.context(c)`). */
export type AssistantContextIds = { projectId?: string; taskId?: string; personId?: string };

/** The name-only confirmed context: never more than an id and a label. */
export type AssistantContextLabel = { id: string; label: string };

/**
 * Times and token usage of one message (`assistant_messages.metadata`).
 * Streamed by the chat route on `start` / `finish`; the loaders add
 * `createdAt` from the row. Older rows have none: durations show "—".
 */
export type AssistantMessageMeta = {
  /** ISO; from `assistant_messages.created_at`, or set at `start` for a live message. */
  createdAt?: string;
  /** toolCallId → ms (`onToolExecutionEnd.toolExecutionMs`), merged across the approval resume. */
  toolMs?: Record<string, number>;
  /** `start` → `finish` of the turn. */
  responseMs?: number;
  /** `finish.totalUsage`. */
  usage?: { inputTokens: number; outputTokens: number };
};

/** A chat message with its metadata. */
export type AssistantUIMessage = UIMessage<AssistantMessageMeta>;

/** A tramo as a context chip shows it (dot color from `tramoColorClass`). */
export type TramoRef = { key: string; name: string; sortOrder: number };

/**
 * A removable context chip of the Asistente composer: the project
 * (`context.projectId`) or the module (`context.route`) the next message is
 * about.
 */
export type ContextChip = { kind: "project" | "module"; id: string; label: string; tramo?: TramoRef };
