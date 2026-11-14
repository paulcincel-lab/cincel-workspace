/**
 * Shared read helpers of the Soporte repository: row mapping, people lookups,
 * status groups and cursor paging. The user side (#1109) and the admin side
 * (#1113) build their lists and details from these.
 */
import { and, eq, inArray, sql, type SQL } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { staff, staffPhotos, supportTicketAttachments, supportTickets } from "@/lib/db/schema";
import {
  CLOSED_STATUSES,
  OPEN_STATUSES,
  type TicketArea,
  type TicketFilters,
  type TicketListRow,
  type TicketPerson,
  type TicketPriority,
  TICKET_AREAS,
} from "@/lib/types/soporte";

export const MY_TICKETS_PAGE_SIZE = 20;

export type TicketRow = typeof supportTickets.$inferSelect;

/** `created_at` at millisecond precision, so the cursor (a JS ISO string) compares exactly. */
export const createdAtMs = sql`date_trunc('milliseconds', ${supportTickets.createdAt})`;

export function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`, "utf8").toString("base64url");
}

/** Null when the cursor is missing or malformed (the first page is served). */
export function decodeCursor(cursor: string | null | undefined): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  const [createdAt, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  if (!createdAt || !id || Number.isNaN(Date.parse(createdAt))) return null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  return { createdAt, id };
}

/** `abiertas` / `cerradas` expand to their status groups. */
export function statusCondition(status: TicketFilters["status"]): SQL | undefined {
  if (!status) return undefined;
  if (status === "abiertas") return inArray(supportTickets.status, [...OPEN_STATUSES]);
  if (status === "cerradas") return inArray(supportTickets.status, [...CLOSED_STATUSES]);
  return eq(supportTickets.status, status);
}

export async function loadPeople(ids: (string | null)[]): Promise<Map<string, TicketPerson>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({
      id: staff.id,
      name: staff.name,
      lastName: staff.lastName,
      hasPhoto: sql<boolean>`${staffPhotos.staffId} is not null`,
    })
    .from(staff)
    .leftJoin(staffPhotos, eq(staffPhotos.staffId, staff.id))
    .where(inArray(staff.id, unique));
  return new Map(
    rows.map((r) => [
      r.id,
      {
        id: r.id,
        name: [r.name, r.lastName].filter(Boolean).join(" "),
        photoUrl: r.hasPhoto ? `/api/staff/${r.id}/photo` : null,
      },
    ]),
  );
}

export function unknownPerson(id: string): TicketPerson {
  return { id, name: "Persona desconocida", photoUrl: null };
}

export async function countAttachments(ticketIds: string[]): Promise<Map<string, number>> {
  if (ticketIds.length === 0) return new Map();
  const rows = await db
    .select({ ticketId: supportTicketAttachments.ticketId, n: sql<number>`count(*)::int` })
    .from(supportTicketAttachments)
    .where(inArray(supportTicketAttachments.ticketId, ticketIds))
    .groupBy(supportTicketAttachments.ticketId);
  return new Map(rows.map((r) => [r.ticketId, r.n]));
}

function asArea(value: string): TicketArea {
  return (TICKET_AREAS as readonly string[]).includes(value) ? (value as TicketArea) : "otro";
}

export async function toListRows(rows: TicketRow[]): Promise<TicketListRow[]> {
  const people = await loadPeople(rows.flatMap((r) => [r.createdBy, r.assigneeId]));
  const attachments = await countAttachments(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    kind: r.kind,
    title: r.title,
    area: asArea(r.area),
    status: r.status,
    priority: (r.priority ?? null) as TicketPriority | null,
    author: people.get(r.createdBy) ?? unknownPerson(r.createdBy),
    assignee: r.assigneeId ? (people.get(r.assigneeId) ?? unknownPerson(r.assigneeId)) : null,
    githubIssueNumber: r.githubIssueNumber,
    githubIssueUrl: r.githubIssueUrl,
    attachmentCount: attachments.get(r.id) ?? 0,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    closedAt: r.closedAt ? r.closedAt.toISOString() : null,
  }));
}

/** One page of tickets matching `where`, newest first; fetches one extra row to know if there is a next page. */
export async function pageTickets(
  where: SQL | undefined,
  cursor: string | null,
  pageSize: number,
): Promise<{ rows: TicketListRow[]; nextCursor: string | null }> {
  const at = decodeCursor(cursor);
  const conditions = [where];
  if (at) conditions.push(sql`(${createdAtMs}, ${supportTickets.id}) < (${at.createdAt}::timestamptz, ${at.id}::uuid)`);
  const found = await db
    .select()
    .from(supportTickets)
    .where(and(...conditions))
    .orderBy(sql`${createdAtMs} desc`, sql`${supportTickets.id} desc`)
    .limit(pageSize + 1);
  const hasMore = found.length > pageSize;
  const pageRows = hasMore ? found.slice(0, pageSize) : found;
  return {
    rows: await toListRows(pageRows),
    nextCursor: hasMore ? encodeCursor(pageRows[pageRows.length - 1]) : null,
  };
}
