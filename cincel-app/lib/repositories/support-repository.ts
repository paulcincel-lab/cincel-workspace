/**
 * Soporte repository (stubs). #1109 implements the user-side functions, #1113
 * the admin ones, #1116 and #1117 the GitHub ones. Reads return safe empty
 * defaults; writes return `{ ok: false, error: "NOT_IMPLEMENTED" }`.
 */
import { and, asc, eq, isNull } from "drizzle-orm";

import { staffAccessRole } from "@/lib/auth/access-role";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveSupportCapabilities } from "@/lib/auth/permissions";
import { getRolePermissionOverrides } from "@/lib/auth/permissions-matrix";
import { db } from "@/lib/db/client";
import { staff, supportTicketAttachments, supportTicketEvents, supportTickets } from "@/lib/db/schema";
import type { SystemAccessRole } from "@/lib/data/roles";
import { MY_TICKETS_PAGE_SIZE, loadPeople, pageTickets, statusCondition, toListRows, unknownPerson } from "@/lib/repositories/support-rows";
import type { ActionResult } from "@/lib/types/schedule";
import type {
  CreateTicketInput,
  TicketContext,
  TicketDetail,
  TicketFilters,
  TicketsPage,
} from "@/lib/types/soporte";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = { ok: false, error: "NOT_FOUND" } as const;

/** Who is asking: ownership and the capability are resolved by the action. */
export type TicketViewer = { staffId: string; canManageSupport: boolean };

// ── User side (#1109) ───────────────────────────────────────────────────────

/** Days after `resuelto` in which the author's reply reopens the ticket. */
export const REOPEN_WINDOW_DAYS = 14;
export const WITHDRAWN_REASON = "Retirada por quien la envió";

/** Inserts the ticket and its `created` event; returns the generated code (from `support_ticket_seq`, unique under concurrency). */
export async function createTicket(
  staffId: string,
  input: CreateTicketInput & { area: string; appVersion: string },
): Promise<ActionResult<{ id: string; code: string }>> {
  const context: TicketContext = { ...input.context, appVersion: input.appVersion, occurredAt: new Date().toISOString() };
  const created = await db.transaction(async (tx) => {
    const [ticket] = await tx
      .insert(supportTickets)
      .values({
        kind: input.kind,
        title: input.title,
        description: input.description,
        steps: input.kind === "error" ? input.steps || null : null,
        area: input.area,
        context,
        createdBy: staffId,
      })
      .returning({ id: supportTickets.id, code: supportTickets.code });
    await tx.insert(supportTicketEvents).values({
      ticketId: ticket.id,
      actorId: staffId,
      type: "created",
      visibility: "public",
      payload: {},
    });
    return ticket;
  });
  return { ok: true, data: created };
}

/** The author's own tickets, newest first, cursor paging (20). */
export async function listMyTickets(
  staffId: string,
  filters: TicketFilters,
  cursor: string | null,
): Promise<TicketsPage> {
  return pageTickets(and(eq(supportTickets.createdBy, staffId), statusCondition(filters.status)), cursor, MY_TICKETS_PAGE_SIZE);
}

/** One ticket for its author or an admin; null when missing or not visible. Authors never get `internal` events. */
export async function getTicket(viewer: TicketViewer, id: string): Promise<TicketDetail | null> {
  if (!UUID.test(id)) return null;
  const [row] = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).limit(1);
  if (!row) return null;
  if (row.createdBy !== viewer.staffId && !viewer.canManageSupport) return null;

  const [listRow] = await toListRows([row]);
  const eventRows = await db
    .select()
    .from(supportTicketEvents)
    .where(
      and(
        eq(supportTicketEvents.ticketId, id),
        viewer.canManageSupport ? undefined : eq(supportTicketEvents.visibility, "public"),
      ),
    )
    .orderBy(asc(supportTicketEvents.createdAt), asc(supportTicketEvents.id));
  const attachmentRows = await db
    .select()
    .from(supportTicketAttachments)
    .where(eq(supportTicketAttachments.ticketId, id))
    .orderBy(asc(supportTicketAttachments.createdAt), asc(supportTicketAttachments.id));
  const original = row.duplicateOf
    ? (
        await db
          .select({ id: supportTickets.id, code: supportTickets.code })
          .from(supportTickets)
          .where(eq(supportTickets.id, row.duplicateOf))
          .limit(1)
      )[0]
    : undefined;
  const people = await loadPeople(eventRows.map((e) => e.actorId));

  return {
    ...listRow,
    description: row.description,
    steps: row.steps,
    context: row.context,
    duplicateOf: original ? { id: original.id, code: original.code } : null,
    githubSyncedAt: row.githubSyncedAt ? row.githubSyncedAt.toISOString() : null,
    events: eventRows.map((e) => ({
      id: e.id,
      ticketId: e.ticketId,
      type: e.type,
      visibility: e.visibility,
      actor: e.actorId ? (people.get(e.actorId) ?? unknownPerson(e.actorId)) : null,
      payload: e.payload,
      createdAt: e.createdAt.toISOString(),
    })),
    attachments: attachmentRows.map((a) => ({ id: a.id, name: a.name, mime: a.mime, size: a.size })),
  };
}

