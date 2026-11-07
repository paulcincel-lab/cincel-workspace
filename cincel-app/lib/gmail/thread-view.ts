/**
 * Reads the Gmail API `threads.get` JSON (`format=full` or `metadata`) into
 * the shapes the reading pane needs (redesign BE §7.6). Pure: no sanitizing
 * here (`fetchGmailThreadAction` runs `sanitizeEmailHtml` on `html`).
 *
 * Attachment ids handed to the client are `<threadId>~<partId>`: Gmail's own
 * `body.attachmentId` changes on every fetch, so the attachments route looks
 * the part up again by its stable `partId` inside the caller's thread and
 * uses the fresh id.
 */
import type { GmailAttachment } from "@/lib/types/redesign";

type RawHeader = { name?: unknown; value?: unknown };
export type RawPart = {
  partId?: unknown;
  mimeType?: unknown;
  filename?: unknown;
  headers?: unknown;
  body?: { attachmentId?: unknown; size?: unknown; data?: unknown } | null;
  parts?: unknown;
};
export type RawMessage = {
  id?: unknown;
  threadId?: unknown;
  labelIds?: unknown;
  snippet?: unknown;
  internalDate?: unknown;
  payload?: RawPart | null;
};

export type ParsedAddress = { name: string; email: string };

export type ParsedGmailMessage = {
  id: string;
  subject: string;
  from: string;
  fromAddress: ParsedAddress;
  to: string[];
  cc: string[];
  date: string;
  /** Header `Message-ID` (for replies). */
  messageIdHeader: string;
  references: string;
  labelIds: string[];
  snippet: string;
  /** Not sanitized. */
  html: string;
  text: string;
  attachments: GmailAttachment[];
};

export type ParsedGmailThread = { id: string; messages: ParsedGmailMessage[] };

const str = (v: unknown): string => (typeof v === "string" ? v : "");

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function headerValue(part: RawPart | null | undefined, name: string): string {
  const wanted = name.toLowerCase();
  const found = asArray<RawHeader>(part?.headers).find((h) => str(h?.name).toLowerCase() === wanted);
  return str(found?.value);
}

/** Splits an address list on commas outside quotes, angle brackets and comments. */
export function splitAddressList(value: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  let angle = 0;
  let paren = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === "\\" && quoted && i + 1 < value.length) {
      current += c + value[++i];
      continue;
    }
    if (c === '"') quoted = !quoted;
    else if (!quoted && c === "<") angle++;
    else if (!quoted && c === ">") angle = Math.max(0, angle - 1);
    else if (!quoted && c === "(") paren++;
    else if (!quoted && c === ")") paren = Math.max(0, paren - 1);
    if (c === "," && !quoted && angle === 0 && paren === 0) {
      if (current.trim()) out.push(current.trim());
      current = "";
      continue;
    }
    current += c;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** `"Ana López" <ana@x.mx>` → `{ name: "Ana López", email: "ana@x.mx" }`; a bare address has no name. */
export function parseAddress(value: string): ParsedAddress {
  const trimmed = value.trim();
  const angle = /^(.*?)<([^<>]*)>\s*$/.exec(trimmed);
  if (angle) {
    const name = angle[1]
      .trim()
      .replace(/^"(.*)"$/, "$1")
      .replace(/\\(.)/g, "$1")
      .trim();
    return { name, email: angle[2].trim() };
  }
  return { name: "", email: trimmed.replace(/\s*\(.*\)\s*$/, "") };
}

/** `Name <email>`, or the address alone. */
export function formatAddress(address: ParsedAddress): string {
  if (!address.name) return address.email;
  if (!address.email) return address.name;
  return `${address.name} <${address.email}>`;
}

function charsetOf(part: RawPart): string {
  const contentType = headerValue(part, "Content-Type");
  const match = /charset\s*=\s*"?([^";\s]+)"?/i.exec(contentType);
  return match ? match[1].toLowerCase() : "utf-8";
}

