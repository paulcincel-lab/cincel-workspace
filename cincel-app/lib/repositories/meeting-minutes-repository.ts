/**
 * Minutes, decisions and the tasks created from them (Calendario BE §3.4, §8.3). Server-only.
 * Only the organizer and staff attendees can read or write minutes.
 */
import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { emptyMinutes } from "@/lib/calendario/empty";
import { notImplemented, stubDefault } from "@/lib/stubs";
import type { MeetingMinutes } from "@/lib/types/calendario";

export async function getMinutes(user: AuthenticatedUser, eventId: string): Promise<MeetingMinutes | null> {
  return stubDefault(emptyMinutes(eventId), user);
}

/** Creates the `meeting_minutes` row on first save. */
export async function saveNotes(user: AuthenticatedUser, eventId: string, notes: string): Promise<{ minutesId: string; updatedAt: string }> {
  return notImplemented("saveNotes", user, eventId, notes);
}

export async function saveDecisions(minutesId: string, projectId: string | null, texts: string[]): Promise<{ decisionIds: string[] }> {
  return notImplemented("saveDecisions", minutesId, projectId, texts);
}

export async function linkMinuteTasks(minutesId: string, taskIds: string[]): Promise<void> {
  return notImplemented("linkMinuteTasks", minutesId, taskIds);
}

export async function setMinutesStatus(minutesId: string, status: "borrador" | "lista" | "enviada", openPoints?: string[]): Promise<void> {
  return notImplemented("setMinutesStatus", minutesId, status, openPoints);
}
