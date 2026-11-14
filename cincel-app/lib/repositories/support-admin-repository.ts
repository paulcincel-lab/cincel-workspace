/**
 * Admin side of Soporte (#1113): the Mejoras list and counts, triage, public
 * replies and internal notes, duplicates. Re-exported by `support-repository`.
 * Authorization (`canManageSupport`) is checked by the actions.
 */
import { and, count, eq, inArray, isNull, ne, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "@/lib/db/client";
import { staff, supportTicketEvents, supportTickets } from "@/lib/db/schema";
import { notify } from "@/lib/notifications/notify";
import type { ActionResult } from "@/lib/types/schedule";
import {
  CLOSED_STATUSES,
  OPEN_STATUSES,
  STATUS_LABEL,
  TICKET_STATUSES,
  type MejorasCounts,
  type TicketArea,
  type TicketEventPayload,
  type TicketEventType,
  type TicketFilters,
  type TicketKind,
  type TicketListRow,
  type TicketMessageInput,
  type TicketPatch,
  type TicketPriority,
  type TicketsPage,
  type TicketStatus,
  type TicketVisibility,
} from "@/lib/types/soporte";

/** Page size of Mejoras. */
export const MEJORAS_PAGE_SIZE = 50;

/** Where an author opens a solicitud (Mis solicitudes, #1111). */
const MY_TICKETS_PATH = "/ajustes/solicitudes";

const CLOSING: readonly TicketStatus[] = ["resuelto", "descartado"];

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ── List ────────────────────────────────────────────────────────────────────

const author = alias(staff, "ticket_author");
const assignee = alias(staff, "ticket_assignee");

const tsMs = (col: SQL | typeof supportTickets.updatedAt | typeof supportTickets.createdAt) => sql`date_trunc('milliseconds', ${col})`;
const priorityRank = sql`(case ${supportTickets.priority} when 'alta' then 3 when 'media' then 2 when 'baja' then 1 else 0 end)`;

function fullName(name: string | null, lastName: string | null): string {
  return [name, lastName].filter(Boolean).join(" ");
}

/** Filters shared by the list and the counts; the counts skip `status`. */
function filterConditions(filters: TicketFilters, opts: { skipStatus?: boolean } = {}): SQL[] {
  const where: SQL[] = [];
  if (!opts.skipStatus && filters.status) {
    if (filters.status === "abiertas") where.push(inArray(supportTickets.status, [...OPEN_STATUSES]));
    else if (filters.status === "cerradas") where.push(inArray(supportTickets.status, [...CLOSED_STATUSES]));
    else where.push(eq(supportTickets.status, filters.status));
  }
  if (filters.kind) where.push(eq(supportTickets.kind, filters.kind));
  if (filters.area) where.push(eq(supportTickets.area, filters.area));
  if (filters.priority) where.push(eq(supportTickets.priority, filters.priority));
  if (filters.unassigned) where.push(isNull(supportTickets.assigneeId));
  else if (filters.assigneeId) where.push(eq(supportTickets.assigneeId, filters.assigneeId));
  if (filters.authorId) where.push(eq(supportTickets.createdBy, filters.authorId));
  const q = filters.q?.trim();
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, "\\$&")}%`;
    where.push(
      sql`(${supportTickets.code} ilike ${like} or ${supportTickets.title} ilike ${like} or ${supportTickets.description} ilike ${like})`,
    );
  }
  return where;
}

type Cursor = { r?: number; t: string; id: string };

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(raw: string | null): Cursor | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<Cursor>;
    if (typeof value.t !== "string" || typeof value.id !== "string" || Number.isNaN(Date.parse(value.t))) return null;
    if (value.r !== undefined && typeof value.r !== "number") return null;
    return { r: value.r, t: value.t, id: value.id };
  } catch {
    return null;
  }
}

export async function listMejoras(filters: TicketFilters, cursorRaw: string | null): Promise<TicketsPage> {
  const sort = filters.sort ?? "updated";
  const keyColumn = sort === "created" ? supportTickets.createdAt : supportTickets.updatedAt;
  const where = filterConditions(filters);

  const cursor = decodeCursor(cursorRaw);
  if (cursor) {
    const t = sql`${cursor.t}::timestamptz`;
    if (sort === "priority") {
      where.push(
        sql`(${priorityRank}, ${tsMs(keyColumn)}, ${supportTickets.id}) < (${cursor.r ?? 0}::int, ${t}, ${cursor.id}::uuid)`,
      );
    } else {
      where.push(sql`(${tsMs(keyColumn)}, ${supportTickets.id}) < (${t}, ${cursor.id}::uuid)`);
    }
  }

  const order =
    sort === "priority"
      ? [sql`${priorityRank} desc`, sql`${tsMs(keyColumn)} desc`, sql`${supportTickets.id} desc`]
      : [sql`${tsMs(keyColumn)} desc`, sql`${supportTickets.id} desc`];

  const rows = await db
    .select({
      id: supportTickets.id,
      code: supportTickets.code,
      kind: supportTickets.kind,
      title: supportTickets.title,
      area: supportTickets.area,
      status: supportTickets.status,
      priority: supportTickets.priority,
      authorId: author.id,
      authorName: author.name,
      authorLastName: author.lastName,
      assigneeId: assignee.id,
      assigneeName: assignee.name,
      assigneeLastName: assignee.lastName,
      githubIssueNumber: supportTickets.githubIssueNumber,
      githubIssueUrl: supportTickets.githubIssueUrl,
      attachmentCount: sql<number>`(select count(*)::int from core.support_ticket_attachments a where a.ticket_id = ${supportTickets.id})`,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
      closedAt: supportTickets.closedAt,
    })
    .from(supportTickets)
    .innerJoin(author, eq(author.id, supportTickets.createdBy))
    .leftJoin(assignee, eq(assignee.id, supportTickets.assigneeId))
    .where(where.length > 0 ? and(...where) : undefined)
    .orderBy(...order)
    .limit(MEJORAS_PAGE_SIZE + 1);

  const page = rows.slice(0, MEJORAS_PAGE_SIZE);
  const mapped: TicketListRow[] = page.map((r) => ({
    id: r.id,
    code: r.code,
    kind: r.kind as TicketKind,
    title: r.title,
    area: r.area as TicketArea,
    status: r.status as TicketStatus,
    priority: (r.priority as TicketPriority | null) ?? null,
    author: { id: r.authorId, name: fullName(r.authorName, r.authorLastName), photoUrl: null },
    assignee: r.assigneeId
      ? { id: r.assigneeId, name: fullName(r.assigneeName, r.assigneeLastName), photoUrl: null }
      : null,
    githubIssueNumber: r.githubIssueNumber,
    githubIssueUrl: r.githubIssueUrl,
    attachmentCount: Number(r.attachmentCount),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    closedAt: r.closedAt ? r.closedAt.toISOString() : null,
  }));

  let nextCursor: string | null = null;
  if (rows.length > MEJORAS_PAGE_SIZE) {
    const last = page[page.length - 1];
    const key = sort === "created" ? last.createdAt : last.updatedAt;
    const rank = last.priority === "alta" ? 3 : last.priority === "media" ? 2 : last.priority === "baja" ? 1 : 0;
    nextCursor = encodeCursor({ ...(sort === "priority" ? { r: rank } : {}), t: key.toISOString(), id: last.id });
  }
  return { rows: mapped, nextCursor };
}

/**
 * Counts per status under the given filters (the status filter itself is
 * ignored, so the tabs add up to what the list can show). `nuevo` always counts
 * the whole table: it is the badge of the nav item.
 */
export async function getMejorasCounts(filters: TicketFilters = {}): Promise<MejorasCounts> {
  const where = filterConditions(filters, { skipStatus: true });
  const grouped = await db
    .select({ status: supportTickets.status, n: count() })
    .from(supportTickets)
    .where(where.length > 0 ? and(...where) : undefined)
    .groupBy(supportTickets.status);

  const byStatus = Object.fromEntries(TICKET_STATUSES.map((s) => [s, 0])) as Record<TicketStatus, number>;
  for (const row of grouped) byStatus[row.status as TicketStatus] = Number(row.n);
  const total = TICKET_STATUSES.reduce((sum, s) => sum + byStatus[s], 0);

  const [{ n: nuevo }] = await db
    .select({ n: count() })
    .from(supportTickets)
    .where(eq(supportTickets.status, "nuevo"));
  return { byStatus, nuevo: Number(nuevo), total };
}

// ── Writes ──────────────────────────────────────────────────────────────────

type TicketRow = typeof supportTickets.$inferSelect;

type Notice = { title: string; body?: string; eventId: string };

async function lockTicket(tx: Tx, id: string): Promise<TicketRow | null> {
  const [row] = await tx.select().from(supportTickets).where(eq(supportTickets.id, id)).for("update");
  return row ?? null;
}

async function addEvent(
  tx: Tx,
  ticketId: string,
  actorId: string,
  type: TicketEventType,
  visibility: TicketVisibility,
  payload: TicketEventPayload,
): Promise<string> {
  const [row] = await tx
    .insert(supportTicketEvents)
    .values({ ticketId, actorId, type, visibility, payload })
    .returning({ id: supportTicketEvents.id });
  return row.id;
}

/**
 * Notifies the author and, for an original, the authors of its duplicates (they
 * follow it). Public changes only; respects each person's preferences through
 * `notify` and never notifies the actor.
 */
async function notifyFollowers(ticket: TicketRow, actorId: string, notices: Notice[]): Promise<void> {
  if (notices.length === 0) return;
  try {
    const duplicates = await db
      .select({ createdBy: supportTickets.createdBy })
      .from(supportTickets)
      .where(eq(supportTickets.duplicateOf, ticket.id));
    const recipients = [...new Set([ticket.createdBy, ...duplicates.map((d) => d.createdBy)])];
    for (const notice of notices) {
      await notify(db, recipients, {
        kind: "sistema",
        title: notice.title,
        body: notice.body,
        url: `${MY_TICKETS_PATH}?id=${ticket.id}`,
        dedupeKey: `soporte.actualizada:${notice.eventId}`,
        actorId,
      });
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "soporte.notify.failed",
        err: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

const NOT_FOUND = { ok: false, error: "NOT_FOUND: solicitud" } as const;

/** Applies the patch; one event per changed field with before/after. */
export async function updateTicket(actorId: string, id: string, patch: TicketPatch): Promise<ActionResult<null>> {
  const message = patch.message?.trim() || undefined;

  const outcome = await db.transaction(async (tx): Promise<{ result: ActionResult<null>; ticket?: TicketRow; notices: Notice[] }> => {
    const ticket = await lockTicket(tx, id);
    if (!ticket) return { result: NOT_FOUND, notices: [] };

    const notices: Notice[] = [];
    const set: Partial<typeof supportTickets.$inferInsert> = {};
    const statusChanges = patch.status !== undefined && patch.status !== ticket.status;
    const priorityChanges = patch.priority !== undefined && patch.priority !== ticket.priority;
    const assigneeChanges = patch.assigneeId !== undefined && patch.assigneeId !== ticket.assigneeId;

    if (statusChanges && patch.status === "descartado" && !message) {
      return { result: { ok: false, error: "VALIDATION: descartar requiere un mensaje público" }, notices };
    }
    if (assigneeChanges && patch.assigneeId) {
      const [person] = await tx
        .select({ id: staff.id })
        .from(staff)
        .where(and(eq(staff.id, patch.assigneeId), eq(staff.active, true), isNull(staff.deletedAt)));
      if (!person) return { result: { ok: false, error: "VALIDATION: responsable no válido" }, notices };
    }

    if (statusChanges && patch.status) {
      const to = patch.status;
      set.status = to;
      set.closedAt = CLOSING.includes(to) ? new Date() : null;
      const eventId = await addEvent(tx, id, actorId, "status", "public", {
        from: ticket.status,
        to,
        ...(message ? { text: message } : {}),
      });
      notices.push({
        eventId,
        title: `Tu solicitud ${ticket.code} cambió a: ${STATUS_LABEL[to]}`,
        body: message,
      });
    }
    if (priorityChanges) {
      set.priority = patch.priority ?? null;
      await addEvent(tx, id, actorId, "priority", "internal", {
        from: ticket.priority,
        to: patch.priority ?? null,
      });
    }
    if (assigneeChanges) {
      set.assigneeId = patch.assigneeId ?? null;
      await addEvent(tx, id, actorId, "assignee", "internal", {
        from: ticket.assigneeId,
        to: patch.assigneeId ?? null,
      });
    }

    if (Object.keys(set).length === 0) return { result: { ok: true, data: null }, notices };
    await tx.update(supportTickets).set(set).where(eq(supportTickets.id, id));
    return { result: { ok: true, data: null }, ticket, notices };
  });

  if (outcome.ticket) await notifyFollowers(outcome.ticket, actorId, outcome.notices);
  return outcome.result;
}

/** A public reply (the author is notified) or an internal note (admins only). */
export async function addTicketMessage(
  actorId: string,
  id: string,
  input: TicketMessageInput,
): Promise<ActionResult<null>> {
  const text = input.text.trim();
  if (!text) return { ok: false, error: "VALIDATION: mensaje vacío" };
  const isNote = input.visibility === "internal";

  const outcome = await db.transaction(async (tx) => {
    const ticket = await lockTicket(tx, id);
    if (!ticket) return null;
    const eventId = await addEvent(tx, id, actorId, isNote ? "note" : "reply", input.visibility, { text });
    await tx.update(supportTickets).set({ updatedAt: new Date() }).where(eq(supportTickets.id, id));
    return { ticket, eventId };
  });
  if (!outcome) return NOT_FOUND;

  if (!isNote) {
    await notifyFollowers(outcome.ticket, actorId, [
      { eventId: outcome.eventId, title: `Respuesta a tu solicitud ${outcome.ticket.code}`, body: text.slice(0, 200) },
    ]);
  }
  return { ok: true, data: null };
}

/** Status `descartado` + `duplicate_of`, a public message, and the author follows the original. */
export async function markDuplicate(actorId: string, id: string, ofId: string): Promise<ActionResult<null>> {
  if (id === ofId) return { ok: false, error: "VALIDATION: una solicitud no puede duplicarse a sí misma" };

  const outcome = await db.transaction(
    async (tx): Promise<{ result: ActionResult<null>; ticket?: TicketRow; eventId?: string; code?: string }> => {
      const ticket = await lockTicket(tx, id);
      if (!ticket) return { result: NOT_FOUND };
      const [original] = await tx
        .select({ id: supportTickets.id, code: supportTickets.code, duplicateOf: supportTickets.duplicateOf })
        .from(supportTickets)
        .where(and(eq(supportTickets.id, ofId), ne(supportTickets.id, id)));
      if (!original) return { result: { ok: false, error: "NOT_FOUND: solicitud original" } };
      if (original.duplicateOf) {
        return { result: { ok: false, error: "VALIDATION: la original ya es una duplicada" } };
      }
      const hasDuplicates = await tx
        .select({ id: supportTickets.id })
        .from(supportTickets)
        .where(eq(supportTickets.duplicateOf, id))
        .limit(1);
      if (hasDuplicates.length > 0) {
        return { result: { ok: false, error: "VALIDATION: otras solicitudes apuntan a esta" } };
      }

      const eventId = await addEvent(tx, id, actorId, "duplicate", "public", {
        from: ticket.status,
        to: "descartado",
        text: `Duplicada de ${original.code}`,
        duplicateOf: { id: original.id, code: original.code },
      });
      await tx
        .update(supportTickets)
        .set({
          status: "descartado",
          duplicateOf: original.id,
          closedAt: ticket.status === "descartado" && ticket.closedAt ? ticket.closedAt : new Date(),
        })
        .where(eq(supportTickets.id, id));
      return { result: { ok: true, data: null }, ticket, eventId, code: original.code };
    },
  );

  if (outcome.ticket && outcome.eventId) {
    await notifyFollowers(outcome.ticket, actorId, [
      {
        eventId: outcome.eventId,
        title: `Tu solicitud ${outcome.ticket.code} es una duplicada`,
        body: `Duplicada de ${outcome.code}. Seguirás su avance ahí.`,
      },
    ]);
  }
  return outcome.result;
}
