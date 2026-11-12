"use server";

import { fetchMyTasksAction } from "@/lib/actions/tasks-actions";
import { calendarioHintsFrom, type CalendarioAssistantHints } from "@/lib/assistant/calendar-hints";
import { resolveCalendarCapabilities } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import { todayInAppTimeZone } from "@/lib/project-flow/admin-tasks";

/**
 * Real names and dates for the asistente's Calendario suggestions and composer
 * placeholder (BE §11.5), from the viewer's own open tasks. Needs
 * `canViewCalendar` (FORBIDDEN otherwise); returns nothing about other people
 * beyond the name of one teammate on the viewer's own tasks.
 */
export async function fetchCalendarioAssistantHintsAction(): Promise<CalendarioAssistantHints> {
  const user = await requireCapabilityUser();
  if (!resolveCalendarCapabilities(user).canViewCalendar) throw new Error("FORBIDDEN");
  const tasks = await fetchMyTasksAction();
  return calendarioHintsFrom(tasks, user.member.id, todayInAppTimeZone());
}
