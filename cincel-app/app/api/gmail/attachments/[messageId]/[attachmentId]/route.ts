/**
 * GET /api/gmail/attachments/[messageId]/[attachmentId] (redesign BE §7.6):
 * owner only (401 without a session, 404 when the message isn't in the
 * caller's mailbox, 409 `NOT_CONNECTED`); streams the bytes from
 * `messages.attachments.get` as an attachment, `nosniff`, `private, no-store`.
 *
 * Contract stub.
 */
import type { NextRequest, NextResponse } from "next/server";

import { notImplemented } from "@/lib/stubs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ messageId: string; attachmentId: string }> },
): Promise<NextResponse> {
  return notImplemented("GET /api/gmail/attachments/[messageId]/[attachmentId]", request, context);
}
