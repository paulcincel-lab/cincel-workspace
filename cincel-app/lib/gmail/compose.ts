/**
 * Builds the RFC 5322 message of a Gmail draft (redesign BE §7.6) and returns
 * it base64url-encoded, the form of the Gmail API `raw` field. The body is
 * the text the user typed (markdown), sent as base64 `text/plain` UTF-8. Replies
 * carry `In-Reply-To` / `References` so Gmail keeps them in the thread.
 */
import MailComposer from "nodemailer/lib/mail-composer";

export type ComposeInput = {
  to: string[];
  subject: string;
  body: string;
  /** `Message-ID` of the message being answered. */
  inReplyTo?: string;
  /** `References` of the message being answered (its own id is appended). */
  references?: string;
};

export function replyReferences(references: string | undefined, inReplyTo: string | undefined): string[] {
  const ids = (references ?? "").split(/\s+/).filter(Boolean);
  if (inReplyTo && !ids.includes(inReplyTo)) ids.push(inReplyTo);
  return ids;
}

export async function buildRawEmail(input: ComposeInput): Promise<string> {
  const references = replyReferences(input.references, input.inReplyTo);
  const composer = new MailComposer({
    to: input.to,
    subject: input.subject,
    text: input.body,
    // Always base64 (nodemailer picks 7bit for ASCII-only text otherwise).
    headers: { "Content-Transfer-Encoding": "base64" },
    ...(input.inReplyTo ? { inReplyTo: input.inReplyTo } : {}),
    ...(references.length > 0 ? { references } : {}),
  });
  const message = await composer.compile().build();
  return Buffer.from(message).toString("base64url");
}
