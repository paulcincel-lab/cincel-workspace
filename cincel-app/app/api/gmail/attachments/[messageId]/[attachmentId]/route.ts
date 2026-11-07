/**
 * GET /api/gmail/attachments/[messageId]/[attachmentId] (redesign BE §7.6):
 * owner only (401 without a session, 404 when the message isn't in the
 * caller's mailbox, 409 `NOT_CONNECTED` / `SCOPE_MISSING`); streams the bytes
 * from `messages.attachments.get` as an attachment, `nosniff`,
 * `private, no-store`. Nothing is cached server-side.
 *
 * `attachmentId` is the id `fetchGmailThreadAction` hands out
 * (`<threadId>~<partId>`, see `lib/gmail/thread-view.ts`): the thread is read
 * with the caller's own token, so another staff member's message is never
 * found, and the part's name and mime type come from Gmail, not the URL.
 */
import { NextResponse, type NextRequest } from "next/server";

import { requireSessionAccess } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { actionErrorCode } from "@/lib/errors";
import { loadGmailAccess } from "@/lib/gmail/access";
import { gmailClient } from "@/lib/gmail/client";
import {
  attachmentContentDisposition,
  attachmentMime,
  attachmentName,
  findPart,
  findRawMessage,
  parseAttachmentRef,
} from "@/lib/gmail/thread-view";

const error = (status: number, code: string) =>
  NextResponse.json({ error: code }, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ messageId: string; attachmentId: string }> },
): Promise<NextResponse> {
  void request;
  let staffId: string;
  try {
    staffId = (await requireSessionAccess()).id;
  } catch {
    return error(401, "UNAUTHENTICATED");
  }

  const { messageId, attachmentId } = await context.params;
  const access = await loadGmailAccess(db, staffId);
  if (!access.connected) return error(409, "NOT_CONNECTED");
  if (!access.canRead) return error(409, "SCOPE_MISSING");

  const ref = parseAttachmentRef(attachmentId ?? "");
  if (!ref || !messageId || !/^[A-Za-z0-9_-]+$/.test(messageId)) return error(404, "NOT_FOUND");

  try {
    const api = await gmailClient(staffId);
    const message = findRawMessage(await api.getThread(ref.threadId, "full"), messageId);
    const part = message ? findPart(message.payload, ref.partId) : null;
    if (!part) return error(404, "NOT_FOUND");

    const gmailAttachmentId = typeof part.body?.attachmentId === "string" ? part.body.attachmentId : "";
    const inline = typeof part.body?.data === "string" ? part.body.data : "";
    // Only attachment parts (a file name or a Gmail attachment body), never the message text.
    const isAttachment = gmailAttachmentId !== "" || (typeof part.filename === "string" && part.filename !== "");
    if (!isAttachment || (!gmailAttachmentId && !inline)) return error(404, "NOT_FOUND");

    const bytes = gmailAttachmentId
      ? (await api.getAttachment(messageId, gmailAttachmentId)).data
      : Buffer.from(inline, "base64url");

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": attachmentMime(part),
        "Content-Disposition": attachmentContentDisposition(attachmentName(part)),
        "Content-Length": String(bytes.length),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    const code = actionErrorCode(err);
    if (code === "NOT_FOUND" || code === "INVALID" || code === "FORBIDDEN") return error(404, "NOT_FOUND");
    if (code === "NOT_CONNECTED" || code === "SCOPE_MISSING") return error(409, code);
    if (code === "RATE_LIMITED") return error(429, code);
    throw err;
  }
}
