"use server";

import { toActionResult, unwrapActionResult } from "@/lib/actions/action-result";
import { createRateLimiter } from "@/lib/auth/rate-limit";
import { canManageSupport } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { notify } from "@/lib/notifications/notify";
import * as supportRepository from "@/lib/repositories/support-repository";
import { areaFromPath } from "@/lib/soporte/area";
import type { ActionResult } from "@/lib/types/schedule";
import type { CreateTicketInput, TicketDetail, TicketFilters, TicketsPage } from "@/lib/types/soporte";
import { createTicketInputSchema, listTicketsInputSchema, ticketReplySchema } from "@/lib/validation/soporte";
import { UuidSchema, parseInput } from "@/lib/validation/project-flow";
import { APP_VERSION } from "@/lib/version";

/** 10 solicitudes per hour per user. */
const createLimiter = createRateLimiter({ limit: 10, windowMs: 60 * 60 * 1000 });

/**
 * Soporte, user side (#1109). Any signed-in staff member files and follows
 * their own solicitudes; ownership is re-checked here and in the repository.
 * #1112 adds attachments to create and reply.
 */

/** File a solicitud with the captured context. Rate limited to 10 per hour per user (`RATE_LIMITED`). */
export async function createTicketAction(input: CreateTicketInput): Promise<ActionResult<{ id: string; code: string }>> {
  return toActionResult(async () => {
    const draft = parseInput(createTicketInputSchema, input);
    const user = await requireCapabilityUser();
    const staffId = user.member.id;
    if (!createLimiter.hit(staffId).allowed) throw new Error("RATE_LIMITED");

    const created = unwrapActionResult(
      await supportRepository.createTicket(staffId, {
        ...draft,
        steps: draft.steps ?? null,
        area: areaFromPath(draft.context.path),
        appVersion: APP_VERSION ?? "dev",
      }),
    );

    // The solicitud is saved; a failed notice must not fail the action.
    try {
      const adminIds = await supportRepository.listSupportAdminIds();
      await notify(db, adminIds, {
        kind: "sistema",
        title: `Nueva solicitud ${created.code}`,
        body: draft.title,
        url: "/mejoras",
        dedupeKey: `soporte.nueva:${created.id}`,
        actorId: staffId,
      });
    } catch (error) {
      console.error("[soporte] notify.failed", { kind: "soporte.nueva", message: error instanceof Error ? error.message : "unknown" });
    }
    return created;
  });
}

/** The caller's own solicitudes, newest first, cursor paging (20). */
export async function listMyTicketsAction(input: TicketFilters & { cursor?: string | null }): Promise<TicketsPage> {
  const { cursor, ...rest } = parseInput(listTicketsInputSchema, input);
  const user = await requireCapabilityUser();
  // Mis solicitudes only filters by status; any other filter is ignored.
  return supportRepository.listMyTickets(user.member.id, { status: rest.status }, cursor ?? null);
}

/** One solicitud for its author or a `canManageSupport` user; null otherwise. Authors never get internal events. */
export async function getTicketAction(id: string): Promise<TicketDetail | null> {
  const ticketId = UuidSchema.safeParse(id);
  if (!ticketId.success) return null;
  const user = await requireCapabilityUser();
  return supportRepository.getTicket({ staffId: user.member.id, canManageSupport: canManageSupport(user) }, ticketId.data);
}

/** A public reply by the author; reopens `resuelto` within 14 days. */
export async function replyTicketAction(id: string, text: string): Promise<ActionResult<null>> {
  return toActionResult(async () => {
    const ticketId = parseInput(UuidSchema, id);
    const reply = parseInput(ticketReplySchema, text);
    const user = await requireCapabilityUser();
    return unwrapActionResult(await supportRepository.addAuthorReply(user.member.id, ticketId, reply));
  });
}

/** The author withdraws a `nuevo` solicitud. */
export async function withdrawTicketAction(id: string): Promise<ActionResult<null>> {
  return toActionResult(async () => {
    const ticketId = parseInput(UuidSchema, id);
    const user = await requireCapabilityUser();
    return unwrapActionResult(await supportRepository.withdrawTicket(user.member.id, ticketId));
  });
}