/** Decodes a part body (`base64url`) with its declared charset; unknown charsets fall back to UTF-8. */
export function decodeBody(data: string, charset = "utf-8"): string {
  const bytes = Buffer.from(data, "base64url");
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function isAttachmentPart(part: RawPart): boolean {
  if (str(part.filename)) return true;
  return /^\s*attachment/i.test(headerValue(part, "Content-Disposition"));
}

function walkParts(part: RawPart | null | undefined, visit: (part: RawPart) => void): void {
  if (!part || typeof part !== "object") return;
  visit(part);
  for (const child of asArray<RawPart>(part.parts)) walkParts(child, visit);
}

export function attachmentRef(threadId: string, partId: string): string {
  return `${threadId}~${partId}`;
}

export function parseAttachmentRef(ref: string): { threadId: string; partId: string } | null {
  const sep = ref.indexOf("~");
  if (sep <= 0 || sep === ref.length - 1) return null;
  const threadId = ref.slice(0, sep);
  const partId = ref.slice(sep + 1);
  if (!/^[A-Za-z0-9_-]+$/.test(threadId) || !/^[0-9.]+$/.test(partId)) return null;
  return { threadId, partId };
}

/** The part with this `partId` in a message payload, or null. */
export function findPart(payload: RawPart | null | undefined, partId: string): RawPart | null {
  let found: RawPart | null = null;
  walkParts(payload, (p) => {
    if (!found && str(p.partId) === partId) found = p;
  });
  return found;
}

/** Download name: control characters and path separators removed; "adjunto" when empty. */
export function attachmentName(part: RawPart): string {
  const name = str(part.filename)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "_")
    .trim();
  return name || "adjunto";
}

/** `Content-Disposition` of a download: RFC 5987 `filename*` (UTF-8, percent-encoded). */
export function attachmentContentDisposition(name: string): string {
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename*=UTF-8''${encoded}`;
}

export function attachmentMime(part: RawPart): string {
  const mime = str(part.mimeType).trim().toLowerCase();
  return /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mime) ? mime : "application/octet-stream";
}

function parseMessage(raw: RawMessage, threadId: string): ParsedGmailMessage {
  const payload = raw.payload ?? null;
  let html = "";
  let text = "";
  const attachments: GmailAttachment[] = [];
  const messageId = str(raw.id);

  walkParts(payload, (part) => {
    const mime = str(part.mimeType).toLowerCase();
    if (mime.startsWith("multipart/")) return;
    if (isAttachmentPart(part)) {
      const partId = str(part.partId);
      if (!partId) return;
      const size = typeof part.body?.size === "number" ? part.body.size : 0;
      attachments.push({
        messageId,
        attachmentId: attachmentRef(threadId, partId),
        name: attachmentName(part),
        mime: attachmentMime(part),
        size,
      });
      return;
    }
    const data = str(part.body?.data);
    if (!data) return;
    if (mime === "text/html" && !html) html = decodeBody(data, charsetOf(part));
    else if (mime === "text/plain" && !text) text = decodeBody(data, charsetOf(part));
  });

  const internal = Number(str(raw.internalDate));
  const headerDate = Date.parse(headerValue(payload, "Date"));
  const date = Number.isFinite(internal) && internal > 0 ? internal : Number.isFinite(headerDate) ? headerDate : 0;
  const fromAddress = parseAddress(headerValue(payload, "From"));

  return {
    id: messageId,
    subject: headerValue(payload, "Subject"),
    from: formatAddress(fromAddress),
    fromAddress,
    to: splitAddressList(headerValue(payload, "To")).map((a) => formatAddress(parseAddress(a))),
    cc: splitAddressList(headerValue(payload, "Cc")).map((a) => formatAddress(parseAddress(a))),
    date: new Date(date).toISOString(),
    messageIdHeader: headerValue(payload, "Message-ID") || headerValue(payload, "Message-Id"),
    references: headerValue(payload, "References"),
    labelIds: asArray<unknown>(raw.labelIds).filter((l): l is string => typeof l === "string"),
    snippet: str(raw.snippet),
    html,
    text,
    attachments,
  };
}

/** Throws `NOT_FOUND` when the payload is not a thread with messages. */
export function parseGmailThread(raw: unknown): ParsedGmailThread {
  if (!raw || typeof raw !== "object") throw new Error("NOT_FOUND");
  const thread = raw as { id?: unknown; messages?: unknown };
  const id = str(thread.id);
  const messages = asArray<RawMessage>(thread.messages).filter((m) => m && typeof m === "object");
  if (!id || messages.length === 0) throw new Error("NOT_FOUND");
  return { id, messages: messages.map((m) => parseMessage(m, id)) };
}

/** The raw message with this id inside a `threads.get` payload, or null. */
export function findRawMessage(raw: unknown, messageId: string): RawMessage | null {
  if (!raw || typeof raw !== "object") return null;
  const messages = asArray<RawMessage>((raw as { messages?: unknown }).messages);
  return messages.find((m) => m && typeof m === "object" && str(m.id) === messageId) ?? null;
}
