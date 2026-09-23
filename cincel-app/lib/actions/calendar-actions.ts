"use server";

import { headers } from "next/headers";

import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveCalendarCapabilities } from "@/lib/auth/permissions";
import { CALENDAR_SCOPE, hasScope, isOauthConfigured } from "@/lib/google/oauth";
import { syncGoogleCalendar, type CalendarSyncResult } from "@/lib/google/calendar-sync-service";
import * as feedRepository from "@/lib/repositories/calendar-feed-repository";
import * as syncRepository from "@/lib/repositories/google-calendar-sync-repository";
import { getGoogleOauthAccount } from "@/lib/repositories/google-oauth-repository";

async function requireCalendarUser() {
  const user = await requireCapabilityUser();
  if (!resolveCalendarCapabilities(user).canViewCalendar) {
    throw new Error("FORBIDDEN: calendar");
  }
  return user;
}

export async function fetchCalendarFeedStatusAction(): Promise<{ enabled: boolean }> {
  const user = await requireCalendarUser();
  return { enabled: await feedRepository.hasCalendarFeed(user.member.id) };
}

/**
 * Creates the caller's subscribable feed, or replaces it (the old URL stops
 * working). Returns only the secret token; the client builds the URL from its
 * own origin. It can't be read back later — only its hash is stored.
 */
export async function generateCalendarFeedAction(): Promise<{ token: string }> {
  const user = await requireCalendarUser();
  return { token: await feedRepository.createCalendarFeedToken(user.member.id) };
}

export async function disableCalendarFeedAction(): Promise<void> {
  const user = await requireCalendarUser();
  await feedRepository.deleteCalendarFeedToken(user.member.id);
}

// ── Direct Google Calendar sync (#434) ─────────────────────────────────────

export type GoogleCalendarSyncStatus = {
  /** OAuth isn't configured on this server — the section is hidden. */
  oauthAvailable: boolean;
  connectedEmail: string | null;
  hasCalendarScope: boolean;
  enabled: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
};

/** Automatic syncs (opening Calendario) run at most this often; "Sincronizar ahora" ignores it. */
const AUTO_SYNC_INTERVAL_MS = 5 * 60 * 1000;

/** Event links point back into the app, so they need its public origin. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function fetchGoogleCalendarSyncStatusAction(): Promise<GoogleCalendarSyncStatus> {
  const user = await requireCalendarUser();
  const oauthAvailable = isOauthConfigured();
  const [account, sync] = await Promise.all([
    oauthAvailable ? getGoogleOauthAccount(user.member.id) : null,
    syncRepository.getCalendarSync(user.member.id),
  ]);
  return {
    oauthAvailable,
    connectedEmail: account?.email ?? null,
    hasCalendarScope: hasScope(account?.scope, CALENDAR_SCOPE),
    enabled: Boolean(sync?.enabled),
    lastSyncedAt: sync?.lastSyncedAt?.toISOString() ?? null,
    lastError: sync?.lastError ?? null,
  };
}

export type GoogleCalendarSyncOutcome = { ok: true; result: CalendarSyncResult } | { ok: false; error: string };

/**
 * Failures come back as a value: production builds strip thrown server
 * action messages, and the user needs to read this one.
 */
async function runSync(staffId: string): Promise<GoogleCalendarSyncOutcome> {
  try {
    return { ok: true, result: await syncGoogleCalendar(staffId, await requestOrigin()) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo sincronizar." };
  }
}

/** Turns sync on (creating the "Cincel" calendar in Google if needed) and runs a first sync. */
export async function enableGoogleCalendarSyncAction(): Promise<GoogleCalendarSyncOutcome> {
  const user = await requireCalendarUser();
  await syncRepository.upsertCalendarSync(user.member.id, { enabled: true });
  return runSync(user.member.id);
}

/**
 * Syncs now. With `auto`, skips (returns null) when sync is off or ran
 * recently — that's the call Calendario makes on every visit.
 */
export async function syncGoogleCalendarAction(options: { auto?: boolean } = {}): Promise<GoogleCalendarSyncOutcome | null> {
  const user = await requireCalendarUser();
  const sync = await syncRepository.getCalendarSync(user.member.id);
  if (!sync?.enabled) return null;
  if (options.auto && sync.lastSyncedAt && Date.now() - sync.lastSyncedAt.getTime() < AUTO_SYNC_INTERVAL_MS) {
    return null;
  }
  // The error, if any, is also stored and shown in the dialog.
  return runSync(user.member.id);
}

/** Stops syncing. The "Cincel" calendar stays in Google; the user can delete it there. */
export async function disableGoogleCalendarSyncAction(): Promise<void> {
  const user = await requireCalendarUser();
  await syncRepository.upsertCalendarSync(user.member.id, { enabled: false });
}
