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

export function heading(text: string): string {
  return `<h2 style="margin:24px 0 8px;font-size:16px;font-weight:600">${escapeHtml(text)}</h2>`;
}

/** A list of links; each label and href is escaped. */
export function linkList(items: { label: string; href: string }[]): string {
  const rows = items
    .map(
      ({ label, href }) =>
        `<li style="margin:0 0 6px"><a href="${escapeHtml(href)}" style="color:#111">${escapeHtml(label)}</a></li>`,
    )
    .join("");
  return `<ul style="margin:0 0 16px;padding-left:20px">${rows}</ul>`;
}

const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export const MAIL_TIME_ZONE = "America/Mexico_City";

/** `YYYY-MM-DD` → "3 de diciembre de 2026" (calendar date, no time zone shift). */
export function formatMailDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  if (!match) return isoDate;
  const [, year, month, day] = match;
  return `${Number(day)} de ${MONTHS_ES[Number(month) - 1]} de ${year}`;
}

/** ISO instant → "7 de noviembre de 2026, 15:30" in America/Mexico_City (24-hour clock). */
export function formatMailDateTime(isoInstant: string, timeZone: string = MAIL_TIME_ZONE): string {
  const date = new Date(isoInstant);
  if (Number.isNaN(date.getTime())) return isoInstant;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${formatMailDate(`${part("year")}-${part("month")}-${part("day")}`)}, ${part("hour")}:${part("minute")}`;
}

/** "1 día" / "5 días". */
export function formatDays(days: number): string {
  return `${days} ${days === 1 ? "día" : "días"}`;
}

/** "del 3 de diciembre de 2026 al 7 de diciembre de 2026", or "el 3 de diciembre de 2026" for one day. */
export function formatDateRange(from: string, to: string): string {
  if (from === to) return `el ${formatMailDate(from)}`;
  return `del ${formatMailDate(from)} al ${formatMailDate(to)}`;
}
