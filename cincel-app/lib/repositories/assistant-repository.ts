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

/** One row of the threads list: the thread plus its rail status (`AssistantThreadSummary`). */
export type AssistantThreadListRow = Pick<AssistantThreadRow, "id" | "title" | "updatedAt" | "pinnedAt"> & {
  pendingApprovals: number;
  unread: boolean;
};

/** `assistant_actions` rows of the thread still waiting for an answer. */
const pendingApprovalsSql = sql<number>`(
  select count(*)::int from ${assistantActions}
  where ${assistantActions.threadId} = ${assistantThreads.id} and ${assistantActions.status} = 'proposed'
)`;

/**
 * An assistant message newer than `last_read_at`. A thread never marked
 * read (`last_read_at` null, every thread before the column existed) counts
 * as read.
 */
const unreadSql = sql<boolean>`(
  ${assistantThreads.lastReadAt} is not null and exists (
    select 1 from ${assistantMessages}
    where ${assistantMessages.threadId} = ${assistantThreads.id}
      and ${assistantMessages.role} = 'assistant'
      and ${assistantMessages.createdAt} > ${assistantThreads.lastReadAt}
  )
)`;

const threadListColumns = {
  id: assistantThreads.id,
  title: assistantThreads.title,
  updatedAt: assistantThreads.updatedAt,
  pinnedAt: assistantThreads.pinnedAt,
  pendingApprovals: pendingApprovalsSql,
  unread: unreadSql,
};

function toListRow(row: AssistantThreadListRow): AssistantThreadListRow {
  return { ...row, pendingApprovals: Number(row.pendingApprovals) || 0, unread: Boolean(row.unread) };
}

/**
 * The caller's live threads: pinned first (newest pin first), then newest
 * first (`updated_at`), so a pinned thread is never cut by the limit.
 */
export async function listLiveAssistantThreads(
  db: OwnerDb,
  staffId: string,
  limit: number = ASSISTANT_THREADS_KEEP,
): Promise<AssistantThreadListRow[]> {
  const rows = await db
    .select(threadListColumns)
    .from(assistantThreads)
    .where(and(eq(assistantThreads.staffId, staffId), isNull(assistantThreads.deletedAt)))
    .orderBy(sql`${assistantThreads.pinnedAt} desc nulls last`, desc(assistantThreads.updatedAt), desc(assistantThreads.id))
    .limit(limit);
  return rows.map(toListRow);
}

/** One of the caller's live threads as a list row, or null when it isn't theirs. */
export async function findOwnedAssistantThreadListRow(
  db: OwnerDb,
  staffId: string,
  id: string,
): Promise<AssistantThreadListRow | null> {
  const [row] = await db
    .select(threadListColumns)
    .from(assistantThreads)
    .where(and(eq(assistantThreads.id, id), eq(assistantThreads.staffId, staffId), isNull(assistantThreads.deletedAt)))
    .limit(1);
  return row ? toListRow(row) : null;
}

/**
 * Pins (now) or unpins the caller's live thread. `updated_at` stays as it
 * was: pinning isn't activity. False when there is no such thread.
 */
export async function setOwnedAssistantThreadPinned(
  db: OwnerDb,
  staffId: string,
  id: string,
  pinned: boolean,
): Promise<boolean> {
  const rows = await db
    .update(assistantThreads)
    .set({ pinnedAt: pinned ? new Date() : null, updatedAt: sql`${assistantThreads.updatedAt}` })
    .where(and(eq(assistantThreads.id, id), eq(assistantThreads.staffId, staffId), isNull(assistantThreads.deletedAt)))
    .returning({ id: assistantThreads.id });
  return rows.length > 0;
}

/** Sets `last_read_at` to now on the caller's live thread (keeps `updated_at`). False when there is none. */
export async function markOwnedAssistantThreadRead(db: OwnerDb, staffId: string, id: string): Promise<boolean> {
  const rows = await db
    .update(assistantThreads)
    .set({ lastReadAt: new Date(), updatedAt: sql`${assistantThreads.updatedAt}` })
    .where(and(eq(assistantThreads.id, id), eq(assistantThreads.staffId, staffId), isNull(assistantThreads.deletedAt)))
    .returning({ id: assistantThreads.id });
  return rows.length > 0;
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
 * the first `keep` per staff in list order (pinned first, then newest), so a
 * pinned thread is kept. Returns how many threads were soft-deleted.
 * The `assistant_actions` audit rows are kept.
 */
export async function trimAssistantThreads(db: OwnerDb, keep: number = ASSISTANT_THREADS_KEEP): Promise<number> {
  const rows = await db.execute<{ id: string }>(sql`
    update ${assistantThreads} t
    set deleted_at = now()
    from (
      select id, row_number() over (partition by staff_id order by pinned_at desc nulls last, updated_at desc, id desc) as rn
      from ${assistantThreads}
      where deleted_at is null
    ) ranked
    where t.id = ranked.id and ranked.rn > ${keep}
    returning t.id
  `);
  return rows.length;
}
