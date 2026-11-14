"use server";

import { z } from "zod";

import { toActionResult } from "@/lib/actions/action-result";
import { requireCapabilityUser } from "@/lib/auth/session";
import { canManageSupport } from "@/lib/auth/permissions";
import { createRateLimiter } from "@/lib/auth/rate-limit";
import { findTicketAuthor, saveTicketAttachment } from "@/lib/soporte/attachments";
import { ATTACHMENT_ERRORS, ATTACHMENT_MAX_BYTES } from "@/lib/soporte/attachments-rules";
import type { ActionResult } from "@/lib/types/schedule";
import type { TicketAttachment } from "@/lib/types/soporte";

/** 30 images an hour per person: three per solicitud with room for replies. */
const uploadLimiter = createRateLimiter({ limit: 30, windowMs: 60 * 60 * 1000 });

const ticketIdSchema = z.string().uuid();

/**
 * Attaches one image to a solicitud (#1112). Call it once per file after
 * `createTicketAction` or `replyTicketAction`; `formData` carries the field
 * `file`. Only the author, or a `canManageSupport` user, can attach. Errors
 * come back as Spanish copy in `ActionResult`.
 */
export async function uploadTicketAttachmentAction(
  ticketId: string,
  formData: FormData
): Promise<ActionResult<TicketAttachment>> {
  return toActionResult(async () => {
    const parsed = ticketIdSchema.safeParse(ticketId);
    if (!parsed.success) throw new Error(ATTACHMENT_ERRORS.notFound);

    const user = await requireCapabilityUser();
    const staffId = user.member.id;

    const author = await findTicketAuthor(parsed.data);
    // Someone else's solicitud looks the same as a missing one.
    if (!author || (author !== staffId && !canManageSupport(user))) throw new Error(ATTACHMENT_ERRORS.notFound);

    if (!uploadLimiter.hit(staffId).allowed) throw new Error(ATTACHMENT_ERRORS.rateLimited);

    const file = formData.get("file");
    if (!file || typeof file === "string") throw new Error(ATTACHMENT_ERRORS.malformed);
    if (file.size > ATTACHMENT_MAX_BYTES) throw new Error(ATTACHMENT_ERRORS.tooLarge);

    const result = await saveTicketAttachment(parsed.data, {
      name: file.name,
      mime: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
    if (!result.ok) throw new Error(result.error);
    return result.data;
  });
}
