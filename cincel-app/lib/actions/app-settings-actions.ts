"use server";

import { revalidatePath } from "next/cache";

import { toActionResult } from "@/lib/actions/action-result";
import { canManageGeneralSettings } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import * as appSettingsRepository from "@/lib/repositories/app-settings-repository";
import { GENERAL_SETTINGS_SETTING_KEY, type LoadedGeneralSettings } from "@/lib/settings/general-settings";
import { parseGeneralSettingsInput } from "@/lib/settings/general-settings-schema";
import { getGeneralSettings } from "@/lib/settings/general-settings-server";
import type { ActionResult } from "@/lib/types/schedule";

export async function fetchGeneralSettingsAction(): Promise<LoadedGeneralSettings> {
  await requireCapabilityUser();
  return getGeneralSettings();
}

/** Save Configuración → General for the whole company. Returns the server save time. */
export async function saveGeneralSettingsAction(
  ...args: Parameters<typeof saveGeneralSettingsActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof saveGeneralSettingsActionImpl>>>> {
  return toActionResult(() => saveGeneralSettingsActionImpl(...args));
}

async function saveGeneralSettingsActionImpl(candidate: unknown): Promise<{ savedAt: string }> {
  const user = await requireCapabilityUser();
  if (!canManageGeneralSettings(user)) throw new Error("FORBIDDEN: general settings edit");
  const settings = parseGeneralSettingsInput(candidate);
  if (!settings) throw new Error("INVALID_GENERAL_SETTINGS");
  const savedAt = await appSettingsRepository.setAppSetting(
    GENERAL_SETTINGS_SETTING_KEY,
    JSON.stringify({ version: 1, data: settings }),
  );
  revalidatePath("/", "layout");
  return { savedAt: (savedAt ?? new Date()).toISOString() };
}

/** Drop the stored general settings so everyone is back on the defaults. */
export async function restoreGeneralSettingsAction(
  ...args: Parameters<typeof restoreGeneralSettingsActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof restoreGeneralSettingsActionImpl>>>> {
  return toActionResult(() => restoreGeneralSettingsActionImpl(...args));
}

async function restoreGeneralSettingsActionImpl(): Promise<void> {
  const user = await requireCapabilityUser();
  if (!canManageGeneralSettings(user)) throw new Error("FORBIDDEN: general settings edit");
  await appSettingsRepository.setAppSetting(GENERAL_SETTINGS_SETTING_KEY, null);
  revalidatePath("/", "layout");
}
