/**
 * Org default workday for the Calendario load (BE §9, D3): `app_settings('calendario.workday_hours')`,
 * a plain number of hours (1-12, step 0.5), default 6. Used when a person's puesto has no weekly capacity.
 */
import { z } from "zod";

import { DEFAULT_WORKDAY_HOURS } from "@/lib/calendario/load";

export const WORKDAY_HOURS_SETTING_KEY = "calendario.workday_hours";

export const WorkdayHoursSchema = z
  .number()
  .min(1)
  .max(12)
  .refine((v) => Math.round(v * 2) === v * 2, { message: "INVALID: workday_hours" });

/** The stored value, or the default when missing or not a valid number. */
export function parseWorkdayHours(raw: string | null): number {
  if (raw === null) return DEFAULT_WORKDAY_HOURS;
  const parsed = WorkdayHoursSchema.safeParse(Number(raw));
  return parsed.success ? parsed.data : DEFAULT_WORKDAY_HOURS;
}

export async function getWorkdayHoursSetting(): Promise<number> {
  try {
    const { getAppSetting } = await import("@/lib/repositories/app-settings-repository");
    return parseWorkdayHours(await getAppSetting(WORKDAY_HOURS_SETTING_KEY));
  } catch (error) {
    console.error("[calendario] could not read the workday setting", error);
    return DEFAULT_WORKDAY_HOURS;
  }
}

export async function writeWorkdayHoursSetting(hours: number): Promise<void> {
  const value = WorkdayHoursSchema.parse(hours);
  const { setAppSetting } = await import("@/lib/repositories/app-settings-repository");
  await setAppSetting(WORKDAY_HOURS_SETTING_KEY, String(value));
}
