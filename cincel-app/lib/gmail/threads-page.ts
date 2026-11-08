/**
 * The caller's cached Gmail threads (redesign BE §7.6), shared by
 * `fetchGmailThreadsAction` and the Mi espacio loader: the status DTO of a
 * `GmailAccess`, one page of `gmail_threads` (30, cursor `[receivedAt, id]`
 * in base64url) and the summary DTO. Owner-only: the staff id comes from the
 * session or the page's viewer. Callers check access first
 * (`assertGmailAccess(access, { read: true })`).
 */
import "server-only";

import { db } from "@/lib/db/client";
import type { GmailAccess } from "@/lib/gmail/access";
import { formatAddress } from "@/lib/gmail/thread-view";
import * as gmailRepository from "@/lib/repositories/gmail-repository";
import type { GmailThreadRow } from "@/lib/repositories/gmail-repository";
import type { GmailThreadsPage } from "@/lib/types/mi-espacio";
import type { GmailStatus, GmailThreadSummary } from "@/lib/types/redesign";
import { GmailThreadsQuerySchema, parseInput } from "@/lib/validation/redesign";

/** Threads per page. */
export const GMAIL_THREADS_PAGE_SIZE = 30;

export type { GmailThreadsPage } from "@/lib/types/mi-espacio";

export function gmailStatusOf(access: GmailAccess): GmailStatus {
  return {
    connected: access.connected,
    scopeOk: access.scopeOk,
    lastSyncedAt: access.account?.lastSyncedAt?.toISOString() ?? null,
    lastError: access.account?.lastError ?? null,
  };
}

export function toThreadSummary(row: GmailThreadRow): GmailThreadSummary {
  return {
    id: row.id,
    subject: row.subject,
    from: formatAddress({ name: row.fromName, email: row.fromEmail }),
    snippet: row.snippet,
    receivedAt: row.receivedAt.toISOString(),
    unread: row.unread,
    projectId: row.projectId,
    suggestedProjectId: row.suggestedProjectId,
  };
}

function encodeCursor(row: GmailThreadRow): string {
  return Buffer.from(JSON.stringify([row.receivedAt.toISOString(), row.id])).toString("base64url");
}

function decodeCursor(cursor: string): gmailRepository.GmailThreadsCursor {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (Array.isArray(value) && value.length === 2 && typeof value[0] === "string" && typeof value[1] === "string") {
      const receivedAt = new Date(value[0]);
      if (!Number.isNaN(receivedAt.getTime())) return { receivedAt, id: value[1] };
    }
  } catch {
    // falls through to INVALID
  }
  throw new Error("INVALID: cursor");
}

/** One page of the caller's cached threads (ILIKE subject/from/snippet). Errors: `INVALID`. */
export async function listGmailThreadsPage(
  staffId: string,
  input: { query?: string; cursor?: string } | undefined,
): Promise<GmailThreadsPage> {
  const parsed = parseInput(GmailThreadsQuerySchema, input ?? {});
  const rows = await gmailRepository.listGmailThreads(db, staffId, {
    query: parsed.query,
    cursor: parsed.cursor ? decodeCursor(parsed.cursor) : null,
    limit: GMAIL_THREADS_PAGE_SIZE + 1,
  });
  const page = rows.slice(0, GMAIL_THREADS_PAGE_SIZE);
  return {
    threads: page.map(toThreadSummary),
    nextCursor: rows.length > GMAIL_THREADS_PAGE_SIZE ? encodeCursor(page[page.length - 1]!) : null,
  };
}
