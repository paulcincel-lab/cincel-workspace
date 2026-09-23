"use server";

import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveCalendarCapabilities } from "@/lib/auth/permissions";
import * as feedRepository from "@/lib/repositories/calendar-feed-repository";

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
