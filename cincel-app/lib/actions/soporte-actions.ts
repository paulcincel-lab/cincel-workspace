"use server";

import type { ActionResult } from "@/lib/types/schedule";
import type { CreateTicketInput, TicketDetail, TicketFilters, TicketsPage } from "@/lib/types/soporte";

/** Stubs (Soporte Phase 0). #1109 implements them; #1112 adds attachments to create and reply. */

/** File a solicitud with the captured context. Rate limited to 10 per hour per user (`RATE_LIMITED`). */
export async function createTicketAction(_input: CreateTicketInput): Promise<ActionResult<{ id: string; code: string }>> {
  return { ok: false, error: "NOT_IMPLEMENTED" };
}

/** The caller's own solicitudes, newest first, cursor paging (20). */
export async function listMyTicketsAction(_input: TicketFilters & { cursor?: string | null }): Promise<TicketsPage> {
  return { rows: [], nextCursor: null };
}

/** One solicitud for its author or a `canManageSupport` user; null otherwise. Authors never get internal events. */
export async function getTicketAction(_id: string): Promise<TicketDetail | null> {
  return null;
}

/** A public reply by the author; reopens `resuelto` within 14 days. */
export async function replyTicketAction(_id: string, _text: string): Promise<ActionResult<null>> {
  return { ok: false, error: "NOT_IMPLEMENTED" };
}

/** The author withdraws a `nuevo` solicitud. */
export async function withdrawTicketAction(_id: string): Promise<ActionResult<null>> {
  return { ok: false, error: "NOT_IMPLEMENTED" };
}
