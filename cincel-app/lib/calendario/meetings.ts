/**
 * Cincel meetings: create, update and cancel with the Google write-through first (D1), the
 * failure path with email invitations (D13, BE §7.6), the in-app `reunion` notification and the
 * history lines (BE §8, §15). Server-only. The actions in `calendario-actions.ts` and, later,
 * `apply_proposal` call these functions, so every path audits and invites the same way.
 *
 * - `google`: Google sends the invitation, the updates and the cancel notice; Cincel adds only
 *   the in-app notification for staff attendees.
 * - `cincel`: the failure path. `invitacion-reunion` goes to every attendee email (no `.ics`)
 *   and the in-app notification goes out at once; updates and the cancel go the same way.
 */
import "server-only";

import { randomUUID } from "node:crypto";

import { getAppOrigin } from "@/lib/auth/safe-return-to";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { createRateLimiter } from "@/lib/auth/rate-limit";
import { db } from "@/lib/db/client";
import { zonedHourMinute } from "@/lib/dates/zoned-formatters";
import { sendMail } from "@/lib/email";
import { invitacionReunionEmail, type InvitacionReunionParams } from "@/lib/email/templates/invitacion-reunion";
import { formatMailDateTime } from "@/lib/email/templates/layout";
import { notify } from "@/lib/notifications/notify";
import * as events from "@/lib/repositories/calendar-events-repository";
import type { EventNoticeData } from "@/lib/repositories/calendar-events-repository";
import { writeMeetingToGoogle } from "@/lib/google/calendar-events-sync";
import type { CalEventItem, MeetingDraft, MeetingPatch } from "@/lib/types/calendario";

/** Test seam: the backoff sleep of the Google write. */
export type GoogleDeps = { sleep?: (ms: number) => Promise<void> };

/** `createMeetingAction`: 30 per hour per person (BE §14). */
export const createMeetingRateLimiter = createRateLimiter({ limit: 30, windowMs: 60 * 60 * 1000 });

type NoticeKind = InvitacionReunionParams["kind"];

function logFailure(msg: string, error: unknown, extra: Record<string, unknown> = {}): void {
  console.error(JSON.stringify({ msg, ...extra, error: error instanceof Error ? error.message : String(error) }));
}

/** "12 de noviembre de 2026, 10:00 – 11:00" in the meeting's time zone. */
export function whenText(event: Pick<EventNoticeData, "startsAt" | "endsAt" | "timeZone">): string {
  return `${formatMailDateTime(event.startsAt.toISOString(), event.timeZone)} – ${zonedHourMinute(event.endsAt, event.timeZone)}`;
}

const NOTICE_TITLE: Record<NoticeKind, (title: string) => string> = {
  invitacion: (title) => `Te invitaron a «${title}»`,
  cambio: (title) => `Cambió la reunión «${title}»`,
  cancelacion: (title) => `Se canceló la reunión «${title}»`,
};

type NoticeOptions = {
  actor: AuthenticatedUser;
  event: EventNoticeData;
  kind: NoticeKind;
  /** Only these attendees (by email, lower-case); everyone but the actor when omitted. */
  only?: Set<string>;
  /** Cincel sends the email (failure path); on the Google path Google does. */
  email: boolean;
  /** Distinguishes two changes of the same meeting for the notification dedupe key. */
  stamp: string;
};

