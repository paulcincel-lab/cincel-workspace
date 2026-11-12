/**
 * "Enviar orden del día a asistentes" (BE §11.3): one mail with the edited agenda to the attendees
 * of a meeting, a history line on the event, 10 sends an hour per person and 3 per event.
 * Shared by `sendAgendaAction` and the `send_agenda` tool. Server-only.
 */
import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { createRateLimiter } from "@/lib/auth/rate-limit";
import { formatMeetingWhen } from "@/lib/calendario/meeting-prep";
import { sendMail } from "@/lib/email";
import { ordenDelDiaEmail } from "@/lib/email/templates/orden-del-dia";
import { localParts } from "@/lib/my-space/zoned-time";
import { recordComment } from "@/lib/repositories/history-repository";
import { getPrepEvent, listAgendaRecipients } from "@/lib/repositories/meeting-prep-repository";
import { SendAgendaToolSchema } from "@/lib/validation/calendario";
import { parseInput } from "@/lib/validation/project-flow";

const HOUR_MS = 60 * 60 * 1000;
export const agendaPerStaffLimiter = createRateLimiter({ limit: 10, windowMs: HOUR_MS });
export const agendaPerEventLimiter = createRateLimiter({ limit: 3, windowMs: HOUR_MS });

const pad = (n: number) => String(n).padStart(2, "0");

function wallTime(at: Date, timeZone: string): { date: string; time: string } {
  const p = localParts(at, timeZone);
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

export function agendaSentLine(actorName: string, count: number): string {
  return `${actorName} envió el orden del día a ${count} ${count === 1 ? "asistente" : "asistentes"}`;
}

/**
 * Sends the agenda. Throws plain `Error`s with a code: `INVALID`, `FORBIDDEN` (not the organizer
 * or a staff attendee), `RATE_LIMITED`, `NO_ATTENDEES`, `MAIL_FAILED`.
 */
export async function sendAgenda(user: AuthenticatedUser, eventIdInput: string, itemsInput: string[]): Promise<{ sent: number }> {
  const { eventId, items } = parseInput(SendAgendaToolSchema.pick({ eventId: true, items: true }), { eventId: eventIdInput, items: itemsInput });

  const viewerId = user.member.id;
  const event = await getPrepEvent(viewerId, eventId);
  if (!event) throw new Error("FORBIDDEN");

  const own = (user.email || user.member.institutionalEmail || "").trim().toLowerCase();
  const seen = new Set<string>();
  const to: string[] = [];
  for (const r of await listAgendaRecipients(event.id)) {
    const email = r.email.trim();
    const key = email.toLowerCase();
    if (key === own || seen.has(key)) continue;
    seen.add(key);
    to.push(email);
  }
  if (to.length === 0) throw new Error("NO_ATTENDEES");

  if (!agendaPerStaffLimiter.hit(viewerId).allowed || !agendaPerEventLimiter.hit(event.id).allowed) throw new Error("RATE_LIMITED");

  const mail = ordenDelDiaEmail({
    title: event.title,
    when: formatMeetingWhen({ start: wallTime(event.startsAt, event.timeZone), end: wallTime(event.endsAt, event.timeZone) }),
    location: event.location,
    meetUrl: event.meetUrl,
    items,
    organizerName: user.member.name,
  });
  const result = await sendMail({ to, ...mail });
  if (!result.sent) throw new Error("MAIL_FAILED");

  try {
    await recordComment({ entity: "calendar_event", entityId: event.id, actorId: viewerId, comment: agendaSentLine(user.member.name, to.length) });
  } catch (error) {
    // The mail already went out: a missing history line must not turn the send into a failure.
    console.error("[calendario] agenda history line failed", error instanceof Error ? error.message : "unknown");
  }
  return { sent: to.length };
}
