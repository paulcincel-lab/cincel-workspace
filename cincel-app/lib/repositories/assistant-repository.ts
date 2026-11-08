/** Assistant threads, messages and the approval audit (redesign BE §3.10, §8.10). Owner-only. */
import { randomUUID } from "node:crypto";

import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";

import { assistantActions, assistantMessages, assistantThreads } from "@/lib/db/schema";
import type { FlowDb } from "@/lib/project-flow/db";
import { ownerScoped, type OwnerDb } from "@/lib/repositories/owner-scoped";
import type { AssistantActionRecord, AssistantContext } from "@/lib/types/redesign";

export type AssistantThreadRow = typeof assistantThreads.$inferSelect;
export type AssistantMessageRow = typeof assistantMessages.$inferSelect;
export type AssistantActionRow = typeof assistantActions.$inferSelect;

export const assistantThreadsRepository = ownerScoped(assistantThreads);

/** Live threads kept per staff (`fetchAssistantThreadsAction` cap and `daily-digest` housekeeping). */
export const ASSISTANT_THREADS_KEEP = 50;

/** Page size of the approval audit. */
export const ASSISTANT_ACTIONS_PAGE = 30;

/** The caller's live threads, newest first (`updated_at`). */
export async function listLiveAssistantThreads(
  db: OwnerDb,
  staffId: string,
  limit: number = ASSISTANT_THREADS_KEEP,
): Promise<Pick<AssistantThreadRow, "id" | "title" | "updatedAt">[]> {
  return db
    .select({ id: assistantThreads.id, title: assistantThreads.title, updatedAt: assistantThreads.updatedAt })
    .from(assistantThreads)
    .where(and(eq(assistantThreads.staffId, staffId), isNull(assistantThreads.deletedAt)))
    .orderBy(desc(assistantThreads.updatedAt), desc(assistantThreads.id))
    .limit(limit);
}

/** The caller's thread, or null when missing, owned by someone else or (unless `includeDeleted`) soft-deleted. */
export async function findOwnedAssistantThread(
  db: OwnerDb,
  staffId: string,
  id: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<AssistantThreadRow | null> {
  const conditions = [eq(assistantThreads.id, id), eq(assistantThreads.staffId, staffId)];
  if (!opts.includeDeleted) conditions.push(isNull(assistantThreads.deletedAt));
  const [row] = await db
    .select()
    .from(assistantThreads)
    .where(and(...conditions))
    .limit(1);
  return row ?? null;
}

/** Messages a thread read returns: the most recent ones (`listAssistantThreadMessages`). */
export const ASSISTANT_THREAD_MESSAGES_PAGE = 100;

/**
 * A thread's last `limit` displayable messages (no `tool` rows), in
 * conversation order. Reads newest first with the limit, then reverses, so
 * a long thread never loads its whole history. The chat route reads the full
 * history separately (`loadThreadMessages`), so the model still sees it all.
 */
export async function listAssistantThreadMessages(
  db: OwnerDb,
  threadId: string,
  opts: { limit?: number } = {},
): Promise<AssistantMessageRow[]> {
  const rows = await db
    .select()
    .from(assistantMessages)
    .where(and(eq(assistantMessages.threadId, threadId), ne(assistantMessages.role, "tool")))
    .orderBy(desc(assistantMessages.createdAt), desc(assistantMessages.id))
    .limit(opts.limit ?? ASSISTANT_THREAD_MESSAGES_PAGE);
  return rows.reverse();
}

/** Soft-deletes the caller's live thread; false when there is none to delete. */
export async function softDeleteOwnedAssistantThread(db: OwnerDb, staffId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(assistantThreads)
    .set({ deletedAt: new Date() })
    .where(
      and(eq(assistantThreads.id, id), eq(assistantThreads.staffId, staffId), isNull(assistantThreads.deletedAt)),
    )
    .returning({ id: assistantThreads.id });
  return rows.length > 0;
}

/**
 * Creates a thread with its messages in one transaction. Message timestamps
 * step by 1 ms from now so the stored order is the given order.
 */
export async function createAssistantThreadWithMessages(
  db: FlowDb,
  staffId: string,
  input: {
    title: string;
    context: AssistantContext;
    importedFrom: string | null;
    messages: { id: string; role: "user" | "assistant"; parts: unknown[] }[];
  },
): Promise<{ id: string }> {
  const id = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(assistantThreads).values({
      id,
      staffId,
      title: input.title,
      context: input.context,
      importedFrom: input.importedFrom,
    });
    if (input.messages.length === 0) return;
    const base = Date.now();
    await tx.insert(assistantMessages).values(
      input.messages.map((message, index) => ({
        id: message.id,
        threadId: id,
        role: message.role,
        parts: message.parts,
        createdAt: new Date(base + index),
      })),
    );
  });
  return { id };
}

function toActionRecord(row: AssistantActionRow): AssistantActionRecord {
  return {
    id: row.id,
    threadId: row.threadId,
    toolCallId: row.toolCallId,
    tool: row.tool,
    summary: row.summary,
    input: row.input,
    status: row.status,
    result: row.result ?? null,
    error: row.error ?? null,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
  };
}

/**
 * The caller's approval audit, newest first, one page. `cursorId` is the id of
 * the last record of the previous page (keyset on `created_at, id`); a cursor
 * that isn't one of the caller's records yields an empty page.
 */
export async function listAssistantActions(
  db: OwnerDb,
  staffId: string,
  opts: { threadId?: string; cursorId?: string; limit?: number } = {},
): Promise<AssistantActionRecord[]> {
  const conditions = [eq(assistantActions.staffId, staffId)];
  if (opts.threadId) conditions.push(eq(assistantActions.threadId, opts.threadId));
  if (opts.cursorId) {
    conditions.push(
      sql`(${assistantActions.createdAt}, ${assistantActions.id}) < (
        select c.created_at, c.id from ${assistantActions} c
        where c.id = ${opts.cursorId} and c.staff_id = ${staffId}
      )`,
    );
  }
  const rows = await db
    .select()
    .from(assistantActions)
    .where(and(...conditions))
    .orderBy(desc(assistantActions.createdAt), desc(assistantActions.id))
    .limit(opts.limit ?? ASSISTANT_ACTIONS_PAGE);
  return rows.map(toActionRecord);
}

/**
 * `daily-digest` housekeeping (BE §13): soft-deletes every live thread beyond
 * the newest `keep` per staff. Returns how many threads were soft-deleted.
 * The `assistant_actions` audit rows are kept.
 */
export async function trimAssistantThreads(db: OwnerDb, keep: number = ASSISTANT_THREADS_KEEP): Promise<number> {
  const rows = await db.execute<{ id: string }>(sql`
    update ${assistantThreads} t
    set deleted_at = now()
    from (
      select id, row_number() over (partition by staff_id order by updated_at desc, id desc) as rn
      from ${assistantThreads}
      where deleted_at is null
    ) ranked
    where t.id = ranked.id and ranked.rn > ${keep}
    returning t.id
  `);
  return rows.length;
}
