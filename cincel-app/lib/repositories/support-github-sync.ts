/**
 * Writes of the Soporte GitHub status sync (#1117). Server-only. Re-exported
 * by `support-repository.ts` as `listSyncableTickets` / `applySyncedStatus`.
 */
import "server-only";

import { and, asc, eq, isNotNull, notInArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { supportTicketEvents, supportTickets } from "@/lib/db/schema";
import { notify } from "@/lib/notifications/notify";
import { CLOSED_STATUSES, STATUS_LABEL, type TicketStatus } from "@/lib/types/soporte";
import type { ActionResult } from "@/lib/types/schedule";

/** Published, not closed tickets, least recently synced first (never synced first). */
export async function listSyncableTickets(
  limit: number
): Promise<{ id: string; githubIssueNumber: number; status: TicketStatus }[]> {
  const rows = await db
    .select({ id: supportTickets.id, githubIssueNumber: supportTickets.githubIssueNumber, status: supportTickets.status })
    .from(supportTickets)
    .where(and(isNotNull(supportTickets.githubIssueNumber), notInArray(supportTickets.status, [...CLOSED_STATUSES])))
    .orderBy(sql`${supportTickets.githubSyncedAt} asc nulls first`, asc(supportTickets.createdAt))
    .limit(limit);
  return rows.flatMap((r) => (r.githubIssueNumber === null ? [] : [{ ...r, githubIssueNumber: r.githubIssueNumber }]));
}

/**
 * Applies a mapped GitHub state. `status` null only stamps `github_synced_at`.
 * A status equal to the current one writes nothing but the stamp, so a second
 * run never duplicates the event. A change writes a public `synced` event
 * (actor null) and notifies the author.
 */
export async function applySyncedStatus(
  id: string,
  status: TicketStatus | null,
  message?: string
): Promise<ActionResult<null>> {
  const now = new Date();
  const changed = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        status: supportTickets.status,
        code: supportTickets.code,
        createdBy: supportTickets.createdBy,
        githubIssueNumber: supportTickets.githubIssueNumber,
        githubIssueUrl: supportTickets.githubIssueUrl,
      })
      .from(supportTickets)
      .where(eq(supportTickets.id, id))
      .for("update");
    if (!row) return { found: false as const };

    if (status === null || status === row.status) {
      await tx.update(supportTickets).set({ githubSyncedAt: now }).where(eq(supportTickets.id, id));
      return { found: true as const, notice: null };
    }

    const closes = CLOSED_STATUSES.includes(status);
    await tx
      .update(supportTickets)
      .set({ status, githubSyncedAt: now, updatedAt: now, closedAt: closes ? now : null })
      .where(eq(supportTickets.id, id));
    await tx.insert(supportTicketEvents).values({
      ticketId: id,
      actorId: null,
      type: "synced",
      visibility: "public",
      payload: {
        from: row.status,
        to: status,
        ...(message ? { text: message } : {}),
        ...(row.githubIssueNumber !== null && row.githubIssueUrl
          ? { github: { number: row.githubIssueNumber, url: row.githubIssueUrl } }
          : {}),
      },
    });
    return { found: true as const, notice: { code: row.code, authorId: row.createdBy } };
  });

  if (!changed.found) return { ok: false, error: "NOT_FOUND" };
  if (changed.notice && status) {
    await notify(
      db,
      [changed.notice.authorId],
      {
        kind: "sistema",
        title: `${changed.notice.code}: ${STATUS_LABEL[status]}`,
        body: message ?? "",
        url: "/ajustes/solicitudes",
      },
      { now }
    );
  }
  return { ok: true, data: null };
}
