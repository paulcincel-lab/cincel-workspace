import type { CalendarEvent } from "@/lib/types/calendar";

/**
 * Builds an iCalendar (RFC 5545) feed from calendar events, for Google
 * Calendar (or any client) to subscribe to.
 *
 * Every event is an **all-day** event on purpose. Tasks only store dates —
 * the in-app calendar synthesizes a display time (see calendar-service.ts) —
 * and pushing an invented "09:00" into someone's real agenda would put false
 * time blocks in it.
 */

const CRLF = "\r\n";

/** Escape a TEXT value: backslash, semicolon, comma and newlines. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Fold a content line at 75 octets (never splitting a UTF-8 character); continuation lines start with a space. */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  // Continuation lines carry a leading space, so they hold one octet less.
  let limit = 75;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
      limit = 74;
    }
    current += char;
    currentBytes += bytes;
  }
  parts.push(current);
  return parts.join(CRLF + " ");
}

function compactDate(isoDate: string): string {
  return isoDate.replace(/-/g, "");
}

function nextDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function utcStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function buildIcs(
  events: CalendarEvent[],
  options: { baseUrl: string; calendarName: string; now?: Date }
): string {
  const stamp = utcStamp(options.now ?? new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Cincel Workspace//Calendario//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(options.calendarName)}`,
  ];

  for (const event of events) {
    const description = [
      `Proyecto: ${event.project}`,
      `Etapa: ${event.stageLabel}`,
      `Responsable: ${event.responsible}`,
      event.phase ? `Fase: ${event.phase}` : null,
      `Tipo: ${event.type}`,
    ]
      .filter(Boolean)
      .join("\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.id}@cincel-workspace`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compactDate(event.date)}`,
      `DTEND;VALUE=DATE:${compactDate(nextDay(event.date))}`,
      `SUMMARY:${escapeIcsText(event.title)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      `URL:${new URL(event.href, options.baseUrl).toString()}`,
      "TRANSP:TRANSPARENT",
      "END:VEVENT"
    );
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}