/** The in-app `reunion` row for staff attendees and, on the failure path, the email for everyone. */
async function deliverNotice({ actor, event, kind, only, email, stamp }: NoticeOptions): Promise<void> {
  const actorId = actor.member.id;
  const recipients = event.attendees.filter((a) => a.staffId !== actorId && a.email.toLowerCase() !== actor.email.toLowerCase());
  const chosen = only ? recipients.filter((a) => only.has(a.email.toLowerCase())) : recipients;
  if (chosen.length === 0) return;

  const staffIds = chosen.map((a) => a.staffId).filter((v): v is string => Boolean(v));
  const origin = getAppOrigin();
  const url = origin ? `/calendario?evento=e:${event.id}` : undefined;
  if (staffIds.length > 0) {
    try {
      await notify(db, staffIds, {
        kind: "reunion",
        title: NOTICE_TITLE[kind](event.title),
        body: whenText(event),
        entity: "calendar_event",
        entityId: event.id,
        url,
        dedupeKey: `reunion:${event.id}:${kind}:${stamp}`,
        actorId,
        // The templated email below (or Google) is the email channel of this notice.
        force: { inApp: true, email: false },
      });
    } catch (error) {
      logFailure("notify.failed", error, { kind: "reunion", count: staffIds.length });
    }
  }

  if (!email) return;
  if (!origin) {
    console.error("[calendario] APP_ORIGIN is not set; the meeting email was not sent");
    return;
  }
  const mail = invitacionReunionEmail({
    title: event.title,
    when: whenText(event),
    location: event.location,
    meetingUrl: `${origin}/calendario?evento=e:${event.id}`,
    organizerName: actor.member.name,
    kind,
  });
  for (const attendee of chosen) {
    try {
      await sendMail({ to: attendee.email, ...mail });
    } catch (error) {
      logFailure("calendario.mail_failed", error, { template: "invitacion-reunion" });
    }
  }
}

// ── Create ──────────────────────────────────────────────────────────────────

/**
 * Google first (D1): the row is saved and the event is written to the organizer's primary calendar
 * with a Meet link and Google's invitations. When Google can't run (`NO_GRANT`, `ACCESS_DENIED`,
 * `REAUTH`, `UNAVAILABLE`, `RATE_LIMITED`) the meeting stays Cincel-only: the code is in
 * `google_sync_error`, `invites_via` becomes `cincel` and the invitation goes by email and in-app.
 */
export async function createMeeting(user: AuthenticatedUser, draft: MeetingDraft, deps: GoogleDeps = {}): Promise<CalEventItem> {
  if (!createMeetingRateLimiter.hit(user.member.id).allowed) throw new Error("RATE_LIMITED");

  const id = randomUUID();
  await events.createEvent(user, draft, { invitesVia: "google", id });
  const outcome = await writeMeetingToGoogle(id, "create", { actorId: user.member.id, meet: draft.meet, sleep: deps.sleep });

  if (!outcome.ok) await events.setInvitesVia(id, "cincel");
  const created = await events.getEventForNotice(id);
  if (created) {
    await deliverNotice({ actor: user, event: created, kind: "invitacion", email: !outcome.ok, stamp: "create" });
  }
  return await readItem(user, id);
}

async function readItem(user: AuthenticatedUser, id: string): Promise<CalEventItem> {
  const item = await events.getEventItem(user, id);
  if (!item) throw new Error("NOT_FOUND");
  return item;
}

// ── Update ──────────────────────────────────────────────────────────────────

/** The event as the viewer may edit it: `NOT_FOUND` when hidden, `NOT_ORGANIZER` for a cached Google copy, `FORBIDDEN` otherwise. */
async function editableEvent(user: AuthenticatedUser, eventId: string): Promise<EventNoticeData> {
  const item = await events.getEventItem(user, eventId);
  if (!item) throw new Error("NOT_FOUND");
  if (item.source === "google") throw new Error("NOT_ORGANIZER");
  if (!item.canEdit) throw new Error("FORBIDDEN");
  const event = await events.getEventForNotice(eventId);
  if (!event) throw new Error("NOT_FOUND");
  return event;
}

/**
 * Edits a meeting and, when it has a Google event, patches it with the organizer's token (a change
 * Google can't reconcile is `CONFLICT` and the edit is taken back). An admin edit stays Cincel-only
 * and is flagged `NOT_ORGANIZER`. `notify` (default true) controls the notices.
 */
