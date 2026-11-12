"use server";


import { toActionResult } from "@/lib/actions/action-result";
import { getWorkdayHoursSetting, WorkdayHoursSchema, writeWorkdayHoursSetting } from "@/lib/calendario/workday-setting";
import { canManageGeneralSettings } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import type { ActionResult } from "@/lib/types/schedule";
import { parseInput } from "@/lib/validation/project-flow";

/** The org workday in hours (Ajustes › General). Any staff session may read it. */
export async function fetchWorkdayHoursAction(): Promise<number> {
  await requireCapabilityUser();
  return getWorkdayHoursSetting();
}

/** Save the org workday (admin only, 1-12 h in steps of 0.5). */
export async function saveWorkdayHoursAction(hours: number): Promise<ActionResult<{ hours: number }>> {
  return toActionResult(async () => {
    const user = await requireCapabilityUser();
    if (!canManageGeneralSettings(user)) throw new Error("FORBIDDEN: general settings edit");
    const parsed = parseInput(WorkdayHoursSchema, hours);
    await writeWorkdayHoursSetting(parsed);
    return { hours: parsed };
  });
}
