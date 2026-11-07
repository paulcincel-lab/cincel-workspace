/**
 * Server-side threads (redesign BE §8.10): ownership verified before any
 * upsert (another owner → 403), messages upserted by `(thread_id, id)`,
 * history loaded from the database (client history ignored), title from the
 * first user message.
 */
import type { UIMessage } from "ai";

import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import { notImplemented } from "@/lib/stubs";
import type { AssistantContext } from "@/lib/types/redesign";

/** Creates the thread when new; throws `FORBIDDEN` when it belongs to someone else. */
export async function upsertOwnedThread(
  db: OwnerDb,
  input: { threadId: string; staffId: string; context: AssistantContext },
): Promise<void> {
  return notImplemented("upsertOwnedThread", db, input);
}

export async function loadThreadMessages(db: OwnerDb, threadId: string): Promise<UIMessage[]> {
  return notImplemented("loadThreadMessages", db, threadId);
}

export async function saveThreadMessages(db: OwnerDb, threadId: string, messages: UIMessage[]): Promise<void> {
  return notImplemented("saveThreadMessages", db, threadId, messages);
}
