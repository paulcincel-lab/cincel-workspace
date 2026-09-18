"use server";

import { requireCapabilityUser } from "@/lib/auth/session";
import { resolveProjectsCapabilities } from "@/lib/auth/permissions";
import * as scheduleRepository from "@/lib/repositories/schedule-repository";
import type { CronogramaData } from "@/lib/types/schedule";

async function requireProjectsCapabilities() {
  return resolveProjectsCapabilities(await requireCapabilityUser());
}

/** The project's timezone for "today" — every viewer gets the same date/week regardless of their own clock. */
const SCHEDULE_TIMEZONE = "America/Mexico_City";

function todayInTimezone(timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date()
  );
}

export interface ScheduleViewData {
  data: CronogramaData;
  today: string;
}

export async function fetchScheduleAction(projectId: string): Promise<ScheduleViewData | null> {
  const caps = await requireProjectsCapabilities();
  if (!caps.canViewProjects) return null;

  const data = await scheduleRepository.getScheduleForProject(projectId);
  if (!data) return null;

  return { data, today: todayInTimezone(SCHEDULE_TIMEZONE) };
}
