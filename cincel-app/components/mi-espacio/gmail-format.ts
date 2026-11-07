/**
 * Client helpers for the Gmail reading pane and reply draft (redesign FE §3.3).
 *
 * The message HTML arrives sanitized from `fetchGmailThreadAction`; this module
 * only builds the `srcdoc` of the sandboxed iframe that shows it. Remote images
 * are blocked twice: the document carries a Content-Security-Policy that only
 * allows inline (`data:` / `cid:`) images until the reader asks for them, and
 * remote `src` / `srcset` attributes are parked in data attributes so nothing
 * is even requested.
 */

const BLOCKED_SRC = "data-cincel-src";
const BLOCKED_SRCSET = "data-cincel-srcset";

/** `http:`, `https:` or protocol-relative URL. */
function isRemoteUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^\s*(https?:)?\/\//i.test(value);
}

const REMOTE_CSS_URL = /url\(\s*(['"]?)\s*(https?:)?\/\//i;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type EmailDocument = {
  /** Full HTML document for `<iframe srcdoc>`. */
  srcDoc: string;
  /** The message references remote images (whether or not they are shown). */
  hasRemoteImages: boolean;
};

/** Content-Security-Policy of the iframe document. Scripts never run (the iframe has no `allow-scripts` either). */
export function emailContentSecurityPolicy(showImages: boolean): string {
  const img = showImages ? "data: cid: https: http:" : "data: cid:";
  return `default-src 'none'; img-src ${img}; style-src 'unsafe-inline'; font-src data:; media-src 'none'; frame-src 'none'; form-action 'none'`;
}

/** Rewrites remote image references in the body; returns the body and whether any were found. */
function processBody(html: string, showImages: boolean): { body: string; hasRemoteImages: boolean } {
  if (typeof DOMParser === "undefined") {
    // Server render: the CSP alone blocks the requests.
    const found =
      /<img\b[^>]*\bsrc\s*=\s*["']?\s*(https?:)?\/\//i.test(html) ||
      /\bsrcset\s*=\s*["'][^"']*(https?:)?\/\//i.test(html) ||
      /\bbackground\s*=\s*["']?\s*(https?:)?\/\//i.test(html) ||
      REMOTE_CSS_URL.test(html);
    return { body: html, hasRemoteImages: found };
  }

  const doc = new DOMParser().parseFromString(html, "text/html");
  let found = false;

  doc.querySelectorAll("img, source, input[type=image]").forEach((el) => {
    const src = el.getAttribute("src");
    if (isRemoteUrl(src)) {
      found = true;
      if (!showImages) {
        el.setAttribute(BLOCKED_SRC, src ?? "");
        el.removeAttribute("src");
      }
    }
    const srcset = el.getAttribute("srcset");
    if (srcset && /(https?:)?\/\//i.test(srcset)) {
      found = true;
      if (!showImages) {
        el.setAttribute(BLOCKED_SRCSET, srcset);
        el.removeAttribute("srcset");
      }
    }
  });

  doc.querySelectorAll("[background]").forEach((el) => {
    const bg = el.getAttribute("background");
    if (isRemoteUrl(bg)) {
      found = true;
      if (!showImages) {
        el.setAttribute("data-cincel-background", bg ?? "");
        el.removeAttribute("background");
      }
    }
  });

  doc.querySelectorAll("[style]").forEach((el) => {
    if (REMOTE_CSS_URL.test(el.getAttribute("style") ?? "")) found = true;
  });
  doc.querySelectorAll("style").forEach((el) => {
    if (REMOTE_CSS_URL.test(el.textContent ?? "")) found = true;
  });

  const head = doc.head ? Array.from(doc.head.querySelectorAll("style")).map((s) => s.outerHTML).join("") : "";
  return { body: head + (doc.body?.innerHTML ?? ""), hasRemoteImages: found };
}

/**
 * The `srcdoc` for one message: sanitized HTML when present, otherwise the
 * plain text escaped inside a pre-wrapped block.
 */
export function buildEmailDocument(message: { html: string; text: string }, options: { showImages: boolean }): EmailDocument {
  const hasHtml = message.html.trim().length > 0;
  const { body, hasRemoteImages } = hasHtml
    ? processBody(message.html, options.showImages)
    : { body: `<pre class="cincel-text">${escapeHtml(message.text)}</pre>`, hasRemoteImages: false };

  const srcDoc =
    "<!doctype html><html><head>" +
    '<meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${emailContentSecurityPolicy(options.showImages)}">` +
    '<meta name="referrer" content="no-referrer">' +
    '<base target="_blank">' +
    "<style>" +
    ":root{color-scheme:light}" +
    "body{margin:0;padding:4px 2px;background:Canvas;color:CanvasText;font:14.5px/1.65 system-ui,sans-serif;overflow-wrap:anywhere}" +
    "img{max-width:100%;height:auto}" +
    "pre.cincel-text{margin:0;white-space:pre-wrap;font:inherit}" +
    "</style>" +
    "</head><body>" +
    body +
    "</body></html>";

  return { srcDoc, hasRemoteImages };
}

/** Download URL of an attachment (BE §7.6 route). */
export function attachmentHref(messageId: string, attachmentId: string): string {
  return `/api/gmail/attachments/${encodeURIComponent(messageId)}/${encodeURIComponent(attachmentId)}`;
}

/** "1.2 MB", "340 KB", "12 B". */
export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

/** Short label from the mime type or file name for the attachment chip ("PDF", "JPG"). */
export function attachmentKind(name: string, mime: string): string {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(name)?.[1];
  if (ext) return ext.toUpperCase();
  const sub = mime.split("/")[1];
  return sub ? sub.split(/[.+-]/)[0].slice(0, 4).toUpperCase() : "ARCH";
}

/** es-MX, lowercase: "6 nov · 10:42". */
export function formatMessageDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(d).replace(/\./g, "");
  const time = new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${day} · ${time}`.toLowerCase();
}

/** Display name of a `"<name> <email>"` / `"Name <email>"` / bare address sender. */
export function senderName(from: string): string {
  const name = from.replace(/<[^>]*>/g, "").replace(/["']/g, "").trim();
  return name || senderEmail(from) || from;
}

/** Email address inside a sender string, or "" when there is none. */
export function senderEmail(from: string): string {
  const angle = /<([^>\s]+@[^>\s]+)>/.exec(from);
  if (angle) return angle[1];
  const bare = /[^\s<>"']+@[^\s<>"']+/.exec(from);
  return bare ? bare[0] : "";
}

/** Two-letter initials for the sender avatar. */
export function senderInitials(from: string): string {
  const parts = senderName(from)
    .split(/[\s·.@_-]+/)
    .filter(Boolean);
  const letters = (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : (parts[0]?.[1] ?? ""));
  return letters.toUpperCase() || "?";
}

/** "Re: " prefix unless the subject already has one. */
export function replySubject(subject: string): string {
  const s = subject.trim();
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

/** Recipients typed as "a@b.mx, c@d.mx; e@f.mx". */
export function parseRecipients(value: string): string[] {
  return value
    .split(/[,;\s]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

/** "ana@x.mx", "ana@x.mx y luis@y.mx", "ana@x.mx, luis@y.mx y 2 más". */
export function recipientsLabel(to: string[]): string {
  if (to.length <= 1) return to[0] ?? "";
  if (to.length === 2) return `${to[0]} y ${to[1]}`;
  if (to.length === 3) return `${to[0]}, ${to[1]} y ${to[2]}`;
  return `${to[0]}, ${to[1]} y ${to.length - 2} más`;
}
