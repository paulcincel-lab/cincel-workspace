/** Shared pieces for the Spanish mail templates: plain text plus minimal, escaped HTML. */

export type MailContent = { subject: string; text: string; html: string };

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

/** `origin` without a trailing slash, so `${origin}/portal/login` never doubles it. */
export function trimOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 16px">${escapeHtml(text)}</p>`;
}

export function button(label: string, href: string): string {
  return (
    `<p style="margin:0 0 16px"><a href="${escapeHtml(href)}" ` +
    `style="display:inline-block;padding:10px 16px;background:#000;color:#fff;` +
    `text-decoration:none;border-radius:6px">` +
    `${escapeHtml(label)}</a></p>`
  );
}

export function note(text: string): string {
  return `<p style="margin:0 0 16px;color:#666;font-size:13px">${escapeHtml(text)}</p>`;
}

/** Wraps already-escaped body blocks in a minimal document. */
export function htmlDocument(body: string[]): string {
  return (
    `<!doctype html><html lang="es"><body style="margin:0;padding:24px;font-family:Arial,sans-serif;` +
    `font-size:15px;line-height:1.5;color:#111;background:#fff">${body.join("")}</body></html>`
  );
}