export async function updateMeeting(
  user: AuthenticatedUser,
  eventId: string,
  patch: MeetingPatch & { notify?: boolean },
  deps: GoogleDeps = {}
): Promise<CalEventItem> {
  const before = await editableEvent(user, eventId);
  if (before.status === "cancelada") throw new Error("INVALID: status");
  const { notify: notifyAttendees = true, ...fields } = patch;

  const nextStart = fields.start ?? before.startsAt.toISOString();
  const nextEnd = fields.end ?? before.endsAt.toISOString();
  if (!(Date.parse(nextEnd) > Date.parse(nextStart))) throw new Error("INVALID: end");

  await events.updateEvent(user, eventId, fields);

  const googlePatch: MeetingPatch = {};
  if (fields.title !== undefined && fields.title.trim() !== before.title) googlePatch.title = fields.title.trim();
  if (fields.start !== undefined && Date.parse(fields.start) !== before.startsAt.getTime()) googlePatch.start = fields.start;
  if (fields.end !== undefined && Date.parse(fields.end) !== before.endsAt.getTime()) googlePatch.end = fields.end;
  if (fields.location !== undefined && (fields.location?.trim() || null) !== before.location) googlePatch.location = fields.location?.trim() || null;
  if (fields.attendees !== undefined) googlePatch.attendees = fields.attendees;

  if (before.googleEventId && Object.keys(googlePatch).length > 0) {
    const outcome = await writeMeetingToGoogle(eventId, "update", {
      patch: googlePatch,
      actorId: user.member.id,
      notify: notifyAttendees,
      sleep: deps.sleep,
    });
    if (!outcome.ok && outcome.error === "CONFLICT") {
      await events.updateEvent(user, eventId, {
        title: before.title,
        start: before.startsAt.toISOString(),
        end: before.endsAt.toISOString(),
        location: before.location,
        attendees: before.attendees
          .filter((a) => !a.isOrganizer)
          .map((a) => ({ ...(a.staffId ? { staffId: a.staffId } : {}), ...(a.contactId ? { contactId: a.contactId } : {}), email: a.email, name: a.name })),
      });
      throw new Error("CONFLICT");
    }
  }

  const after = await events.getEventForNotice(eventId);
  if (after && notifyAttendees) {
    const stamp = String(Date.now());
    const known = new Set(before.attendees.map((a) => a.email.toLowerCase()));
    const added = new Set(after.attendees.map((a) => a.email.toLowerCase()).filter((e) => !known.has(e)));
    const scalarChanged = googlePatch.title !== undefined || googlePatch.start !== undefined || googlePatch.end !== undefined || googlePatch.location !== undefined;
    const viaCincel = before.invitesVia === "cincel";
    if (added.size > 0) await deliverNotice({ actor: user, event: after, kind: "invitacion", only: added, email: viaCincel, stamp: `add:${stamp}` });
    if (scalarChanged) {
      const others = new Set(after.attendees.map((a) => a.email.toLowerCase()).filter((e) => !added.has(e)));
      if (others.size > 0) await deliverNotice({ actor: user, event: after, kind: "cambio", only: others, email: viaCincel, stamp });
    }
  }
  return await readItem(user, eventId);
}

// ── Cancel ──────────────────────────────────────────────────────────────────

/** Cancel is a status. With a Google event, Google cancels it too (and tells the attendees on the Google path). */
export async function cancelMeeting(
  user: AuthenticatedUser,
  eventId: string,
  opts: { notify: boolean },
  deps: GoogleDeps = {}
): Promise<{ eventId: string }> {
  const before = await editableEvent(user, eventId);
  if (before.status === "cancelada") return { eventId };

  await events.cancelEvent(user, eventId);
  if (before.googleEventId) {
    await writeMeetingToGoogle(eventId, "cancel", { actorId: user.member.id, notify: opts.notify, sleep: deps.sleep });
  }
  if (opts.notify) {
    await deliverNotice({ actor: user, event: before, kind: "cancelacion", email: before.invitesVia === "cincel", stamp: "cancel" });
  }
  return { eventId };
}
