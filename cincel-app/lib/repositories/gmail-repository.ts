/** Gmail sync state and thread cache (redesign BE §3.7, §8.6). Owner-only. */
import { and, desc, eq, ilike, lt, or } from "drizzle-orm";

import { gmailAccounts, gmailThreads } from "@/lib/db/schema";
import { ownerScoped, type OwnerDb } from "@/lib/repositories/owner-scoped";

export type GmailAccountRow = typeof gmailAccounts.$inferSelect;
export type GmailThreadRow = typeof gmailThreads.$inferSelect;

export const gmailThreadsRepository = ownerScoped(gmailThreads);

export async function findGmailAccount(db: OwnerDb, staffId: string): Promise<GmailAccountRow | null> {
  const [row] = await db.select().from(gmailAccounts).where(eq(gmailAccounts.staffId, staffId)).limit(1);
  return row ?? null;
}

/** One cached thread of the caller, or null (another staff member's thread is never returned). */
export async function findGmailThread(db: OwnerDb, staffId: string, id: string): Promise<GmailThreadRow | null> {
  const [row] = await db
    .select()
    .from(gmailThreads)
    .where(and(eq(gmailThreads.staffId, staffId), eq(gmailThreads.id, id)))
    .limit(1);
  return row ?? null;
}

/** Keyset position of the threads list: newest first, ties by id. */
export type GmailThreadsCursor = { receivedAt: Date; id: string };

/** `%`, `_` and `\` match literally inside an ILIKE pattern. */
function likeContains(value: string): string {
  return `%${value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * The caller's cached threads, newest first. `query` matches subject, sender
 * (name or address) and snippet case-insensitively; `cursor` continues after
 * a previous page.
 */
export async function listGmailThreads(
  db: OwnerDb,
  staffId: string,
  opts: { query?: string; cursor?: GmailThreadsCursor | null; limit: number },
): Promise<GmailThreadRow[]> {
  const conditions = [eq(gmailThreads.staffId, staffId)];
  const query = opts.query?.trim();
  if (query) {
    const pattern = likeContains(query);
    conditions.push(
      or(
        ilike(gmailThreads.subject, pattern),
        ilike(gmailThreads.fromName, pattern),
        ilike(gmailThreads.fromEmail, pattern),
        ilike(gmailThreads.snippet, pattern),
      )!,
    );
  }
  if (opts.cursor) {
    const { receivedAt, id } = opts.cursor;
    conditions.push(
      or(
        lt(gmailThreads.receivedAt, receivedAt),
        and(eq(gmailThreads.receivedAt, receivedAt), lt(gmailThreads.id, id)),
      )!,
    );
  }
  return db
    .select()
    .from(gmailThreads)
    .where(and(...conditions))
    .orderBy(desc(gmailThreads.receivedAt), desc(gmailThreads.id))
    .limit(opts.limit);
}

/** Marks one of the caller's cached threads read. No-op when it isn't cached. */
export async function markGmailThreadRead(db: OwnerDb, staffId: string, id: string): Promise<void> {
  await db
    .update(gmailThreads)
    .set({ unread: false })
    .where(and(eq(gmailThreads.staffId, staffId), eq(gmailThreads.id, id)));
}

/** Links (or with null unlinks) one of the caller's cached threads; returns the updated row or null. */
export async function setGmailThreadProject(
  db: OwnerDb,
  staffId: string,
  id: string,
  projectId: string | null,
): Promise<GmailThreadRow | null> {
  const [row] = await db
    .update(gmailThreads)
    .set({ projectId })
    .where(and(eq(gmailThreads.staffId, staffId), eq(gmailThreads.id, id)))
    .returning();
  return row ?? null;
}

/** Deletes every cached thread of the caller; returns how many. */
export async function deleteGmailThreads(db: OwnerDb, staffId: string): Promise<number> {
  const rows = await db
    .delete(gmailThreads)
    .where(eq(gmailThreads.staffId, staffId))
    .returning({ id: gmailThreads.id });
  return rows.length;
}

/** Sets `disconnected_at` (creating the sync row when the account was never synced). */
export async function markGmailDisconnected(db: OwnerDb, staffId: string, at: Date): Promise<void> {
  await db
    .insert(gmailAccounts)
    .values({ staffId, disconnectedAt: at })
    .onConflictDoUpdate({ target: gmailAccounts.staffId, set: { disconnectedAt: at, updatedAt: at } });
}
