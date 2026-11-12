/** Hours of the Día timeline (BE §5): app settings, else the jornada of Control de horario, else 08:00-19:00. Server-only. */
import "server-only";

import { getAppSetting } from "@/lib/repositories/app-settings-repository";
import { getTimeTrackingSettings } from "@/lib/time-tracking/settings";

export const DEFAULT_DAY_RANGE = { start: "08:00", end: "19:00" } as const;
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The pair when both are valid clock times and the end is after the start. */
export function validDayRange(start: string | null | undefined, end: string | null | undefined): { start: string; end: string } | null {
  return start && end && CLOCK.test(start) && CLOCK.test(end) && end > start ? { start, end } : null;
}

export async function getDayRange(): Promise<{ start: string; end: string }> {
  try {
    const [start, end] = await Promise.all([getAppSetting("calendario.day_start"), getAppSetting("calendario.day_end")]);
    const fromSettings = validDayRange(start, end);
    if (fromSettings) return fromSettings;
    const jornada = await getTimeTrackingSettings();
    return validDayRange(jornada.dayStart, jornada.dayEnd) ?? { ...DEFAULT_DAY_RANGE };
  } catch (error) {
    console.error("[calendario] could not read the day range", error);
    return { ...DEFAULT_DAY_RANGE };
  }
}
