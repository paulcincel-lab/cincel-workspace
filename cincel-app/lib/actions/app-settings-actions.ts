"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { toActionResult } from "@/lib/actions/action-result";
import { canManageGeneralSettings } from "@/lib/auth/permissions";
import { isSettingsAdministrator } from "@/lib/auth/ajustes-segments";
import { requireCapabilityUser } from "@/lib/auth/session";
import { listEtapas } from "@/lib/etapas/compat";
import * as appSettingsRepository from "@/lib/repositories/app-settings-repository";
import { GENERAL_SETTINGS_SETTING_KEY, type LoadedGeneralSettings } from "@/lib/settings/general-settings";
import { parseGeneralSettingsInput } from "@/lib/settings/general-settings-schema";
import { getGeneralSettings } from "@/lib/settings/general-settings-server";
import { NAV_VISIBILITY_SETTING_KEY, sanitizeHiddenKeys, type NavVisibility } from "@/lib/shell/nav-visibility";
import { getNavVisibility } from "@/lib/shell/nav-visibility-server";
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

const navVisibilityInputSchema = z.array(z.string().max(100)).max(200);

/** The menu visibility of the organization (administrators only). */
export async function fetchNavVisibilityAction(): Promise<NavVisibility> {
  const user = await requireCapabilityUser();
  if (!isSettingsAdministrator(user)) throw new Error("FORBIDDEN: nav visibility read");
  return getNavVisibility();
}

/**
 * Save which menu elements are hidden for the whole organization. Unknown
 * keys, Ajustes and the keys of etapas that no longer exist are dropped.
 */
export async function setNavVisibilityAction(
  ...args: Parameters<typeof setNavVisibilityActionImpl>
): Promise<ActionResult<Awaited<ReturnType<typeof setNavVisibilityActionImpl>>>> {
  return toActionResult(() => setNavVisibilityActionImpl(...args));
}

async function setNavVisibilityActionImpl(hidden: string[]): Promise<{ hidden: string[]; savedAt: string }> {
  const user = await requireCapabilityUser();
  if (!isSettingsAdministrator(user)) throw new Error("FORBIDDEN: nav visibility edit");
  const parsed = navVisibilityInputSchema.safeParse(hidden);
  if (!parsed.success) throw new Error("INVALID_NAV_VISIBILITY");
  const etapaKeys = new Set((await listEtapas()).map((etapa) => etapa.key));
  const clean = sanitizeHiddenKeys(parsed.data, etapaKeys);
  const savedAt = await appSettingsRepository.setAppSetting(
    NAV_VISIBILITY_SETTING_KEY,
    JSON.stringify({ version: 1, hidden: clean }),
  );
  revalidatePath("/", "layout");
  return { hidden: clean, savedAt: (savedAt ?? new Date()).toISOString() };
}
