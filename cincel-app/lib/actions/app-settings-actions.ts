"use server";

import { revalidatePath } from "next/cache";

import { canManageAppearance } from "@/lib/auth/permissions";
import { requireCapabilityUser } from "@/lib/auth/session";
import * as appSettingsRepository from "@/lib/repositories/app-settings-repository";
import { isPrimaryColorToken, PRIMARY_COLOR_SETTING_KEY, type PrimaryColorToken } from "@/lib/theme/primary-color";
import { getPrimaryColor } from "@/lib/theme/primary-color-server";

export type AppearanceState = { primaryColor: PrimaryColorToken | null; canManage: boolean };

export async function fetchAppearanceAction(): Promise<AppearanceState> {
  const user = await requireCapabilityUser();
  return { primaryColor: await getPrimaryColor(), canManage: canManageAppearance(user) };
}

/** Save the company's primary color; `null` restores the default. */
export async function savePrimaryColorAction(token: PrimaryColorToken | null): Promise<void> {
  const user = await requireCapabilityUser();
  if (!canManageAppearance(user)) throw new Error("FORBIDDEN: appearance edit");
  if (token !== null && !isPrimaryColorToken(token)) throw new Error("INVALID_PRIMARY_COLOR");
  await appSettingsRepository.setAppSetting(PRIMARY_COLOR_SETTING_KEY, token);
  revalidatePath("/", "layout");
}
