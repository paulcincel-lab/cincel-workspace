import "server-only";

import { buildCalendarEvents } from "@/lib/calendar/calendar-service";
import {
  GoogleCalendarError,
  createCalendar,
  deleteEvent,
  getCalendar,
  insertEvent,
  isGone,
  patchEvent,
} from "@/lib/google/calendar-api";
import { planSync, toDesiredEvents, type DesiredEvent } from "@/lib/google/calendar-sync";
import { CALENDAR_SCOPE, getOauthAccessToken, hasScope } from "@/lib/google/oauth";
import * as syncRepository from "@/lib/repositories/google-calendar-sync-repository";
import { getGoogleOauthAccount } from "@/lib/repositories/google-oauth-repository";
import { listMyTasks } from "@/lib/repositories/tasks-repository";

/**
 * Pushes a staff member's tasks into a dedicated "Cincel" calendar in their
 * own Google account (#434). One-way: the app is the source of truth, and
 * edits made in Google to these events are overwritten on the next change.
 */

const CALENDAR_NAME = "Cincel";
const TIME_ZONE = "America/Mexico_City";
const CONCURRENCY = 5;

export type CalendarSyncResult = { created: number; updated: number; deleted: number };

export class CalendarNotConnectedError extends Error {
  constructor() {
    super("Conecta tu cuenta de Google con acceso a Calendar para sincronizar.");
    this.name = "CalendarNotConnectedError";
  }
}

async function inBatches<T>(items: T[], run: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += CONCURRENCY) {
    await Promise.all(items.slice(i, i + CONCURRENCY).map(run));
  }
}

/** The access token, only if the connected account granted Calendar access. */
async function calendarToken(staffId: string): Promise<string> {
  const account = await getGoogleOauthAccount(staffId);
  if (!account || !hasScope(account.scope, CALENDAR_SCOPE)) throw new CalendarNotConnectedError();
  const access = await getOauthAccessToken(staffId);
  if (!access) throw new CalendarNotConnectedError();
  return access.token;
}

/** The existing Cincel calendar, or a new one if there is none or the user deleted it in Google. */
async function ensureCalendar(token: string, staffId: string): Promise<string> {
  const state = await syncRepository.getCalendarSync(staffId);
  if (state?.calendarId) {
    try {
      await getCalendar(token, state.calendarId);
      return state.calendarId;
    } catch (error) {
      if (!isGone(error)) throw error;
    }
  }
  const calendarId = await createCalendar(token, CALENDAR_NAME, TIME_ZONE);
  // Events recorded against the old calendar went away with it.
  await syncRepository.deleteSyncedEvents(staffId);
  await syncRepository.upsertCalendarSync(staffId, { calendarId });
  return calendarId;
}

export async function syncGoogleCalendar(staffId: string, baseUrl: string): Promise<CalendarSyncResult> {
  try {
    const token = await calendarToken(staffId);
    const calendarId = await ensureCalendar(token, staffId);

    const tasks = await listMyTasks(staffId, { archived: false });
    const desired = toDesiredEvents(buildCalendarEvents(tasks), baseUrl);
    const plan = planSync(desired, await syncRepository.listSyncedEvents(staffId));

    const create = async (event: DesiredEvent) => {
      const googleEventId = await insertEvent(token, calendarId, event.body);
      await syncRepository.saveSyncedEvent(staffId, { eventKey: event.eventKey, googleEventId, contentHash: event.contentHash });
    };

    await inBatches(plan.create, create);
    await inBatches(plan.update, async (event) => {
      try {
        await patchEvent(token, calendarId, event.googleEventId, event.body);
        await syncRepository.saveSyncedEvent(staffId, event);
      } catch (error) {
        // Deleted by hand in Google — put it back.
        if (!isGone(error)) throw error;
        await create(event);
      }
    });
    await inBatches(plan.delete, (event) => deleteEvent(token, calendarId, event.googleEventId));
    await syncRepository.deleteSyncedEvents(
      staffId,
      plan.delete.map((e) => e.eventKey)
    );

    await syncRepository.upsertCalendarSync(staffId, { lastSyncedAt: new Date(), lastError: null });
    return { created: plan.create.length, updated: plan.update.length, deleted: plan.delete.length };
  } catch (error) {
    await syncRepository.upsertCalendarSync(staffId, { lastError: describeError(error) });
    throw new Error(describeError(error), { cause: error });
  }
}

/** A message the user can act on, in Spanish; Google's own text as the fallback. */
export function describeError(error: unknown): string {
  if (error instanceof GoogleCalendarError) {
    if (error.status === 401) return "Google rechazó el acceso. Vuelve a conectar tu cuenta de Google.";
    if (error.status === 403) return `Google Calendar denegó la operación: ${error.message}`;
    if (error.status === 429) return "Google Calendar está limitando las solicitudes. Intenta de nuevo en unos minutos.";
    return `Google Calendar: ${error.message}`;
  }
  return error instanceof Error ? error.message : "Error desconocido al sincronizar.";
}