/** A public reply by the author; reopens `resuelto` within 14 days. */
export async function addAuthorReply(staffId: string, id: string, text: string): Promise<ActionResult<null>> {
  if (!UUID.test(id)) return NOT_FOUND;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ status: supportTickets.status, closedAt: supportTickets.closedAt, updatedAt: supportTickets.updatedAt })
      .from(supportTickets)
      .where(and(eq(supportTickets.id, id), eq(supportTickets.createdBy, staffId)))
      .for("update")
      .limit(1);
    if (!row) return NOT_FOUND;

    const now = new Date();
    await tx.insert(supportTicketEvents).values({
      ticketId: id,
      actorId: staffId,
      type: "reply",
      visibility: "public",
      payload: { text },
    });
    const closedAt = row.closedAt ?? row.updatedAt;
    const reopens = row.status === "resuelto" && now.getTime() - closedAt.getTime() <= REOPEN_WINDOW_DAYS * 86_400_000;
    if (reopens) {
      await tx.insert(supportTicketEvents).values({
        ticketId: id,
        actorId: staffId,
        type: "status",
        visibility: "public",
        payload: { from: "resuelto", to: "en_revision" },
      });
    }
    await tx
      .update(supportTickets)
      .set(reopens ? { status: "en_revision", closedAt: null, updatedAt: now } : { updatedAt: now })
      .where(eq(supportTickets.id, id));
    return { ok: true, data: null };
  });
}

/** The author withdraws a `nuevo` ticket. */
export async function withdrawTicket(staffId: string, id: string): Promise<ActionResult<null>> {
  if (!UUID.test(id)) return NOT_FOUND;
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ status: supportTickets.status })
      .from(supportTickets)
      .where(and(eq(supportTickets.id, id), eq(supportTickets.createdBy, staffId)))
      .for("update")
      .limit(1);
    if (!row) return NOT_FOUND;
    if (row.status !== "nuevo") return { ok: false, error: "Solo puedes retirar una solicitud nueva." } as const;

    const now = new Date();
    await tx.update(supportTickets).set({ status: "descartado", closedAt: now, updatedAt: now }).where(eq(supportTickets.id, id));
    await tx.insert(supportTicketEvents).values({
      ticketId: id,
      actorId: staffId,
      type: "status",
      visibility: "public",
      payload: { from: "nuevo", to: "descartado", text: WITHDRAWN_REASON },
    });
    return { ok: true, data: null };
  });
}

/** Staff ids holding `canManageSupport` (role default or the saved matrix), for the new-ticket notification. */
export async function listSupportAdminIds(): Promise<string[]> {
  const rows = await db
    .select({ id: staff.id, role: staff.role, email: staff.email })
    .from(staff)
    .where(and(eq(staff.active, true), isNull(staff.deletedAt)));
  const byAccess = new Map<SystemAccessRole, string[]>();
  for (const r of rows) {
    const access = staffAccessRole(r.role, r.email);
    if (!access) continue;
    byAccess.set(access, [...(byAccess.get(access) ?? []), r.id]);
  }
  const ids: string[] = [];
  for (const [access, members] of byAccess) {
    const permissionOverrides = await getRolePermissionOverrides(access);
    const user = { access, ...(permissionOverrides ? { permissionOverrides } : {}) } as AuthenticatedUser;
    if (resolveSupportCapabilities(user).canManageSupport) ids.push(...members);
  }
  return ids;
}

// ── Admin side (#1113) ──────────────────────────────────────────────────────

export {
  addTicketMessage,
  getMejorasCounts,
  listMejoras,
  markDuplicate,
  updateTicket,
} from "@/lib/repositories/support-admin-repository";

// ── GitHub (#1116, #1117) ───────────────────────────────────────────────────

// Implemented in `support-publish.ts` (#1116).
export { recordPublished } from "@/lib/repositories/support-publish";

// Implemented in `support-github-sync.ts` (#1117).
export { applySyncedStatus, listSyncableTickets } from "@/lib/repositories/support-github-sync";
