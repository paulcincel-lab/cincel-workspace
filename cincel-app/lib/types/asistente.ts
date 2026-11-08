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
